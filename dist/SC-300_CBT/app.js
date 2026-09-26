(() => {
  "use strict";

  const DATA = window.SC300_DATA;
  const QUESTIONS = DATA.questions;
  const BY_N = new Map(QUESTIONS.map(q => [q.n, q]));
  const SETS = DATA.sets || [];                          // 공통 지문 세트 (tools/sets/apply_sets.py)
  const SET_BY_ID = new Map(SETS.map(s => [s.id, s]));
  const setLabel = q => q.set ? `세트 ${q.set.no}-${q.set.idx}` : "";
  const THEME_KEY = "sc300cbt.theme";     // 테마만 기기별 저장. 기록은 전부 서버(D1, exam=sc300).
  const EXAM = "sc300";
  const PROGRESS_API = `/api/progress?exam=${EXAM}`;
  const REPORT_API = `/api/report?exam=${EXAM}`;
  let myReports = [];
  const TYPE_LABEL = { multiple_choice: "객관식", dropdown: "HOTSPOT", drag_drop: "DRAG DROP", statements: "예/아니요", answer_reveal: "자기 채점" };
  const qLabel = q => `Q${q.n}`;

  const $ = id => document.getElementById(id);

  // ---------- 상태 ----------
  let state = { records: {}, session: null, examRuns: [], theme: "" };
  let examTimerHandle = null;
  let pending = {};          // 현재 문항의 입력 중 상태

  const KO_KEY = THEME_KEY.replace(/theme$/, "ko");     // 한국어 번역 패널을 펼쳐 둘지 (기기별)
  function loadTheme() { try { state.theme = localStorage.getItem(THEME_KEY) || ""; state.koOpen = localStorage.getItem(KO_KEY) === "1"; } catch { state.theme = ""; } }
  function saveTheme() { try { localStorage.setItem(THEME_KEY, state.theme || ""); } catch { /* ignore */ } }
  function saveKo() { try { localStorage.setItem(KO_KEY, state.koOpen ? "1" : "0"); } catch { /* ignore */ } }

  // ===== 서버 동기화 (D1) — AZ-104 CBT 와 같은 방식 =====
  // 서버가 유일한 기준. 세션 쿠키(HttpOnly)는 fetch 가 자동으로 들고 간다.
  // 저장은 "마지막으로 서버와 맞춘 내용"과 달라진 문항만 보내고, 서버는 문항별 updatedAt 이 큰 쪽을 남긴다.
  let me = null;
  let syncTimer = null, syncBusy = false, syncReady = false, pendingPush = false;
  let lastSent = {};            // n → 마지막으로 서버와 맞춘 레코드 JSON
  let lastSession = "";         // 마지막으로 서버와 맞춘 세션 JSON
  let sentRuns = new Set();     // 서버에 이미 있는 모의고사 회차 id

  function setSyncStatus(text, tone) {
    const el = $("syncStatus"); if (!el) return;
    el.textContent = text; el.className = `sync-status${tone ? " " + tone : ""}`;
  }
  function nowLabel() { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
  function goLogin() { location.replace(`/?next=${encodeURIComponent(location.pathname + location.search)}`); }
  async function api(path, opts) {
    const r = await fetch(path, { cache: "no-store", credentials: "same-origin", ...opts });
    if (r.status === 401) { goLogin(); throw new Error("unauthorized"); }
    return r;
  }
  function runIdOf(run) { return String(run?.id || run?.at || run?.finishedAt || ""); }
  function sessionJson() {
    if (!state.session) return "null";
    const { answeredNow, ...rest } = state.session;   // 잠금 상태는 기기 로컬 정보라 서버에 올리지 않는다
    return JSON.stringify(rest);
  }

  function adoptRemote(remote) {
    const incoming = (remote && typeof remote.progress === "object" && remote.progress) ? remote.progress : {};
    state.records = Object.fromEntries(Object.entries(incoming).filter(([, v]) => !isEmptyRecord(v)));
    state.examRuns = Array.isArray(remote?.examRuns) ? remote.examRuns : [];
    state.session = (remote && remote.session && Array.isArray(remote.session.queue)) ? remote.session : null;
    lastSent = {};
    for (const [k, v] of Object.entries(state.records)) lastSent[k] = JSON.stringify(v);
    lastSession = sessionJson();
    sentRuns = new Set(state.examRuns.map(runIdOf).filter(Boolean));
    return Object.keys(state.records).length;
  }
  async function syncPull() {
    try {
      setSyncStatus("서버에서 불러오는 중…");
      const r = await api(PROGRESS_API);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || r.status);
      const n = adoptRemote(data);
      syncReady = true;
      setSyncStatus(`서버 기준 ${n}건 · ${nowLabel()}`, "ok");
      if (pendingPush) { pendingPush = false; syncFlush(); }
      return true;
    } catch (e) {
      if (String(e?.message) === "unauthorized") return false;
      syncReady = false;
      setSyncStatus("서버 연결 실패 · 저장 보류", "bad");
      return false;
    }
  }
  function saveState() {
    if (!syncReady) { pendingPush = true; return; }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncFlush, 2000);           // 2초 디바운스
  }
  function buildDelta() {
    const records = {};
    for (const [k, v] of Object.entries(state.records || {})) { if (isEmptyRecord(v)) continue; const j = JSON.stringify(v); if (lastSent[k] !== j) records[k] = v; }
    const sesJson = sessionJson();
    const examRuns = (state.examRuns || []).filter(r => !sentRuns.has(runIdOf(r)));
    const body = {};
    if (Object.keys(records).length) body.records = records;
    if (sesJson !== lastSession) body.session = JSON.parse(sesJson) || { queue: [] };
    if (examRuns.length) body.examRuns = examRuns;
    return { body, sesJson, empty: !body.records && !body.session && !body.examRuns };
  }
  async function syncFlush() {
    clearTimeout(syncTimer); syncTimer = null;
    if (!syncReady || syncBusy) { pendingPush = true; return; }
    const d = buildDelta();
    if (d.empty) return;
    syncBusy = true;
    try {
      setSyncStatus("저장 중…");
      const r = await api(PROGRESS_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d.body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || r.status);
      for (const k of Object.keys(d.body.records || {})) lastSent[k] = JSON.stringify(state.records[k]);
      if (d.body.session) lastSession = d.sesJson;
      for (const run of d.body.examRuns || []) sentRuns.add(runIdOf(run));
      setSyncStatus(`저장됨 · ${data.count ?? Object.keys(state.records).length}건 · ${nowLabel()}`, "ok");
    } catch (e) {
      if (String(e?.message) !== "unauthorized") setSyncStatus("저장 실패 · 잠시 후 다시 시도", "bad");
    } finally {
      syncBusy = false;
      if (pendingPush) { pendingPush = false; saveState(); }
    }
  }
  async function resetRemote() {
    await api(PROGRESS_API, { method: "DELETE" });
    state.records = {}; state.examRuns = []; state.session = null;
    lastSent = {}; lastSession = sessionJson(); sentRuns = new Set();
  }
  async function loadMe() {
    try {
      const r = await api("/api/auth/me"); const d = await r.json();
      me = d.user || null;
      const el = $("whoamiName"); if (el) el.textContent = me?.name || "…";
    } catch { /* 401 이면 goLogin 이 처리 */ }
  }
  // ---------- 문항 신고 ----------
  async function loadReports() {
    try {
      const r = await api(REPORT_API);
      const d = await r.json();
      myReports = Array.isArray(d?.reports) ? d.reports : [];
    } catch { myReports = []; }
    const el = $("reportCount"); if (el) el.textContent = String(myReports.length);
    const q = currentQuestion(); if (q) renderReportBar(q);
  }
  function reportFor(n) { return myReports.find(r => Number(r.source) === Number(n)); }
  function renderReportBar(q) {
    const btn = $("reportOpen"), st = $("reportState");
    if (!btn || !q) return;
    const done = !!reportFor(q.n);
    btn.textContent = done ? "🚩 신고 내용 수정" : "🚩 이 문항 신고";
    if (st) st.textContent = done ? "신고함" : "";
  }
  function myAnswerText(q) {
    const sel = pending.selected;
    if (!sel) return "";
    if (Array.isArray(sel)) return sel.join("");
    if (typeof sel === "object") return Object.values(sel).filter(v => typeof v === "string").join(" / ");
    return String(sel);
  }
  function appAnswerText(q) {
    if (q.type === "multiple_choice") return (q.answers || []).join(", ");
    if (q.type === "dropdown") return (q.blanks || []).map(b => b.answer).join(" / ");
    if (q.type === "statements") return (q.statements || []).map(s => s.answer).join(" / ");
    if (q.type === "drag_drop") return (q.slots || []).map(s => s.answer).join(" / ");
    return "(자기 채점)";
  }
  function openReport() {
    const q = currentQuestion();
    if (!q) { toast("문항을 연 뒤에 신고할 수 있습니다"); return; }
    const prior = reportFor(q.n);
    $("reportQ").textContent = `Q${q.n} · ${q.topicKo || q.topic} · ${TYPE_LABEL[q.type] || q.type}`;
    $("reportKind").value = prior?.kind || "translation";
    $("reportNote").value = prior?.note || "";
    const rec = state.records[q.n];
    $("reportCtx").textContent = `함께 전송: 내가 고른 답 ${myAnswerText(q) || "(미선택)"} · 앱 정답 ${appAnswerText(q)} · 채점 ${rec?.result || "미채점"}`;
    const msg = $("reportMsg"); msg.textContent = ""; msg.className = "report-msg";
    $("reportModal").classList.remove("hidden");
    setTimeout(() => $("reportNote").focus(), 60);
  }
  async function sendReport() {
    const q = currentQuestion(); if (!q) return;
    const rec = state.records[q.n];
    const payload = {
      source: q.n, kind: $("reportKind").value,
      myAnswer: myAnswerText(q), graded: rec?.result || "none",
      appAnswer: appAnswerText(q), note: $("reportNote").value.trim(),
    };
    const btn = $("reportSend"), msg = $("reportMsg");
    btn.disabled = true; msg.textContent = "전송 중…"; msg.className = "report-msg";
    try {
      const r = await api(REPORT_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || r.status);
      msg.textContent = `신고했습니다. 누적 ${d.count}건.`;
      msg.className = "report-msg ok";
      await loadReports();
      setTimeout(() => $("reportModal").classList.add("hidden"), 900);
    } catch (e) {
      msg.textContent = `전송에 실패했습니다 (${String(e?.message || e)}). 잠시 후 다시 시도하세요.`;
      msg.className = "report-msg bad";
    } finally { btn.disabled = false; }
  }
  function showMyReports() {
    $("wnTitle").textContent = "내 문항 신고"; $("wnActions").classList.add("hidden");
    const KIND = { "wrong-answer": "정답 오류", "bad-explanation": "해설 문제", translation: "번역·오탈자", image: "이미지", other: "기타" };
    $("wnStats").innerHTML = `<div class="wn-kpi"><strong>${myReports.length}</strong><span>신고</span></div>`;
    $("wnList").innerHTML = myReports.length
      ? myReports.slice().reverse().map(r => `<button type="button" class="wn-item" data-n="${r.source}"><span class="wn-no">Q${r.source}</span><span class="wn-body"><strong>${escapeHtml(KIND[r.kind] || r.kind)} · ${fmtDate(r.at)}</strong><em>${escapeHtml(r.note || "(메모 없음)")}</em></span></button>`).join("")
      : `<p class="wn-empty">아직 신고한 문항이 없습니다.</p>`;
    $("wnList").querySelectorAll(".wn-item").forEach(b => b.addEventListener("click", () => startSession({ queue: [Number(b.dataset.n)], order: "sequential", filter: "review", title: "신고 문항" })));
    showOnly("wrongNote");
  }
  async function clearReports() {
    if (!myReports.length) { toast("지울 신고가 없습니다"); return; }
    if (!confirm(`신고 ${myReports.length}건을 모두 지웁니다. 되돌릴 수 없습니다.`)) return;
    try { await api(REPORT_API, { method: "DELETE" }); await loadReports(); toast("신고를 모두 지웠습니다"); showMyReports(); }
    catch { toast("삭제에 실패했습니다"); }
  }

  async function logout() {
    await syncFlush();
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    location.replace("/");
  }
  // 쓰기용: 없으면 만든다
  function recordFor(n) {
    if (!state.records[n]) state.records[n] = { result: null, attempts: 0, wrongCount: 0, bookmarked: false, selected: null, updatedAt: null };
    return state.records[n];
  }
  // 읽기용: 없으면 빈 객체를 돌려줄 뿐 저장하지 않는다 (문항을 보기만 해도 기록이 생기면 안 된다)
  function peekRecord(n) { return state.records[n] || {}; }
  // 아무 내용도 없는 기록 (보기만 한 문항) 은 서버에 올리지 않는다
  function isEmptyRecord(r) { return !r || (!r.result && !r.bookmarked && !r.attempts); }

  // ---------- 유틸 ----------
  function escapeHtml(v = "") { return String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
  function sameSet(a, b) { if (a.length !== b.length) return false; const s = new Set(a); return b.every(x => s.has(x)); }
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._h); toast._h = setTimeout(() => t.classList.remove("show"), 2200); }
  function nowIso() { return new Date().toISOString(); }
  function fmtDate(iso) { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }

  // 간단 마크다운 → HTML (굵게/기울임/코드/제목/목록/코드블록/이미지칩)
  function inline(s) {
    s = escapeHtml(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
    // [보이는 글자](주소) — 해설의 Learn 링크가 그대로 노출되고 있었다
    s = s.replace(/\[([^\]\n]+)\]\((https?:(?:&amp;|[^\s)])+)\)/g, (m, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
    s = s.replace(/\[\[IMG(\d+)\]\]/g, (m, i) => `<button type="button" class="img-chip" data-img="${i}">🖼 이미지 ${i}</button>`);
    return s;
  }
  function figureHtml(i, opts) {
    const src = opts.images[i - 1]; const n = opts.images.length;
    if (!src || (opts.missing || []).includes(i)) return `<div class="img-missing">🖼 이미지 ${i} — 원본 사이트에서 이미지가 유실된 문항입니다</div>`;
    return `<figure class="q-figure inline"><img src="${escapeHtml(src)}" alt="이미지 ${i}" data-img="${i}" loading="lazy"><figcaption>이미지 ${i}${n > 1 ? ` / ${n}` : ""} · 클릭하면 크게 봅니다</figcaption></figure>`;
  }
  // opts.images 를 주면 [[IMGn]] 줄이 그 자리의 <figure> 가 되고, 없으면 클릭용 칩으로 남긴다 (한국어 번역 패널)
  // 마크다운 → HTML. 지원: 제목(#~####), 목록(-,*,1. · 한 단계 중첩), 인용(>), 표(GFM),
  // 코드블록(```), 수평선(---), 그리고 inline() 이 처리하는 강조·코드·링크·이미지 칩.
  function mdToHtml(text, opts = {}) {
    const lines = text.replace(/\r/g, "").replace(/([^\n])[ \t]*(\[\[IMG\d+\]\])/g, "$1\n$2").replace(/(\[\[IMG\d+\]\])[ \t]*([^\n])/g, "$1\n$2").split("\n");
    const out = []; let para = []; let list = null; let quote = null; let code = null;
    const flushPara = () => { if (para.length) { const t = para.join(" ").trim(); if (t) out.push(/^\*\(참고:.*\)\*$/.test(t) ? `<span class="scenario-note">${inline(t.slice(1, -1))}</span>` : `<p>${inline(t)}</p>`); para = []; } };
    const flushList = () => {
      if (!list) return;
      const sub = it => it.sub.length ? `<${it.subOrdered ? "ol" : "ul"}>${it.sub.map(t => `<li>${inline(t)}</li>`).join("")}</${it.subOrdered ? "ol" : "ul"}>` : "";
      const tag = list.ordered ? "ol" : "ul";
      const start = list.ordered && list.start > 1 ? ` start="${list.start}"` : "";
      out.push(`<${tag}${start}>${list.items.map(it => `<li>${inline(it.text)}${sub(it)}</li>`).join("")}</${tag}>`);
      list = null;
    };
    const flushQuote = () => { if (quote) { out.push(`<blockquote>${quote.map(t => `<p>${inline(t)}</p>`).join("")}</blockquote>`); quote = null; } };
    const flushAll = () => { flushPara(); flushList(); flushQuote(); };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/\s+$/, "");
      if (code !== null) { if (/^```/.test(line)) { out.push(`<pre>${escapeHtml(code.join("\n"))}</pre>`); code = null; } else code.push(line); continue; }
      if (/^```/.test(line)) { flushAll(); code = []; continue; }
      if (!line.trim()) { flushAll(); continue; }
      let m;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flushAll(); const lv = Math.min(4, m[1].length + 1); out.push(`<h${lv}>${inline(m[2])}</h${lv}>`); continue; }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { flushAll(); out.push("<hr>"); continue; }
      if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); if (!quote) quote = []; quote.push(m[1]); continue; }
      if (quote) flushQuote();
      // 목록: 들여쓰기가 있으면 바로 위 항목의 하위 목록으로 붙인다
      if ((m = /^(\s*)(?:([-*+])|(\d{1,3})[.)])\s+(.*)$/.exec(line))) {
        flushPara();
        const indent = m[1].length, ordered = !!m[3], body = m[4];
        if (list && indent >= 2 && list.items.length) {
          const last = list.items[list.items.length - 1];
          if (!last.sub.length) last.subOrdered = ordered;
          last.sub.push(body);
        } else {
          if (list && list.ordered !== ordered) flushList();
          if (!list) list = { ordered, start: ordered ? Number(m[3]) : 1, items: [] };
          list.items.push({ text: body, sub: [], subOrdered: false });
        }
        continue;
      }
      if (list) flushList();
      if ((m = /^\[\[IMG(\d+)\]\]$/.exec(line.trim()))) { flushAll(); out.push(opts.images ? figureHtml(Number(m[1]), opts) : `<p>${inline(line.trim())}</p>`); continue; }
      // 표(GFM): 머리글 줄 다음에 |---|---| 구분 줄이 오면 표로 그린다
      if (/^\|.*\|$/.test(line.trim()) && /^\|[\s:|-]+\|$/.test((lines[i + 1] || "").trim())) {
        flushAll();
        const cells = t => t.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
        const head = cells(line);
        const align = cells(lines[i + 1]).map(c => /^:-+:$/.test(c) ? "center" : /^-+:$/.test(c) ? "right" : "");
        const body = [];
        let j = i + 2;
        while (j < lines.length && /^\|.*\|$/.test(lines[j].trim())) { body.push(cells(lines[j])); j++; }
        i = j - 1;
        const cell = (c, k, tag) => `<${tag}${align[k] ? ` style="text-align:${align[k]}"` : ""}>${inline(c)}</${tag}>`;
        out.push(`<div class="md-table-wrap"><table class="md-table"><thead><tr>${head.map((c, k) => cell(c, k, "th")).join("")}</tr></thead>`
          + `<tbody>${body.map(r => `<tr>${r.map((c, k) => cell(c, k, "td")).join("")}</tr>`).join("")}</tbody></table></div>`);
        continue;
      }
      para.push(line.trim());
    }
    flushAll();
    if (code) out.push(`<pre>${escapeHtml(code.join("\n"))}</pre>`);
    return out.join("");
  }

  // ---------- 통계 ----------
  function updateStats() {
    const recs = Object.values(state.records);
    const answered = recs.filter(r => r.result).length;
    const correct = recs.filter(r => r.result === "correct").length;
    const wrong = recs.filter(r => r.result === "wrong").length;
    const bm = recs.filter(r => r.bookmarked).length;
    $("statAnswered").textContent = answered; $("statCorrect").textContent = correct; $("statWrong").textContent = wrong; $("statBookmarked").textContent = bm;
    const pct = Math.round(answered / QUESTIONS.length * 100);
    $("progressPercent").textContent = pct + "%";
    $("progressRing").style.setProperty("--progress", (pct * 3.6) + "deg");
  }

  // ---------- 세션 ----------
  function candidatesFor(filter) {
    return QUESTIONS.filter(q => {
      const r = state.records[q.n];
      if (filter === "all") return true;
      if (filter === "unanswered") return !r || !r.result;
      if (filter === "wrong") return r && r.result === "wrong";
      if (filter === "bookmarked") return r && r.bookmarked;
      if (filter.startsWith("type:")) return q.type === filter.slice(5);
      if (filter.startsWith("topic:")) return q.topic === filter.slice(6);
      return true;
    }).map(q => q.n);
  }
  // "Solution: … Does this achieve the goal?" 같은 시나리오 시리즈 — 실제 시험처럼 연달아 나와야 한다
  const SERIES = Array.isArray(DATA.series) ? DATA.series : [];
  const SERIES_OF = new Map();
  SERIES.forEach(s => s.members.forEach(n => SERIES_OF.set(Number(n), s)));
  function groupOf(n) {
    const q = BY_N.get(n);
    if (q && q.set) { const set = SET_BY_ID.get(q.set.id); if (set) return set.members; }
    const ser = SERIES_OF.get(Number(n));
    return ser ? ser.members : null;
  }
  // 후보 n 목록 → [n] 또는 [묶음 멤버들...] 단위 목록. 묶음(사례 연구·시리즈)은 첫 멤버 자리에 통째로 놓인다.
  function unitsOf(ns) {
    const inList = new Set(ns); const done = new Set(); const units = [];
    for (const n of ns) {
      if (done.has(n)) continue;
      const members = groupOf(n);
      const unit = members ? members.map(Number).filter(m => inList.has(m)) : [n];
      unit.forEach(m => done.add(m)); units.push(unit);
    }
    return units;
  }
  function startSession({ filter, order, mode = "practice", queue = null, title = "" } = {}) {
    filter = filter || $("questionFilter").value; order = order || $("questionOrder").value;
    let q = queue || candidatesFor(filter);
    if (!q.length) { toast("조건에 맞는 문항이 없습니다"); return; }
    q = (order === "random" ? shuffle(unitsOf(q)) : unitsOf(q)).flat();   // 세트(공통 지문) 문항은 랜덤이어도 붙어서 나온다
    state.session = { mode, queue: q, cursor: 0, filter, order, answers: {}, startedAt: nowIso(), title };
    saveState(); showQuiz(); renderQuestion();
    closeSidebar();
  }

  // 모의고사: 영역 비중 배분 + 미응답/오답 우선
  function examPool() {
    return QUESTIONS.filter(q => q.type !== "answer_reveal");
  }
  function includeLegacyNow() { const el = document.getElementById("examIncludeLegacy"); return el ? el.checked : false; }

  // ---------- 배점 ----------
  // 실제 시험처럼 "같은 지문 예/아니요(OX)" 한 세트는 문장 수만큼 배점된다. 그 밖에는 1문항 = 1점.
  function pointsOf(q) { return q && q.type === "statements" ? (q.statements || []).length : 1; }
  function pointsOfNs(ns) { return ns.reduce((a, n) => a + pointsOf(BY_N.get(n)), 0); }
  function earnedOf(q, g) { return q.type === "statements" ? g.parts.filter(p => p.ok).length : (g.correct ? 1 : 0); }

  // 출제 우선순위: 안 푼 문항 → 틀린 문항 → 맞힌 문항
  function unitPriority(unit) {
    return Math.min(...unit.map(n => { const r = state.records[n]; if (!r || !r.result) return 0; return r.result === "wrong" ? 1 : 2; }));
  }
  function orderUnits(units) { return [0, 1, 2].map(p => shuffle(units.filter(u => unitPriority(u) === p))).flat(); }
  const topicOfUnit = u => (BY_N.get(u[0]) || {}).topic;
  function topicTargets(total) {
    const w = DATA.topics.map(t => (t.weight[0] + t.weight[1]) / 2);
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    return w.map(x => total * x / sum);
  }

  // 모의고사: 총 배점 기준으로 영역 비중대로 뽑는다. 세트(사례 연구·OX)는 쪼개지 않는다.
  function allocateExam(totalPoints, includeLegacy) {
    const pool = examPool(includeLegacy);
    const units = unitsOf(pool.map(q => q.n));
    const targets = topicTargets(totalPoints);
    const picked = []; const used = new Set(); let got = 0;
    const take = (u) => { picked.push(u); u.forEach(n => used.add(n)); got += pointsOfNs(u); };
    DATA.topics.forEach((t, i) => {
      let tp = 0;
      for (const u of orderUnits(units.filter(u => topicOfUnit(u) === t.en))) {
        if (tp >= targets[i] || got >= totalPoints) break;
        const p = pointsOfNs(u);
        if (got + p > totalPoints + 2) continue;      // 세트가 커서 총점을 크게 넘기면 건너뛴다
        take(u); tp += p;
      }
    });
    for (const u of orderUnits(units.filter(u => !u.some(n => used.has(n))))) {   // 모자란 만큼 채우기
      if (got >= totalPoints) break;
      const p = pointsOfNs(u);
      if (got + p > totalPoints + 2) continue;
      take(u);
    }
    return shuffle(picked).flat();
  }

  // ---------- 실전 모의고사 ----------
  // 실제 시험 구성 그대로: 다지선다·짧은 HOTSPOT 40~45문항 → 같은 지문 OX 2세트 → 사례 연구 1세트
  const REAL_PLAN = { singleMin: 40, singleMax: 45, oxSets: 2, oxPick: 3, caseSets: 1, casePick: 4 };
  function buildRealExam(includeLegacy) {
    const pool = examPool(includeLegacy);
    const inPool = new Set(pool.map(q => q.n));
    const ALL_SETS = DATA.sets || [];
    // 3부 = 진짜 사례 연구. 세트에는 사례 연구가 아닌 것도 섞여 있어서 제목으로 갈라낸다.
    const isCaseSet = s => /사례 연구|Case study/i.test((s.titleKo || "") + " " + (s.titleEn || ""));
    const CASE_IDS = new Set(ALL_SETS.filter(isCaseSet).map(s => s.id));
    // 2부 = 같은 설정을 놓고 해결책만 바꿔 가며 묻는 예/아니요 시리즈(지문 공유). 실제 시험의 2부가 이것이다.
    // 한 문항 안에 문장이 여러 개인 statements 형(핫에어리어)은 여기가 아니라 1부에 둔다.
    const isYnQ = q => (q.choices || []).length === 2 && q.choices.every(c => {
      const t = ((c.en || "") + " " + (c.ko || "")).trim();
      return /^(yes|no)($| )/i.test(t) || /^(예|아니요)/.test(t);
    });
    const YN_IDS = new Set(ALL_SETS.filter(s => !CASE_IDS.has(s.id)
      && s.members.length > 1 && s.members.every(n => { const m = BY_N.get(n); return m && isYnQ(m); })).map(s => s.id));
    const partOf = q => q.set ? (CASE_IDS.has(q.set.id) ? 3 : YN_IDS.has(q.set.id) ? 2 : 1) : 1;
    const single = unitsOf(pool.filter(q => partOf(q) === 1).map(q => q.n));   // 1부: 단답 + 핫에어리어 + 사례/시리즈 아닌 세트
    let ox = ALL_SETS.filter(s => YN_IDS.has(s.id)).map(s => s.members.filter(n => inPool.has(n))).filter(m => m.length);
    if (!ox.length) ox = pool.filter(q => !q.set && q.type === "statements").map(q => [q.n]);   // 시리즈가 없는 시험이면 종전대로
    let sets = ALL_SETS.filter(isCaseSet).map(s => s.members.filter(n => inPool.has(n))).filter(m => m.length);
    // 사례 연구가 아예 없는 시험(AZ-900 등)은 3부 없이 1부 -> 2부로 끝난다.
    // 예전에는 아무 세트나 3부로 써서 지문 공유 시리즈가 '사례 연구' 이름으로 나왔다.
    const big = sets.filter(m => m.length >= 3);
    const casePool = big.length ? big : sets;   // 1~2문항짜리 사례 연구가 3부로 뽑히면 너무 빈약하다
    const target = Math.min(single.length, REAL_PLAN.singleMin + Math.floor(Math.random() * (REAL_PLAN.singleMax - REAL_PLAN.singleMin + 1)));
    const targets = topicTargets(target);
    const partA = []; const usedA = new Set();
    DATA.topics.forEach((t, i) => {
      let c = 0;
      for (const u of orderUnits(single.filter(u => topicOfUnit(u) === t.en && !usedA.has(u[0])))) {
        if (c >= Math.round(targets[i]) || partA.flat().length >= target) break;
        partA.push(u); u.forEach(n => usedA.add(n)); c += u.length;
      }
    });
    for (const u of orderUnits(single.filter(u => !u.some(n => usedA.has(n))))) { if (partA.flat().length >= target) break; partA.push(u); u.forEach(n => usedA.add(n)); }
    // 지문 순서는 지키고 그 안에서만 무작위로 고른다(사례 연구는 앞 문항이 뒤 문항의 전제가 되기도 한다)
    const pickSome = (ns, k) => ns.length <= k ? ns
      : shuffle(ns.slice()).slice(0, k).sort((x, y) => ns.indexOf(x) - ns.indexOf(y));
    const partB = orderUnits(ox).slice(0, REAL_PLAN.oxSets).map(u => pickSome(u, REAL_PLAN.oxPick));
    const partC = shuffle(casePool).slice(0, REAL_PLAN.caseSets).map(m => pickSome(m, REAL_PLAN.casePick));
    const queue = [...shuffle(partA), ...partB, ...partC].flat();
    const plan = {
      single: partA.flat().length,
      ox: partB.length, oxCount: partB.flat().length, oxPoints: pointsOfNs(partB.flat()),
      cases: partC.length, caseCount: partC.flat().length, casePoints: pointsOfNs(partC.flat()),
    };
    return { queue, plan };
  }

  function startExamSession(real) {
    const includeLegacy = includeLegacyNow();
    let queue, plan = null;
    if (real) {
      const r = buildRealExam(includeLegacy); queue = r.queue; plan = r.plan;
    } else {
      const pool = examPool(includeLegacy);
      queue = allocateExam(Math.min(Number($("examSize").value), pointsOfNs(pool.map(q => q.n))), includeLegacy);
    }
    if (!queue.length) { toast("출제할 문항이 없습니다"); return; }
    const timed = $("examTimer").checked;
    const points = pointsOfNs(queue);
    startSession({ mode: "exam", queue, order: "sequential", filter: "exam", title: real ? "실전 모의고사" : "모의고사" });
    const s = state.session;
    s.timed = timed; s.includeLegacy = includeLegacy; s.real = !!real; s.plan = plan; s.points = points;
    if (timed) { s.endsAt = Date.now() + points * 120 * 1000; startExamTimer(); }
    saveState();
    renderQuestion();   // real/plan/points 를 세션에 채운 뒤 다시 그려야 1번 문항부터 파트가 표시된다
    const bits = [`단답 ${plan.single}문항`];
    if (plan.oxCount) bits.push(`지문 공유 예/아니요 ${plan.oxCount}문항 ${plan.oxPoints}점`);
    if (plan.caseCount) bits.push(`사례 연구 ${plan.caseCount}문항 ${plan.casePoints}점`);
    toast(real
      ? `실전 모의고사 · ${queue.length}문항 ${points}점 (${bits.join(" · ")})`
      : `모의고사 · ${queue.length}문항 ${points}점`);
  }
  function startExamTimer() {
    stopExamTimer();
    $("examTimerDisplay").classList.remove("hidden");
    tickExamTimer(); examTimerHandle = setInterval(tickExamTimer, 1000);
  }
  function tickExamTimer() {
    const s = state.session; if (!s || !s.endsAt) return stopExamTimer();
    const left = Math.max(0, Math.floor((s.endsAt - Date.now()) / 1000));
    const el = $("examTimerDisplay");
    el.textContent = `⏱ ${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    el.classList.toggle("urgent", left < 300);
    if (left <= 0) { toast("시간 종료 — 채점합니다"); finishSession(); }
  }
  function stopExamTimer() { clearInterval(examTimerHandle); examTimerHandle = null; $("examTimerDisplay").classList.add("hidden"); }

  // 실전 모의고사에서 지금 몇 부인지 (1부 단답 → 2부 예/아니요 → 3부 사례 연구)
  function realPartLabel(s) {
    if (!s || !s.real || !s.plan) return "";
    const a = s.plan.single, b = a + (s.plan.oxCount || s.plan.ox);
    if (s.cursor < a) return ` · 1부 단답 ${s.cursor + 1}/${a}`;
    if (s.cursor < b) return ` · 2부 예/아니요 ${s.cursor - a + 1}/${s.plan.oxCount || s.plan.ox}`;
    return ` · 3부 사례 연구 ${s.cursor - b + 1}/${s.queue.length - b}`;
  }
  function currentQuestion() { const s = state.session; return s ? BY_N.get(s.queue[s.cursor]) : null; }

  // ---------- 화면 전환 ----------
  function showOnly(id) {
    ["welcome", "quiz", "examResult", "wrongNote"].forEach(x => $(x).classList.toggle("hidden", x !== id));
    window.scrollTo({ top: 0 });
  }
  function showWelcome() {
    $("wcTotal").textContent = QUESTIONS.length;
    $("wcKo").textContent = QUESTIONS.filter(q => !q.koMissing).length;
    $("wcMc").textContent = QUESTIONS.filter(q => q.type === "multiple_choice").length;
    $("wcHs").textContent = QUESTIONS.filter(q => q.type !== "multiple_choice").length;
    showOnly("welcome");
  }
  function showQuiz() { showOnly("quiz"); }

  // ---------- 문항 렌더 ----------
  function renderQuestion() {
    const q = currentQuestion(); const s = state.session;
    if (!q) return showWelcome();
    pending = {};
    const badge = $("kindBadge"); badge.textContent = TYPE_LABEL[q.type]; badge.className = "pill type-" + q.type;
    $("sourceNumber").textContent = `Q${q.n}`;
    if (q.set) $("sourceNumber").textContent += ` · ${setLabel(q)}`;
    $("topicBadge").textContent = s.mode === "exam" ? "" : q.topicKo;
    const lb = $("legacyBanner");
    if (q.koMissing) {
      lb.innerHTML = `<strong>번역 준비 중</strong> · 이 문항은 아직 한국어 번역 전이라 영어 원문으로 표시됩니다.`;
      lb.classList.remove("hidden");
    } else lb.classList.add("hidden");
    $("sessionPosition").textContent = `${s.cursor + 1} / ${s.queue.length}`;
    $("sessionMode").textContent = s.mode === "exam"
      ? `${s.real ? "실전 모의고사" : "모의고사"}${realPartLabel(s)}${s.points ? " · " + s.points + "점" : ""}${s.timed ? " · 시간제한" : ""}`
      : (s.title || "연습");
    $("sessionBar").style.width = ((s.cursor + 1) / s.queue.length * 100) + "%";
    const rec = peekRecord(q.n);
    $("bookmarkButton").textContent = rec.bookmarked ? "★ 북마크됨" : "☆ 북마크";
    $("bookmarkButton").classList.toggle("active", rec.bookmarked);

    // 1) 세트(공통 지문) 배너
    renderSetBanner(q, s);
    // 2) 본문은 영어 원문(실제 시험 표현). 이미지는 [[IMGn]] 자리에 그대로 삽입. 세트 문항은 공통 지문을 접이식 패널로 위에 두고 질문만 본문에.
    const imgOpts = { images: q.images, missing: q.missingImages };
    const inSet = !!q.caseEn;
    $("casePanel").innerHTML = inSet ? casePanelHtml(q, s, imgOpts) : "";
    $("questionText").innerHTML = mdToHtml(inSet ? q.askEn : q.stemEn, imgOpts);
    // 3) 한국어 번역은 참고용 패널 — 한 번 펼치면 다음 문항에서도 펼쳐진 채로 유지
    $("questionTextKo").innerHTML = mdToHtml((inSet ? q.askKo : q.stemKo) + (q.templateKo ? "\n\n" + q.templateKo : ""));   // 빈칸 문장(template)의 한국어도 참고 패널에 같이 보여 준다
    const kw = $("koWrap"); kw.classList.toggle("hidden", !!q.koMissing); kw.open = !!state.koOpen;
    // 3) 답 입력
    const answeredNow = s.mode !== "exam" && s.answeredNow && s.answeredNow[q.n] && rec.result;
    const prior = s.mode === "exam" ? (s.answers[q.n] || null) : (answeredNow ? { selected: rec.selected, graded: true } : null);
    renderControls(q, prior);
    // 4) 피드백/해설
    $("feedback").classList.add("hidden"); $("explanation").classList.add("hidden");
    if (answeredNow) { const g = grade(q, rec.selected); showFeedback(g, q); showExplanation(q, g); }
    renderReportBar(q);
    $("prevButton").disabled = s.cursor === 0;
    $("nextButton").textContent = s.cursor === s.queue.length - 1 ? (s.mode === "exam" ? "제출하고 채점 →" : "세션 종료 →") : "다음 →";
  }

  function renderSetBanner(q, s) {
    const el = $("setBanner");
    if (!q.set) { el.classList.add("hidden"); el.innerHTML = ""; return; }
    const set = SET_BY_ID.get(q.set.id) || { members: [] };
    const mark = n => { if (s.mode === "exam") return s.answers[n] ? " done" : ""; const r = state.records[n]; return r?.result === "correct" ? " done ok" : r?.result === "wrong" ? " done bad" : ""; };
    const chips = set.members.map(n => { const pos = s.queue.indexOf(n); const m = BY_N.get(n); return `<button type="button" class="set-chip${n === q.n ? " current" : ""}${pos < 0 ? " absent" : ""}${mark(n)}" data-pos="${pos}" title="${pos < 0 ? "이 세션에 없는 문항" : `Q${n} · ${setLabel(m)}`}" ${pos < 0 ? "disabled" : ""}>${m.set.idx}</button>`; }).join("");
    el.innerHTML = `<strong>${setLabel(q)}</strong><span>${escapeHtml(set.titleKo || "공통 지문")} · ${q.set.size}문항이 같은 지문을 공유합니다</span><span class="set-chips">${chips}</span>`;
    el.classList.remove("hidden");
    el.querySelectorAll(".set-chip[data-pos]").forEach(b => b.addEventListener("click", () => { const pos = Number(b.dataset.pos); if (pos >= 0 && pos !== s.cursor) { s.cursor = pos; saveState(); renderQuestion(); window.scrollTo({ top: 0 }); } }));
  }
  function casePanelHtml(q, s, imgOpts) {
    const set = SET_BY_ID.get(q.set.id) || {};
    const prev = s.cursor > 0 ? BY_N.get(s.queue[s.cursor - 1]) : null;
    const open = !(prev && prev.set && prev.set.id === q.set.id);   // 세트의 첫 문항에서만 펼치고, 이어지는 문항에서는 접어 둔다
    return `<details class="case-panel" ${open ? "open" : ""}><summary><span class="case-tag">CASE STUDY</span>${escapeHtml(set.titleEn || "Shared scenario")}<small>세트 ${q.set.no} · ${q.set.size}문항 공통 지문${open ? "" : " · 이미 읽었다면 접어 두고 아래 질문만 보세요"}</small></summary><div class="question-body case-body">${mdToHtml(q.caseEn, imgOpts)}</div><details class="original-text ko-text" ${state.koOpen ? "open" : ""}><summary>KO · 지문 한국어 번역 (참고용)</summary><div class="question-body">${mdToHtml(q.caseKo)}</div></details></details>`;
  }

  function renderControls(q, prior) {
    const box = $("answerControls");
    const sel = prior ? prior.selected : null;
    const locked = !!(prior && (prior.graded || state.session.mode === "exam" && sel));
    const g = locked && state.session.mode !== "exam" ? grade(q, sel) : null;
    let html = "";
    if (q.type === "multiple_choice") {
      const multi = q.answers.length > 1;
      pending.selected = sel ? sel.slice() : [];
      html += `<h3 class="answer-title">답 선택<small>${multi ? `정답 ${q.answers.length}개를 고르세요` : "하나를 고르세요"}</small></h3><div class="choice-row with-text">`;
      for (const c of q.choices) {
        const chosen = pending.selected.includes(c.label);
        let cls = "choice" + (chosen ? " selected" : "");
        if (g) { if (q.answers.includes(c.label)) cls += " correct-mark"; else if (chosen) cls += " wrong-mark"; }
        html += `<button type="button" class="${cls}" data-letter="${c.label}" ${locked ? "disabled" : ""}><span class="choice-letter">${c.label}.</span><span class="choice-text">${escapeHtml(c.en)}${c.ko !== c.en ? `<span class="choice-sub">${escapeHtml(c.ko)}</span>` : ""}</span></button>`;
      }
      html += `</div>`;
    } else if (q.type === "dropdown") {
      pending.selected = sel ? { ...sel } : {};
      html += `<h3 class="answer-title">답 선택<small>각 항목에서 하나씩 고르세요</small></h3>`;
      const selectHtml = b => {
        const chosen = pending.selected[b.id] || "";
        return `<select data-blank="${b.id}" ${locked ? "disabled" : ""}><option value="">— 선택 —</option>${b.options.map(o => `<option value="${escapeHtml(o.en)}" ${chosen === o.en ? "selected" : ""}>${escapeHtml(o.en)}${o.ko !== o.en ? ` (${escapeHtml(o.ko)})` : ""}</option>`).join("")}</select>`;
      };
      if (q.template) {
        let tpl = escapeHtml(q.template);
        for (const b of q.blanks) {
          const st = g ? (g.parts.find(p => p.id === b.id).ok ? "tpl-ok" : "tpl-bad") : "";
          tpl = tpl.replace(`{{${b.id}}}`, `<span class="${st}">${selectHtml(b)}</span>`);
        }
        html += `<div class="code-template">${tpl}</div>`;
      } else {
        html += `<div class="choice-boxes">`;
        for (const b of q.blanks) {
          const st = g ? (g.parts.find(p => p.id === b.id).ok ? " ok" : " bad") : "";
          html += `<div class="choice-box${st}"><strong>${escapeHtml(b.labelEn || b.labelKo)}</strong>${b.labelEn && b.labelKo !== b.labelEn ? `<span class="choice-en-hint">${escapeHtml(b.labelKo)}</span>` : ""}${selectHtml(b)}</div>`;
        }
        html += `</div>`;
      }
    } else if (q.type === "statements") {
      pending.selected = sel ? { ...sel } : {};
      html += `<h3 class="answer-title">각 문장이 참이면 예, 아니면 아니요</h3>`;
      q.statements.forEach((st, i) => {
        const chosen = pending.selected[i] || "";
        const cls = g ? (g.parts[i].ok ? " ok" : " bad") : "";
        html += `<div class="stmt-row${cls}"><div>${escapeHtml(st.en)}<span class="stmt-sub">${escapeHtml(st.ko)}</span></div><div>${q.columns.map(c => `<button type="button" class="${chosen === c ? "selected" : ""}" data-stmt="${i}" data-val="${c}" ${locked ? "disabled" : ""}>${escapeHtml(c)}</button>`).join("")}</div></div>`;
      });
    } else if (q.type === "drag_drop") {
      pending.selected = sel ? { ...sel } : {};
      html += `<h3 class="answer-title">각 항목에 맞는 구성을 배치<small>드래그 대신 목록에서 고릅니다 · 같은 항목을 여러 번 쓸 수 있습니다</small></h3>`;
      html += `<div class="dd-items">${q.items.map(it => `<span title="${escapeHtml(it.ko)}">${escapeHtml(it.en)}</span>`).join("")}</div><div class="choice-boxes">`;
      for (const sl of q.slots) {
        const chosen = pending.selected[sl.id] || "";
        const st = g ? (g.parts.find(p => p.id === sl.id).ok ? " ok" : " bad") : "";
        html += `<div class="choice-box${st}"><strong>${escapeHtml(sl.labelEn || sl.labelKo)}</strong>${sl.labelEn && sl.labelKo !== sl.labelEn ? `<span class="choice-en-hint">${escapeHtml(sl.labelKo)}</span>` : ""}<select data-slot="${sl.id}" ${locked ? "disabled" : ""}><option value="">— 선택 —</option>${q.items.map(it => `<option value="${escapeHtml(it.en)}" ${chosen === it.en ? "selected" : ""}>${escapeHtml(it.en)}${it.ko !== it.en ? ` (${escapeHtml(it.ko)})` : ""}</option>`).join("")}</select></div>`;
      }
      html += `</div>`;
    }
    else if (q.type === "answer_reveal") {
      pending.selected = sel ? { ...sel } : {};
      const revealed = !!(pending.selected.revealed || locked);
      html += `<h3 class="answer-title">자기 채점 문항<small>정답이 이미지·서술형이라 자동 채점이 안 됩니다. 먼저 답을 생각한 뒤 정답을 열고 스스로 채점하세요.</small></h3>`;
      if (!revealed) html += `<div class="submit-row"><small>답을 정했으면 정답을 확인합니다</small><button type="button" class="primary" id="revealAnswer">정답 보기</button></div>`;
      else {
        html += `<div class="reveal-box"><strong>정답</strong>${q.answerImages.map((src, i) => `<figure class="q-figure"><img src="${src}" alt="정답 이미지 ${i + 1}" data-answer-img="${i}"><figcaption>정답 이미지 ${i + 1} · 클릭하면 크게 봅니다</figcaption></figure>`).join("")}${q.answerTextEn ? `<div class="explain-body">${mdToHtml(q.answerTextEn)}</div>` : ""}${q.answerTextKo && q.answerTextKo !== q.answerTextEn ? `<details class="explain-en"><summary>KO · 한국어 번역 (참고용)</summary><div class="explain-body">${mdToHtml(q.answerTextKo)}</div></details>` : ""}</div>`;
        if (!locked) html += `<div class="self-grade"><button type="button" class="correct-button" data-self="correct">✅ 맞았어요</button><button type="button" class="wrong-button" data-self="wrong">❌ 틀렸어요</button></div>`;
        else html += `<div class="self-instruction">자기 채점 결과: ${sel?.self === "correct" ? "정답 처리" : "오답 처리"}</div>`;
      }
    }
    if (!locked && q.type !== "answer_reveal") html += `<div class="submit-row"><small>${state.session.mode === "exam" ? "제출하면 다음 문항으로 넘어갑니다 (나중에 다시 돌아와 바꿀 수 있음)" : "제출하면 바로 채점하고 해설을 보여줍니다"}</small><button type="button" class="primary" id="submitAnswer">제출</button></div>`;
    else if (state.session.mode === "exam") html += `<div class="submit-row"><small>제출된 답입니다. 바꾸려면 아래에서 다시 선택하세요.</small><button type="button" id="changeAnswer">답 바꾸기</button></div>`;
    else html += `<div class="submit-row"><small>이미 푼 문항입니다. 다시 풀면 이 문항의 기록이 새 결과로 바뀝니다.</small><button type="button" id="retryAnswer">다시 풀기</button></div>`;
    box.innerHTML = html;

    box.querySelectorAll(".choice[data-letter]").forEach(b => b.addEventListener("click", () => toggleChoice(q, b.dataset.letter)));
    box.querySelectorAll("select[data-blank]").forEach(s => s.addEventListener("change", () => { pending.selected[s.dataset.blank] = s.value; }));
    box.querySelectorAll("select[data-slot]").forEach(s => s.addEventListener("change", () => { pending.selected[s.dataset.slot] = s.value; }));
    box.querySelectorAll("button[data-stmt]").forEach(b => b.addEventListener("click", () => {
      pending.selected[b.dataset.stmt] = b.dataset.val;
      b.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("selected", x === b));
    }));
    const sb = $("submitAnswer"); if (sb) sb.addEventListener("click", submitAnswer);
    const rv = $("revealAnswer"); if (rv) rv.addEventListener("click", () => { pending.selected.revealed = true; renderControls(q, { selected: pending.selected }); });
    box.querySelectorAll("button[data-self]").forEach(b => b.addEventListener("click", () => { pending.selected = { revealed: true, self: b.dataset.self }; submitAnswer(); }));
    const cb = $("changeAnswer"); if (cb) cb.addEventListener("click", () => { delete state.session.answers[q.n]; saveState(); renderControls(q, null); });
    const rt = $("retryAnswer"); if (rt) rt.addEventListener("click", () => { $("feedback").classList.add("hidden"); $("explanation").classList.add("hidden"); renderControls(q, null); });
  }

  function toggleChoice(q, letter) {
    const multi = q.answers.length > 1;
    if (multi) {
      const i = pending.selected.indexOf(letter);
      if (i >= 0) pending.selected.splice(i, 1); else { if (pending.selected.length >= q.answers.length) pending.selected.shift(); pending.selected.push(letter); }
    } else pending.selected = [letter];
    $("answerControls").querySelectorAll(".choice[data-letter]").forEach(b => b.classList.toggle("selected", pending.selected.includes(b.dataset.letter)));
  }

  // ---------- 채점 ----------
  function grade(q, sel) {
    if (q.type === "multiple_choice") {
      const chosen = Array.isArray(sel) ? sel : [];
      return { correct: sameSet(chosen, q.answers), parts: q.answers.map(a => ({ label: a, ok: chosen.includes(a) })), chosen };
    }
    if (q.type === "dropdown") {
      const parts = q.blanks.map(b => ({ id: b.id, label: b.labelEn || b.labelKo, labelKo: b.labelKo, chosen: sel?.[b.id] || "", answer: b.answer, answerKo: (b.options.find(o => o.en === b.answer) || {}).ko, ok: (sel?.[b.id] || "") === b.answer }));
      return { correct: parts.every(p => p.ok), parts };
    }
    if (q.type === "statements") {
      const parts = q.statements.map((st, i) => ({ id: i, label: st.en, labelKo: st.ko, chosen: sel?.[i] || "", answer: st.answer, answerKo: st.answer === "Yes" ? "예" : st.answer === "No" ? "아니요" : st.answer, ok: (sel?.[i] || "") === st.answer }));
      return { correct: parts.every(p => p.ok), parts };
    }
    if (q.type === "answer_reveal") {
      const ok = sel?.self === "correct";
      return { correct: ok, parts: [{ id: "self", label: "자기 채점", chosen: sel?.self || "", answer: "correct", answerKo: "직접 채점", ok }] };
    }
    if (q.type === "drag_drop") {
      const parts = q.slots.map(sl => ({ id: sl.id, label: sl.labelEn || sl.labelKo, labelKo: sl.labelKo, chosen: sel?.[sl.id] || "", answer: sl.answer, answerKo: (q.items.find(i => i.en === sl.answer) || {}).ko, ok: (sel?.[sl.id] || "") === sl.answer }));
      return { correct: parts.every(p => p.ok), parts };
    }
    return { correct: false, parts: [] };
  }
  function isComplete(q, sel) {
    if (q.type === "multiple_choice") return Array.isArray(sel) && sel.length === q.answers.length;
    if (q.type === "dropdown") return q.blanks.every(b => sel?.[b.id]);
    if (q.type === "statements") return q.statements.every((s, i) => sel?.[i]);
    if (q.type === "drag_drop") return q.slots.every(s => sel?.[s.id]);
    if (q.type === "answer_reveal") return !!sel?.self;
    return false;
  }

  function submitAnswer() {
    const q = currentQuestion(); const s = state.session; if (!q) return;
    const sel = pending.selected;
    if (!isComplete(q, sel)) { toast(q.type === "multiple_choice" && q.answers.length > 1 ? `정답 ${q.answers.length}개를 모두 고르세요` : "모든 항목을 선택하세요"); return; }
    if (s.mode === "exam") {
      s.answers[q.n] = { selected: sel, at: nowIso() }; saveState();
      if (s.cursor < s.queue.length - 1) move(1); else finishSession();
      return;
    }
    const g = grade(q, sel);
    if (s) { s.answeredNow = s.answeredNow || {}; s.answeredNow[q.n] = true; }
    updateRecord(q, g, sel);
    renderControls(q, { selected: sel, graded: true });
    showFeedback(g, q); showExplanation(q, g);
    $("feedback").scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function updateRecord(q, g, sel) {
    const r = recordFor(q.n);
    r.attempts += 1; r.result = g.correct ? "correct" : "wrong"; if (!g.correct) r.wrongCount += 1;
    r.selected = sel; r.updatedAt = nowIso();
    saveState(); updateStats();
  }

  function showFeedback(g, q) {
    const fb = $("feedback");
    const okParts = g.parts.filter(p => p.ok).length;
    let body = g.correct ? `<strong>정답입니다 ✅</strong>` : `<strong>오답입니다 ❌</strong>`;
    if (q.type === "answer_reveal") body += `<div>자기 채점 결과입니다</div>`;
    else if (q.type !== "multiple_choice") body += `<div>부분 점수: ${okParts} / ${g.parts.length}</div>`;
    else if (q.answers.length > 1) body += `<div>정답 ${q.answers.length}개 중 ${okParts}개 일치</div>`;
    const r = state.records[q.n]; if (r && r.attempts > 1) body += `<div style="opacity:.75;font-size:12px;margin-top:4px">이 문항 ${r.attempts}회 풀이 · 오답 ${r.wrongCount}회</div>`;
    fb.className = "feedback " + (g.correct ? "correct" : "wrong"); fb.innerHTML = body; fb.classList.remove("hidden");
  }

  function answerSummaryHtml(q, g) {
    if (q.type === "answer_reveal") return `<strong>정답</strong><div class="explain-body">${mdToHtml(q.answerTextEn || q.answerTextKo || "(위 정답 이미지 참조)")}</div>`;
    if (q.type === "multiple_choice") {
      return `<strong>정답: ${q.answers.join(", ")}</strong><ul>${q.answers.map(a => { const c = q.choices.find(x => x.label === a); return `<li><b>${a}.</b> ${escapeHtml(c.en)}${c.ko !== c.en ? ` <span style="opacity:.7">(${escapeHtml(c.ko)})</span>` : ""}</li>`; }).join("")}</ul>`;
    }
    return `<strong>정답</strong><ul>${g.parts.map(p => `<li>${p.ok ? "✅" : "❌"} <b>${escapeHtml(p.label)}</b> ${escapeHtml(p.answer)}${p.answerKo && p.answerKo !== p.answer ? ` <span style="opacity:.7">(${escapeHtml(p.answerKo)})</span>` : ""}${!p.ok && p.chosen ? ` <span style="color:#c0392b">· 내 답: ${escapeHtml(labelOf(q, p))}</span>` : ""}</li>`).join("")}</ul>`;
  }
  function labelOf(q, p) {   // 내가 고른 답 — 영어 + (한국어)
    let ko = "";
    if (q.type === "dropdown") { const b = q.blanks.find(x => x.id === p.id); const o = b.options.find(x => x.en === p.chosen); ko = o ? o.ko : ""; }
    else if (q.type === "drag_drop") { const o = q.items.find(x => x.en === p.chosen); ko = o ? o.ko : ""; }
    else if (q.type === "statements") ko = p.chosen === "Yes" ? "예" : p.chosen === "No" ? "아니요" : "";
    return ko && ko !== p.chosen ? `${p.chosen} (${ko})` : p.chosen;
  }
  function showExplanation(q, g) {
    const ex = $("explanation");
    let html = `<h3>정답 및 해설</h3><div class="answer-summary">${answerSummaryHtml(q, g)}</div>`;
    if (q.koMissing) html += `<div class="explanation-section"><h4>해설 (영어 원문 · 번역 준비 중)</h4><div class="explain-body">${mdToHtml(q.explanationEn)}</div></div>`;
    else {
      html += `<div class="explanation-section"><h4>해설 (한국어)</h4><div class="explain-body">${mdToHtml(q.explanationKo)}</div></div>`;
      html += `<details class="explain-en"><summary>EN · 영어 원문 해설 보기</summary><div class="explain-body">${mdToHtml(q.explanationEn)}</div></details>`;
    }
    if (q.learnMore.length) html += `<div class="reference-links"><strong>Learn more:</strong>${q.learnMore.map(l => `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.title)}</a>`).join("")}</div>`;
    ex.innerHTML = html; ex.classList.remove("hidden");
  }

  // ---------- 이동 ----------
  function move(delta) {
    const s = state.session; if (!s) return;
    const next = s.cursor + delta;
    if (next < 0) return;
    if (next >= s.queue.length) { finishSession(); return; }
    s.cursor = next; saveState(); renderQuestion(); window.scrollTo({ top: 0 });
  }
  function finishSession() {
    const s = state.session; if (!s) return showWelcome();
    stopExamTimer();
    const results = s.queue.map(n => {
      const q = BY_N.get(n);
      if (s.mode === "exam") { const a = s.answers[n]; const g = a ? grade(q, a.selected) : { correct: false, parts: [] }; return { n, q, correct: g.correct, answered: !!a, sel: a ? a.selected : null, max: pointsOf(q), got: a ? earnedOf(q, g) : 0 }; }
      const r = state.records[n]; const ok = r?.result === "correct"; return { n, q, correct: ok, answered: !!r?.result, sel: r?.selected, max: pointsOf(q), got: ok ? pointsOf(q) : 0 };
    });
    if (s.mode === "exam") {
      // 기록 반영
      for (const r of results) if (r.answered) updateRecord(r.q, { correct: r.correct }, r.sel); else { const rec = recordFor(r.n); rec.attempts += 1; rec.result = "wrong"; rec.wrongCount += 1; rec.updatedAt = nowIso(); }
      const run = { id: nowIso(), at: nowIso(), total: results.length, correct: results.filter(r => r.correct).length, points: results.reduce((a, r) => a + r.got, 0), maxPoints: results.reduce((a, r) => a + r.max, 0), real: !!s.real, plan: s.plan || null, timed: !!s.timed, wrong: results.filter(r => !r.correct).map(r => r.n), topics: {} };
      for (const t of DATA.topics) { const rs = results.filter(r => r.q.topic === t.en); if (rs.length) run.topics[t.en] = { total: rs.length, correct: rs.filter(r => r.correct).length }; }
      state.examRuns.push(run); state.examRuns = state.examRuns.slice(-30);
      saveState(); updateStats();
      renderResult({ mode: "exam", results, run });
    } else {
      renderResult({ mode: "practice", results });
    }
    state.session = null; saveState();
  }
  function renderResult({ mode, results, run }) {
    const answered = results.filter(r => r.answered);
    const correct = results.filter(r => r.correct).length;
    const total = mode === "exam" ? results.length : answered.length;
    const scored = mode === "exam" ? results : answered;
    const gotPts = scored.reduce((a, r) => a + (r.got || 0), 0);
    const maxPts = scored.reduce((a, r) => a + (r.max || 0), 0);
    $("resultEyebrow").textContent = mode === "exam" ? "EXAM COMPLETE" : "SESSION COMPLETE";
    $("resultTitle").textContent = mode === "exam" ? "모의고사 결과" : "세션 결과";
    $("examScore").textContent = `${gotPts} / ${maxPts}`;
    const pct = maxPts ? Math.round(gotPts / maxPts * 100) : 0;
    $("examPercent").textContent = pct + "%";
    $("examSummary").textContent = mode === "exam" ? `${maxPts}점 만점에 ${gotPts}점 (${pct}%) · ${results.length}문항 중 ${correct}문항 완전 정답${run && run.plan ? ` · 실전 구성(단답 ${run.plan.single}문항${run.plan.oxCount ? ` · 예/아니요 시리즈 ${run.plan.oxCount}문항` : ""}${run.plan.caseCount ? ` · 사례 연구 ${run.plan.caseCount}문항` : ""})` : ""}. 실제 시험 합격선은 1000점 만점에 700점(약 70%)입니다.` : `이번 세션에서 ${answered.length}문항을 풀어 ${correct}문항을 맞혔습니다.`;
    const grid = $("resultChapters"); grid.innerHTML = "";
    for (const t of DATA.topics) {
      const rs = results.filter(r => r.q.topic === t.en && (mode === "exam" || r.answered)); if (!rs.length) continue;
      const c = rs.filter(r => r.correct).length; const p = Math.round(c / rs.length * 100);
      grid.insertAdjacentHTML("beforeend", `<div class="result-ch${p < 70 ? " low" : ""}"><b>${escapeHtml(t.ko)}</b><div class="rc-bar"><i style="width:${p}%"></i></div><div class="rc-num">${c} / ${rs.length} · ${p}%</div></div>`);
    }
    const wrong = results.filter(r => (mode === "exam" || r.answered) && !r.correct);
    $("resultWrong").innerHTML = wrong.length ? `<h3>틀린 문항 ${wrong.length}개</h3><div class="rw-list">${wrong.map(r => `<button type="button" class="rw-item" data-n="${r.n}"><span class="rw-no">Q${r.n}</span><span class="rw-txt">${escapeHtml(firstLine(r.q))}</span><span class="rw-topic">${escapeHtml(r.q.topicKo)}</span></button>`).join("")}</div>` : `<p class="rw-empty">틀린 문항이 없습니다. 🎉</p>`;
    $("resultWrong").querySelectorAll(".rw-item").forEach(b => b.addEventListener("click", () => startSession({ queue: [Number(b.dataset.n)], order: "sequential", filter: "review", title: "복습" })));
    $("reviewExamWrong").onclick = () => wrong.length ? startSession({ queue: wrong.map(r => r.n), order: "sequential", filter: "review", title: "세션 오답 복습" }) : toast("틀린 문항이 없습니다");
    showOnly("examResult");
  }
  function firstLine(q) {   // 목록용 한 줄 요약 — 영어 질문 문장 우선, 세트 문항은 세트 표시
    const md = q.askEn || q.stemEn || "";
    const lines = md.replace(/\[\[IMG\d+\]\]/g, "").replace(/[#*`]/g, "").split("\n").map(s => s.trim()).filter(s => s && !/^(HOTSPOT|DRAG DROP)\s*[-–]?$/.test(s) && !/^NOTE:/i.test(s));
    const ask = lines.slice().reverse().find(s => /[?？]$/.test(s));
    const need = lines.slice().reverse().find(s => /^You need/i.test(s));
    return (q.set ? `[${setLabel(q)}] ` : "") + (ask || need || lines.find(s => s.length > 12) || lines[0] || "");
  }

  // ---------- 오답노트 / 모의고사 기록 ----------
  function wrongList(minWrong = 1) { return QUESTIONS.filter(q => { const r = state.records[q.n]; return r && r.result === "wrong" && r.wrongCount >= minWrong; }); }
  function openWrongNote() {
    const list = wrongList(1); const rep = wrongList(2);
    $("wnTitle").textContent = "오답노트"; $("wnActions").classList.remove("hidden");
    $("wnStats").innerHTML = `<div class="wn-kpi"><strong>${list.length}</strong><span>현재 오답</span></div><div class="wn-kpi"><strong>${rep.length}</strong><span>2회 이상 오답</span></div><div class="wn-kpi"><strong>${Object.values(state.records).filter(r => r.bookmarked).length}</strong><span>북마크</span></div>`;
    $("wnList").innerHTML = list.length ? list.map(q => `<button type="button" class="wn-item" data-n="${q.n}"><span class="wn-no">Q${q.n}</span><span class="wn-body"><strong>${escapeHtml(q.topicKo)} · ${TYPE_LABEL[q.type]}</strong><em>${escapeHtml(firstLine(q))}</em></span><span class="wn-cnt">오답 ${state.records[q.n].wrongCount}회</span></button>`).join("") : `<p class="wn-empty">틀린 문제가 없습니다.</p>`;
    $("wnList").querySelectorAll(".wn-item").forEach(b => b.addEventListener("click", () => startSession({ queue: [Number(b.dataset.n)], order: "sequential", filter: "review", title: "오답 복습" })));
    showOnly("wrongNote");
  }
  function showExamRuns() {
    $("wnTitle").textContent = "모의고사 기록"; $("wnActions").classList.add("hidden");
    const runs = state.examRuns.slice().reverse();
    const runPct = r => Math.round((r.maxPoints ? r.points / r.maxPoints : r.correct / r.total) * 100);
    const runScore = r => r.maxPoints ? `${r.points} / ${r.maxPoints}점` : `${r.correct} / ${r.total}`;
    const best = runs.length ? Math.max(...runs.map(runPct)) : 0;
    $("wnStats").innerHTML = `<div class="wn-kpi"><strong>${runs.length}</strong><span>응시 횟수</span></div><div class="wn-kpi"><strong>${best}%</strong><span>최고 점수</span></div><div class="wn-kpi"><strong>${runs.length ? Math.round(runs.reduce((a, r) => a + runPct(r), 0) / runs.length) : 0}%</strong><span>평균</span></div>`;
    $("wnList").innerHTML = runs.length ? runs.map((r, i) => `<button type="button" class="wn-item" data-i="${runs.length - 1 - i}"><span class="wn-no">#${runs.length - i}</span><span class="wn-body"><strong>${runScore(r)} · ${runPct(r)}%${r.real ? " · 실전" : ""}${r.timed ? " · 시간제한" : ""}</strong><em>${fmtDate(r.at)} · 오답 ${r.wrong.length}개 → 클릭하면 오답 복습</em></span></button>`).join("") : `<p class="wn-empty">아직 모의고사 기록이 없습니다.</p>`;
    $("wnList").querySelectorAll(".wn-item").forEach(b => b.addEventListener("click", () => { const run = state.examRuns[Number(b.dataset.i)]; if (run.wrong.length) startSession({ queue: run.wrong, order: "sequential", filter: "review", title: "모의고사 오답 복습" }); else toast("이 회차는 오답이 없습니다"); }));
    showOnly("wrongNote");
  }

  // ---------- 북마크 / 이동 / 테마 / 라이트박스 ----------
  function toggleBookmark() { const q = currentQuestion(); if (!q) return; const r = recordFor(q.n); r.bookmarked = !r.bookmarked; r.updatedAt = nowIso(); saveState(); updateStats(); renderQuestion(); toast(r.bookmarked ? "북마크 추가" : "북마크 해제"); }
  function jumpTo() {
    const raw = $("questionJump").value.trim(); const n = Number(raw);
    if (!BY_N.has(n)) { toast("1~463 사이의 원본 문항 번호를 입력하세요 (은퇴 문항 번호는 비어 있음)"); return; }
    const s = state.session;
    if (s && s.mode !== "exam" && s.queue.includes(n)) { s.cursor = s.queue.indexOf(n); saveState(); showQuiz(); renderQuestion(); }
    else if (s && s.mode === "exam") toast("모의고사 중에는 이동할 수 없습니다");
    else { startSession({ queue: QUESTIONS.map(q => q.n), order: "sequential", filter: "all", title: "연습" }); state.session.cursor = state.session.queue.indexOf(n); saveState(); renderQuestion(); }
    $("questionJump").value = "";
  }
  function applyTheme() { document.body.classList.toggle("light", state.theme === "light"); }  // 기본은 다크(노선도와 동일)
  function openLightbox(src, cap) { $("lightboxImg").src = src; $("lightboxCap").textContent = cap || ""; $("lightbox").classList.remove("hidden"); }
  function closeSidebar() { $("sidebar").classList.remove("open"); $("sidebarOverlay").hidden = true; document.body.classList.remove("sidebar-open"); }

  // ---------- 내보내기/가져오기 ----------
  function exportProgress() {
    const blob = new Blob([JSON.stringify({ app: "sc300-cbt", exportedAt: nowIso(), records: state.records, examRuns: state.examRuns }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `sc300-progress-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  function importProgress(file) {
    const fr = new FileReader();
    fr.onload = () => { try { const d = JSON.parse(fr.result); if (d.app !== "sc300-cbt") throw 0; for (const [k, v] of Object.entries(d.records || {})) state.records[k] = { ...v, updatedAt: nowIso() }; if (Array.isArray(d.examRuns)) state.examRuns = [...state.examRuns, ...d.examRuns].slice(-30); saveState(); updateStats(); toast("기록을 가져왔습니다 · 서버에 저장 중"); } catch { toast("올바른 기록 파일이 아닙니다"); } };
    fr.readAsText(file);
  }

  // ---------- 초기화 ----------
  function bind() {
    $("startSession").addEventListener("click", () => startSession({ title: "연습" }));
    $("quickStart").addEventListener("click", () => startSession({ filter: "all", order: "sequential", title: "연습" }));
    $("examStart").addEventListener("click", () => startExamSession(false)); $("examStartSide").addEventListener("click", () => startExamSession(false));
    $("realExamStart").addEventListener("click", () => startExamSession(true)); $("realExamStartSide").addEventListener("click", () => startExamSession(true));
    $("openWrongNote").addEventListener("click", openWrongNote); $("openWrongNote2").addEventListener("click", openWrongNote); $("navWrongNote").addEventListener("click", () => { openWrongNote(); closeSidebar(); });
    $("openExamRuns").addEventListener("click", showExamRuns); $("openExamRuns2").addEventListener("click", showExamRuns); $("navExamRuns").addEventListener("click", () => { showExamRuns(); closeSidebar(); });
    $("navHome").addEventListener("click", () => { showWelcome(); closeSidebar(); }); $("backHome").addEventListener("click", showWelcome);
    $("wnClose").addEventListener("click", () => state.session ? (showQuiz(), renderQuestion()) : showWelcome());
    $("wnStartAll").addEventListener("click", () => { const l = wrongList(1); l.length ? startSession({ queue: l.map(q => q.n), order: "sequential", filter: "wrong", title: "오답 복습" }) : toast("틀린 문제가 없습니다"); });
    $("wnStartRepeat").addEventListener("click", () => { const l = wrongList(2); l.length ? startSession({ queue: l.map(q => q.n), order: "sequential", filter: "wrong", title: "반복 오답 복습" }) : toast("2회 이상 틀린 문제가 없습니다"); });
    $("prevButton").addEventListener("click", () => move(-1));
    $("nextButton").addEventListener("click", () => { const s = state.session; if (s && s.cursor === s.queue.length - 1) { if (s.mode === "exam" && !confirm("모의고사를 제출하고 채점할까요?")) return; finishSession(); } else move(1); });
    $("bookmarkButton").addEventListener("click", toggleBookmark);
    $("jumpButton").addEventListener("click", jumpTo); $("questionJump").addEventListener("keydown", e => { if (e.key === "Enter") jumpTo(); });
    $("themeToggle").addEventListener("click", () => { state.theme = state.theme === "light" ? "" : "light"; saveTheme(); applyTheme(); });
    $("exportProgress").addEventListener("click", exportProgress);
    $("importProgress").addEventListener("change", e => { if (e.target.files[0]) importProgress(e.target.files[0]); e.target.value = ""; });
    $("resetProgress").addEventListener("click", async () => {
      if (!confirm("SC-300 풀이 기록·북마크·모의고사 기록을 서버에서 삭제할까요? (다른 시험 기록은 그대로)")) return;
      try { await resetRemote(); updateStats(); showWelcome(); toast("기록을 초기화했습니다"); } catch { toast("초기화 실패 · 잠시 후 다시 시도"); }
    });
    const lo = $("logoutBtn"); if (lo) lo.addEventListener("click", logout);
    $("reportOpen").addEventListener("click", openReport);
    $("reportCancel").addEventListener("click", () => $("reportModal").classList.add("hidden"));
    $("reportSend").addEventListener("click", sendReport);
    $("reportModal").addEventListener("click", e => { if (e.target === $("reportModal")) $("reportModal").classList.add("hidden"); });
    $("openReports").addEventListener("click", showMyReports);
    $("clearReports").addEventListener("click", clearReports);
    const sn = $("syncNow"); if (sn) sn.addEventListener("click", async () => { await syncFlush(); await syncPull(); toast("서버와 동기화했습니다"); });
    $("menuToggle").addEventListener("click", () => { $("sidebar").classList.add("open"); $("sidebarOverlay").hidden = false; document.body.classList.add("sidebar-open"); });
    $("sidebarClose").addEventListener("click", closeSidebar); $("sidebarOverlay").addEventListener("click", closeSidebar);
    $("lightbox").addEventListener("click", () => $("lightbox").classList.add("hidden"));
    $("koWrap").addEventListener("toggle", () => { if (state.koOpen !== $("koWrap").open) { state.koOpen = $("koWrap").open; saveKo(); } });
    document.addEventListener("click", e => {
      const chip = e.target.closest(".img-chip"); const img = e.target.closest(".q-figure img");
      const q = currentQuestion(); if (!q) return;
      if (img && img.dataset.answerImg !== undefined) { openLightbox(img.src, `${qLabel(q)} · 정답 이미지`); return; }
      if (chip) { const i = Number(chip.dataset.img); if (q.images[i - 1]) openLightbox(q.images[i - 1], `Q${q.n} · 이미지 ${i}`); }
      else if (img) openLightbox(img.src, `Q${q.n} · 이미지 ${img.dataset.img}`);
    });
    document.addEventListener("keydown", e => {
      if ($("quiz").classList.contains("hidden")) return;
      const tag = (e.target.tagName || "").toLowerCase(); if (tag === "input" || tag === "select" || tag === "textarea") return;
      if (e.key === "Escape") { $("lightbox").classList.add("hidden"); return; }
      const q = currentQuestion(); if (!q) return;
      if (e.key === "Enter") { e.preventDefault(); const sb = $("submitAnswer"); if (sb) submitAnswer(); else $("nextButton").click(); }
      else if (e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowLeft") move(-1);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); toggleBookmark(); }
      else if (q.type === "multiple_choice" && $("submitAnswer")) {
        const k = e.key.toUpperCase(); let letter = null;
        if (/^[1-9]$/.test(k)) letter = (q.choices[Number(k) - 1] || {}).label; else if (/^[A-P]$/.test(k) && q.choices.some(c => c.label === k)) letter = k;
        if (letter) toggleChoice(q, letter);
      }
    });
  }
  function fillTopics() {
    const g = $("topicGroup");
    for (const t of DATA.topics) g.insertAdjacentHTML("beforeend", `<option value="topic:${escapeHtml(t.en)}">${escapeHtml(t.ko)} (${t.count})</option>`);
    $("datasetCount").textContent = QUESTIONS.length;
    $("koCount").textContent = QUESTIONS.filter(q => !q.koMissing).length;
    $("scrapedAt").textContent = DATA.scrapedAt || "";
    $("arCount").textContent = QUESTIONS.filter(q => q.type === "answer_reveal").length;
    $("mcCount").textContent = QUESTIONS.filter(q => q.type === "multiple_choice").length;
    $("hsCount").textContent = QUESTIONS.filter(q => q.type === "dropdown").length;
    $("ddCount").textContent = QUESTIONS.filter(q => q.type === "drag_drop").length;
    $("ynCount").textContent = QUESTIONS.filter(q => q.type === "statements").length;
  }

  loadTheme(); applyTheme(); fillTopics(); bind();
  (async () => {
    await loadMe();
    await syncPull();
    await loadReports();
    updateStats();
    if (state.session && state.session.queue && state.session.queue.length) {
      showQuiz(); renderQuestion();
      if (state.session.mode === "exam" && state.session.timed) startExamTimer();
    } else showWelcome();
  })();
  window.addEventListener("beforeunload", () => { if (syncTimer) { clearTimeout(syncTimer); syncFlush(); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && syncTimer) { clearTimeout(syncTimer); syncFlush(); } });
})();
