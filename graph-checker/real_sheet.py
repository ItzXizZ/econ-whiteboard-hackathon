"""Contact sheets of real Commons images for manual review: python3 real_sheet.py FAMILY [start] [n]"""
import json, sys, math
from PIL import Image, ImageDraw
cat = json.load(open("/home/ubuntu/econ-graphs/dataset/real/catalog.json"))
fam = sys.argv[1]; start = int(sys.argv[2]) if len(sys.argv) > 2 else 0; n = int(sys.argv[3]) if len(sys.argv) > 3 else 20
recs = [r for r in cat if fam in ("all", r["graph_family"])][start:start + n]
W, H, cols = 400, 320, 5
rows = math.ceil(len(recs) / cols) or 1
sheet = Image.new("RGB", (W * cols, H * rows), "white"); d = ImageDraw.Draw(sheet)
for i, r in enumerate(recs):
    try:
        im = Image.open(r["image"] if r["image"].startswith("/") else "/home/ubuntu/econ-graphs/dataset/real/" + r["image"]).convert("RGBA"); bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im); im = bg.convert("RGB")
        im.thumbnail((W - 10, H - 30)); x, y = (i % cols) * W, (i // cols) * H
        sheet.paste(im, (x + 5, y + 25)); d.text((x + 5, y + 5), f"{start+i} {r['id']}"[:60], fill="red")
    except Exception as e:
        print("bad", r["id"], e)
out = f"/tmp/real_{fam}_{start}.png"; sheet.save(out); print(out, len(recs))
