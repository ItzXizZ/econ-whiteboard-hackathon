"""Plain-English explanation of the checker's verdict from a local vision LLM served by LM Studio (offline, localhost only).
Default model: Ternary-Bonsai-2-4B (vision). Start it with:
  lms server start && lms load ternary-bonsai-2-4b --identifier bonsai-4b -y"""
import base64, json, os, urllib.error, urllib.request

URLS = [os.environ["LMSTUDIO_URL"]] if os.environ.get("LMSTUDIO_URL") else [f"http://127.0.0.1:{p}/v1/chat/completions" for p in (1234, 1235)]
MODEL = os.environ.get("LMSTUDIO_MODEL", "bonsai-4b")
EFFORT = os.environ.get("BONSAI_REASONING", "none")  # none = ~2 s/graph; low/medium think first (slower)
SCHEMA = {"type": "object", "properties": {"explanation": {"type": "string"}, "fix": {"type": "string"}},
          "required": ["explanation", "fix"]}


def ask(r, timeout=180):
    img = base64.b64encode(open(r["image"], "rb").read()).decode()
    mime = "image/png" if r["image"].lower().endswith(".png") else "image/jpeg"
    name = r["graph_type"].replace("_", " ")
    if r["verdict"] == "correct":
        task = (f"A graph checker found this {name} graph is drawn correctly. In 1-2 sentences, explain to the student why it is "
                "correct, mentioning only curves, labels and points that are actually drawn. Set fix to an empty string.")
    else:
        task = (f"A graph checker found this {name} graph is drawn incorrectly. Mistake: {r['error_type'].replace('_', ' ')}. "
                + (f"Reference fix: {r['fix']}. " if r.get("fix") else "")
                + "In 1-2 sentences explain to the student why this is wrong in economic terms, then in 1-2 sentences say "
                "how to redraw it. Mention only curves, labels and points that are actually drawn.")
    prompt = "You are an economics tutor. " + task + " Answer in JSON."
    body = {"model": MODEL, "temperature": 0.1, "max_tokens": 4000, "reasoning_effort": EFFORT,
            "response_format": {"type": "json_schema", "json_schema": {"name": "graph_check", "schema": SCHEMA}},
            "messages": [{"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{img}"}},
                {"type": "text", "text": prompt}]}]}
    for i, url in enumerate(URLS):
        try:
            req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
            msg = json.load(urllib.request.urlopen(req, timeout=timeout))["choices"][0]["message"]["content"]; break
        except urllib.error.URLError:
            if i == len(URLS) - 1: raise
    return json.loads(msg[msg.find("{"):msg.rfind("}") + 1])
