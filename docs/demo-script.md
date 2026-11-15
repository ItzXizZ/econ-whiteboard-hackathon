# Econ Coach: demo script (4 min live, under 2 min video)

**Before you start:** turn WiFi off. Start Bonsai (port 8080), `npm run dev` (5173) and Argmax (50060). Open http://localhost:5173 and have the phone on the hub (https://<Mac IP>:3443).

## One-sentence description
Econ Coach is an economics whiteboard tutor that runs entirely on a laptop. It recognizes the graphs and equations students draw, circles their mistakes, and draws the fix alongside them, using Bonsai-2, Argmax and our own graph-checking model with no internet.

## Live demo
1. **Home screen (0:00).** Point out "Hi, I'm Adam" and the WiFi-off menu bar. Say: "Most AI tutors give you the answer. Adam teaches you, and nothing leaves this laptop."
2. **Draw with Adam (0:20).** Pick *Loanable funds* (or upload a worksheet photo that mentions a budget deficit). Adam draws the axes and waits.
   - Draw the saving curve sloping the **wrong** way. Adam circles it and explains.
   - Redraw it correctly. Adam labels it and moves to the next step.
   - Finish the deficit shift. Adam shows the interest rate rising.
3. **Freehand mistake (1:20).** End the lesson. Draw a supply and demand graph with **D sloping up**, labeled D and S. Adam tags the graph, highlights the wrong curve in red and redraws it in green with his own cursor.
4. **Equations (1:50).** Write `Qd = 100 - 4P` and `Qs = 20 + 4P`. Adam shows the steps as proper math and writes them on the board. Tap his "Adam read" chip to show the student can correct a misread. Adam guides first instead of giving the answer; type "Can you show me the answer?" to get P* = 10 and Q* = 60 step by step.
5. **Voice (2:20).** Tap the mic and ask "Why does the demand curve slope down?" Argmax transcribes it on-device and Adam answers.
6. **Phone (2:50).** On the phone, run the PPF lesson with your finger, drawing a point outside the curve. Say: "One laptop serves a whole classroom over a local hotspot. No internet needed."
7. **Close (3:30).** Use the tech and sustainability lines below.

## What runs where (all on the laptop)
- **Bonsai-2 4B** (llama.cpp): tutoring answers, explanations and reading handwriting.
- **Argmax** (on-device Whisper): speech-to-text for the mic. Spoken replies use the system's on-device voice.
- **Our graph checker:** a ResNet-18 vision model we trained on 18,274 economics graphs across 41 graph types. On held-out graphs it tells right from wrong 92.6% of the time and catches 91.2% of wrong graphs. Supply/demand slope mistakes are also measured directly from the strokes.
- **LM Studio:** Bonsai-2 4B running in LM Studio read the curve labels on 1,520 new graphs. The 1,262 it read correctly went into a fine-tuning round of the graph model. (Say "checked the labels for a fine-tuning round", not "made it more accurate". That round came out about even, so v2 stays live.)

## Sustainability and access
- Runs on one laptop: no data-center round-trip per question, and no cloud account or subscription.
- Works where internet is slow, expensive or missing: one laptop acts as the classroom hub, and phones connect to it over a local hotspot.
- Lessons keep working on the phone even if the hub drops.
- Don't quote energy or CO2 numbers; we haven't measured them.

## Known limits (if judges ask)
- Handwriting reading still makes mistakes, which is why students can tap to correct what Adam read.
- The graph model misses some mistakes, such as a mirror-image supply/demand graph. Adam only says a graph is wrong when he's confident.
