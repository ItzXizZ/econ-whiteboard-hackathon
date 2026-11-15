"""Merge manual visual reviews (dataset/real/reviews_manual.json) into catalog.json.
Review keys are "family:index" (index within that family's catalog order, as shown by real_sheet.py)."""
import json, collections
C = "dataset/real/catalog.json"
cat = json.load(open(C)); man = json.load(open("dataset/real/reviews_manual.json"))
fam = collections.defaultdict(list)
for r in cat: fam[r["graph_family"]].append(r)
n = collections.Counter()
for key, rv in man.items():
    f, i = key.rsplit(":", 1); r = fam[f][int(i)]
    if rv.get("id") and rv["id"] != r["id"]: raise SystemExit(f"id mismatch {key}: {rv['id']} vs {r['id']}")
    r["verdict"] = rv["verdict"]; r["review"] = {k: v for k, v in rv.items() if k not in ("verdict", "id")} | {"method": "manual_visual"}
    n[rv["verdict"]] += 1
json.dump(cat, open(C, "w"), indent=1, ensure_ascii=False)
print(dict(n), "reviewed;", sum(r["verdict"] == "unreviewed" for r in cat), "unreviewed")
