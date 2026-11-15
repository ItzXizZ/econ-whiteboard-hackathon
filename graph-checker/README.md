# econ-graphs

Micro and macro economics graphs labeled correct or incorrect, with explanations, pixel annotations for every element, and step-by-step fixes for wrong graphs. Built for training a model that checks graphs and drives a whiteboard (highlight, move, fix).

- **Import into a product:** [`export/INTEGRATION.md`](export/INTEGRATION.md). Data is in `export/records.jsonl.gz` (schema `export/schema.json`); images are release assets.
- **Dataset details:** [`dataset/README.md`](dataset/README.md), taxonomy in [`dataset/TAXONOMY.md`](dataset/TAXONOMY.md).
- **Generate synthetic data:** `python3 generate.py --per 100 --out dataset/synthetic --jobs 8`
- **Train the baseline (CPU):** `python3 train/data.py && python3 train/train.py --epochs 15`
- **Whiteboard viewer:** `python3 -m http.server`, then open `/viewer/index.html`
- **Rebuild the export:** `python3 export.py`

## Check drawings offline (Mac/Linux, no internet)

One-time setup (needs internet once):
```bash
python3 -m venv .venv && .venv/bin/pip install torch torchvision pillow numpy
# download model.pt from the data-v2 release into train/
```
Then, fully offline:
```bash
.venv/bin/python check.py drawing.png            # or a folder
```
It prints graph type, correct/wrong, the mistake, why, and how to fix it, and saves `<name>.checked.png` with the suspected error boxed. Verified on macOS (Apple Silicon) with outbound network blocked by `sandbox-exec`; results matched the training machine exactly.

**Optional: plain-English tutor text from Bonsai 4B in LM Studio** (also offline, talks only to localhost):
```bash
lms get https://huggingface.co/prism-ml/Ternary-Bonsai-2-4B-gguf   # Q2_0 + mmproj-Q8_0 (vision), ~1.6 GB
lms server start && lms load ternary-bonsai-2-4b --identifier bonsai-4b -y
.venv/bin/python check.py --explain drawing.png
```
The vision model above decides right/wrong; Bonsai only rewrites the result as tutor text (about 1-2 s per graph with `BONSAI_REASONING=none`, the default). In testing, Bonsai 4B was **not** reliable as a grader or explainer:
- Asked to grade on its own, it called all 3 test drawings wrong, including the 2 correct ones, with made-up reasons.
- Told the checker's answer, it just agreed, including on a deliberately wrong mirrored drawing.
- In 4 of 5 explanations of wrong graphs it added economics errors, for example "MR must be parallel to demand".

Treat the checker's own `why`/`fix` lines as authoritative and Bonsai's text as a draft. `LMSTUDIO_MODEL` selects a larger local model.

## LM Studio labeling round (v3, not the default model)

A fine-tuning round where Bonsai-2 4B, served locally by LM Studio, checked the training labels:

1. `gen_lms_batch.py` generated 1,520 new graphs (fresh seeds, 13 graph types used by the whiteboard lessons, every mistake type).
2. `lmstudio/lmstudio_label.py` asked Bonsai-2 4B in LM Studio to read the curve labels on each image. The 1,262 images where Bonsai read at least half of the true curve labels were kept (`lmstudio/lmstudio_labels.jsonl`).
3. `lmstudio/finetune_mac.py` fine-tuned v2 on those 1,262 images plus 2,500 replayed training images, on an Apple-silicon GPU (MPS, 3 epochs, about 4 minutes). Output: `model_v3.pt` in the data-v2 release.

Same held-out tests as above (`train/compare_v3.json`):

| | v2 | v3 |
|---|---|---|
| Right vs wrong | 92.6% | 92.8% |
| Wrong graphs caught | 91.2% | 91.8% |
| Correct graphs passed | 97.4% | 96.2% |
| Label mistakes caught | 89.8% | 91.0% |
| Real diagrams: correct ones flagged wrong | 0 of 220 | 1 of 220 |

v3 is a wash overall: it catches slightly more mistakes but flags more correct graphs as wrong, so v2 stays the default. The images Bonsai read correctly are biased towards the easier ones, so this round is a labeling check, not an accuracy gain.

## How accurate is it?

Current model (v2): `train/model.pt` (ResNet-18, CPU-trained, about 46 MB, in the `data-v2` release). Input is 448x336, up from 320x240 in v1, so small labels are readable. It was initialized from v1 and trained for 5 more epochs on 18,274 synthetic graphs (v1 had 7,002), plus 1,012 hand-reviewed real diagrams. The new graphs include a new mistake type: two curves carry each other's labels, across 29 graph types. All numbers below are on held-out data neither model trained on. Both models were scored on the same graphs with `train/compare.py`.

**Synthetic held-out set** (2,555 graphs: 580 correct, 1,975 wrong)

| Task | v1 | v2 |
|---|---|---|
| Graph type (41 types) | 98.3% | 99.5% |
| Right vs wrong | 84.3% | 92.6% |
| Correct graphs passed | 88.5% | 97.4% |
| Wrong graphs caught | 83.1% | 91.2% |
| Which mistake it is (on wrong graphs) | 86.9% | 97.1% |
| Points at the wrong part of the graph (heatmap peak on the faulty element) | 88.0% | 92.7% |
| Label mistakes caught (959 swapped or wrong labels) | 73.7% | 89.8% |

**By drawing style** (right vs wrong, v1 -> v2)

| Style | n | Right vs wrong | Wrong caught | Which mistake |
|---|---|---|---|---|
| Clean / textbook | 602 | 84.7% -> 93.5% | 82.3% -> 91.8% | 89.6% -> 97.8% |
| Hand-drawn (marker, pencil, handwriting) | 1,016 | 85.5% -> 92.8% | 84.7% -> 91.1% | 88.0% -> 97.2% |
| Photo of a hand-drawn graph (tilt, glare, blur) | 937 | 82.8% -> 91.9% | 82.0% -> 91.0% | 84.1% -> 96.4% |

**Mistakes v2 still misses** (wrong graphs caught on the held-out set; small samples)

| Mistake | n | v1 | v2 |
|---|---|---|---|
| `curve_labels_swapped` (new) | 143 | 17% | 96% |
| `point_labels_wrong` (PPF) | 14 | 29% | 100% |
| `atc_avc_labels_swapped` | 15 | 13% | 87% |
| `qs_qd_swapped` | 34 | 15% | 3% |
| `q_labels_swapped` | 29 | 0% | 3% |
| `loss_labeled_profit` | 15 | 7% | 7% |
| `ms_shift_wrong_direction` | 13 | 0% | 0% |
| `comparative_advantage_reversed` | 13 | 23% | 0% |
| `fx_label_wrong` | 12 | 67% | 0% |
| `shift_wrong_direction` | 36 | 56% | 31% |

For most of these, the model often names the right mistake when asked, but still says "correct". These are small swaps of one label or direction on an otherwise normal-looking graph. Full per-mistake numbers: `train/compare_v1.json`, `train/compare_v2.json`.

**User drawings and hand-made tests** (`user_tests/`)

- 2 correct hand drawings (supply/demand, monopoly): both models say correct.
- 6 generated wrong graphs: v1 caught 5 and missed the wrong PPF point labels; v2 caught all 6 and named each mistake.
- A mirrored copy of the supply/demand drawing, where D slopes up: **both models still call it correct**. v2 thinks it is a monopsony graph.

**Real diagrams from Wikimedia Commons** (222 held out, hand-reviewed)

- Right vs wrong: v1 99.1%, v2 99.5%. Correct diagrams passed: v1 219 of 220, v2 220 of 220. Wrong diagrams caught: 1 of 2, for both models.
- Caution: 220 of these 222 are correct, so a model that always answers "correct" would score 99.1%. This mainly shows the model does not reject real correct diagrams. It says almost nothing about catching real mistakes.
- Before real images were added, the synthetic-only model flagged about 90% of correct real diagrams as wrong. Fine-tuning fixed that.

**Limits, read before relying on it**

- The synthetic test graphs come from the same generator as the training graphs: same mistake types, same drawing styles. High synthetic scores mean the model is good at the generator's mistakes, not at every mistake a person can make.
- Genuinely wrong diagrams are rare online: only 18 among the 1,862 reviewed. So wrong-graph detection on real diagrams is essentially unmeasured.
- Mistake type, location, and fix steps are scored only on synthetic graphs. Real diagrams have a right/wrong label but no per-element annotations.
- Hand-drawn results come from synthetic hand-drawn renders, not real photos of people's drawings. Test it on your own photos with `python3 train/predict.py photo.jpg`.
- Metrics files: `train/compare_v1.json` and `train/compare_v2.json` (the tables above), and `train/metrics.json` (v2 training log). The v1 files are `train/metrics_synth_only.json`, `train/metrics_finetune.json`, `train/metrics_by_style.json`, and `train/metrics_real.json`; the last covers all reviewed real images, including training ones, so it overstates accuracy. The v1 model is still in the `data-v1` release.

