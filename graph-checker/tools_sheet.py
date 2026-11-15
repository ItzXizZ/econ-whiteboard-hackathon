import json, sys, glob, os
from PIL import Image, ImageDraw
d, pat, out = sys.argv[1], sys.argv[2], sys.argv[3]
import random; random.seed(int(os.environ.get("SEED", 0))); fs = glob.glob(os.path.join(d, "annotations", pat)); random.shuffle(fs); fs = fs[:int(sys.argv[4]) if len(sys.argv) > 4 else 20]
cols = 4; tw, th = 400, 300
sheet = Image.new("RGB", (cols * tw, ((len(fs) + cols - 1) // cols) * (th + 20)), "white")
dr = ImageDraw.Draw(sheet)
for i, f in enumerate(fs):
    r = json.load(open(f)); im = Image.open(os.path.join(d, r["image"])).convert("RGB")
    g = ImageDraw.Draw(im)
    hl = set((r["error"] or {}).get("highlight", []))
    for e in r["elements"]:
        if e["id"] in hl:
            if "polyline" in e: g.line([tuple(p) for p in e["polyline"]], fill=(255, 0, 255), width=5)
            b = e.get("bbox") or e.get("label_bbox")
            if b: g.rectangle(b, outline=(255, 0, 255), width=3)
            if "label_bbox" in e: g.rectangle(e["label_bbox"], outline=(0, 200, 255), width=2)
    im = im.resize((tw, th)); x, y = (i % cols) * tw, (i // cols) * (th + 20)
    sheet.paste(im, (x, y + 20)); dr.text((x + 4, y + 4), r["id"][:60], fill="black")
sheet.save(out)
