"""Build the integration export: one unified JSONL of every graph (synthetic + Wikimedia + OpenStax).

Output (export/):
  records.jsonl.gz   one record per image, schema in export/schema.json
  MANIFEST.json      counts, schema version, sha256 of records file
  release/*.tar      image bundles (uploaded as GitHub release assets, not committed)
Image paths in records are relative to an images root that contains synthetic/, real/, openstax/.
"""
import gzip, hashlib, json, os, sys, tarfile, collections
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
D = os.path.join(ROOT, "dataset")
OUT = os.path.join(ROOT, "export")
SCHEMA_VERSION = "1.0"


def boxes(rec, ids):
    by = {e["id"]: e for e in rec.get("elements", [])}
    return [by[i].get("bbox") or by[i].get("label_bbox") for i in ids if i in by and (by[i].get("bbox") or by[i].get("label_bbox"))]


def synthetic_records():
    manifest = os.path.join(D, "synthetic/manifest.jsonl")
    with open(manifest, encoding="utf-8") as f:
        for line in f:
            rid = json.loads(line)["id"]
            with open(os.path.join(D, "synthetic/annotations", rid + ".json"), encoding="utf-8") as annotation:
                yield json.load(annotation)


def synthetic():
    for r in synthetic_records():
        err = None
        if r.get("error"):
            e = r["error"]
            err = {"type": e["type"], "severity": e.get("severity"), "explanation": e.get("explanation"), "fix": e.get("fix"),
                   "highlight": e.get("highlight", []), "highlight_bboxes": boxes(r, e.get("highlight", []))}
        corr = None
        if r.get("correction"):
            c = r["correction"]
            corr = {"corrected_id": c["corrected_id"], "fix": c["fix"], "actions": c["actions"]}
        yield {
            "schema_version": SCHEMA_VERSION, "id": r["id"], "source": "synthetic",
            "image": "synthetic/" + r["image"], "width": r["width"], "height": r["height"],
            "graph_type": r["graph_type"], "graph_name": r.get("graph_name"), "topic": r.get("topic"), "title": r.get("title"),
            "verdict": r["verdict"], "error": err, "correction": corr, "pair_id": r.get("pair_id"),
            "axes": r.get("axes"), "elements": r.get("elements", []),
            "explanation_steps": [dict(s, highlight_bboxes=boxes(r, s.get("highlight", []))) for s in r.get("explanation_steps", [])],
            "render_style": r.get("render_style"),
            "license": "CC0-1.0", "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
            "author": "econ-graphs synthetic generator", "source_page": None, "original_url": None,
            "caption": None, "alt_text": None, "review": {"method": "generated"},
        }


def synthetic_image_parts():
    paths = [os.path.join(D, "synthetic", r["image"]) for r in synthetic_records()]
    parts, totals = [[], []], [0, 0]
    for path in sorted(paths, key=lambda p: (-os.path.getsize(p), p)):
        part = min(range(2), key=lambda i: totals[i])
        parts[part].append(path)
        totals[part] += os.path.getsize(path)
    return [sorted(part) for part in parts]


def size(p):
    try:
        with Image.open(p) as im:
            return im.size
    except Exception:
        return (None, None)


def real(sub, src):
    cat = json.load(open(os.path.join(D, sub, "catalog.json")))
    for r in cat:
        rv = r.get("review") or {}
        v = rv.get("verdict") or r.get("verdict") or "unreviewed"
        err = None
        if v == "incorrect":
            err = {"type": rv.get("error_type"), "severity": rv.get("severity"), "explanation": rv.get("explanation"), "fix": rv.get("fix"),
                   "highlight": rv.get("highlight", []), "highlight_bboxes": []}
        w, h = size(os.path.join(D, sub, r["image"]))
        yield {
            "schema_version": SCHEMA_VERSION, "id": r["id"], "source": src,
            "image": f"{sub}/{r['image']}", "width": w, "height": h,
            "graph_type": rv.get("true_family") or r.get("graph_family"), "graph_name": None, "topic": None,
            "title": r.get("title") or r.get("caption"),
            "verdict": v, "error": err, "correction": None, "pair_id": None, "axes": None, "elements": [],
            "explanation_steps": [], "render_style": None,
            "license": r.get("license"), "license_url": r.get("license_url"), "author": r.get("author"),
            "source_page": r.get("source_page"), "original_url": r.get("original_url"),
            "caption": r.get("caption"), "alt_text": r.get("alt_text"),
            "review": {k: rv[k] for k in rv if k in ("method", "note", "true_family")} or None,
        }


def main(tars=True):
    os.makedirs(os.path.join(OUT, "release"), exist_ok=True)
    stats = collections.defaultdict(collections.Counter)
    rp = os.path.join(OUT, "records.jsonl.gz")
    with gzip.open(rp, "wt", encoding="utf-8") as f:
        for gen in (synthetic(), real("real", "wikimedia"), real("openstax", "openstax")):
            for rec in gen:
                stats[rec["source"]][rec["verdict"]] += 1
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    sha = hashlib.sha256(open(rp, "rb").read()).hexdigest()
    assets = {}
    if tars:
        for i, paths in enumerate(synthetic_image_parts(), 1):
            name = f"images-synthetic-{i}.tar"
            t = os.path.join(OUT, "release", name)
            with tarfile.open(t, "w") as tf:
                for path in paths:
                    tf.add(path, arcname=os.path.relpath(path, D), recursive=False)
            assets[name] = os.path.getsize(t)
            if assets[name] >= 1_900_000_000:
                raise ValueError(f"{name} exceeds the 1.9 GB asset limit")
        for sub in ("real", "openstax"):
            t = os.path.join(OUT, "release", f"images-{sub}.tar")
            with tarfile.open(t, "w") as tf:
                tf.add(os.path.join(D, sub, "images"), arcname=f"{sub}/images")
            assets[f"images-{sub}.tar"] = os.path.getsize(t)
        old_synthetic_tar = os.path.join(OUT, "release", "images-synthetic.tar")
        if os.path.exists(old_synthetic_tar):
            os.remove(old_synthetic_tar)
    man = {"schema_version": SCHEMA_VERSION, "records_file": "records.jsonl.gz", "records_sha256": sha,
           "counts": {k: dict(v) for k, v in stats.items()}, "total": sum(sum(v.values()) for v in stats.values()),
           "image_assets": assets or None}
    json.dump(man, open(os.path.join(OUT, "MANIFEST.json"), "w"), indent=1)
    print(json.dumps(man, indent=1))


if __name__ == "__main__":
    main(tars="--no-tars" not in sys.argv)
