# Economics graph correctness dataset

Economics diagrams (micro and macro) labeled **correct** or **incorrect**. Each one comes with an explanation and pixel geometry for every element, so a model can say what is wrong, point to it on a whiteboard, and walk through the graph step by step.

## Contents

| Part | Path | Size |
|---|---|---|
| Taxonomy of graphs and concepts | `taxonomy.json`, `TAXONOMY.md` | 83 graphs (56 micro, 27 macro); 44 have a synthetic generator |
| Synthetic graphs, correct and wrong | `synthetic/` | 18274 images: 4100 correct, 14174 incorrect; 41 graph types, 236 error types |
| VLM training file | `synthetic/vlm_train.jsonl` | one chat record per synthetic image |
| Real online diagrams (Wikimedia Commons) | `real/catalog.json`, `real/images/` | 1862 openly licensed files; 1862 manually reviewed |

### Real diagram review status
- `correct`: 1216
- `off_topic`: 507
- `ambiguous`: 121
- `incorrect`: 18

Flagged **incorrect** real diagrams:
- [PPF opportunity cost inverted-mr.svg](https://commons.wikimedia.org/wiki/File:PPF_opportunity_cost_inverted-mr.svg): The frontier is convex to the origin, which implies decreasing opportunity cost. The standard PPF is concave (bowed out) because resources are not equally suited to both goods. (The file title says it is intentionally 'inverted'.)
- [Baisse des prix et des quantités.png](https://commons.wikimedia.org/wiki/File:Baisse_des_prix_et_des_quantit%C3%A9s.png): The upward-sloping curve is labeled Demande and the downward-sloping curves Offre 1 / Offre 2. Demand slopes down and supply slopes up, so the labels are swapped. (The shift shown, lower P and lower Q, is a decrease in demand.)
- [Átlagköltség hosszú távon.png](https://commons.wikimedia.org/wiki/File:%C3%81tlagk%C3%B6lts%C3%A9g_hossz%C3%BA_t%C3%A1von.png): The LAC envelope is drawn through the minimum point of every short-run AC curve (Viner's error). Only at the minimum of LAC does the tangency occur at an SRAC minimum; on the falling part of LAC the tangency is left of the SRAC minimum, on the rising part to the right.
- [Indifference-curves-transitivity-de.svg](https://commons.wikimedia.org/wiki/File:Indifference-curves-transitivity-de.svg): I1 and I2 intersect at B. Crossing indifference curves contradict transitivity and monotonic preferences (this figure is a didactic counterexample).
- [Simple Indifference Curve with Intransitive Preferences (no text).svg](https://commons.wikimedia.org/wiki/File:Simple_Indifference_Curve_with_Intransitive_Preferences_(no_text).svg): The two indifference curves cross, which violates transitivity.
- [Effect of Changes in Supply and Demand on the Potato Market.png](https://commons.wikimedia.org/wiki/File:Effect_of_Changes_in_Supply_and_Demand_on_the_Potato_Market.png): Price-axis tick values increase downward (10 at the top, 20 at the bottom), so the visual slopes of supply and demand are reversed relative to the standard convention.
- [Gleichgewicht.jpg](https://commons.wikimedia.org/wiki/File:Gleichgewicht.jpg): The upward-sloping line is labeled Nachfrage (demand) and the downward-sloping line Angebot (supply). Demand slopes down and supply slopes up, so the labels are reversed.
- [America Lorenz Curve.png](https://commons.wikimedia.org/wiki/File:America_Lorenz_Curve.png): The Lorenz curve bends past 100% of the population and curls back up. A Lorenz curve is a non-decreasing, convex curve inside the unit square from (0,0) to (100,100).
- [PPF opportunity cost inverted-bn.svg](https://commons.wikimedia.org/wiki/File:PPF_opportunity_cost_inverted-bn.svg): The frontier is convex to the origin, which implies decreasing opportunity cost. The standard PPF is concave (bowed out) because resources are not equally suited to both goods. (File title says it is intentionally 'inverted'.)
- [PPF opportunity cost inverted-kn.svg](https://commons.wikimedia.org/wiki/File:PPF_opportunity_cost_inverted-kn.svg): The frontier is convex to the origin, which implies decreasing opportunity cost. The standard PPF is concave (bowed out) because resources are not equally suited to both goods. (File title says it is intentionally 'inverted'.)
- [PPF opportunity cost inverted-ml.svg](https://commons.wikimedia.org/wiki/File:PPF_opportunity_cost_inverted-ml.svg): The frontier is convex to the origin, which implies decreasing opportunity cost. The standard PPF is concave (bowed out) because resources are not equally suited to both goods. (File title says it is intentionally 'inverted'.)
- [PPF opportunity cost inverted-pa.svg](https://commons.wikimedia.org/wiki/File:PPF_opportunity_cost_inverted-pa.svg): The frontier is convex to the origin, which implies decreasing opportunity cost. The standard PPF is concave (bowed out) because resources are not equally suited to both goods. (File title says it is intentionally 'inverted'.)
- [PPF opportunity cost inverted-ta.svg](https://commons.wikimedia.org/wiki/File:PPF_opportunity_cost_inverted-ta.svg): The frontier is convex to the origin, which implies decreasing opportunity cost. The standard PPF is concave (bowed out) because resources are not equally suited to both goods. (File title says it is intentionally 'inverted'.)
- [PPF opportunity cost inverted-te.svg](https://commons.wikimedia.org/wiki/File:PPF_opportunity_cost_inverted-te.svg): The frontier is convex to the origin, which implies decreasing opportunity cost. The standard PPF is concave (bowed out) because resources are not equally suited to both goods. (File title says it is intentionally 'inverted'.)
- [PPF opportunity cost inverted.svg](https://commons.wikimedia.org/wiki/File:PPF_opportunity_cost_inverted.svg): The frontier is convex to the origin, which implies decreasing opportunity cost. The standard PPF is concave (bowed out) because resources are not equally suited to both goods. (File title says it is intentionally 'inverted'.)
- [Tax-inelasticdemand-elasticsupply.gif](https://commons.wikimedia.org/wiki/File:Tax-inelasticdemand-elasticsupply.gif): The supply curve is shifted up by a fixed amount per unit, which is a per-unit (specific) tax, but the gap is labeled 'Magnitude of Lump Sum Tax'. A lump-sum tax does not change marginal cost, so it would not shift supply.
- [Tax-inelasticsupply-elasticdemand.gif](https://commons.wikimedia.org/wiki/File:Tax-inelasticsupply-elasticdemand.gif): The supply curve is shifted up by a fixed amount per unit, which is a per-unit (specific) tax, but the gap is labeled 'Magnitude of Lump Sum Tax'. A lump-sum tax does not change marginal cost, so it would not shift supply.
- [DemandElasticity-he.svg](https://commons.wikimedia.org/wiki/File:DemandElasticity-he.svg): D3 is a straight downward-sloping line labeled unit elastic. Elasticity varies along a linear demand curve (elastic above the midpoint, inelastic below), so a line cannot be unit elastic everywhere.

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
