"""New training batch for the LM Studio labeling round: fresh seeds (salted), app-relevant graph types, all their mistakes."""
import hashlib, json, os, sys
from multiprocessing import Pool
from econgraphs import REG
import generate as G

TYPES = ["supply_demand_equilibrium", "demand_shift", "supply_shift", "fx_market", "loanable_funds", "ppf", "ppf_shift",
         "money_market", "monopoly", "per_unit_tax", "price_ceiling", "ad_as_output_gap", "tariff"]
OUT = "dataset/lmstudio_batch"; PER = int(sys.argv[1]) if len(sys.argv) > 1 else 8

if __name__ == "__main__":
    os.makedirs(f"{OUT}/images", exist_ok=True); os.makedirs(f"{OUT}/annotations", exist_ok=True)
    jobs = []
    for g in TYPES:
        errs = [None] + list(REG[g]["errors"]) + [e for e in G.GENERIC if e not in REG[g]["errors"]]
        for i in range(PER):
            seed = int(hashlib.md5(f"lmstudio-{g}-{i}".encode()).hexdigest()[:7], 16)
            jobs += [(g, seed, e, OUT) for e in errs]
    recs, fails = [], []
    with Pool(os.cpu_count()) as p:
        for r, f in p.imap(G._job, jobs, chunksize=8):
            if r: recs.append(r)
            if f: fails.append(f)
    G.add_corrections(recs, OUT)
    with open(f"{OUT}/manifest.jsonl", "w") as f:
        for r in recs:
            f.write(json.dumps({"id": r["id"], "image": r["image"], "graph_type": r["graph_type"], "verdict": r["verdict"],
                                "error_type": (r["error"] or {}).get("type"),
                                "curve_labels": [e["label"] for e in r["elements"] if e["kind"] == "curve" and e["label"]]}, ensure_ascii=False) + "\n")
    print(len(recs), "records;", len(fails), "failures")
