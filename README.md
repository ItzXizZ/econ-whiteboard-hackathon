# Econ Coach

A handwriting whiteboard for economics problems with an AI tutor that runs entirely on your own computer.

Paste a screenshot of a problem, work it out by hand, and ask for a hint. The tutor (Adam) reads your handwriting, works out where you are, and coaches you one small step forward without giving away the answer. No cloud service is involved at any point: the language model, the handwriting recognition, the accounts and the saved boards all live on the machine.

## What it does

- **Whiteboard:** pen, highlighter, eraser, undo/redo, pasted or uploaded problem images, and multiple saved boards per account.
- **Hints in three sizes:** Small (a gentle nudge), Medium (the concept or strategy) and Large (the exact next operation). Each hint points at the lines of your work it is talking about and marks a box where you should write next.
- **Check my step:** write in the box the tutor marked, tap the check mark, and it tells you whether that step is right.
- **Questions:** type a question about the problem and get a short spoken or written answer.
- **Full solution and Generalize:** ask for the worked solution, or for a debrief on how to approach that whole type of problem.
- **Handwriting recognition:** your ink is grouped into lines and transcribed, so the tutor can refer to "line 2" and light up exactly those strokes.

## Local models only

| Piece | What runs it |
| --- | --- |
| Tutor (hints, answers, solutions) | Bonsai-2 4B, served by llama.cpp on `127.0.0.1:8080` |
| Handwriting recognition | The same Bonsai-2 model, through its vision projector |
| Reading pasted problem screenshots | The same Bonsai-2 model, once per image, then cached |
| Spoken replies | The browser's `speechSynthesis`, limited to on-device voices |
| Accounts and saved boards | JSON files under `server/data/` |

The only language model wired in is Bonsai-2, and the launcher accepts only the 2B, 4B and 9B sizes. The API server makes no outbound network requests other than to the local model server.

### Argmax note

Speech-to-text runs on Argmax's open-source Swift SDK (WhisperKit) on Apple Silicon. `voice-server/` is our own small Swift server that loads WhisperKit directly and listens on `127.0.0.1:50060`; it does not use Argmax's Local Server API. The browser records the question, `server/voice.js` forwards the WAV to it, and the text comes back without leaving the computer.

```bash
npm run voice   # first run builds it and downloads the model (WiFi on); later runs work offline
```

- **Speech in:** Argmax, as above. When the voice server is not running the microphone is hidden and questions are typed. Setting `VITE_ALLOW_BROWSER_STT=1` falls back to the browser's Web Speech API, which sends audio to a cloud service, so it is off by default.
- **Speech out:** the browser's `speechSynthesis`, restricted to voices the operating system reports as on-device (`localService`).

## Requirements

- Windows 10/11 (developed on Windows 11 ARM64, Snapdragon X Elite, 16 GB RAM, CPU inference only)
- Node.js 20 or newer
- A [Bonsai-demo](https://github.com/PrismML-Eng/Bonsai-demo) checkout with the Bonsai-2 4B model downloaded

The model files are not part of this repository.

## Setup

1. Get the model (one time, a few GB):

   ```powershell
   git clone https://github.com/PrismML-Eng/Bonsai-demo C:\bonsai\Bonsai-demo
   cd C:\bonsai\Bonsai-demo
   $env:BONSAI_MODEL = "4B"
   .\setup.ps1
   ```

   If you put it somewhere else, set `BONSAI_DIR` to that folder.

2. Install the app:

   ```powershell
   npm install
   ```

## Run

Use two terminals.

```powershell
# Terminal 1: the model (leave it running; first load takes about a minute)
npm run bonsai

# Terminal 2: the API server and the web app
npm run dev
```

Open <http://localhost:5173>, create an account, and paste a problem.

`npm run bonsai` starts Bonsai-2 4B with an 8192-token context and asks Windows to keep the model in RAM. To try another size, set `BONSAI_MODEL` to `2B` or `9B` first.

### Ports

| Port | What |
| --- | --- |
| 5173 | Web app (Vite) |
| 3002 | API server (`PORT` to change it; also update the proxy in `vite.config.ts`) |
| 8080 | Bonsai model server (`BONSAI_URL` to point the API server elsewhere) |

## Graph checker and training data

`graph-checker/` holds the graph model and the data it was trained on (from [econ-data-hacakthon](https://github.com/chiaraluey/econ-data-hacakthon)):

- `train/model.pt`: the live model (v2, ResNet-18, 46 MB): graph type, right/wrong verdict, kind of mistake, and where it is.
- `export/records.jsonl.gz`: 20,453 labeled graphs (18,274 synthetic correct/wrong graphs plus reviewed Wikimedia and OpenStax diagrams), with per-element annotations and step-by-step fixes. Schema in `export/schema.json`.
- `generate.py`, `econgraphs/`, `harvest*.py`: the synthetic generator and the diagram harvesters.
- `lmstudio/`: the round where Bonsai-2 4B in LM Studio checked curve labels on 1,520 new graphs for a fine-tuning round (v3, kept out of the app; see `graph-checker/README.md`).
- The images themselves (2.4 GB) are release assets of the econ-data-hacakthon repo (`data-v2`).

Setup once (needs internet once, then runs offline):

```bash
cd graph-checker && python3 -m venv .venv && .venv/bin/pip install torch torchvision pillow numpy
```

The API server uses `~/econ-graph-checker` if it exists, otherwise this folder. Set `GRAPH_CHECKER_DIR` to point elsewhere.

## Tests

```powershell
node scripts/selftest.mjs          # offline: hint stream filter and the market solver
node scripts/smoke.mjs             # end to end against the running server and model
node scripts/smoke.mjs accounts    # one section: accounts | recognize | hints
node scripts/bench-llm.mjs         # raw model latency
```

## How it works

- **`server/llm.js`** talks to the model server. A CPU can serve one request well at a time, so requests go through a small priority queue: a hint interrupts background handwriting recognition instead of waiting behind it. Each kind of request is pinned to its own server slot so its system prompt stays cached.
- **`server/recognize.js`** clusters strokes into lines, renders each line to a small image, and has the model transcribe it. Results are cached per line, so only lines that changed are read again.
- **`server/math.js`** builds the tutor prompts and streams the reply. A small model does not always follow a format, so a stream filter rebuilds every reply into the structure the whiteboard expects: valid headers, a capped number of steps, exactly one write box, and no markdown.
- **`server/econSolver.js`** solves linear supply and demand problems exactly (equilibrium, and a per-unit tax) and passes the numbers to the model as private notes, so its coaching is grounded in the right answer.
- **`server/accounts.js`** handles accounts (scrypt-hashed passwords, 90-day sessions) and board saving in local JSON files.
- **`src/`** is the React whiteboard. `src/lib/inkRecognition.ts` and `src/lib/mathHint.ts` are the two calls into the API.

## Limitations

- **Speed:** everything runs on the CPU. Hints take seconds, not milliseconds, and the first request after starting the model is the slowest.
- **Memory:** on a 16 GB machine the model slows down dramatically if other apps push it out of RAM. Close heavy browser tabs before a demo; `scripts/pin-bonsai.ps1` helps keep it resident.
- **Exact grounding is narrow:** only linear supply and demand problems are solved exactly. For other topics the tutor relies on the model and a short list of economics reminders.
- **Recognition:** short lines of text and equations work best. Graphs are detected and set aside rather than interpreted.
- **Voice input:** disabled by default, as described in the Argmax note.
