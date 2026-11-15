# Graph checker (trained model)

The whiteboard recognizes graphs drawn on the board with a separate image model trained on economics graphs. The model, its training code and its training data live in [chiaraluey/econ-data-hacakthon](https://github.com/chiaraluey/econ-data-hacakthon). The model is a PyTorch ResNet-18 that predicts graph type, right/wrong, mistake type and where the mistake is. It is not a language model. `server/graphCheck.js` starts `server/graph_worker.py`, which loads the model once and answers on stdin/stdout. Nothing leaves the laptop.

## One-time setup (needs internet once)

```bash
git clone https://github.com/chiaraluey/econ-data-hacakthon.git ~/econ-graph-checker
cd ~/econ-graph-checker
python3 -m venv .venv && .venv/bin/pip install torch torchvision pillow numpy
# Download model.pt from the data-v2 release into train/:
#   https://github.com/chiaraluey/econ-data-hacakthon/releases/tag/data-v2
```

The app then finds it at `~/econ-graph-checker` by default. `GRAPH_CHECKER_DIR` points it elsewhere, `GRAPH_CHECKER_PYTHON` picks the Python to use, and `GRAPH_CHECKER=0` turns it off. `/api/health` reports `graphChecker.state: "ready"` once it's loaded.

## Models in the data-v2 release

| File | Training | Held-out right vs wrong | Wrong graphs caught | Correct graphs passed |
| --- | --- | --- | --- | --- |
| `model.pt` (v2, default) | 18,274 synthetic + reviewed graphs, 448×336 | 92.6% | 91.2% | 97.4% |
| `model_v3.pt` | v2 fine-tuned on 1,262 graphs whose labels Bonsai-2 4B in LM Studio read correctly, plus 2,500 replayed graphs | 92.8% | 91.8% | 96.2% |

v2 is the default: v3 flags slightly more correct graphs as wrong. Both still miss a mirrored supply/demand drawing. See that repo's README for the full tables and caveats.

The app only names a graph at high confidence. It never tells a student a graph is correct on the model's word alone. `server/graphRules.js` measures supply/demand mistakes, such as a demand curve sloping up, directly from the strokes.
