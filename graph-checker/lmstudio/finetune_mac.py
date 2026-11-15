"""Fine-tune the v2 graph checker on Apple-silicon GPU (MPS) with the LM Studio-labeled batch plus a replay sample of the original training set.
python3 finetune_mac.py --epochs 3   -> train/model_v3.pt"""
import argparse, json, os, sys, time, numpy as np, torch, torch.nn.functional as F
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, "train"))
from train import Net, prep
from PIL import Image
W, H, S = 448, 336, 16


def load_img(path):
    im = Image.open(path).convert("RGB"); im.thumbnail((W, H), Image.BILINEAR)
    c = Image.new("RGB", (W, H), "white"); c.paste(im, ((W - im.width) // 2, (H - im.height) // 2)); return np.asarray(c, dtype=np.uint8)


def heat(rec):
    m = np.zeros((H // S, W // S), np.float32)
    if rec["verdict"] != "incorrect": return m
    by = {e["id"]: e for e in rec["elements"]}; sx, sy = W / rec["width"], H / rec["height"]
    for h in rec["error"]["highlight"]:
        e = by.get(h); b = e and (e.get("bbox") or e.get("label_bbox"))
        if not b: continue
        x0, y0, x1, y1 = b
        m[max(0, int(y0 * sy / S)):int(np.ceil(y1 * sy / S)), max(0, int(x0 * sx / S)):int(np.ceil(x1 * sx / S))] = 1
    return m


def load_dir(d, ids):
    X, Hm, G, Vd, E = [], [], [], [], []
    for i in ids:
        r = json.load(open(os.path.join(d, "annotations", i + ".json")))
        if r["graph_type"] not in V["graph_types"]: continue
        et = r["error"]["type"] if r["error"] else "none"
        if et not in V["error_types"]: continue
        X.append(load_img(os.path.join(d, r["image"]))); Hm.append(heat(r)); G.append(V["graph_types"].index(r["graph_type"]))
        Vd.append(int(r["verdict"] == "incorrect")); E.append(V["error_types"].index(et))
    return [np.stack(X), np.stack(Hm), np.array(G), np.array(Vd), np.array(E)]


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--epochs", type=int, default=3); ap.add_argument("--bs", type=int, default=32); a = ap.parse_args()
    torch.manual_seed(0); np.random.seed(0)
    dev = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    V = json.load(open(os.path.join(ROOT, "train/vocab.json")))
    lab = [json.loads(l) for l in open(os.path.join(HERE, "batch/lmstudio_labels.jsonl"))]
    keep = [r["id"] for r in lab if r["keep"]]
    replay = [l.strip() for l in open(os.path.join(HERE, "replay/replay_ids.txt")) if l.strip()]
    A, B = load_dir(os.path.join(HERE, "batch"), keep), load_dir(os.path.join(HERE, "replay"), replay)
    D = [np.concatenate([x, y]) for x, y in zip(A, B)]
    img, hm, gt, vd, er = D; n = len(vd)
    print(f"{len(A[3])} LM Studio-checked images (of {len(lab)} labeled) + {len(B[3])} replay = {n}; device {dev}", flush=True)
    net = Net(len(V["graph_types"]), len(V["error_types"]), pretrained=False)
    net.load_state_dict(torch.load(os.path.join(ROOT, "train/model_v2.pt"), map_location="cpu")); net.to(dev)
    bb = [p for k, p in net.named_parameters() if k.startswith(("stem", "l4"))]; hd = [p for k, p in net.named_parameters() if not k.startswith(("stem", "l4"))]
    opt = torch.optim.AdamW([{"params": bb, "lr": 1e-4}, {"params": hd, "lr": 5e-4}], weight_decay=1e-4)
    steps = a.epochs * (n // a.bs); sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=[1e-4, 5e-4], total_steps=steps, pct_start=0.1)
    pw = torch.tensor(float((vd == 0).sum() / max(1, vd.sum())), device=dev)
    for ep in range(a.epochs):
        net.train(); perm = np.random.permutation(n); t0 = time.time(); tot = 0
        for k in range(n // a.bs):
            j = np.sort(perm[k * a.bs:(k + 1) * a.bs])
            g, v, e, h = net(prep(img[j], train=True).to(dev))
            yh = torch.from_numpy(hm[j]).to(dev); w = torch.from_numpy(vd[j]).float().to(dev)
            lh = (F.binary_cross_entropy_with_logits(h, yh, pos_weight=torch.tensor(6.0, device=dev), reduction="none").mean((1, 2)) * w).sum() / w.sum().clamp(min=1)
            loss = (F.cross_entropy(g, torch.from_numpy(gt[j]).to(dev)) + F.binary_cross_entropy_with_logits(v, w, pos_weight=pw)
                    + F.cross_entropy(e, torch.from_numpy(er[j]).to(dev)) + lh)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step(); tot += loss.item()
        print(json.dumps({"epoch": ep, "train_loss": round(tot / (k + 1), 4), "sec": round(time.time() - t0)}), flush=True)
    torch.save({k: t.cpu() for k, t in net.state_dict().items()}, os.path.join(ROOT, "train/model_v3.pt")); print("saved train/model_v3.pt")
