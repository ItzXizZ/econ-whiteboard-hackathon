# Importing econ-graphs into a product

Everything is in one file, `export/records.jsonl.gz`: one JSON record per graph image, schema in `export/schema.json` (version `1.0`). The images come as release assets.

## Get the data

```bash
git clone https://github.com/chiaraluey/econ-data-hacakthon.git && cd econ-data-hacakthon
gh release download data-v2 -D images_dl        # images-synthetic-1.tar, images-synthetic-2.tar, images-real.tar, images-openstax.tar, model.pt
mkdir -p images && for t in images_dl/images-*.tar; do tar -xf "$t" -C images; done
python3 export/loader.py export/records.jsonl.gz # prints counts by source and verdict
```

`record.image` is relative to `images/`, for example `synthetic/images/<id>.png`.

## What a record gives you

| Field | Use in the product |
|---|---|
| `verdict` | `correct` / `incorrect` (and `ambiguous`, `off_topic`, `unreviewed` for real images) |
| `graph_type` | which graph it is (ids from `dataset/taxonomy.json`) |
| `error.explanation`, `error.fix` | what is wrong and how to fix it, in plain text |
| `error.highlight_bboxes` | pixel boxes to highlight on the whiteboard |
| `explanation_steps[]` | step-by-step walkthrough, each step with boxes to highlight |
| `elements[]` | every curve, point, region, label, with pixel geometry (`polyline`, `polygon`, `bbox`) to draw or drag |
| `correction.actions[]` | how to make a wrong graph right: `move` / `relabel` / `add` / `remove` with target geometry; animate each action to fix the drawing |
| `pair_id`, `correction.corrected_id` | the correct version of the same graph |
| `license`, `author`, `source_page` | attribution, shown for real images |

All coordinates are image pixels `[x0, y0, x1, y1]` from the top-left. Scale them by `display_width / width` when drawing over a resized image.

Only `synthetic` records have `elements` and `correction`. Real images (`wikimedia`, `openstax`) have a verdict and text only. Use `verdicts=["correct","incorrect"]` in the loader to skip unreviewed ones.

## Applying a correction on the whiteboard

```js
for (const a of rec.correction.actions) {
  if (a.follows) continue;                                    // moves along with its parent
  if (a.action === "move")    animateTo(a.element, a.to_polyline || a.to_polygon || a.to_bbox);
  if (a.action === "relabel") setLabel(a.element, a.to_label);
  if (a.action === "add")     drawElement(a);                 // a.polyline / a.polygon / a.bbox
  if (a.action === "remove")  fadeOut(a.element);
}
```

## Updating

Re-run `python3 export.py` after new reviews or generated data; it rewrites `records.jsonl.gz` and `MANIFEST.json` (counts + sha256) and rebuilds the image tars. Bump `schema_version` on breaking field changes. Licenses: synthetic CC0; OpenStax CC BY-NC-SA 4.0 (non-commercial); Wikimedia per record.
