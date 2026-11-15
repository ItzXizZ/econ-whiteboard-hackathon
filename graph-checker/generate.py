"""Render paired correct / incorrect economics diagrams with per-element pixel annotations."""
import argparse, json, os, copy, hashlib, traceback
from multiprocessing import Pool
import numpy as np
from econgraphs import REG
from econgraphs.scene import render
from econgraphs.photo import photo
from econgraphs.corrections import diff, compact

GENERIC = {
    "axis_labels_swapped": "Axis labels swapped",
    "missing_axis_labels": "Axes not labeled",
    "missing_curve_labels": "Curves not labeled",
    "curve_labels_swapped": "Two different curves have each other's labels",
}


NO_CURVE_SWAP = {"cost_curves", "is_lm", "short_run_production", "perfect_elasticity", "elasticity_comparison", "solow_growth"}
NO_AXIS_SWAP = {"ppf", "ppf_shift", "comparative_advantage", "consumer_optimum", "budget_line_shift", "isoquant_isocost", "phillips_curve"}


def apply_generic(s, err):
    s = copy.deepcopy(s); s.steps = []
    if err == "axis_labels_swapped":
        if not s.xlabel or not s.ylabel or s.gtype in NO_AXIS_SWAP: return None
        s.xlabel, s.ylabel = s.ylabel, s.xlabel
        s.set_error(err, ["x_axis", "y_axis"], f"'{s.xlabel}' belongs on the vertical axis and '{s.ylabel}' on the horizontal axis; the axis labels are swapped, which reverses the meaning of every slope.",
                    "Swap the axis labels back.")
    elif err == "missing_axis_labels":
        s.xlabel = s.ylabel = None
        s.set_error(err, [], "Neither axis is labeled, so the curves cannot be interpreted.", "Label both axes.", severity="minor")
    elif err == "missing_curve_labels":
        cs = [e for e in s.els if e["kind"] == "curve" and e["label"]]
        if len(cs) < 2: return None
        for e in cs: e["label"] = None
        s.set_error(err, [e["id"] for e in cs], "None of the curves are labeled, so it is ambiguous which is which.", "Label every curve.", severity="minor")
    elif err == "curve_labels_swapped":
        if s.gtype in NO_CURVE_SWAP: return None
        cs = [e for e in s.els if e["kind"] == "curve" and e["label"]]
        pair = next(((a, b) for i, a in enumerate(cs) for b in cs[i + 1:] if a["role"] != b["role"] and a["label"] != b["label"]), None)
        if pair is None: return None
        a, b = pair; la, lb = a["label"], b["label"]; a["label"], b["label"] = lb, la
        s.set_error(err, [a["id"], b["id"]], f"The labels '{la}' and '{lb}' are on the wrong curves: the curve drawn as {a['role'].replace('_', ' ')} is labeled '{lb}', and the curve drawn as {b['role'].replace('_', ' ')} is labeled '{la}'.",
                    f"Swap the labels back: '{la}' goes on the {a['role'].replace('_', ' ')} curve and '{lb}' on the {b['role'].replace('_', ' ')} curve.")
    return s


def build_and_render(gtype, seed, err, out):
    meta = REG[gtype]
    rng = np.random.default_rng(seed)
    if err in GENERIC and err not in meta["errors"]:
        base = meta["fn"](rng, None)
        s = apply_generic(base, err)
        if s is None: return None
    else:
        s = meta["fn"](rng, err)
        if err and s.error is None: return None
    sid = f"{gtype}__{err or 'correct'}__{seed}"
    img = os.path.join(out, "images", sid + ".png")
    ann, style = render(s, img, np.random.default_rng(seed + 7919))
    ann, style["photo"] = photo(img, ann, style, np.random.default_rng(seed + 31337))
    ids = {a["id"] for a in ann}
    rec = {
        "id": sid, "image": f"images/{sid}.png", "width": 800, "height": 600,
        "graph_type": gtype, "graph_name": meta["title"], "topic": meta["topic"],
        "title": s.title, "scenario": s.caption or None,
        "verdict": "incorrect" if s.error else "correct",
        "error": s.error, "pair_id": f"{gtype}__correct__{seed}" if s.error else None,
        "axes": {"x": s.xlabel, "y": s.ylabel},
        "elements": ann,
        "explanation_steps": [dict(st, highlight=[h for h in st["highlight"] if h in ids]) for st in s.steps] if not s.error else [],
        "facts": {k: (round(v, 3) if isinstance(v, float) else v) for k, v in s.facts.items()},
        "render_style": style, "source": "synthetic", "license": "CC0-1.0",
    }
    if s.error: rec["error"]["highlight"] = [h for h in s.error["highlight"] if h in ids]
    with open(os.path.join(out, "annotations", sid + ".json"), "w") as f: json.dump(rec, f, ensure_ascii=False)
    return rec


def vlm_record(rec):
    by = {e["id"]: e for e in rec["elements"]}
    if rec["verdict"] == "correct":
        ans = {"verdict": "correct", "graph_type": rec["graph_type"], "explanation": [st["text"] for st in rec["explanation_steps"]],
               "walkthrough": [{"text": st["text"], "highlight_bboxes": [by[h].get("bbox") or by[h].get("label_bbox") for h in st["highlight"] if h in by]} for st in rec["explanation_steps"]]}
    else:
        e = rec["error"]
        ans = {"verdict": "incorrect", "graph_type": rec["graph_type"], "error_type": e["type"], "severity": e["severity"],
               "highlight": [{"element": h, "role": by[h]["role"], "bbox": by[h].get("bbox") or by[h].get("label_bbox")} for h in e["highlight"] if h in by],
               "explanation": e["explanation"], "fix": e["fix"]}
        if rec.get("correction"): ans["correction"] = compact(rec["correction"])["actions"]
    prompt = "Is this economics graph drawn correctly? Identify the graph, and if anything is wrong, say what, where (pixel boxes), why, and how to fix it."
    if rec["scenario"]: prompt += f" Scenario: {rec['scenario']}."
    return {"id": rec["id"], "image": rec["image"], "messages": [{"role": "user", "content": prompt}, {"role": "assistant", "content": json.dumps(ans, ensure_ascii=False)}]}


def _job(j):
    try: return build_and_render(*j), None
    except Exception as ex: return None, (j[0], j[2], j[1], repr(ex))


def add_corrections(recs, out):
    by = {r["id"]: r for r in recs}
    for r in recs:
        p = by.get(r["pair_id"]) if r["pair_id"] else None
        if p is None: continue
        r["correction"] = diff(r, p)
        with open(os.path.join(out, "annotations", r["id"] + ".json"), "w") as f: json.dump(r, f, ensure_ascii=False)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--out", default="dataset/synthetic"); ap.add_argument("--per", type=int, default=6)
    ap.add_argument("--only", default=None); ap.add_argument("--jobs", type=int, default=os.cpu_count())
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, "images"), exist_ok=True); os.makedirs(os.path.join(a.out, "annotations"), exist_ok=True)
    types = [a.only] if a.only else sorted(REG)
    jobs = []
    for g in types:
        errs = [None] + list(REG[g]["errors"]) + [e for e in GENERIC if e not in REG[g]["errors"]]
        for i in range(a.per):
            seed = int(hashlib.md5(f"{g}{i}".encode()).hexdigest()[:7], 16)
            jobs += [(g, seed, e, a.out) for e in errs if not (e in GENERIC and i % 3)]
    recs, fails = [], []
    with Pool(a.jobs) as pool:
        for r, f in pool.imap(_job, jobs, chunksize=8):
            if r: recs.append(r)
            if f: fails.append(f)
    add_corrections(recs, a.out)
    with open(os.path.join(a.out, "manifest.jsonl"), "w") as f:
        for r in recs: f.write(json.dumps({k: r[k] for k in ("id", "image", "graph_type", "topic", "verdict", "scenario")} | {"error_type": (r["error"] or {}).get("type")}, ensure_ascii=False) + "\n")
    with open(os.path.join(a.out, "vlm_train.jsonl"), "w") as f:
        for r in recs: f.write(json.dumps(vlm_record(r), ensure_ascii=False) + "\n")
    print(len(recs), "records;", len(fails), "failures")
    for x in fails[:20]: print(x)
