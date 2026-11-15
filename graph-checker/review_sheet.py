"""Contact sheet of UNREVIEWED real images: python3 review_sheet.py FAMILY [skip] [n]; labels are FAMILY:index keys for reviews_manual.json"""
import json, sys, math, collections
from PIL import Image, ImageDraw
cat = json.load(open("/home/ubuntu/econ-graphs/dataset/real/catalog.json"))
man = json.load(open("/home/ubuntu/econ-graphs/dataset/real/reviews_manual.json"))
fam = sys.argv[1]; skip = int(sys.argv[2]) if len(sys.argv) > 2 else 0; n = int(sys.argv[3]) if len(sys.argv) > 3 else 25
idx = collections.defaultdict(int); todo = []
for r in cat:
    k = f'{r["graph_family"]}:{idx[r["graph_family"]]}'; idx[r["graph_family"]] += 1
    if r["graph_family"] == fam and k not in man: todo.append((k, r))
todo = todo[skip:skip + n]
W, H, cols = 400, 320, 5
sheet = Image.new("RGB", (W * cols, H * (math.ceil(len(todo) / cols) or 1)), "white"); d = ImageDraw.Draw(sheet)
for i, (k, r) in enumerate(todo):
    x, y = (i % cols) * W, (i // cols) * H
    try:
        im = Image.open("/home/ubuntu/econ-graphs/dataset/real/" + r["image"]).convert("RGBA"); bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im); im = bg.convert("RGB")
        im.thumbnail((W - 10, H - 30)); sheet.paste(im, (x + 5, y + 25))
    except Exception as e: d.text((x + 5, y + 40), "ERR " + str(e)[:50], fill="blue")
    d.rectangle([x, y, x + W - 1, y + H - 1], outline="#cccccc"); d.text((x + 5, y + 5), k + "  " + r["title"][5:45], fill="red")
out = f"/tmp/rv_{fam}_{skip}.png"; sheet.save(out); print(out, len(todo), "of", sum(1 for _ in todo))
