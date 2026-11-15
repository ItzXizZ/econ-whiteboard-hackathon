"""Long-lived graph checker process for Econ Coach (started by server/graphCheck.js).

    python graph_worker.py <path to the econ-graph-checker folder>

Loads the trained graph model once, then answers one JSON request per line on
stdin ({"id": 1, "path": "/tmp/graph.png"}) with one JSON line on stdout
({"id": 1, "result": {...}}). Everything runs on this machine.
"""
import json
import os
import sys

root = os.path.abspath(sys.argv[1])
sys.path.insert(0, os.path.join(root, "train"))

# Keep stdout clean for the JSON protocol while the libraries import.
_out = sys.stdout
sys.stdout = sys.stderr
from predict import model, predict  # noqa: E402

net = model()
sys.stdout = _out
print(json.dumps({"ready": True}), flush=True)

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    rid = None
    try:
        req = json.loads(line)
        rid = req.get("id")
        result = predict(net, [req["path"]])[0]
        print(json.dumps({"id": rid, "result": result}), flush=True)
    except Exception as ex:  # one bad image must not kill the worker
        print(json.dumps({"id": rid, "error": str(ex)}), flush=True)
