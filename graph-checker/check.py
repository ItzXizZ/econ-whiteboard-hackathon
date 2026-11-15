"""Offline econ-graph checker: no network needed once train/model.pt is present.
python3 check.py drawing.png [more.jpg ...]     (or a folder)
    python3 check.py --explain drawing.png         (Bonsai 4B in LM Studio explains the result)
Prints the verdict, mistake, and fix, and writes <name>.checked.png with the suspected error area boxed."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "train"))
from predict import model, predict
from PIL import Image, ImageDraw


def collect(args):
    paths = []
    for a in args or ["."]:
        if os.path.isdir(a):
            paths += [os.path.join(a, f) for f in sorted(os.listdir(a)) if f.lower().endswith((".png", ".jpg", ".jpeg")) and ".checked." not in f]
        else:
            paths.append(a)
    return paths


def mark(r):
    im = Image.open(r["image"]).convert("RGB"); d = ImageDraw.Draw(im); x0, y0, x1, y1 = r["error_bbox"]; pad = max(im.size) // 25
    d.rectangle([x0 - pad, y0 - pad, x1 + pad, y1 + pad], outline=(230, 30, 30), width=max(3, max(im.size) // 200))
    out = os.path.splitext(r["image"])[0] + ".checked.png"; im.save(out); return out


def report(r):
    s = f"\n{os.path.basename(r['image'])}: {r['graph_type'].replace('_', ' ')} ({r['graph_type_conf']:.0%})\n"
    if r["verdict"] == "correct":
        return s + f"  CORRECT  (chance it's wrong: {r['p_incorrect']:.0%})"
    s += f"  WRONG    (confidence {r['p_incorrect']:.0%}): {r['error_type'].replace('_', ' ')}"
    if r.get("explanation"): s += "\n  why: " + r["explanation"]
    if r.get("fix"): s += "\n  fix: " + r["fix"]
    return s + "\n  marked: " + mark(r)


if __name__ == "__main__":
    args = sys.argv[1:]; explain = "--explain" in args; paths = collect([a for a in args if a != "--explain"])
    if not paths: sys.exit(__doc__)
    for r in predict(model(), paths):
        print(report(r))
        if explain:
            from bonsai import ask
            try:
                b = ask(r)
            except Exception as ex:
                print(f"  bonsai: unavailable ({ex}); is the LM Studio server running with bonsai-4b loaded?"); continue
            print("  bonsai:", b["explanation"])
            if r["verdict"] == "incorrect" and b.get("fix"): print("  bonsai fix:", b["fix"])
