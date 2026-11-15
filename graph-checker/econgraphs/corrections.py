"""Derive a correction (how to make a wrong graph right) by diffing it against its correct pair.

Pairs share seed and render style, so pixel geometry is directly comparable: each action says which
element to move / relabel / add / remove and gives its target geometry, so a whiteboard can animate the fix.
"""
GEOM = ("polyline", "polygon", "center", "from", "to", "bbox", "data_xy", "data_polyline")


def diff(wrong, right):
    ew = {e["id"]: e for e in wrong["elements"]}
    er = {e["id"]: e for e in right["elements"]}
    acts = []
    for k in ("x", "y"):
        if wrong["axes"].get(k) != right["axes"].get(k):
            acts.append({"action": "relabel", "element": f"{k}_axis", "from_label": wrong["axes"].get(k), "to_label": right["axes"].get(k)})
    for i, w in ew.items():
        r = er.get(i)
        if r is None:
            acts.append({"action": "remove", "element": i, "role": w["role"], "bbox": w.get("bbox")})
            continue
        if any(w.get(g) != r.get(g) for g in GEOM):
            a = {"action": "move", "element": i, "role": r["role"], "from_bbox": w.get("bbox"), "to_bbox": r.get("bbox")}
            for g in ("polyline", "polygon", "center", "from", "to", "data_xy"):
                if r.get(g) is not None and w.get(g) != r.get(g): a["to_" + g] = r[g]
            acts.append(a)
        if w.get("label") != r.get("label"):
            acts.append({"action": "relabel", "element": i, "role": r["role"], "from_label": w.get("label"), "to_label": r.get("label"),
                         "label_bbox": r.get("label_bbox") or w.get("label_bbox")})
    for i, r in er.items():
        if i not in ew:
            a = {"action": "add", "element": i, "role": r["role"], "kind": r["kind"], "label": r.get("label"), "bbox": r.get("bbox")}
            for g in ("polyline", "polygon", "center", "from", "to"):
                if r.get(g) is not None: a[g] = r[g]
            acts.append(a)
    # guides/ticks follow their point; keep them but mark as dependent so UIs can animate them together
    pts = {a["element"] for a in acts if a["action"] == "move"}
    for a in acts:
        base = a["element"].rsplit("_", 1)[0]
        if base != a["element"] and base in pts: a["follows"] = base
    return {"corrected_id": right["id"], "corrected_image": right["image"], "fix": wrong["error"]["fix"], "actions": acts}


def compact(c):
    """Short form for model targets: element, action, target box/label only."""
    out = []
    for a in c["actions"]:
        if a.get("follows"): continue
        d = {"element": a["element"], "action": a["action"]}
        for k in ("to_bbox", "bbox", "to_label", "label"):
            if a.get(k) is not None: d[k] = a[k]
        out.append(d)
    return {"fix": c["fix"], "actions": out}
