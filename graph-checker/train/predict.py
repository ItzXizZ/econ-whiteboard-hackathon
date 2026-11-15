"""Run the baseline model on images.
python3 train/predict.py img1.png [img2.jpg ...]   -> JSON per image (graph type, verdict, error, fix, error box)
python3 train/predict.py --eval-real               -> accuracy on hand-reviewed Wikimedia images (correct/incorrect)"""
import argparse, json, os, sys, numpy as np, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from data import load_img, ROOT, W, H, S
from train import Net, prep
from PIL import Image

V = json.load(open(os.path.join(ROOT, "train/vocab.json")))
GT, ET, FIX = V["graph_types"], V["error_types"], V.get("fix_templates") or {}


def model():
    net = Net(len(GT), len(ET), pretrained=False)
    net.load_state_dict(torch.load(os.path.join(ROOT, "train/model.pt"), map_location="cpu")); net.eval()
    return net


@torch.no_grad()
def predict(net, paths, bs=32):
    out = []
    for i in range(0, len(paths), bs):
        ps = paths[i:i + bs]
        g, v, e, h = net(prep(np.stack([load_img(p) for p in ps])))
        pg, pv, pe = g.softmax(1), torch.sigmoid(v), e.softmax(1)
        for k, p in enumerate(ps):
            iw, ih = Image.open(p).size; sc = min(W / iw, H / ih); ox, oy = (W - iw * sc) / 2, (H - ih * sc) / 2
            cy, cx = divmod(int(h[k].flatten().argmax()), h.shape[2])
            box = [(cx * S - ox) / sc, (cy * S - oy) / sc, ((cx + 1) * S - ox) / sc, ((cy + 1) * S - oy) / sc]
            r = {"image": p, "graph_type": GT[int(pg[k].argmax())], "graph_type_conf": round(float(pg[k].max()), 3),
                 "verdict": "incorrect" if pv[k] > 0.5 else "correct", "p_incorrect": round(float(pv[k]), 3)}
            if pv[k] > 0.5:
                et = ET[int(pe[k].argmax())]
                r.update(error_type=et, error_conf=round(float(pe[k].max()), 3), error_bbox=[round(max(0, x)) for x in box])
                t = FIX.get(f'{r["graph_type"]}/{et}')
                if t: r.update(explanation=t["explanation"], fix=t["fix"])
            out.append(r)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("images", nargs="*"); ap.add_argument("--eval-real", action="store_true"); a = ap.parse_args()
    net = model()
    if a.eval_real:
        cat = json.load(open(os.path.join(ROOT, "dataset/real/catalog.json")))
        rs = [r for r in cat if r.get("verdict") in ("correct", "incorrect")]
        paths = [os.path.join(ROOT, "dataset/real", r["image"]) for r in rs]
        ok = [i for i, p in enumerate(paths) if os.path.exists(p)]
        pr = predict(net, [paths[i] for i in ok]); y = np.array([rs[i]["verdict"] == "incorrect" for i in ok], bool); p = np.array([x["verdict"] == "incorrect" for x in pr], bool)
        m = {"n": len(ok), "n_incorrect": int(y.sum()), "verdict_acc": float((p == y).mean()),
             "correct_recall": float((~p[~y]).mean()), "incorrect_recall": float(p[y].mean()) if y.any() else None}
        print(json.dumps(m)); json.dump(m, open(os.path.join(ROOT, "train/metrics_real.json"), "w"), indent=1)
    else:
        for r in predict(net, a.images): print(json.dumps(r, ensure_ascii=False))
