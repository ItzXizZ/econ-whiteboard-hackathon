"""Multi-task CNN baseline (CPU-friendly): graph type, right/wrong verdict, error type, and error-location heatmap.
python3 train/train.py --epochs 8"""
import argparse, json, os, time, numpy as np, torch, torch.nn as nn, torch.nn.functional as F, torchvision

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEAN = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1); STD = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)


class Net(nn.Module):
    def __init__(self, ng, ne, pretrained=True):
        super().__init__()
        m = torchvision.models.resnet18(weights="DEFAULT" if pretrained else None)
        self.stem = nn.Sequential(m.conv1, m.bn1, m.relu, m.maxpool, m.layer1, m.layer2, m.layer3)
        self.l4 = m.layer4
        self.heat = nn.Sequential(nn.Conv2d(256, 128, 3, padding=1), nn.ReLU(), nn.Conv2d(128, 1, 1))
        self.g, self.v, self.e = nn.Linear(512, ng), nn.Linear(512, 1), nn.Linear(512, ne)

    def forward(self, x):
        f3 = self.stem(x); z = F.adaptive_avg_pool2d(self.l4(f3), 1).flatten(1)
        return self.g(z), self.v(z).squeeze(1), self.e(z), self.heat(f3).squeeze(1)


def prep(img_u8, train=False):
    x = torch.from_numpy(img_u8).permute(0, 3, 1, 2).float() / 255
    if train:
        b = x.shape[0]
        x = (x - 0.5) * torch.empty(b, 1, 1, 1).uniform_(0.75, 1.25) + 0.5 + torch.empty(b, 1, 1, 1).uniform_(-0.1, 0.1)
        g = torch.rand(b) < 0.25
        x[g] = x[g].mean(1, keepdim=True).expand(-1, 3, -1, -1)
        x = x.clamp(0, 1)
    return (x - MEAN) / STD


def evaluate(net, D, idx, bs=64):
    net.eval(); out = {k: [] for k in ("g", "v", "e", "h")}
    with torch.no_grad():
        for i in range(0, len(idx), bs):
            j = idx[i:i + bs]; g, v, e, h = net(prep(D["img"][j]))
            out["g"].append(g.argmax(1).numpy()); out["v"].append((v > 0).numpy()); out["e"].append(e.argmax(1).numpy())
            out["h"].append(h.flatten(1).argmax(1).numpy())
    g, v, e, h = (np.concatenate(out[k]) for k in "gveh")
    yv = D["verdict"][idx].astype(bool); hm = D["heat"][idx].reshape(len(idx), -1)
    hit = hm[np.arange(len(idx)), h] > 0; has = hm.sum(1) > 0
    return {"graph_type_acc": float((g == D["gtype"][idx]).mean()),
            "verdict_acc": float((v == yv).mean()),
            "correct_recall": float((~v[~yv]).mean()), "incorrect_recall": float(v[yv].mean()),
            "error_type_acc_on_wrong": float((e[yv] == D["err"][idx][yv]).mean()),
            "error_location_hit": float(hit[yv & has].mean())}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--epochs", type=int, default=8); ap.add_argument("--bs", type=int, default=32)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--real", action="store_true", help="add hand-reviewed Wikimedia correct/incorrect images (verdict loss only)")
    ap.add_argument("--init", default="", help="start from these weights"); a = ap.parse_args()
    torch.set_num_threads(os.cpu_count()); torch.manual_seed(0); np.random.seed(0)
    D = dict(np.load(os.path.join(ROOT, "cache/synth.npz")))
    V = json.load(open(os.path.join(ROOT, "train/vocab.json")))
    D["syn"] = np.ones(len(D["verdict"]), np.float32)
    if a.real:
        from data import load_img, split_of
        cat = json.load(open(os.path.join(ROOT, "dataset/real/catalog.json"))); rs, ims = [], []
        for r in cat:
            if r.get("verdict") not in ("correct", "incorrect"): continue
            try: ims.append(load_img(os.path.join(ROOT, "dataset/real", r["image"]))); rs.append(r)
            except Exception: pass
        n = len(rs)
        R = {"img": np.stack(ims), "heat": np.zeros((n,) + D["heat"].shape[1:], D["heat"].dtype), "gtype": np.zeros(n, D["gtype"].dtype),
             "verdict": np.array([r["verdict"] == "incorrect" for r in rs], np.int64), "err": np.zeros(n, D["err"].dtype),
             "val": np.array([split_of(r["id"]) == "val" for r in rs]), "syn": np.zeros(n, np.float32)}
        D = {k: np.concatenate([D[k], R[k]]) for k in R}
    tr, va = np.where(~D["val"])[0], np.where(D["val"])[0]
    if a.limit: tr, va = tr[:a.limit], va[:a.limit // 4]
    va_real = va[D["syn"][va] == 0]; va = va[D["syn"][va] == 1]
    print(len(tr), "train", len(va), "val", len(va_real), "real val", flush=True)
    net = Net(len(V["graph_types"]), len(V["error_types"]))
    if a.init: net.load_state_dict(torch.load(a.init, map_location="cpu"))
    bb = [p for n, p in net.named_parameters() if n.startswith(("stem", "l4"))]; hd = [p for n, p in net.named_parameters() if not n.startswith(("stem", "l4"))]
    opt = torch.optim.AdamW([{"params": bb, "lr": 4e-4}, {"params": hd, "lr": 2e-3}], weight_decay=1e-4)
    steps = max(1, a.epochs * (len(tr) // a.bs)); sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=[4e-4, 2e-3], total_steps=steps, pct_start=0.1)
    pw = torch.tensor((D["verdict"][tr] == 0).sum() / max(1, D["verdict"][tr].sum()))
    best, log = -1, []
    for ep in range(a.epochs):
        net.train(); perm = np.random.permutation(tr); t0 = time.time(); tot = 0
        for k in range(len(tr) // a.bs):
            j = np.sort(perm[k * a.bs:(k + 1) * a.bs])
            x = prep(D["img"][j], train=True)
            g, v, e, h = net(x)
            yh = torch.from_numpy(D["heat"][j]); wrong = torch.from_numpy(D["verdict"][j]).float(); sy = torch.from_numpy(D["syn"][j])
            lh = (F.binary_cross_entropy_with_logits(h, yh, pos_weight=torch.tensor(6.0), reduction="none").mean((1, 2)) * wrong * sy).sum() / (wrong * sy).sum().clamp(min=1)
            ms = lambda l: (l * sy).sum() / sy.sum().clamp(min=1)
            loss = (ms(F.cross_entropy(g, torch.from_numpy(D["gtype"][j]), reduction="none")) + F.binary_cross_entropy_with_logits(v, wrong, pos_weight=pw)
                    + ms(F.cross_entropy(e, torch.from_numpy(D["err"][j]), reduction="none")) + lh)
            opt.zero_grad(); loss.backward(); opt.step(); sched.step(); tot += loss.item()
            if k % 50 == 0: print(f"ep{ep} step{k} loss {loss.item():.3f} {time.time() - t0:.0f}s", flush=True)
        m = evaluate(net, D, va) | {"epoch": ep, "train_loss": tot / (k + 1), "sec": round(time.time() - t0)}
        if len(va_real):
            mr = evaluate(net, D, va_real); m |= {"real_" + k: mr[k] for k in ("verdict_acc", "correct_recall", "incorrect_recall")}
        print(json.dumps(m), flush=True); log.append(m)
        score = m["verdict_acc"] + m["error_type_acc_on_wrong"] + m["graph_type_acc"] + m["error_location_hit"] + m.get("real_verdict_acc", 0)
        if score > best:
            best = score; torch.save(net.state_dict(), os.path.join(ROOT, "train/model.pt"))
    json.dump(log, open(os.path.join(ROOT, "train/metrics.json"), "w"), indent=1)
