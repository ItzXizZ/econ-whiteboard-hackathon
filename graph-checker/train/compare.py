"""Score one model on held-out data (never trained on): synthetic val split, real reviewed val split, and user_tests drawings.
python3 train/compare.py --model train/model_v1.pt --vocab train/vocab.json --size 320x240 --out train/compare_v1.json
python3 train/compare.py --model train/model.pt --vocab train/vocab.json --size 448x336 --out train/compare_v2.json"""
import argparse, json, os, sys, numpy as np, torch
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import data
from data import ROOT, split_of
from train import Net, prep

LABEL_ERRORS = lambda n: any(k in n for k in ("label", "swapped", "_read_from_", "mislabeled"))


def run(net, paths, bs=48):
    with Pool(8) as p: imgs = p.map(data.load_img, paths, chunksize=16)
    out = {k: [] for k in "gvehp"}
    with torch.no_grad():
        for i in range(0, len(imgs), bs):
            g, v, e, h = net(prep(np.stack(imgs[i:i + bs])))
            out["g"].append(g.argmax(1).numpy()); out["v"].append((v > 0).numpy()); out["e"].append(e.argmax(1).numpy())
            out["p"].append(torch.sigmoid(v).numpy()); hh = h.flatten(1).argmax(1).numpy(); out["h"].append(np.stack([hh // h.shape[2], hh % h.shape[2], np.full_like(hh, h.shape[1]), np.full_like(hh, h.shape[2])], 1))
    return {k: np.concatenate(v) for k, v in out.items()}


def scores(yv, pv, ok_e=None, ok_g=None):
    m = {"n": int(len(yv)), "n_wrong": int(yv.sum()), "verdict_acc": float((pv == yv).mean()),
         "correct_recall": float((~pv[~yv]).mean()) if (~yv).any() else None, "wrong_recall": float(pv[yv].mean()) if yv.any() else None}
    if ok_g is not None: m["graph_type_acc"] = float(ok_g.mean())
    if ok_e is not None and yv.any(): m["error_type_acc_on_wrong"] = float(ok_e[yv].mean())
    return {k: (round(v, 4) if isinstance(v, float) else v) for k, v in m.items()}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--model"); ap.add_argument("--vocab"); ap.add_argument("--size"); ap.add_argument("--out"); a = ap.parse_args()
    data.W, data.H = map(int, a.size.split("x"))
    torch.set_num_threads(os.cpu_count())
    MV, NV = json.load(open(a.vocab)), json.load(open(os.path.join(ROOT, "train/vocab.json")))
    net = Net(len(MV["graph_types"]), len(MV["error_types"]), pretrained=False)
    net.load_state_dict(torch.load(a.model, map_location="cpu")); net.eval()
    D = np.load(os.path.join(ROOT, "cache/synth.npz")); va = np.where(D["val"])[0]
    ids = D["ids"][va]; yv = D["verdict"][va].astype(bool); heat = D["heat"][va]
    yg = np.array([NV["graph_types"][i] for i in D["gtype"][va]]); ye = np.array([NV["error_types"][i] for i in D["err"][va]])
    P = run(net, [os.path.join(ROOT, "dataset/synthetic/images", str(i) + ".png") for i in ids])
    pg = np.array([MV["graph_types"][i] for i in P["g"]]); pe = np.array([MV["error_types"][i] for i in P["e"]])
    ok_g, ok_e = pg == yg, pe == ye
    gy, gx = heat.shape[1:]
    hit = np.array([heat[k, min(gy - 1, int((r + .5) / R * gy)), min(gx - 1, int((c + .5) / C * gx))] > 0 for k, (r, c, R, C) in enumerate(P["h"])])
    has = heat.reshape(len(va), -1).sum(1) > 0
    style = []
    for i in ids:
        s = json.load(open(os.path.join(ROOT, "dataset/synthetic/annotations", str(i) + ".json")))["render_style"]
        style.append("photo_of_hand_drawn" if s.get("photo") else "hand_drawn" if s.get("hand") or s.get("sketch") else "clean")
    style = np.array(style)
    res = {"model": a.model, "size": a.size, "synthetic_val": scores(yv, P["v"], ok_e, ok_g) | {"error_location_hit": round(float(hit[yv & has].mean()), 4)}}
    res["synthetic_val_by_style"] = {s: scores(yv[style == s], P["v"][style == s], ok_e[style == s], ok_g[style == s]) for s in ("clean", "hand_drawn", "photo_of_hand_drawn")}
    lab = np.array([LABEL_ERRORS(e) for e in ye])
    res["synthetic_val_label_reading_errors"] = scores(yv[lab], P["v"][lab], ok_e[lab])
    res["synthetic_val_per_error"] = {e: scores(yv[ye == e], P["v"][ye == e], ok_e[ye == e]) for e in sorted(set(ye))}
    cat = json.load(open(os.path.join(ROOT, "dataset/real/catalog.json")))
    rs = [r for r in cat if r.get("verdict") in ("correct", "incorrect") and split_of(r["id"]) == "val" and os.path.exists(os.path.join(ROOT, "dataset/real", r["image"]))]
    PR = run(net, [os.path.join(ROOT, "dataset/real", r["image"]) for r in rs])
    res["real_val"] = scores(np.array([r["verdict"] == "incorrect" for r in rs]), PR["v"])
    ut = sorted(os.path.join(dp, f) for dp, _, fs in os.walk(os.path.join(ROOT, "user_tests")) for f in fs if f.endswith(".png") and ".checked." not in f and "_preview" not in dp)
    PU = run(net, ut)
    res["user_tests"] = [{"image": os.path.relpath(p, ROOT), "expected": "wrong" if ("WRONG" in p or "synthetic_wrong" in p) else "correct",
                          "graph_type": MV["graph_types"][g], "verdict": "wrong" if v else "correct", "p_wrong": round(float(q), 3), "error_type": MV["error_types"][e] if v else None}
                         for p, g, v, q, e in zip(ut, PU["g"], PU["v"], PU["p"], PU["e"])]
    json.dump(res, open(a.out, "w"), indent=1)
    print(json.dumps({k: v for k, v in res.items() if k != "synthetic_val_per_error"}, indent=1))
