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
`You are Ledger, an AI that answers questions about ONE SEC 10-K by pointing at the exact
words in the filing and explaining WHY they answer the question — like a tutor drawing on
the page. Given the filing text and a question, return JSON: {"steps":[{"find": <verbatim
substring copied EXACTLY from the filing to point at>, "type": "circle"|"underline"|"arrow",
"say": <one or two spoken sentences explaining this step and why it matters>}], "note": <optional>}.
RULES: copy every "find" verbatim from the provided text (it is used to locate the words on
the page — if it isn't an exact substring it won't be found); never invent numbers; ground
every claim in the filing; if the answer isn't in the filing, return an empty steps array and
a "note" saying so. Lead the user from where the figure lives to why it's the right one. Keep
"say" plain-spoken; expand acronyms once.`;

const S = { pdf: null, pages: [], fullText: "", voice: true, isSample: false, busy: false };

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
  S.busy = true; setComposer(false);
  addUser(question);
  clearAnnos();
  const thinking = addThinking();
  let res;
  try { res = await brain(question); } catch (e) { res = { note: "Something went wrong reaching the model. " + (e.message || "") }; }
  thinking.remove();

  if (!res.steps || !res.steps.length) { addPlain(res.note || "I couldn't find that in this filing."); S.busy = false; setComposer(true); return; }

  for (let i = 0; i < res.steps.length; i++) {
    const st = res.steps[i];
    const loc = st.find ? locate(st.find) : null;
    if (loc) { scrollToBox(loc.page, loc.bbox); await wait(520); annotate(loc.page, loc.bbox, st.type || "circle"); await wait(180); }
    const bubble = addBot(st.say, loc);
    await speakAndWait(st.say);
    const sp = bubble.querySelector(".speaking"); if (sp) sp.remove();
    const cue = bubble.querySelector(".cue"); if (cue && !loc) cue.remove();
    await wait(loc ? 220 : 120);
  }
  S.busy = false; setComposer(true);
}
function setComposer(on) { $("#ask").disabled = !on; $("#send").disabled = !on; if (on) $("#ask").focus(); }

/* =============================== the brain =============================== */
async function brain(q) {
  if (getUserKey()) return liveBrain(q);                       // user supplied their own key → real reasoning
  if (S.isSample) { const s = scriptFor(q); if (s) return s; } // offline: curated answers on the sample
  return keywordBrain(q);                                      // offline: locate-by-keyword on any PDF
}

const STEPS_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    steps: {
      type: "array", items: {
        type: "object", additionalProperties: false,
        properties: {
          find: { type: "string" }, type: { type: "string", enum: ["circle", "underline", "arrow"] }, say: { type: "string" },
        },
        required: ["find", "type", "say"],
      },
    },
    note: { type: "string" },
  },
  required: ["steps", "note"],
};

/* ---- live: the user's OWN key, called straight from their browser to Anthropic ----
   The key is read from localStorage (this browser only) and goes ONLY to api.anthropic.com.
   It is never in the shipped files and never touches any server of yours — so sharing the app
   cannot leak your key. Anthropic permits browser calls when the dangerous-direct-browser-access
   header is set (the "danger" is only that you must never ship a SHARED key — which we don't). */
async function liveBrain(q) {
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
        model: CONFIG.MODEL, max_tokens: 1500, system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: S.fullText.slice(0, 180000) + "\n\nQUESTION: " + q }],
        output_config: { format: { type: "json_schema", schema: STEPS_SCHEMA } },
      }),
    });
  } catch (e) { return { note: "Couldn't reach Anthropic from the browser (network/CORS). " + (e.message || "") }; }
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    if (r.status === 401) return { note: "That API key was rejected (401). Tap 🔑 and re-check it." };
    if (r.status === 429) return { note: "Rate limited (429) — wait a moment and ask again." };
    return { note: `Couldn't reach Claude (${r.status}). ${t.slice(0, 160)}` };
  }
  const data = await r.json();
  const txt = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  try { return JSON.parse(txt); } catch (e) {
    const m = txt.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
    return { note: "Got a response I couldn't parse — try rephrasing the question." };
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

/* ---- offline fallback for ANY uploaded PDF: locate the strongest keyword and point ---- */
const STOP = new Set("the a an of to in is are was were be on for and or how do i what where which when find show me this that my your our with as at it its by from can you should would could need want help me about".split(" "));
function keywordBrain(q) {
  const words = q.toLowerCase().replace(/[^a-z0-9%$. ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const tries = [];
  if (words.length >= 2) tries.push(words.slice(0, 3).join(" "), words.slice(0, 2).join(" "));
  words.sort((a, b) => b.length - a.length).forEach((w) => tries.push(w));
  for (const t of tries) {
    const loc = locate(t);
    if (loc) return { steps: [{ find: t, type: "circle",
      say: `Here's where this filing talks about “${t}.” I've pointed to it — read the surrounding sentence to confirm it's what you need. Tap 🔑 to add your Claude key for a full, reasoned walkthrough of why this is the right answer.` }] };
  }
  return { note: `I searched the filing but couldn't find that offline. Tap 🔑 (top right) to add your own Claude key for real reasoning over any PDF — or load the sample 10-K and try “how fast is revenue growing?”.` };
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
  (S.isSample ? SUGGESTIONS : ["What's the revenue?", "Find the total debt", "Where is net income?"]).forEach((s) => {
    const b = el("button", null, esc(s)); b.onclick = () => { $("#ask").value = s; submit(); }; $("#suggest").appendChild(b);
  });
  setComposer(true);
  msgs().innerHTML = "";
  const live = !!getUserKey();
  addPlain(S.isSample
    ? (live
      ? "I've read this 10-K (using your key). Ask me anything — I'll find the answer, draw on the page to show you exactly where it is, and explain why."
      : "I've read this 10-K. Ask me anything — I'll find the answer, draw on the page, and explain why. (These sample questions work offline; tap 🔑 to add your Claude key and ask anything.)")
    : (live
      ? "I've loaded your filing (using your key). Ask anything and I'll point to the answer on the page and explain it."
      : "I've loaded your filing. Offline I can point to keywords on the page — tap 🔑 (top right) to add your own Claude key for full reasoning on this PDF."));
}
function submit() { const v = $("#ask").value.trim(); if (!v) return; $("#ask").value = ""; ask(v); }

function handleFile(file) {
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
    fetch(CONFIG.SAMPLE_PDF).then((r) => r.arrayBuffer()).then((buf) => loadFromData(buf, "Helios Materials, Inc. — Form 10-K (sample)", true))
      .catch(() => alert("Couldn't load the sample PDF."));
  };
  $("#send").onclick = submit;
  $("#ask").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  $("#muteBtn").onclick = (e) => {
    S.voice = !S.voice; e.currentTarget.classList.toggle("on", S.voice); e.currentTarget.textContent = S.voice ? "🔊" : "🔇";
    if (!S.voice && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };
  $("#newBtn").onclick = () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); location.reload(); };

  // bring-your-own-key modal
  const km = $("#keyModal");
  const closeKm = () => { km.hidden = true; };
  $("#keyBtn").onclick = () => { $("#keyInput").value = getUserKey(); $("#keyShow").checked = false; $("#keyInput").type = "password"; km.hidden = false; $("#keyInput").focus(); };
  $("#keyCancel").onclick = closeKm;
  km.onclick = (e) => { if (e.target === km) closeKm(); };
  $("#keyShow").onchange = (e) => { $("#keyInput").type = e.target.checked ? "text" : "password"; };
  $("#keySave").onclick = () => {
    const v = $("#keyInput").value.trim();
    if (v) setUserKey(v); closeKm(); refreshKeyBtn();
    if (v && S.pdf) addPlain("Key saved — it stays in this browser. Now ask me anything about this filing and I'll reason over the whole thing.");
  };
  $("#keyClear").onclick = () => { clearUserKey(); $("#keyInput").value = ""; closeKm(); refreshKeyBtn(); };
  refreshKeyBtn();
}
function refreshKeyBtn() {
  const b = $("#keyBtn"); if (!b) return;
  const has = !!getUserKey();
  b.textContent = has ? "🔑 Key set" : "🔑 Add your key";
  b.classList.toggle("set", has);
}
boot();
})();
