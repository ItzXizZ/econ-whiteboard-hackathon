"""Merge reviews into reviews_manual.json: python3 add_reviews.py '<json>'  (shorthand: {"fam:i": "correct"} or full dict)."""
import json, sys
P = "dataset/real/reviews_manual.json"
m = json.load(open(P)); new = json.loads(sys.argv[1])
for k, v in new.items():
    m[k] = {"verdict": v} if isinstance(v, str) else v
json.dump(m, open(P, "w"), indent=1, ensure_ascii=False); print(len(m), "reviews")
