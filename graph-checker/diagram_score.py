"""Heuristic 'looks like a line diagram' score for real images, to triage off-topic Commons files (photos, posters, maps)."""
import json, numpy as np
from PIL import Image
C = "dataset/real/catalog.json"; cat = json.load(open(C))
def score(p):
    im = Image.open("dataset/real/" + p).convert("RGBA"); bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im)
    a = np.asarray(bg.convert("RGB").resize((256, 192)), dtype=float)
    white = (a.min(axis=2) > 225).mean()
    sat = (a.max(axis=2) - a.min(axis=2)); colorful = (sat > 60).mean()
    mid = ((a.mean(axis=2) > 60) & (a.mean(axis=2) < 200) & (sat < 40)).mean()
    return dict(white_frac=round(white, 3), colorful_frac=round(colorful, 3), gray_frac=round(mid, 3),
                likely_diagram=bool(white > 0.6 and colorful < 0.25 and mid < 0.15))
for r in cat: r["triage"] = score(r["image"])
json.dump(cat, open(C, "w"), indent=1, ensure_ascii=False)
rev = [r for r in cat if r["verdict"] != "unreviewed"]
import collections
print(collections.Counter((r["verdict"] == "off_topic", r["triage"]["likely_diagram"]) for r in rev))
print("all:", collections.Counter(r["triage"]["likely_diagram"] for r in cat))
