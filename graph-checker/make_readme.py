"""Write dataset/README.md with live counts."""
import json, collections, glob
tax = json.load(open("dataset/taxonomy.json"))
man = [json.loads(l) for l in open("dataset/synthetic/manifest.jsonl")]
cat = json.load(open("dataset/real/catalog.json"))
v = collections.Counter(r["verdict"] for r in man)
gt = len({r["graph_type"] for r in man}); et = len({(r["graph_type"], r["error_type"]) for r in man if r["error_type"]})
rv = collections.Counter(r["verdict"] for r in cat)
bad = [r for r in cat if r["verdict"] == "incorrect"]
fields = collections.Counter(t["field"] for t in tax); gen = sum(1 for t in tax if t["generator"])
md = f"""# Economics graph correctness dataset

Economics diagrams (micro and macro) labeled **correct** or **incorrect**. Each one comes with an explanation and pixel geometry for every element, so a model can say what is wrong, point to it on a whiteboard, and walk through the graph step by step.

## Contents

| Part | Path | Size |
|---|---|---|
| Taxonomy of graphs and concepts | `taxonomy.json`, `TAXONOMY.md` | {len(tax)} graphs ({fields['micro']} micro, {fields['macro']} macro); {gen} have a synthetic generator |
| Synthetic graphs, correct and wrong | `synthetic/` | {len(man)} images: {v['correct']} correct, {v['incorrect']} incorrect; {gt} graph types, {et} error types |
| VLM training file | `synthetic/vlm_train.jsonl` | one chat record per synthetic image |
| Real online diagrams (Wikimedia Commons) | `real/catalog.json`, `real/images/` | {len(cat)} openly licensed files; {sum(rv.values()) - rv['unreviewed']} manually reviewed |

### Real diagram review status
{chr(10).join(f'- `{k}`: {n}' for k, n in rv.most_common())}

Flagged **incorrect** real diagrams:
{chr(10).join(f"- [{r['title'][5:]}]({r['source_page']}): {r['review']['explanation']}" for r in bad)}

Real wrong diagrams are rare on Commons. Most of the wrong examples come from the synthetic set, which applies textbook mistakes to correct graphs on purpose. `real/catalog.json` also has a `triage.likely_diagram` flag, a pixel-statistics heuristic that helps sort out photos, posters and maps. It is only a hint for triage, not a judgment.

## Synthetic record (`synthetic/annotations/<id>.json`)

- `verdict`: `correct` or `incorrect`. `pair_id` links each wrong image to the correct graph it was made from (same seed).
- `error`: `type`, `severity`, `highlight` (element ids), `explanation`, `fix`.
- `elements[]`: `id`, `kind` (axis, curve, point, region, arrow, guide, tick, text), `role` (demand, supply, lras, deadweight_loss, ...), `label`, pixel `bbox`, `label_bbox`, `polyline`/`polygon`/`center`, plus `data_polyline`/`data_xy` in graph units.
- `explanation_steps[]`: `text` plus the element ids to `highlight`. This drives the whiteboard walkthrough.
- `render_style`: sketch or clean, palette, line width and font size, randomized so the model does not learn one look.

Images are 800x600 px and licensed CC0. Real images keep the original Commons license, author and source page in their catalog records.

## Whiteboard viewer

Run `python3 -m http.server` from the repo root, then open `/viewer/index.html`. You can filter by verdict or graph type, hover over an element to see its role, step through the explanation highlights, and use **show error** to see what is wrong. In vector mode you can drag curves, points and regions.

## Regenerate

```
python3 taxonomy.py                                   # taxonomy.json / TAXONOMY.md
python3 generate.py --per 40 --out dataset/synthetic  # synthetic set
python3 harvest.py && python3 curate_wikimedia.py     # Commons harvest + download
python3 diagram_score.py && python3 apply_reviews.py  # triage + manual reviews
python3 make_readme.py
```
"""
open("dataset/README.md", "w").write(md); print(md[:1500])
