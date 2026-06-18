/* ============================================================================
   Ledger — upload a 10-K PDF, ask in chat, watch it get drawn for you.
   Renders the real PDF (pdf.js), finds the answer, scrolls to it, and animates a
   hand-drawn annotation pointing at the exact words while it explains by voice + text.

   Network boundary = brain(). Offline it uses scripted answers (sample) + a
   keyword-locate fallback (any PDF). Flip CONFIG.USE_LIVE_API for real reasoning.
   ============================================================================ */
(function () {
"use strict";

const NS = "http://www.w3.org/2000/svg";

// pdf.js schedules rendering via requestAnimationFrame, which the browser PAUSES for
// hidden/background tabs — that would stall PDF rendering. Fall back to a timer when hidden.
(function () {
  const raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
  window.requestAnimationFrame = (cb) => (document.hidden || !raf) ? setTimeout(() => cb(performance.now()), 16) : raf(cb);
})();

const CONFIG = {
  MODEL: "claude-opus-4-8",          // per Anthropic's current guidance
  SAMPLE_PDF: "sample-10k.pdf",
};

/* Each user's OWN Claude key, kept in THEIR browser only (localStorage).
   It is never written into the shipped files, so sharing the app can't leak your key. */
function getUserKey() { try { return localStorage.getItem("ledger.key") || ""; } catch (e) { return ""; } }
function setUserKey(k) { try { localStorage.setItem("ledger.key", k); } catch (e) {} }
function clearUserKey() { try { localStorage.removeItem("ledger.key"); } catch (e) {} }

const SYSTEM_PROMPT =
`You are Ledger, a 10-K research assistant for analysts building financial models. You answer by
POINTING at the exact words in THIS filing and explaining why — never by guessing or inventing
numbers. When a request is broad or could mean several things, you FIRST ask a short numbered
clarifying question, and you keep narrowing across rounds until you can point precisely.

Every reply is EXACTLY ONE JSON object — no prose, no markdown fences. It always contains all of
these fields: "type", "question", "options", "steps", "note". Two shapes:

1) CLARIFY — when you cannot yet point to ONE precise location:
   {"type":"clarify","question":"<one short question>","options":["<label>","<label>", ...],"steps":[],"note":""}
   - 2 to 5 plain-text option labels. No numbers/bullets/punctuation prefixes (the app numbers them).
   - Options mutually distinct, collectively covering the likely intents, most-likely first.

2) ANSWER — when you can point precisely:
   {"type":"answer","question":"","options":[],"steps":[{"find":"<verbatim substring copied EXACTLY from the filing>","gesture":"circle"|"underline"|"arrow","say":"<one or two sentences: what it is and why it matters to the model>"}],"note":""}
   - 1 to 4 steps. "find" MUST be an exact substring of the filing text (it locates the words on the
     page; if it isn't exact it won't be found). Copy it verbatim. Never invent figures — point to WHERE
     the number lives.

DECISION RULE — clarify vs answer:
- Specific ask (one line item / one footnote) → ANSWER directly. e.g. "diluted weighted-average share
  count", "DSO / receivables days", "free cash flow", "remaining buyback authorization".
- Broad ask (a whole statement, or 2+ possible targets) → CLARIFY. e.g. "income statement", "balance
  sheet", "cash flow", "margins", "debt", "segments", "valuation".
- KEEP CLARIFYING across rounds: the analyst's pick arrives as their next message; re-read the whole path
  and either drill ONE level narrower (CLARIFY) or, once unambiguous, ANSWER. Each round must be strictly
  narrower; never repeat a question or re-offer a chosen branch. If a pick is already a leaf, ANSWER now.
- If the analyst gives qualifiers up front ("revenue by reportable segment, multi-year"), skip rounds you
  can already resolve and ANSWER.
- Routing: a standing BALANCE (gross debt, ROU asset, goodwill) is the balance sheet; the cash MOVEMENT of
  an item (capex spend, buyback cash, debt proceeds) is the cash-flow statement; ASC 280 segment mechanics,
  tax reconciliation, and MD&A drivers are cross-cutting.
- If asked to SEE a statement, point FIRST to its heading on the page with the actual figures (never a
  table-of-contents entry), then the key line(s).
Stay strictly inside this filing's content and modeling relevance.`;

const S = { pdf: null, pages: [], fullText: "", voice: true, isSample: false, busy: false, convo: [], activeOptions: null };

const $ = (s) => document.querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => s.replace(/\s+/g, " ").replace(/[–—]/g, "-").trim().toLowerCase();

/* ============================== PDF loading ============================== */
pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

async function loadFromData(data, name, isSample) {
  S.isSample = !!isSample;
  $("#fname").textContent = name;
  $("#uploadView").style.display = "none";
  $("#appView").classList.add("on");
  const viewer = $("#viewer");
  viewer.innerHTML = `<div class="loadwrap" id="loadwrap"><div class="box"><div class="spin"></div>Rendering filing…</div></div>`;
  try {
    S.pdf = await pdfjsLib.getDocument({ data }).promise;
  } catch (e) {
    viewer.innerHTML = `<div class="loadwrap"><div class="box">Couldn't open that PDF.<br>${esc(String(e.message || e))}</div></div>`;
    return;
  }
  const cw = Math.min(viewer.clientWidth - 56, 920);
  const frag = document.createDocumentFragment();
  S.pages = []; S.fullText = "";
  const dpr = window.devicePixelRatio || 1;
  for (let n = 1; n <= S.pdf.numPages; n++) {
    const page = await S.pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.0, Math.max(0.8, cw / base.width));
    const vp = page.getViewport({ scale });
    const cont = document.createElement("div");
    cont.className = "page"; cont.style.width = vp.width + "px"; cont.style.height = vp.height + "px";
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = vp.width + "px"; canvas.style.height = vp.height + "px";
    const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
    cont.appendChild(canvas);
    const pn = document.createElement("div"); pn.className = "pnum"; pn.textContent = "p. " + n; cont.appendChild(pn);
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "anno"); svg.setAttribute("viewBox", `0 0 ${vp.width} ${vp.height}`);
    svg.style.width = vp.width + "px"; svg.style.height = vp.height + "px"; cont.appendChild(svg);
    frag.appendChild(cont);

    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const content = await page.getTextContent();
    const items = [];
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
      const fs = Math.hypot(tx[2], tx[3]) || Math.hypot(tx[0], tx[1]) || 10;
      items.push({ str: it.str, x: tx[4], y: tx[5] - fs, w: it.width * scale, h: fs });
    }
    S.fullText += content.items.map((i) => i.str).join(" ") + "\n";
    S.pages.push({ n, cont, svg, items, width: vp.width, height: vp.height });
  }
  viewer.innerHTML = ""; viewer.appendChild(frag);
  enableChat();
}

/* ============================== locate text ============================== */
function unionBox(items) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  items.forEach((it) => { x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); });
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/* Match against the page's full normalized text with a char->item map, then box ONLY the
   items the matched range actually spans. (Avoids sweeping in nearby headings.) */
function findInItems(items, target) {
  let text = ""; const map = [];           // map[k] = item index for char k (-1 for joiners)
  for (let idx = 0; idx < items.length; idx++) {
    const s = norm(items[idx].str); if (!s) continue;
    if (text) { text += " "; map.push(-1); }
    for (let k = 0; k < s.length; k++) map.push(idx);
    text += s;
  }
  const at = text.indexOf(target); if (at < 0) return null;
  const used = new Set();
  for (let k = at; k < at + target.length; k++) if (map[k] >= 0) used.add(map[k]);
  if (!used.size) return null;
  return unionBox([...used].map((i) => items[i]));
}
function locate(quote) {
  const target = norm(quote);
  if (target.length < 3) return null;
  for (const pg of S.pages) { const b = findInItems(pg.items, target); if (b) return { page: pg, bbox: b }; }
  const short = target.split(" ").slice(0, 6).join(" ");
  if (short !== target) for (const pg of S.pages) { const b = findInItems(pg.items, short); if (b) return { page: pg, bbox: b }; }
  return null;
}
function scrollToBox(page, bbox) {
  const viewer = $("#viewer");
  const top = page.cont.offsetTop + bbox.y - viewer.clientHeight / 2 + bbox.h / 2;
  viewer.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

/* ===================== annotation engine (hand-drawn) ===================== */
function clearAnnos() { S.pages.forEach((p) => { while (p.svg.firstChild) p.svg.removeChild(p.svg.firstChild); }); }
const jit = (a) => (Math.random() - 0.5) * a;

function drawOn(el, dur, delay) {
  const len = el.getTotalLength ? el.getTotalLength() : 0;
  if (len) { el.style.strokeDasharray = len; el.style.strokeDashoffset = len; }
  setTimeout(() => { if (len) { el.style.transition = `stroke-dashoffset ${dur}s cubic-bezier(.6,.1,.3,1)`; el.style.strokeDashoffset = 0; } }, delay || 20);
}
function ovalPath(cx, cy, rx, ry, a0, a1) {
  const N = Math.max(28, Math.round((a1 - a0) / (Math.PI * 2) * 52));
  let d = "";
  for (let i = 0; i <= N; i++) {
    const t = a0 + (a1 - a0) * (i / N), jr = 1 + jit(0.05);
    const px = cx + Math.cos(t) * rx * jr + jit(2), py = cy + Math.sin(t) * ry * jr + jit(2);
    d += (i ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1) + " ";
  }
  return d;
}
function path(svg, d, cls) { const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); if (cls) p.setAttribute("class", cls); svg.appendChild(p); return p; }

function annotate(page, bbox, type) {
  const svg = page.svg;
  if (type === "underline") return drawUnderline(svg, bbox);
  if (type === "arrow") return drawArrow(svg, bbox);
  return drawCircle(svg, bbox);
}
function drawCircle(svg, b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2 + 8, ry = b.h / 2 + 6;
  // highlighter swipe (under the ink)
  const r = document.createElementNS(NS, "rect");
  r.setAttribute("class", "hl"); r.setAttribute("x", b.x - 3); r.setAttribute("y", b.y + b.h * 0.12);
  r.setAttribute("width", b.w + 6); r.setAttribute("height", b.h * 0.82); r.setAttribute("rx", 3);
  r.style.transformBox = "fill-box"; r.style.transformOrigin = "left center"; r.style.transform = "scaleX(0)";
  svg.appendChild(r);
  setTimeout(() => { r.style.transition = "transform .45s ease"; r.style.transform = "scaleX(1)"; }, 12);
  // two sketchy passes for a hand-drawn look
  const p1 = path(svg, ovalPath(cx, cy, rx, ry, -0.4, Math.PI * 2 + 0.5)); drawOn(p1, 0.72, 60);
  const p2 = path(svg, ovalPath(cx, cy, rx + jit(2), ry + jit(2), -0.2, Math.PI * 2 + 0.3));
  p2.style.opacity = ".55"; p2.style.strokeWidth = "1.6"; drawOn(p2, 0.7, 230);
}
function drawUnderline(svg, b) {
  const y = b.y + b.h + 3.5; const N = Math.max(8, Math.round(b.w / 16)); let d = "";
  for (let i = 0; i <= N; i++) { const t = i / N; d += (i ? "L" : "M") + (b.x + b.w * t).toFixed(1) + " " + (y + jit(2) - Math.sin(t * Math.PI) * 1.5).toFixed(1) + " "; }
  drawOn(path(svg, d), 0.6, 40);
}
function drawArrow(svg, b) {
  const tx = b.x - 5, ty = b.y + b.h / 2;
  const sx = Math.max(14, b.x - 78), sy = ty - 34, cx = (sx + tx) / 2, cy = sy - 8;
  drawOn(path(svg, `M${sx} ${sy} Q${cx} ${cy} ${tx} ${ty}`, "arrow"), 0.6, 30);
  const ah = document.createElementNS(NS, "polygon");
  const a = Math.atan2(ty - cy, tx - cx), L = 11;
  ah.setAttribute("class", "arrow head");
  ah.setAttribute("points", `${tx},${ty} ${tx - L * Math.cos(a - 0.4)},${ty - L * Math.sin(a - 0.4)} ${tx - L * Math.cos(a + 0.4)},${ty - L * Math.sin(a + 0.4)}`);
  ah.style.opacity = "0"; svg.appendChild(ah);
  setTimeout(() => { ah.style.transition = "opacity .25s"; ah.style.opacity = "1"; }, 560);
}

/* ============================== chat / voice ============================== */
const msgs = () => $("#msgs");
function addUser(t) { const m = el("div", "msg user", esc(t)); msgs().appendChild(m); scrollMsgs(); }
function addBot(text, loc) {
  const m = el("div", "msg bot pointing");
  m.innerHTML = `<div class="cue">✎ drawing on the filing <span class="speaking"><i></i><i></i><i></i></span></div>${esc(text)}`;
  if (loc) { const c = el("span", "cite", `↪ show on p. ${loc.page.n}`); c.onclick = () => { scrollToBox(loc.page, loc.bbox); }; m.appendChild(c); }
  msgs().appendChild(m); scrollMsgs(); return m;
}
function addPlain(text) { const m = el("div", "msg bot", esc(text)); msgs().appendChild(m); scrollMsgs(); return m; }
function addThinking() { const t = el("div", "thinking", `<span class="dot"></span><span class="dot"></span><span class="dot"></span> reading the filing`); msgs().appendChild(t); scrollMsgs(); return t; }
function scrollMsgs() { msgs().scrollTop = msgs().scrollHeight; }
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function speakAndWait(text) {
  return new Promise((res) => {
    if (!S.voice || !("speechSynthesis" in window)) { setTimeout(res, Math.min(5200, 1100 + text.length * 28)); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[“”]/g, '"')); u.rate = 1.04;
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    u.onend = fin; u.onerror = fin; window.speechSynthesis.speak(u);
    setTimeout(fin, Math.min(15000, 1600 + text.length * 60));   // watchdog if onend never fires
  });
}

/* ============================= orchestration ============================= */
async function ask(question) {
  if (S.busy || !question.trim()) return;
  if (!getUserKey()) { openKey(); return; }
  S.busy = true; setComposer(false); clearOptions();
  addUser(question);
  clearAnnos();
  S.convo = [userMsgWithFiling(question)];     // fresh reasoning thread for a typed question
  await step();
}
async function step() {
  const thinking = addThinking();
  let res;
  try { res = await liveStep(); } catch (e) { res = { note: "Something went wrong. " + (e.message || "") }; }
  thinking.remove();
  await handleResponse(res);
}
async function handleResponse(res) {
  if (res && res.type === "clarify" && res.options && res.options.length) {
    renderClarify(res.question, res.options, res.note);     // ask numbered question, wait for a pick
    S.busy = false; setComposer(true); return;
  }
  if (res && res.type === "answer" && res.steps && res.steps.length) {
    await runSteps(res.steps);
    S.busy = false; setComposer(true); return;
  }
  addPlain((res && res.note) || "I couldn't find that in this filing — try rephrasing.");
  S.busy = false; setComposer(true);
}
async function runSteps(steps) {
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const loc = st.find ? locate(st.find) : null;
    if (loc) { scrollToBox(loc.page, loc.bbox); await wait(520); annotate(loc.page, loc.bbox, st.gesture || "circle"); await wait(180); }
    const bubble = addBot(st.say, loc);
    await speakAndWait(st.say);
    const sp = bubble.querySelector(".speaking"); if (sp) sp.remove();
    const cue = bubble.querySelector(".cue"); if (cue && !loc) cue.remove();
    await wait(loc ? 220 : 120);
  }
}
/* numbered clarifying options — click or press 1-9 */
function renderClarify(question, options, note) {
  S.activeOptions = options.slice(0, 9);
  const m = el("div", "msg bot clarify");
  let html = `<div class="q">${esc(question)}</div>`;
  if (note) html += `<div class="ow" style="margin:-4px 0 8px;color:var(--fg-soft)">${esc(note)}</div>`;
  html += `<div class="opts">` + S.activeOptions.map((o, i) =>
    `<button class="opt" data-i="${i}"><span class="n">${i + 1}</span><span>${esc(o)}</span></button>`).join("") + `</div>`;
  html += `<div class="kbdhint">press 1–${S.activeOptions.length}, click, or type your own question</div>`;
  m.innerHTML = html; msgs().appendChild(m); scrollMsgs();
  S.activeContainer = m;
  m.querySelectorAll(".opt").forEach((b) => { b.onclick = () => pick(+b.dataset.i); });
  if (S.voice && "speechSynthesis" in window) { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(question); u.rate = 1.04; window.speechSynthesis.speak(u); }
}
function clearOptions() { S.activeOptions = null; S.activeContainer = null; }
function pick(i) {
  if (S.busy || !S.activeOptions || i < 0 || i >= S.activeOptions.length) return;
  const label = S.activeOptions[i], container = S.activeContainer;
  if (container) container.querySelectorAll(".opt").forEach((b, j) => { b.disabled = true; if (j === i) b.classList.add("kbd"); });
  clearOptions();
  S.busy = true; setComposer(false);
  addUser(label);
  S.convo.push({ role: "user", content: label });          // continue the SAME thread → narrows further
  step();
}
function setComposer(on) { $("#ask").disabled = !on; $("#send").disabled = !on; if (on) $("#ask").focus(); }

/* =============================== the brain =============================== */
/* structured-output schema: one object that is EITHER a clarify question OR an answer */
const RESPONSE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["clarify", "answer"] },
    question: { type: "string" },
    options: { type: "array", items: { type: "string" } },
    steps: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: { find: { type: "string" }, gesture: { type: "string", enum: ["circle", "underline", "arrow"] }, say: { type: "string" } },
        required: ["find", "gesture", "say"],
      },
    },
    note: { type: "string" },
  },
  required: ["type", "question", "options", "steps", "note"],
};

// first message carries the whole filing (cached across clarify rounds) + the question
function userMsgWithFiling(q) {
  return { role: "user", content: [
    { type: "text", text: "Full text of the 10-K filing:\n\n" + S.fullText.slice(0, 180000), cache_control: { type: "ephemeral" } },
    { type: "text", text: "ANALYST QUESTION: " + q },
  ] };
}

/* ---- one turn of the conversation: the user's OWN key, called straight from the browser ----
   Key lives in localStorage (this browser only) and goes ONLY to api.anthropic.com — never in
   the shipped files, never to any server of yours, so sharing the app can't leak your key. */
async function liveStep() {
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": getUserKey(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: CONFIG.MODEL, max_tokens: 1200, system: SYSTEM_PROMPT,
        messages: S.convo,
        output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
      }),
    });
  } catch (e) { return { note: "Couldn't reach Anthropic from the browser (network). " + (e.message || "") }; }
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (r.status === 401) return { note: "That API key was rejected (401). Tap 🔑 and re-check it." };
    if (r.status === 429) return { note: "Rate limited (429) — wait a moment and try again." };
    return { note: `Couldn't reach Claude (${r.status}). ${t.slice(0, 160)}` };
  }
  const data = await r.json();
  const txt = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  S.convo.push({ role: "assistant", content: txt });
  try { return JSON.parse(txt); } catch (e) {
    const m = txt.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
    return { note: "Got a response I couldn't parse — try rephrasing." };
  }
}

/* ---- offline scripted answers for the bundled sample (quotes exist in the PDF) ---- */
const SCRIPTS = [
  { re: /non.?recurring|one.?time|unusual|restructur|normaliz|adjust|clean/, steps: [
    { find: "restructuring charge of $24.8 million", type: "circle", say: "Watch for one-time items. This $24.8 million restructuring charge is non-recurring — you should strip it out so the base-year operating margin reflects sustainable earnings." },
    { find: "Excluding the restructuring charge, adjusted operating income", type: "underline", say: "Management even gives you the adjusted figure — $257 million, or 13.9% of revenue. That normalized margin is what you carry forward, not the as-reported one." },
  ]},
  { re: /tax|effective rate/, steps: [
    { find: "Our effective tax rate was 22.0%", type: "circle", say: "The effective tax rate was 22.0% — that's the actual blended rate, above the 21% federal statutory rate." },
    { find: "State income taxes, net of federal benefit", type: "underline", say: "But use a normalized rate. The note reconciles 21% up to 22% via state taxes and foreign mix, less the R&D credit. Keep the recurring drivers and drop the one-offs for your forecast." },
  ]},
  { re: /debt|leverage|maturit|covenant|borrow|notes due|term loan|refinanc/, steps: [
    { find: "4.25% Senior Notes due 2029", type: "circle", say: "Total debt is $662 million. Here's the stack — $400 million of senior notes at a fixed 4.25%, plus a floating-rate term loan." },
    { find: "Aggregate maturities of debt are", type: "underline", say: "And this is your refinancing schedule — when each tranche comes due. Note the covenant too: a maximum net-leverage ratio of 3.50 times." },
  ]},
  { re: /d&a|depreciat|amortiz/, steps: [
    { find: "Depreciation and amortization", type: "circle", say: "D&A isn't a separate line on the income statement — it's buried in costs. Find it here in the cash-flow add-backs: $112.8 million. Use this for your PP&E schedule and EBITDA." },
  ]},
  { re: /stock.?based|\bsbc\b|stock comp|dilution|compensation/, steps: [
    { find: "Stock-based compensation", type: "circle", say: "Stock-based comp is $48.6 million — added back here as non-cash. But don't treat it as free: it's a real cost that dilutes shareholders, so model the dilution in your share count." },
  ]},
  { re: /capex|capital expenditure|property, plant|free cash/, steps: [
    { find: "Capital expenditures", type: "circle", say: "Capex sits in investing activities — $156.4 million, about 8.5% of revenue. Subtract it from operating cash flow to get free cash flow of roughly $141 million." },
  ]},
  { re: /segment|by product|by geograph|business line/, steps: [
    { find: "two reportable segments", type: "circle", say: "There are two segments — Advanced Coatings and Industrial Components." },
    { find: "net revenue of $1,104.4 million and $737.9 million", type: "underline", say: "Coatings is the larger and faster-growing piece. Forecast each segment on its own growth and margin, then roll them up — never use one blended rate." },
  ]},
  { re: /gross margin|gross profit|cost of revenue|\bcogs\b/, steps: [
    { find: "gross margin expanded 140 basis points to", type: "underline", say: "Gross margin expanded 140 basis points to 39.0%, on volume leverage and a richer mix — but flag the cobalt and tantalum cost pressure as a downside to margin." },
  ]},
  { re: /net income|earnings|bottom line|\beps\b|per share/, steps: [
    { find: "Net income was $158.3 million, or $1.88 per diluted share", type: "circle", say: "Net income is $158.3 million — that's $1.88 per diluted share, up from $1.49 last year." },
  ]},
  { re: /revenue|sales|top.?line|grow|growth/, steps: [
    { find: "Net revenue increased $187.4 million, or 11.3%, to $1,842.3 million", type: "circle", say: "Start in the MD&A — management states it outright. Revenue grew 11.3% to $1.84 billion." },
    { find: "8.2% organic volume growth in Advanced Coatings, favorable pricing of approximately 2.4%", type: "underline", say: "Now the why: they decompose it into 8.2% organic volume, about 2.4% pricing, less a small currency drag. Build your forecast from those pieces, not from the headline rate." },
  ]},
  { re: /liquidity|cash|balance/, steps: [
    { find: "Operating cash flow", type: "circle", say: "Operating cash flow was $297 million. Pair it with the $312 million cash balance and the undrawn revolver to judge liquidity." },
  ]},
];
function scriptFor(q) { const s = q.toLowerCase(); for (const r of SCRIPTS) if (r.re.test(s)) return { steps: r.steps }; return null; }

/* ---- offline (no key): jump to standard 10-K sections by their real heading, honestly. ----
   No reasoning is possible without the model, so we navigate to known sections and say so —
   we never circle a random keyword and pretend it's the answer. */
const SECTIONS = [
  { re: /income statement|statement of operations|p&l|profit and loss|net income|revenue|sales|earnings|operating income/,
    terms: ["consolidated statements of operations", "consolidated statement of operations", "statements of operations", "statement of operations", "consolidated statements of income", "statements of income", "income statement"],
    numbersPage: true, label: "income statement (statements of operations)" },
  { re: /balance sheet|total assets|liabilit|financial position/,
    terms: ["consolidated balance sheets", "consolidated balance sheet", "balance sheets", "balance sheet", "statements of financial position"],
    numbersPage: true, label: "balance sheet" },
  { re: /cash ?flow/,
    terms: ["consolidated statements of cash flows", "statements of cash flows", "statement of cash flows", "cash flows"],
    numbersPage: true, label: "statement of cash flows" },
  { re: /equity|stockholder|shareholder/,
    terms: ["statements of shareholders' equity", "statements of stockholders' equity", "shareholders' equity", "stockholders' equity", "changes in equity"],
    numbersPage: true, label: "statement of equity" },
  { re: /md&a|management.s discussion|liquidity|results of operation/,
    terms: ["management's discussion and analysis", "management’s discussion and analysis", "results of operations"], label: "MD&A" },
  { re: /risk factor/, terms: ["risk factors"], label: "risk factors" },
  { re: /debt|leverage|borrow|notes payable|credit facility|maturit/,
    terms: ["long-term debt", "credit facility", "notes payable", "indebtedness", "aggregate maturities"], numbersPage: true, label: "debt" },
  { re: /segment/, terms: ["segment information", "reportable segment", "operating segment", "segment"], numbersPage: true, label: "segment information" },
];
// pages with the most digits are the actual financial statements (not the table of contents)
function digitCount(pg) { let d = 0; for (const it of pg.items) { const m = it.str.match(/\d/g); if (m) d += m.length; } return d; }
function locateSection(terms, preferNumbers) {
  let best = null, bestScore = -1;
  for (const pg of S.pages) {
    let bbox = null;
    for (const t of terms) { bbox = findInItems(pg.items, norm(t)); if (bbox) break; }
    if (!bbox) continue;
    const score = preferNumbers ? digitCount(pg) : (S.pages.length - pg.n); // numbers → real statement; else earliest
    if (score > bestScore) { bestScore = score; best = { page: pg, bbox }; }
    if (!preferNumbers) break;   // first occurrence is fine for narrative sections
  }
  return best;
}
function offlineNav(q) {
  const s = q.toLowerCase();
  for (const sec of SECTIONS) {
    if (!sec.re.test(s)) continue;
    const loc = locateSection(sec.terms, sec.numbersPage);
    if (loc) return { steps: [{ find: null, _loc: loc, type: "circle",
      say: `Here's the ${sec.label} in your filing — I've jumped to it and circled the heading on the page with the actual figures. I can't read the numbers off it or explain why they matter without reading the document, though: tap 🔑 to add your Claude key (it stays in your browser) and I'll walk you through it properly.` }] };
  }
  return { note: `I can only jump to standard sections offline — I can't actually read this filing without the model. To answer “${q}” properly (find it, point to the exact figures, and explain why), tap 🔑 (top right) and add your own Claude key. It stays in your browser and never touches a server.` };
}

/* ============================== wiring / boot ============================== */
const SUGGESTIONS = [
  "How fast is revenue growing, and why?",
  "What tax rate should I use?",
  "Where's the debt and when does it mature?",
  "Find the non-recurring items to normalize",
];
function enableChat() {
  $("#suggest").innerHTML = "";
  SUGGESTIONS.forEach((s) => { const b = el("button", null, esc(s)); b.onclick = () => { $("#ask").value = s; submit(); }; $("#suggest").appendChild(b); });
  setComposer(true);
  msgs().innerHTML = "";
  addPlain(S.isSample
    ? "I've read this 10-K. Ask me anything — even something broad like “the income statement.” I'll ask a quick question or two to pin down exactly what you need, then point to it on the page and explain why."
    : "I've read your filing. Ask me anything — even something broad. I'll ask a quick 1-2-3 question to nail down what you want, then point to it on the page and explain.");
}
function submit() { const v = $("#ask").value.trim(); if (!v) return; $("#ask").value = ""; ask(v); }

function handleFile(file) {
  if (!getUserKey()) { openKey(); return; }                    // key required first
  if (!file || file.type !== "application/pdf") { alert("Please choose a PDF file."); return; }
  file.arrayBuffer().then((buf) => loadFromData(buf, file.name, false));
}
function boot() {
  const drop = $("#drop"), input = $("#fileInput");
  drop.onclick = () => input.click();
  input.onchange = (e) => handleFile(e.target.files[0]);
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
  $("#loadSample").onclick = (e) => {
    e.stopPropagation();
    if (!getUserKey()) { openKey(); return; }                  // key required first
    fetch(CONFIG.SAMPLE_PDF).then((r) => r.arrayBuffer()).then((buf) => loadFromData(buf, "Helios Materials, Inc. — Form 10-K (sample)", true))
      .catch(() => alert("Couldn't load the sample PDF."));
  };
  $("#send").onclick = submit;
  $("#ask").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  // press 1-9 to pick a clarifying option (unless typing in the box)
  document.addEventListener("keydown", (e) => {
    if (!S.activeOptions || document.activeElement === $("#ask")) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= S.activeOptions.length) { e.preventDefault(); pick(n - 1); }
  });
  $("#muteBtn").onclick = (e) => {
    S.voice = !S.voice; e.currentTarget.classList.toggle("on", S.voice); e.currentTarget.textContent = S.voice ? "🔊" : "🔇";
    if (!S.voice && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };
  $("#newBtn").onclick = () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); location.reload(); };

  // bring-your-own-key modal (a key is REQUIRED before anything works)
  const km = $("#keyModal");
  const closeKm = () => { km.hidden = true; };
  $("#keyBtn").onclick = openKey;
  $("#uploadKeyBtn").onclick = openKey;
  $("#keyCancel").onclick = closeKm;
  km.onclick = (e) => { if (e.target === km) closeKm(); };
  $("#keyShow").onchange = (e) => { $("#keyInput").type = e.target.checked ? "text" : "password"; };
  $("#keySave").onclick = () => {
    const v = $("#keyInput").value.trim();
    if (v) setUserKey(v); closeKm(); refreshGate();
    if (v && S.pdf) addPlain("Key saved — it stays in this browser. Ask me anything about this filing.");
  };
  $("#keyClear").onclick = () => { clearUserKey(); $("#keyInput").value = ""; closeKm(); refreshGate(); };
  refreshGate();
}
function openKey() {
  $("#keyInput").value = getUserKey(); $("#keyShow").checked = false; $("#keyInput").type = "password";
  $("#keyModal").hidden = false; $("#keyInput").focus();
}
function refreshGate() {
  const has = !!getUserKey();
  const drop = $("#drop"); if (drop) drop.classList.toggle("locked", !has);
  const kg = $("#keygate"); if (kg) kg.classList.toggle("set", has);
  const kt = $("#keygateText"); if (kt) kt.textContent = has ? "Your Claude key is set — you're ready" : "Add your Claude key to begin";
  const ukb = $("#uploadKeyBtn"); if (ukb) ukb.textContent = has ? "🔑 Change key" : "🔑 Add your key";
  const b = $("#keyBtn"); if (b) { b.textContent = has ? "🔑 Key set" : "🔑 Add your key"; b.classList.toggle("set", has); }
}
boot();
})();
