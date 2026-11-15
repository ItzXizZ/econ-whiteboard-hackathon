"""Labeling round with Bonsai-2 4B running in LM Studio (local server, port 1235).
For every new training image, Bonsai reads the curve labels; the reading is compared with the generator's ground truth.
Images whose labels Bonsai can read (>= half of the curve labels found) are kept for training; the rest are set aside.
python3 lmstudio_label.py batch   -> batch/lmstudio_labels.jsonl"""
import base64, json, os, re, sys, time, urllib.request

URL = os.environ.get("LMSTUDIO_URL", "http://127.0.0.1:1235") + "/v1/chat/completions"
MODEL = os.environ.get("LMSTUDIO_MODEL", "ternary-bonsai-2-4b")
PROMPT = ("This is an economics graph. List the text labels written next to the curves (for example D, S, MR, MC, AD, SRAS, PPF). "
          "Reply with the labels only, separated by commas. Do not explain.")
SUB = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")


def norm(s):
    return re.sub(r"[\s_*{}\\$]", "", s.translate(SUB)).lower()


def ask(path):
    img = base64.b64encode(open(path, "rb").read()).decode()
    body = {"model": MODEL, "temperature": 0, "max_tokens": 80, "reasoning_effort": "none",
            "messages": [{"role": "user", "content": [{"type": "text", "text": PROMPT},
                                                      {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img}"}}]}]}
    req = urllib.request.Request(URL, json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)["choices"][0]["message"]["content"] or ""


if __name__ == "__main__":
    d = sys.argv[1]; out = os.path.join(d, "lmstudio_labels.jsonl")
    done = {json.loads(l)["id"] for l in open(out)} if os.path.exists(out) else set()
    recs = [json.loads(l) for l in open(os.path.join(d, "manifest.jsonl"))]
    with open(out, "a") as f:
        for n, r in enumerate(recs):
            if r["id"] in done: continue
            t0 = time.time()
            try: text = ask(os.path.join(d, r["image"]))
            except Exception as e: text = f"ERROR {e}"
            read = [norm(x) for x in re.split(r"[,\n;]+", text) if norm(x)]
            gt = [norm(x) for x in r["curve_labels"]]
            found = [g for g in gt if any(g == x or (len(g) > 1 and g in x) for x in read)]
            agree = len(found) / len(gt) if gt else None
            row = {"id": r["id"], "bonsai_read": text.strip(), "curve_labels": r["curve_labels"], "agreement": agree,
                   "keep": agree is None or agree >= 0.5, "sec": round(time.time() - t0, 2), "labeler": f"LM Studio / {MODEL}"}
            f.write(json.dumps(row, ensure_ascii=False) + "\n"); f.flush()
            if n % 25 == 0: print(n, len(recs), row["sec"], row["agreement"], text.strip()[:60], flush=True)
