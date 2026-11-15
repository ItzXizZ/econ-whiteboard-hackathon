"""Shared data utilities: label vocab, image cache, error-location heatmaps."""
import json, os, hashlib, numpy as np
from multiprocessing import Pool
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYN = os.path.join(ROOT, "dataset/synthetic")
W, H, S = 448, 336, 16          # input size and heatmap stride -> 28x21 grid (v1 model used 320x240)


def split_of(rid):
    seed = rid.rsplit("__", 1)[-1]
    return "val" if int(hashlib.md5(seed.encode()).hexdigest(), 16) % 100 < 15 else "train"


def load_img(path):
    im = Image.open(path).convert("RGB")
    im.thumbnail((W, H), Image.BILINEAR)          # keep aspect, letterbox on white
    c = Image.new("RGB", (W, H), "white"); c.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
    return np.asarray(c, dtype=np.uint8)


def heat(rec):
    m = np.zeros((H // S, W // S), np.float32)
    if rec["verdict"] != "incorrect": return m
    by = {e["id"]: e for e in rec["elements"]}
    sx, sy = W / rec["width"], H / rec["height"]
    for h in rec["error"]["highlight"]:
        e = by.get(h)
        b = e and (e.get("bbox") or e.get("label_bbox"))
        if not b: continue
        x0, y0, x1, y1 = b
        m[max(0, int(y0 * sy / S)):int(np.ceil(y1 * sy / S)), max(0, int(x0 * sx / S)):int(np.ceil(x1 * sx / S))] = 1
    return m


def _one(rid):
    rec = json.load(open(os.path.join(SYN, "annotations", rid + ".json")))
    return load_img(os.path.join(SYN, rec["image"])), heat(rec), rec


def build_cache(out=os.path.join(ROOT, "cache/synth.npz")):
    ids = [json.loads(l)["id"] for l in open(os.path.join(SYN, "manifest.jsonl"))]
    with Pool(8) as p: res = p.map(_one, ids, chunksize=32)
    recs = [r for _, _, r in res]
    gtypes = sorted({r["graph_type"] for r in recs})
    errs = ["none"] + sorted({r["error"]["type"] for r in recs if r["error"]})
    fixes = {}
    for r in recs:
        if r["error"]: fixes.setdefault(f'{r["graph_type"]}/{r["error"]["type"]}', {"explanation": r["error"]["explanation"], "fix": r["error"]["fix"], "severity": r["error"]["severity"], "highlight_roles": sorted({e["role"] for e in r["elements"] if e["id"] in r["error"]["highlight"]})})
    np.savez(out, img=np.stack([a for a, _, _ in res]), heat=np.stack([b for _, b, _ in res]),
             gtype=np.array([gtypes.index(r["graph_type"]) for r in recs]),
             verdict=np.array([r["verdict"] == "incorrect" for r in recs], np.int64),
             err=np.array([errs.index(r["error"]["type"]) if r["error"] else 0 for r in recs]),
             val=np.array([split_of(r["id"]) == "val" for r in recs]), ids=np.array(ids))
    json.dump({"graph_types": gtypes, "error_types": errs, "fix_templates": fixes, "input": [W, H], "stride": S},
              open(os.path.join(ROOT, "train/vocab.json"), "w"), indent=1, ensure_ascii=False)
    print(len(ids), "cached;", len(gtypes), "graph types;", len(errs) - 1, "error names;", len(fixes), "graph/error combos")


if __name__ == "__main__":
    build_cache()
