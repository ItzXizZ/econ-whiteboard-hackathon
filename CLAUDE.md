# Econ Coach: handoff notes

Hackathon project (Cornell Commons Local AI Hackathon). Written on Sat 14 Nov 2026 as a handoff from a
Claude chat session to Claude Code. Chiara owns this Mac and the pitch; the repo is her partner's
(github.com/ItzXizZ/econ-whiteboard-hackathon), originally built on a Windows ARM laptop.

## Deadline and rules

- Submission closes **noon, Sunday 15 Nov 2026**: GitHub link, one-sentence description, video under 2 minutes.
  Finalists demo live for 4 minutes.
- Must run on a Mac **with WiFi turned off**.
- Language models must be **Bonsai-2 2B, 4B or 9B** only (no 27B, no other LLM).
- Must use **Argmax** in some capacity.
- Judged on: use of Bonsai/Argmax, creativity, wow factor, technical impressiveness.
- Theme is "Recreate": an existing AI app rebuilt fully on-device. Side tracks: sustainability, accessibility.

## How to run (three Terminal windows)

```bash
# 1. Model server (llama.cpp, port 8080)
cd ~/Bonsai-demo && BONSAI_MODEL=4B ./scripts/start_llama_server.sh

# 2. App: API server on 3002 + Vite on 5173
cd ~/econ-whiteboard-hackathon && npm run dev

# 3. Argmax speech-to-text (port 50060); only needed for the mic
cd ~/argmax-oss-swift && .build/release/argmax-cli serve --model tiny
```

`npm run bonsai` is a Windows PowerShell script; do not use it on the Mac. The API server does not
hot-reload: restart window 2 after any change under `server/` or to `server.js`. Client changes hot-reload.

Argmax build (first time only, needs the Swift toolchain; not confirmed to work on this Mac yet):

```bash
cd ~ && git clone https://github.com/argmaxinc/argmax-oss-swift.git && cd argmax-oss-swift && BUILD_ALL=1 swift build -c release --product argmax-cli
```

Tests: `node scripts/selftest.mjs` (21 offline checks) and `npx tsc --noEmit`. Both passed after the last change.

## What was changed in the chat session (all uncommitted in this working tree)

| Area | Files | State |
| --- | --- | --- |
| Prices like "$6" were rendered as squashed italic math | `src/lib/mathText.ts` (new), `src/lib/tutorNarration.ts`, `src/components/Markdown.tsx`, `server/math.js` | Verified in the running app |
| Graph recognition with the trained model in `~/econ-graph-checker` | `server/graphCheck.js`, `server/graph_worker.py` (new), `server/recognize.js`, `src/lib/inkRecognition.ts`, tag UI in `MathLayer.tsx`, CSS at the end of `src/index.css` | Verified in the running app: checker loads, tag appears |
| Measured graph mistakes (D sloping up, S sloping down, S/D swapped, P/Q on wrong axes) | `server/graphRules.js` (new), `server/recognize.js` | Unit-tested only. Depends on Bonsai vision reading the handwritten labels S, D, P, Q; never tried on the Mac |
| Tutor draws a graph in its reply when asked | `server/graphDraw.js` (new), `src/components/ExplorationMode/TutorGraph.tsx` (new), `src/lib/mathHint.ts`, `MathTutorOverlay.tsx`, `MathLayer.tsx` | Rendering checked offline; never tried in the running app |
| Argmax voice input | `server/voice.js` (new), `src/lib/voiceTutor.ts`, `MathLayer.tsx` | Tested against a stand-in server only. Real Argmax server not yet built or run |
| Small UI fixes | `src/econ/EconApp.tsx` and others | Paste hint shows the Mac shortcut; tutor cards avoid the corner controls |
| Adam draws on the board: animated ink with his own cursor, circles the mistake, draws the corrected curve/labels; replay by clicking the tag; "Clear Adam's ink" button; mistakes stay visible while recognition re-runs (items 4, 5, 6) | `src/lib/tutorPen.ts`, `src/lib/useTutorPen.ts` (new), `MathLayer.tsx`, `MathTutorOverlay.tsx`, `src/lib/inkRecognition.ts`, `server/graphRules.js`, `server/recognize.js`, `src/index.css` | Verified in a browser on Devin's VM with a hand-drawn upward-sloping D: tag and correction stayed for 2.5 min. Not yet tried by hand on the Mac |
| v2 graph model (18k graphs, 448x336) installed; v1 kept as `train/model_v1.pt`. Argmax built and STT tested end to end on this Mac | `~/econ-graph-checker/train/`, `~/argmax-oss-swift` | Verified |

A local test account named `claudetest` exists in `server/data/`.

### Facts worth knowing

- The trained model (`~/econ-graph-checker/train/model.pt`, ResNet-18, 41 graph types) names a clean
  hand-drawn supply and demand graph with 0.93 to 0.99 confidence, but does **not** catch mistakes in
  hand-drawn graphs, and it confidently mislabelled an unlabelled scribble. `server/graphCheck.js` therefore
  only names a graph above 0.9 confidence and never claims a graph is correct on the model's word.
  A retrain was running in Devin; if a newer `model.pt` exists, copy it into `~/econ-graph-checker/train/`.
- `server/graphRules.js` is the reliable mistake detector, but only for supply and demand style graphs.
- The tutor's drawn graph is an SVG inside the reply card. It is not ink on the whiteboard.
- Only speech-to-text uses Argmax. Spoken replies use the browser's on-device `speechSynthesis`.
- The hackathon's Technical Details file says "the Local Server API will not be available". The voice
  feature uses the server in Argmax's open-source CLI. Whether that is allowed is unconfirmed; ask the organisers.

## Chiara's list of what is still wrong (her words, 8:12pm)

1. The UI doesn't do equations and LaTeX.
2. It's wrong sometimes.
3. She wants to be able to draw for the tutor, and have it highlight what's wrong.
4. Better interface ("it sucks right now"); wants the tutor to have a cursor of its own.
5. The fix shows up for about a second and then goes away.
6. She does not want a generated image. She wants the tutor to actually DRAW on the board with her while
   she draws.
7. There are about three Adams going at the same time and they sometimes block each other.
8. Argmax speaking as well as typing.
9. It's a little buggy.
10. Add a sustainability angle, and make clear that LM Studio was used to train the model that inspects the graphs.
11. An extremely easy, cooler user interface.

Notes on these:

- Items 4, 6: the natural next step is to turn `TutorGraph` specs into animated strokes on the board itself
  (same coordinate space as the student's ink), led by a visible tutor cursor.
- Item 5: not yet reproduced. Likely the graph tag or error ring being cleared when recognition re-runs
  (`setInkModel` in `MathLayer.tsx` replaces the model on every poll), or a hint card being replaced.
- Item 7: several tutor cards (hint, voice, clarify) can be open at once; `MathTutorScreenLayer` places them.
- Item 10: check the claim before it goes in the pitch. `~/econ-graph-checker/train/train.py` trains with
  PyTorch; LM Studio appears in `bonsai.py` only as the server for Bonsai explanations. Ask Chiara what LM
  Studio was used for.
- Do not add any model other than Bonsai-2 2B/4B/9B, and keep everything working with WiFi off.
