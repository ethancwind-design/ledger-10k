# Ledger — a plan to replicate Brilliant's AI tutor for 10-K filings

Brilliant's AI tutor ("Koji") is described by the company as *"the world's first
graphical tutor."* It isn't a chatbot bolted onto the side of the app — it is **fused
to the lesson surface**. The transferable thesis, and the entire basis for this plan:

> An AI that **sees exactly what you're looking at**, **points at and annotates the
> specific thing** it's talking about, **proactively orients you** to what matters on
> the current section, and **walks you through it with graduated depth** — instead of
> dumping a summary — while keeping every claim grounded in a verified source.

A 10-K is the ideal target. It is long (100+ pages), jargon-heavy, and intimidating,
yet it contains exactly the inputs a financial modeler needs — if only they knew
*where they live* and *what they mean*. That is the gap Ledger closes.

---

## 1. What Koji does → how it maps to a 10-K

| Brilliant / Koji behavior | Ledger equivalent for a 10-K |
|---|---|
| **Screen-aware** — the AI shares your exact context; "explain this" means "explain THIS" | The **selection is the context**: highlight any sentence, table, or number and that span is the AI's scope. No copy-pasting into ChatGPT. |
| **Speak-first orientation** — on each new page, "here's what changed and what to watch" (it does *not* read the content aloud) | **Section orientation cards**: scroll into MD&A → "Modelers live here — this is where management decomposes revenue growth; watch the restructuring charge." Orient, don't summarize. |
| **On-surface pointing / highlighting / annotation** | Every answer's claims and numbers carry a **citation chip** that scrolls to and highlights the exact source span (two-way sync). |
| **Socratic, answer-withholding, graduated** | **Layered disclosure**: a one-line plain-English gloss first, then "What it means" / "Why it matters for a model" / "Define the jargon" / "Show the numbers" on demand. |
| **Decomposition into interactive checkpoints** | **"Talk me through it"**: a step-revealed walkthrough that pauses with a checkpoint question to keep the user active and locate confusion. |
| **Adaptive scaffolding that fades** | **Audience toggle** (new-to-finance vs. analyst) tunes verbosity and how much jargon is auto-defined. |
| **Infrastructure-grounded accuracy** ("exceedingly unlikely to make a math mistake") | **Deterministic numbers + citations**: the model copies figures *verbatim*; the app computes every ratio/delta in code. A confidently wrong number is fatal in finance. |
| **Friendly named character, not a sparkle button; voice + text** | Ledger is a named, lightly embodied guide with optional read-aloud and a clean mute. |
| **Freemium preview** | A free-action allowance per filing, then a paywall. |

---

## 2. Core interaction model — UPLOAD → ASK → DRAW ON THE PDF

The product is deliberately just two things: **the actual 10-K PDF, and a chat.** The loop is
`Upload → Ask → Locate → Draw-on-the-page → Explain`, which is the closest possible analog to
Koji "reaching into the material and pointing at it."

1. **Upload** a 10-K PDF (or load the bundled sample). It renders as the real document.
2. **Ask** a question in chat.
3. **Locate** — the AI returns the verbatim quote(s) in the filing that answer it; the app
   finds the exact pixel position of those words in the rendered PDF text layer.
4. **Draw on the page** — it scrolls to the words and animates a **hand-drawn annotation**
   (sketchy circle + highlighter, underline, or arrow) with a stroke "draw-on" effect,
   pointing at the precise words — not a region, the words.
5. **Explain** — it narrates each step by voice while the text appears in chat, walking from
   *where the figure lives* to *why it's the right one*, one annotation at a time.

There is no rail, no extraction tables, no modes — those were cut. The magic is the AI
drawing on the user's own document while it teaches.

**Trust:** the model only ever returns quotes copied **verbatim** from the filing (they must
be exact substrings or they can't be located on the page), grounding every claim in the
source; numbers are never invented.

The source document is **never mutated**; explanations are reviewable cards that can be
pinned as gutter notes tethered to their passage.

---

## 3. What a modeler needs from a 10-K (the "shortcut" surface)

Ledger's left rail turns the modeling workflow into one-click jumps that scroll to the
right section *and* pre-fire the right AI action:

- **Set up:** confirm fiscal year, currency, units (cover + Note 1).
- **Revenue:** extract the income statement; revenue by segment (ASC 280); decompose
  growth into volume/price/FX (MD&A).
- **Margins & non-cash:** find D&A (it's in the cash-flow add-backs, not on the income
  statement); stock-based comp & dilution (ASC 718).
- **Working capital:** extract the balance sheet; deferred revenue as a forward indicator.
- **Cash flow & capex:** extract the cash-flow statement; capex & the PP&E roll-forward.
- **Debt / tax / shares:** build the debt schedule (rates, maturities, covenants); derive
  the *normalized* tax rate (ASC 740 reconciliation); share count & capital returns.
- **Quality checks:** flag non-recurring items to normalize the base year; compare to last year.

These encode the real failure modes — D&A buried in COGS, segment OI that doesn't sum to
consolidated EBIT, the headline tax rate distorted by one-time items, SBC treated as "free."

---

## 4. Architecture

```
┌────────────┐     selection / shortcut      ┌──────────────────┐
│  Document  │ ───────────────────────────▶  │  askLedger()      │  ← the ONLY
│  pane      │   {action, span, section,     │  (network boundary)│    network boundary
│ (anchored  │    audience, anchors}         └─────────┬─────────┘
│  HTML)     │ ◀───────────────────────────            │
└────────────┘   cited answer (jump+flash)             ▼
                                              ┌──────────────────┐
                                              │ your proxy server │  holds ANTHROPIC_API_KEY
                                              │  → Claude Messages │  model: claude-opus-4-8
                                              └──────────────────┘
```

- **Document model.** The filing is semantic HTML; each `<section data-id>` is a citable
  unit. Citations resolve to a section (and, where possible, the exact sentence/row, which
  the highlight controller wraps and flashes). Swap the sample for any parsed filing — the
  app only needs `{ company, sections: [{ id, item, title, html }] }`.
- **The AI boundary is one function** (`askLedger`). The rest of the app is backend-agnostic.
  It ships **stubbed with canned, finance-accurate responses** so the prototype runs offline;
  flip `USE_LIVE_API` to call your proxy.
- **Grounding/trust (non-negotiable in finance):**
  1. *Answer only from the filing.* "That isn't stated in this filing" is a first-class answer.
  2. *Cite every claim and number* to its source span.
  3. *Never let the model do arithmetic* — it copies figures verbatim; the app computes ratios/deltas.
  4. *Preserve qualifiers* ("approximately", "as of", date ranges) verbatim.

---

## 5. AI prompt templates

The exact templates the live path uses ship as constants in `app.js`
(`SYSTEM_PROMPT` + `ACTION_PROMPTS`) so wiring the real model is copy-paste. Highlights:

- **System:** "You are Ledger… teach WHERE the inputs live and WHAT they mean, not do the
  analysis. Answer only from the source; cite everything; never do arithmetic; preserve
  qualifiers; orient, don't summarize."
- **Explain** → layered (1-line gloss → "what it means" → offers deeper layers).
- **Why it matters** → which driver/schedule it feeds, whether it changes an assumption,
  what to normalize, the next step.
- **Extract** → strict JSON, verbatim values, `{metric, value, unit, period, segment, basis,
  source_span}` — app computes deltas.
- **Talk me through it** → one step per turn + checkpoint questions.
- **Orient / Red-flag** → proactively surface what to watch and where judgment lives.

---

## 6. Roadmap

**Phase 0 — Prototype (this repo).** Full interaction model on one hardcoded, internally-
consistent sample 10-K; canned AI; clearly-marked Claude API hookup. *Design-ready.*

**Phase 1 — Live AI on one filing.**
- Stand up the proxy (Node / Cloudflare Worker) holding `ANTHROPIC_API_KEY`.
- Wire `askLedger` → Claude Messages API (`claude-opus-4-8`), streaming explanations,
  strict JSON for extraction. Parse defensively.
- Enforce citation-overlap verification server-side (reject citations whose spans don't
  overlap the provided source) to defeat fabricated citations.

**Phase 2 — Ingest real filings.**
- Pull from SEC EDGAR (the filing's R-files / financial statement data, or parse the HTML),
  segment into Items and footnotes, assign stable anchor IDs per sentence/table cell.
- Long filings → retrieve the relevant overlapping chunks + the user's selection (RAG);
  pass only those to the model.

**Phase 3 — Cross-filing & depth.**
- Comparison **matrix** (filings as rows, questions as columns) for multi-year history and
  peer comparison — each cell cited, deltas computed in-app.
- Red-flag/earnings-quality scan across the whole filing; YoY diff vs. the prior-year 10-K.
- Premium voice (e.g. ElevenLabs) replacing the browser's SpeechSynthesis placeholder.

**Phase 4 — Product.** Accounts, saved annotations, export to a model template, freemium
metering, team sharing.

---

## 7. The one thing not to get wrong

Trust. A hallucinated figure or a misread footnote ends the product. Every number is copied
verbatim and every claim is cited; all math is deterministic and done in code. That is the
financial-document analog of Koji being "tied to our infrastructure in ways that ensure
accuracy" — and it is the feature this whole design is organized around.
