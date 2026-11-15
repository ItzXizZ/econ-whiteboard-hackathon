"""Minimal loader for the econ-graphs export. No dependencies beyond the standard library.

    from loader import load
    for rec in load("export/records.jsonl.gz", images_root="images"):
        rec["image_path"]  # absolute path to the image file
"""
import gzip, json, os


def load(path="records.jsonl.gz", images_root=None, sources=None, verdicts=None):
    op = gzip.open if path.endswith(".gz") else open
    with op(path, "rt", encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            if sources and r["source"] not in sources:
                continue
            if verdicts and r["verdict"] not in verdicts:
                continue
            if images_root:
                r["image_path"] = os.path.join(images_root, r["image"])
            yield r


if __name__ == "__main__":
    import collections, sys
    c = collections.Counter((r["source"], r["verdict"]) for r in load(sys.argv[1] if len(sys.argv) > 1 else "records.jsonl.gz"))
    for k, v in sorted(c.items()):
        print(*k, v)
