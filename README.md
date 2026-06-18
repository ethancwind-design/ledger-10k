# Ledger — ask your 10-K, watch it get drawn for you

Upload a 10-K PDF. Ask a question in chat. Ledger finds the answer **in the filing**,
scrolls to it, and **draws on the document** — a hand-drawn circle / underline / arrow
pointing at the exact words — while it explains, by voice and text, **why** that's the
answer.

That's the whole app: **a PDF and a chat.** Nothing else.

See **[PLAN.md](PLAN.md)** for how this maps to Brilliant's "Koji" tutor and the roadmap.

## Run it

Static, no build step. PDF rendering (pdf.js) is vendored locally, so it works offline.

```bash
cd tenk-ai-reader
python3 -m http.server 4180
# open http://localhost:4180
```

> Serve over `http://` (don't open via `file://`) — pdf.js needs to load its worker and
> `fetch` the sample PDF, which browsers block on the `file://` origin.

## Try it

1. Click **“Load a sample 10-K”** (or drag in your own PDF).
2. Ask — or tap a suggestion:
   - *“How fast is revenue growing, and why?”*
   - *“What tax rate should I use?”*
   - *“Where's the debt and when does it mature?”*
   - *“Find the non-recurring items to normalize”*
3. Watch it scroll to the page, **draw on the words**, and talk you through it (voice on by
   default — mute with 🔊).

## How it works

- **Render**: `pdf.js` renders the PDF to canvas and extracts a text layer with the pixel
  position of every word. (`vendor/pdf.min.js`, `vendor/pdf.worker.min.js`.)
- **Locate**: given a target quote, the app finds it in the page's text and computes the
  exact bounding box of the words — so it can point at *them*, not a whole region.
- **Draw**: an SVG overlay draws a hand-drawn annotation (sketchy double-stroke circle +
  highlighter swipe, underline, or arrow) animated with a stroke "draw-on" effect.
- **Explain**: the chat narrates each step (voice via `SpeechSynthesis`) while the
  annotation appears — pointing, then explaining, like a tutor with a pen.

## The brain (where answers come from)

`brain()` in `app.js` has three modes:

1. **Scripted** (offline, the bundled sample) — curated multi-step answers whose quotes
   exist verbatim in the sample filing. This is what makes the offline demo impressive.
2. **Keyword-locate** (offline, any uploaded PDF) — finds the strongest keyword from your
   question in the filing and points to it, with a note to connect the API for real reasoning.
3. **Live Claude** (any PDF, real reasoning) — see below.

### Real reasoning on any 10-K — "bring your own key" (no server, no leaked key)

This is already built. Click **🔑 Add your key** in the app, paste an Anthropic API key, and
ask anything — the app calls Claude directly from the browser and reasons over the whole filing.

**Why this is safe to share:** the key is stored in `localStorage` (that person's browser only)
and sent **only to `api.anthropic.com`**. It is **never written into any file** and never passes
through a server, so distributing the app cannot leak *your* key. Everyone you share with adds
their own key. (Anthropic permits browser calls via the `anthropic-dangerous-direct-browser-access`
header — see `liveBrain()` in `app.js`.)

The model returns **point-and-explain steps** — each with a `find` (verbatim quote to point at),
a `type` (circle / underline / arrow), and a `say` (spoken explanation) — and the app does the
locating and drawing. The prompt forces `find` to be an exact substring and grounds every claim
in the filing. For very long filings, send retrieved chunks (RAG) instead of the whole text.

> Caveat: a key typed into a web page is visible to that page (it's *their* key, *their* browser
> — fine for a personal tool). The rule that matters: never commit a key into a shared file.
> If instead you want recipients to use it **without** their own key, you'd host a small server
> proxy that holds your key as a secret — but then your account pays for everyone's usage.

## Files

| File | What it is |
|---|---|
| `index.html` | Upload screen + PDF viewer + chat. Styles. |
| `app.js` | Everything: pdf.js rendering, text-locate, the hand-drawn annotation engine, chat + voice, and `brain()`. |
| `sample-10k.pdf` | The bundled sample filing (fictional Helios Materials; statements tie out). |
| `vendor/` | pdf.js (vendored for offline). |
| `sample-10k.js` + `build/` | Source content + print template used to regenerate `sample-10k.pdf`. |

### Regenerate the sample PDF

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --no-pdf-header-footer --virtual-time-budget=5000 \
  --print-to-pdf="sample-10k.pdf" "build/sample-10k-print.html"
```

## Notes for design handoff

- The "pen" is one CSS variable (`--ink`). Annotation styles live in the `.anno` rules and
  the `drawCircle` / `drawUnderline` / `drawArrow` functions — tune stroke, jitter, timing.
- Voice uses the browser's built-in `SpeechSynthesis` as a free placeholder; swap in a
  premium voice (e.g. ElevenLabs) at `speakAndWait()`.
- A small `requestAnimationFrame` shim keeps pdf.js rendering even if the tab is backgrounded.
- Model id + Messages-API shape follow Anthropic's current guidance (`claude-opus-4-8`).
