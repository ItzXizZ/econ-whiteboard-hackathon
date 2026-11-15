"""Synthetic validation accuracy split by drawing style (clean / hand-drawn / photo of hand-drawn)."""
import json, os, sys, numpy as np, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from data import ROOT
from train import Net, prep
D = dict(np.load(os.path.join(ROOT, "cache/synth.npz"))); V = json.load(open(os.path.join(ROOT, "train/vocab.json")))
net = Net(len(V["graph_types"]), len(V["error_types"]), pretrained=False)
net.load_state_dict(torch.load(os.path.join(ROOT, "train/model.pt"), map_location="cpu")); net.eval()
va = np.where(D["val"])[0]
def style(i):
    s = json.load(open(os.path.join(ROOT, "dataset/synthetic/annotations", str(D["ids"][i]) + ".json")))["render_style"]
    return "photo_of_hand_drawn" if s.get("photo") else "hand_drawn" if s.get("hand") or s.get("sketch") else "clean"
st = np.array([style(i) for i in va]); P = {"g": [], "v": [], "e": []}
with torch.no_grad():
    for k in range(0, len(va), 64):
        g, v, e, _ = net(prep(D["img"][va[k:k + 64]])); P["g"].append(g.argmax(1).numpy()); P["v"].append((v > 0).numpy()); P["e"].append(e.argmax(1).numpy())
g, v, e = (np.concatenate(P[x]) for x in "gve"); yv = D["verdict"][va].astype(bool)
out = {}
for s in ("clean", "hand_drawn", "photo_of_hand_drawn"):
    m = st == s; w = m & yv
    out[s] = {"n": int(m.sum()), "graph_type_acc": round(float((g[m] == D["gtype"][va][m]).mean()), 3), "verdict_acc": round(float((v[m] == yv[m]).mean()), 3),
              "error_type_acc_on_wrong": round(float((e[w] == D["err"][va][w]).mean()), 3)}
print(json.dumps(out, indent=1)); json.dump(out, open(os.path.join(ROOT, "train/metrics_by_style.json"), "w"), indent=1)
