"""Add correction diffs to existing synthetic annotations and rebuild vlm_train.jsonl (no re-render)."""
import json, os, collections
from generate import add_corrections, vlm_record
D = "dataset/synthetic"
recs = [json.load(open(os.path.join(D, "annotations", json.loads(l)["id"] + ".json"))) for l in open(os.path.join(D, "manifest.jsonl"))]
add_corrections(recs, D)
with open(os.path.join(D, "vlm_train.jsonl"), "w") as f:
    for r in recs: f.write(json.dumps(vlm_record(r), ensure_ascii=False) + "\n")
c = collections.Counter()
for r in recs:
    if r["verdict"] == "incorrect":
        acts = r.get("correction", {}).get("actions", [])
        c["with_actions" if acts else "no_actions"] += 1
        for a in acts: c[a["action"]] += 1
print(dict(c))
none = collections.Counter(r["error"]["type"] for r in recs if r["verdict"] == "incorrect" and not r.get("correction", {}).get("actions"))
print("errors with empty diff:", none.most_common(15))
