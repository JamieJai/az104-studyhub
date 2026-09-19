(() => {
  "use strict";

  const DATA = window.AZ802_DATA;
  const QUESTIONS = DATA.questions;
  const BY_N = new Map(QUESTIONS.map(q => [q.n, q]));
  const THEME_KEY = "az802cbt.theme";     // 테마만 기기별 저장. 기록은 전부 서버(D1, exam=az802).
  const EXAM = "az802";
  const PROGRESS_API = `/api/progress?exam=${EXAM}`;
  const TYPE_LABEL = { multiple_choice: "객관식", dropdown: "HOTSPOT", drag_drop: "DRAG DROP", statements: "예/아니요" };

  const $ = id => document.getElementById(id);

  // ---------- 상태 ----------
  let state = { records: {}, session: null, examRuns: [], theme: "" };
  let examTimerHandle = null;
  let pending = {};          // 현재 문항의 입력 중 상태

  function loadTheme() { try { state.theme = localStorage.getItem(THEME_KEY) || ""; } catch { state.theme = ""; } }
  function saveTheme() { try { localStorage.setItem(THEME_KEY, state.theme || ""); } catch { /* ignore */ } }

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
  function sessionJson() { return JSON.stringify(state.session || null); }

  function adoptRemote(remote) {
    state.records = (remote && typeof remote.progress === "object" && remote.progress) ? remote.progress : {};
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
    for (const [k, v] of Object.entries(state.records || {})) { const j = JSON.stringify(v); if (lastSent[k] !== j) records[k] = v; }
    const sesJson = sessionJson();
    const examRuns = (state.examRuns || []).filter(r => !sentRuns.has(runIdOf(r)));
    const body = {};
    if (Object.keys(records).length) body.records = records;
    if (sesJson !== lastSession) body.session = state.session || { queue: [] };
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
  async function logout() {
    await syncFlush();
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* ignore */ }
    location.replace("/");
  }
  function recordFor(n) {
    if (!state.records[n]) state.records[n] = { result: null, attempts: 0, wrongCount: 0, bookmarked: false, selected: null, updatedAt: null };
    return state.records[n];
  }

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
    s = s.replace(/\[\[IMG(\d+)\]\]/g, (m, i) => `<button type="button" class="img-chip" data-img="${i}">🖼 이미지 ${i}</button>`);
    return s;
  }
  function mdToHtml(text) {
    const lines = text.replace(/\r/g, "").split("\n");
    const out = []; let para = []; let list = null; let code = null;
    const flushPara = () => { if (para.length) { const t = para.join(" ").trim(); if (t) out.push(/^\*\(참고:.*\)\*$/.test(t) ? `<span class="scenario-note">${inline(t.slice(1, -1))}</span>` : `<p>${inline(t)}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<ul>${list.map(l => `<li>${inline(l)}</li>`).join("")}</ul>`); list = null; } };
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (code !== null) { if (/^```/.test(line)) { out.push(`<pre>${escapeHtml(code.join("\n"))}</pre>`); code = null; } else code.push(line); continue; }
      if (/^```/.test(line)) { flushPara(); flushList(); code = []; continue; }
      if (!line.trim()) { flushPara(); flushList(); continue; }
      let m;
      if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flushPara(); flushList(); const lv = Math.min(3, m[1].length + 1); out.push(`<h${lv}>${inline(m[2])}</h${lv}>`); continue; }
      if ((m = /^[-*]\s+(.*)$/.exec(line))) { flushPara(); if (!list) list = []; list.push(m[1]); continue; }
      if (list) flushList();
      if (/^\[\[IMG\d+\]\]$/.test(line.trim())) { flushPara(); out.push(`<p>${inline(line.trim())}</p>`); continue; }
      para.push(line.trim());
    }
    flushPara(); flushList();
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
  function startSession({ filter, order, mode = "practice", queue = null, title = "" } = {}) {
    filter = filter || $("questionFilter").value; order = order || $("questionOrder").value;
    let q = queue || candidatesFor(filter);
    if (!q.length) { toast("조건에 맞는 문항이 없습니다"); return; }
    if (order === "random") q = shuffle(q);
    state.session = { mode, queue: q, cursor: 0, filter, order, answers: {}, startedAt: nowIso(), title };
    saveState(); showQuiz(); renderQuestion();
    closeSidebar();
  }

  // 모의고사: 영역 비중 배분 + 미응답/오답 우선
  function allocateExam(total) {
    const topics = DATA.topics;
    const weights = topics.map(t => (t.weight[0] + t.weight[1]) / 2);
    const wsum = weights.reduce((a, b) => a + b, 0);
    let alloc = topics.map((t, i) => Math.min(t.count, Math.round(total * weights[i] / wsum)));
    let diff = total - alloc.reduce((a, b) => a + b, 0);
    // 남거나 모자란 만큼 여유 있는 영역에 분배
    let guard = 0;
    while (diff !== 0 && guard++ < 200) {
      for (let i = 0; i < topics.length && diff !== 0; i++) {
        if (diff > 0 && alloc[i] < topics[i].count) { alloc[i]++; diff--; }
        else if (diff < 0 && alloc[i] > 0) { alloc[i]--; diff++; }
      }
    }
    const picked = [];
    topics.forEach((t, i) => {
      const pool = QUESTIONS.filter(q => q.topic === t.en).map(q => q.n);
      const pri = n => { const r = state.records[n]; if (!r || !r.result) return 0; if (r.result === "wrong") return 1; return 2; };
      const groups = [0, 1, 2].map(p => shuffle(pool.filter(n => pri(n) === p)));
      const ordered = groups.flat();
      picked.push(...ordered.slice(0, alloc[i]));
    });
    return shuffle(picked);
  }
  function startExamSession() {
    const size = Math.min(QUESTIONS.length, Number($("examSize").value));
    const queue = allocateExam(size);
    const timed = $("examTimer").checked;
    startSession({ mode: "exam", queue, order: "sequential", filter: "exam", title: "모의고사" });
    state.session.timed = timed;
    if (timed) { state.session.endsAt = Date.now() + size * 120 * 1000; startExamTimer(); }
    saveState();
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

  function currentQuestion() { const s = state.session; return s ? BY_N.get(s.queue[s.cursor]) : null; }

  // ---------- 화면 전환 ----------
  function showOnly(id) {
    ["welcome", "quiz", "examResult", "wrongNote"].forEach(x => $(x).classList.toggle("hidden", x !== id));
    window.scrollTo({ top: 0 });
  }
  function showWelcome() {
    $("wcTotal").textContent = QUESTIONS.length;
    $("wcMc").textContent = QUESTIONS.filter(q => q.type === "multiple_choice").length;
    $("wcHs").textContent = QUESTIONS.filter(q => q.type === "dropdown" || q.type === "drag_drop").length;
    $("wcYn").textContent = QUESTIONS.filter(q => q.type === "statements").length;
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
    $("topicBadge").textContent = s.mode === "exam" ? "" : q.topicKo;
    $("sessionPosition").textContent = `${s.cursor + 1} / ${s.queue.length}`;
    $("sessionMode").textContent = s.mode === "exam" ? `모의고사${s.timed ? " · 시간제한" : ""}` : (s.title || "연습");
    $("sessionBar").style.width = ((s.cursor + 1) / s.queue.length * 100) + "%";
    const rec = recordFor(q.n);
    $("bookmarkButton").textContent = rec.bookmarked ? "★ 북마크됨" : "☆ 북마크";
    $("bookmarkButton").classList.toggle("active", rec.bookmarked);

    // 1) 이미지
    $("questionImages").innerHTML = q.images.map((src, i) => `<figure class="q-figure"><img src="${src}" alt="이미지 ${i + 1}" data-img="${i + 1}" loading="lazy"><figcaption>이미지 ${i + 1}${q.images.length > 1 ? ` / ${q.images.length}` : ""} · 클릭하면 크게 봅니다</figcaption></figure>`).join("");
    // 2) 번역 텍스트 + 원문
    $("questionText").innerHTML = mdToHtml(q.stemKo);
    $("questionTextEn").innerHTML = mdToHtml(q.stemEn);
    $("originalWrap").open = false;
    // 3) 답 입력
    const prior = s.mode === "exam" ? (s.answers[q.n] || null) : (rec.result ? { selected: rec.selected, graded: true } : null);
    renderControls(q, prior);
    // 4) 피드백/해설
    $("feedback").classList.add("hidden"); $("explanation").classList.add("hidden");
    if (s.mode !== "exam" && rec.result) { const g = grade(q, rec.selected); showFeedback(g, q); showExplanation(q, g); }
    $("prevButton").disabled = s.cursor === 0;
    $("nextButton").textContent = s.cursor === s.queue.length - 1 ? (s.mode === "exam" ? "제출하고 채점 →" : "세션 종료 →") : "다음 →";
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
        html += `<button type="button" class="${cls}" data-letter="${c.label}" ${locked ? "disabled" : ""}><span class="choice-letter">${c.label}.</span><span class="choice-text">${escapeHtml(c.ko)}${c.ko !== c.en ? `<span class="choice-en">${escapeHtml(c.en)}</span>` : ""}</span></button>`;
      }
      html += `</div>`;
    } else if (q.type === "dropdown") {
      pending.selected = sel ? { ...sel } : {};
      html += `<h3 class="answer-title">답 선택<small>각 항목에서 하나씩 고르세요</small></h3>`;
      const selectHtml = b => {
        const chosen = pending.selected[b.id] || "";
        return `<select data-blank="${b.id}" ${locked ? "disabled" : ""}><option value="">— 선택 —</option>${b.options.map(o => `<option value="${escapeHtml(o.en)}" ${chosen === o.en ? "selected" : ""}>${escapeHtml(o.ko)}${o.ko !== o.en ? ` (${escapeHtml(o.en)})` : ""}</option>`).join("")}</select>`;
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
          html += `<div class="choice-box${st}"><strong>${escapeHtml(b.labelKo)}</strong>${b.labelKo !== b.labelEn ? `<span class="choice-en-hint">${escapeHtml(b.labelEn)}</span>` : ""}${selectHtml(b)}</div>`;
        }
        html += `</div>`;
      }
    } else if (q.type === "statements") {
      pending.selected = sel ? { ...sel } : {};
      html += `<h3 class="answer-title">각 문장이 참이면 예, 아니면 아니요</h3>`;
      q.statements.forEach((st, i) => {
        const chosen = pending.selected[i] || "";
        const cls = g ? (g.parts[i].ok ? " ok" : " bad") : "";
        html += `<div class="stmt-row${cls}"><div>${escapeHtml(st.ko)}<span class="stmt-en">${escapeHtml(st.en)}</span></div><div>${q.columns.map(c => `<button type="button" class="${chosen === c ? "selected" : ""}" data-stmt="${i}" data-val="${c}" ${locked ? "disabled" : ""}>${c === "Yes" ? "예" : c === "No" ? "아니요" : escapeHtml(c)}</button>`).join("")}</div></div>`;
      });
    } else if (q.type === "drag_drop") {
      pending.selected = sel ? { ...sel } : {};
      html += `<h3 class="answer-title">각 항목에 맞는 구성을 배치<small>드래그 대신 목록에서 고릅니다 · 같은 항목을 여러 번 쓸 수 있습니다</small></h3>`;
      html += `<div class="dd-items">${q.items.map(it => `<span title="${escapeHtml(it.en)}">${escapeHtml(it.ko)}</span>`).join("")}</div><div class="choice-boxes">`;
      for (const sl of q.slots) {
        const chosen = pending.selected[sl.id] || "";
        const st = g ? (g.parts.find(p => p.id === sl.id).ok ? " ok" : " bad") : "";
        html += `<div class="choice-box${st}"><strong>${escapeHtml(sl.labelKo)}</strong>${sl.labelKo !== sl.labelEn ? `<span class="choice-en-hint">${escapeHtml(sl.labelEn)}</span>` : ""}<select data-slot="${sl.id}" ${locked ? "disabled" : ""}><option value="">— 선택 —</option>${q.items.map(it => `<option value="${escapeHtml(it.en)}" ${chosen === it.en ? "selected" : ""}>${escapeHtml(it.ko)}${it.ko !== it.en ? ` (${escapeHtml(it.en)})` : ""}</option>`).join("")}</select></div>`;
      }
      html += `</div>`;
    }
    if (!locked) html += `<div class="submit-row"><small>${state.session.mode === "exam" ? "제출하면 다음 문항으로 넘어갑니다 (나중에 다시 돌아와 바꿀 수 있음)" : "제출하면 바로 채점하고 해설을 보여줍니다"}</small><button type="button" class="primary" id="submitAnswer">제출</button></div>`;
    else if (state.session.mode === "exam") html += `<div class="submit-row"><small>제출된 답입니다. 바꾸려면 아래에서 다시 선택하세요.</small><button type="button" id="changeAnswer">답 바꾸기</button></div>`;
    box.innerHTML = html;

    box.querySelectorAll(".choice[data-letter]").forEach(b => b.addEventListener("click", () => toggleChoice(q, b.dataset.letter)));
    box.querySelectorAll("select[data-blank]").forEach(s => s.addEventListener("change", () => { pending.selected[s.dataset.blank] = s.value; }));
    box.querySelectorAll("select[data-slot]").forEach(s => s.addEventListener("change", () => { pending.selected[s.dataset.slot] = s.value; }));
    box.querySelectorAll("button[data-stmt]").forEach(b => b.addEventListener("click", () => {
      pending.selected[b.dataset.stmt] = b.dataset.val;
      b.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("selected", x === b));
    }));
    const sb = $("submitAnswer"); if (sb) sb.addEventListener("click", submitAnswer);
    const cb = $("changeAnswer"); if (cb) cb.addEventListener("click", () => { delete state.session.answers[q.n]; saveState(); renderControls(q, null); });
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
      const parts = q.blanks.map(b => ({ id: b.id, label: b.labelKo, chosen: sel?.[b.id] || "", answer: b.answer, answerKo: (b.options.find(o => o.en === b.answer) || {}).ko, ok: (sel?.[b.id] || "") === b.answer }));
      return { correct: parts.every(p => p.ok), parts };
    }
    if (q.type === "statements") {
      const parts = q.statements.map((st, i) => ({ id: i, label: st.ko, chosen: sel?.[i] || "", answer: st.answer, answerKo: st.answer === "Yes" ? "예" : st.answer === "No" ? "아니요" : st.answer, ok: (sel?.[i] || "") === st.answer }));
      return { correct: parts.every(p => p.ok), parts };
    }
    if (q.type === "drag_drop") {
      const parts = q.slots.map(sl => ({ id: sl.id, label: sl.labelKo, chosen: sel?.[sl.id] || "", answer: sl.answer, answerKo: (q.items.find(i => i.en === sl.answer) || {}).ko, ok: (sel?.[sl.id] || "") === sl.answer }));
      return { correct: parts.every(p => p.ok), parts };
    }
    return { correct: false, parts: [] };
  }
  function isComplete(q, sel) {
    if (q.type === "multiple_choice") return Array.isArray(sel) && sel.length === q.answers.length;
    if (q.type === "dropdown") return q.blanks.every(b => sel?.[b.id]);
    if (q.type === "statements") return q.statements.every((s, i) => sel?.[i]);
    if (q.type === "drag_drop") return q.slots.every(s => sel?.[s.id]);
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
    if (q.type !== "multiple_choice") body += `<div>부분 점수: ${okParts} / ${g.parts.length}</div>`;
    else if (q.answers.length > 1) body += `<div>정답 ${q.answers.length}개 중 ${okParts}개 일치</div>`;
    const r = state.records[q.n]; if (r && r.attempts > 1) body += `<div style="opacity:.75;font-size:12px;margin-top:4px">이 문항 ${r.attempts}회 풀이 · 오답 ${r.wrongCount}회</div>`;
    fb.className = "feedback " + (g.correct ? "correct" : "wrong"); fb.innerHTML = body; fb.classList.remove("hidden");
  }

  function answerSummaryHtml(q, g) {
    if (q.type === "multiple_choice") {
      return `<strong>정답: ${q.answers.join(", ")}</strong><ul>${q.answers.map(a => { const c = q.choices.find(x => x.label === a); return `<li><b>${a}.</b> ${escapeHtml(c.ko)}${c.ko !== c.en ? ` <span style="opacity:.7">(${escapeHtml(c.en)})</span>` : ""}</li>`; }).join("")}</ul>`;
    }
    return `<strong>정답</strong><ul>${g.parts.map(p => `<li>${p.ok ? "✅" : "❌"} <b>${escapeHtml(p.label)}</b> ${escapeHtml(p.answerKo || p.answer)}${p.answerKo && p.answerKo !== p.answer ? ` <span style="opacity:.7">(${escapeHtml(p.answer)})</span>` : ""}${!p.ok && p.chosen ? ` <span style="color:#c0392b">· 내 답: ${escapeHtml(labelOf(q, p))}</span>` : ""}</li>`).join("")}</ul>`;
  }
  function labelOf(q, p) {
    if (q.type === "dropdown") { const b = q.blanks.find(x => x.id === p.id); const o = b.options.find(x => x.en === p.chosen); return o ? o.ko : p.chosen; }
    if (q.type === "drag_drop") { const o = q.items.find(x => x.en === p.chosen); return o ? o.ko : p.chosen; }
    if (q.type === "statements") return p.chosen === "Yes" ? "예" : p.chosen === "No" ? "아니요" : p.chosen;
    return p.chosen;
  }
  function showExplanation(q, g) {
    const ex = $("explanation");
    let html = `<h3>정답 및 해설</h3><div class="answer-summary">${answerSummaryHtml(q, g)}</div>`;
    html += `<div class="explanation-section"><h4>해설 (한국어)</h4><div class="explain-body">${mdToHtml(q.explanationKo)}</div></div>`;
    html += `<details class="explain-en"><summary>EN · 영어 원문 해설 보기</summary><div class="explain-body">${mdToHtml(q.explanationEn)}</div></details>`;
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
      if (s.mode === "exam") { const a = s.answers[n]; const g = a ? grade(q, a.selected) : { correct: false, parts: [] }; return { n, q, correct: g.correct, answered: !!a, sel: a ? a.selected : null }; }
      const r = state.records[n]; return { n, q, correct: r?.result === "correct", answered: !!r?.result, sel: r?.selected };
    });
    if (s.mode === "exam") {
      // 기록 반영
      for (const r of results) if (r.answered) updateRecord(r.q, { correct: r.correct }, r.sel); else { const rec = recordFor(r.n); rec.attempts += 1; rec.result = "wrong"; rec.wrongCount += 1; rec.updatedAt = nowIso(); }
      const run = { id: nowIso(), at: nowIso(), total: results.length, correct: results.filter(r => r.correct).length, timed: !!s.timed, wrong: results.filter(r => !r.correct).map(r => r.n), topics: {} };
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
    $("resultEyebrow").textContent = mode === "exam" ? "EXAM COMPLETE" : "SESSION COMPLETE";
    $("resultTitle").textContent = mode === "exam" ? "모의고사 결과" : "세션 결과";
    $("examScore").textContent = `${correct} / ${total}`;
    const pct = total ? Math.round(correct / total * 100) : 0;
    $("examPercent").textContent = pct + "%";
    $("examSummary").textContent = mode === "exam" ? `${results.length}문항 중 ${correct}문항 정답 (${pct}%). 실제 시험 합격선은 1000점 만점에 700점(약 70%)입니다.` : `이번 세션에서 ${answered.length}문항을 풀어 ${correct}문항을 맞혔습니다.`;
    const grid = $("resultChapters"); grid.innerHTML = "";
    for (const t of DATA.topics) {
      const rs = results.filter(r => r.q.topic === t.en && (mode === "exam" || r.answered)); if (!rs.length) continue;
      const c = rs.filter(r => r.correct).length; const p = Math.round(c / rs.length * 100);
      grid.insertAdjacentHTML("beforeend", `<div class="result-ch${p < 70 ? " low" : ""}"><b>${escapeHtml(t.ko)}</b><div class="rc-bar"><i style="width:${p}%"></i></div><div class="rc-num">${c} / ${rs.length} · ${p}%</div></div>`);
    }
    const wrong = results.filter(r => (mode === "exam" || r.answered) && !r.correct);
    $("resultWrong").innerHTML = wrong.length ? `<h3>틀린 문항 ${wrong.length}개</h3><div class="rw-list">${wrong.map(r => `<button type="button" class="rw-item" data-n="${r.n}"><span class="rw-no">Q${r.n}</span><span class="rw-txt">${escapeHtml(firstLine(r.q.stemKo))}</span><span class="rw-topic">${escapeHtml(r.q.topicKo)}</span></button>`).join("")}</div>` : `<p class="rw-empty">틀린 문항이 없습니다. 🎉</p>`;
    $("resultWrong").querySelectorAll(".rw-item").forEach(b => b.addEventListener("click", () => startSession({ queue: [Number(b.dataset.n)], order: "sequential", filter: "review", title: "복습" })));
    $("reviewExamWrong").onclick = () => wrong.length ? startSession({ queue: wrong.map(r => r.n), order: "sequential", filter: "review", title: "세션 오답 복습" }) : toast("틀린 문항이 없습니다");
    showOnly("examResult");
  }
  function firstLine(md) {
    const lines = md.replace(/\*\(참고:[^)]*\)\*/g, "").replace(/\[\[IMG\d+\]\]/g, "").replace(/[#*`]/g, "").split("\n").map(s => s.trim()).filter(s => s && !/^(HOTSPOT|DRAG DROP)\s*[-–]?$/.test(s));
    const need = lines.slice().reverse().find(s => /야 합니다\.?$/.test(s));
    const ask = lines.slice().reverse().find(s => /[?？]$/.test(s));
    return need || ask || lines.find(s => s.length > 12) || lines[0] || "";
  }

  // ---------- 오답노트 / 모의고사 기록 ----------
  function wrongList(minWrong = 1) { return QUESTIONS.filter(q => { const r = state.records[q.n]; return r && r.result === "wrong" && r.wrongCount >= minWrong; }); }
  function openWrongNote() {
    const list = wrongList(1); const rep = wrongList(2);
    $("wnTitle").textContent = "오답노트"; $("wnActions").classList.remove("hidden");
    $("wnStats").innerHTML = `<div class="wn-kpi"><strong>${list.length}</strong><span>현재 오답</span></div><div class="wn-kpi"><strong>${rep.length}</strong><span>2회 이상 오답</span></div><div class="wn-kpi"><strong>${Object.values(state.records).filter(r => r.bookmarked).length}</strong><span>북마크</span></div>`;
    $("wnList").innerHTML = list.length ? list.map(q => `<button type="button" class="wn-item" data-n="${q.n}"><span class="wn-no">Q${q.n}</span><span class="wn-body"><strong>${escapeHtml(q.topicKo)} · ${TYPE_LABEL[q.type]}</strong><em>${escapeHtml(firstLine(q.stemKo))}</em></span><span class="wn-cnt">오답 ${state.records[q.n].wrongCount}회</span></button>`).join("") : `<p class="wn-empty">틀린 문제가 없습니다.</p>`;
    $("wnList").querySelectorAll(".wn-item").forEach(b => b.addEventListener("click", () => startSession({ queue: [Number(b.dataset.n)], order: "sequential", filter: "review", title: "오답 복습" })));
    showOnly("wrongNote");
  }
  function showExamRuns() {
    $("wnTitle").textContent = "모의고사 기록"; $("wnActions").classList.add("hidden");
    const runs = state.examRuns.slice().reverse();
    const best = runs.length ? Math.max(...runs.map(r => Math.round(r.correct / r.total * 100))) : 0;
    $("wnStats").innerHTML = `<div class="wn-kpi"><strong>${runs.length}</strong><span>응시 횟수</span></div><div class="wn-kpi"><strong>${best}%</strong><span>최고 점수</span></div><div class="wn-kpi"><strong>${runs.length ? Math.round(runs.reduce((a, r) => a + r.correct / r.total * 100, 0) / runs.length) : 0}%</strong><span>평균</span></div>`;
    $("wnList").innerHTML = runs.length ? runs.map((r, i) => `<button type="button" class="wn-item" data-i="${runs.length - 1 - i}"><span class="wn-no">#${runs.length - i}</span><span class="wn-body"><strong>${r.correct} / ${r.total} · ${Math.round(r.correct / r.total * 100)}%${r.timed ? " · 시간제한" : ""}</strong><em>${fmtDate(r.at)} · 오답 ${r.wrong.length}개 → 클릭하면 오답 복습</em></span></button>`).join("") : `<p class="wn-empty">아직 모의고사 기록이 없습니다.</p>`;
    $("wnList").querySelectorAll(".wn-item").forEach(b => b.addEventListener("click", () => { const run = state.examRuns[Number(b.dataset.i)]; if (run.wrong.length) startSession({ queue: run.wrong, order: "sequential", filter: "review", title: "모의고사 오답 복습" }); else toast("이 회차는 오답이 없습니다"); }));
    showOnly("wrongNote");
  }

  // ---------- 북마크 / 이동 / 테마 / 라이트박스 ----------
  function toggleBookmark() { const q = currentQuestion(); if (!q) return; const r = recordFor(q.n); r.bookmarked = !r.bookmarked; r.updatedAt = nowIso(); saveState(); updateStats(); renderQuestion(); toast(r.bookmarked ? "북마크 추가" : "북마크 해제"); }
  function jumpTo() {
    const n = Number($("questionJump").value); if (!BY_N.has(n)) { toast("1~63 사이 번호를 입력하세요"); return; }
    const s = state.session;
    if (s && s.mode !== "exam" && s.queue.includes(n)) { s.cursor = s.queue.indexOf(n); saveState(); showQuiz(); renderQuestion(); }
    else if (s && s.mode === "exam") toast("모의고사 중에는 이동할 수 없습니다");
    else startSession({ queue: QUESTIONS.map(q => q.n), order: "sequential", filter: "all", title: "연습" }), state.session.cursor = n - 1, saveState(), renderQuestion();
    $("questionJump").value = "";
  }
  function applyTheme() { document.body.classList.toggle("dark", state.theme === "dark"); }
  function openLightbox(src, cap) { $("lightboxImg").src = src; $("lightboxCap").textContent = cap || ""; $("lightbox").classList.remove("hidden"); }
  function closeSidebar() { $("sidebar").classList.remove("open"); $("sidebarOverlay").hidden = true; document.body.classList.remove("sidebar-open"); }

  // ---------- 내보내기/가져오기 ----------
  function exportProgress() {
    const blob = new Blob([JSON.stringify({ app: "az802-cbt", exportedAt: nowIso(), records: state.records, examRuns: state.examRuns }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `az802-progress-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  function importProgress(file) {
    const fr = new FileReader();
    fr.onload = () => { try { const d = JSON.parse(fr.result); if (d.app !== "az802-cbt") throw 0; for (const [k, v] of Object.entries(d.records || {})) state.records[k] = { ...v, updatedAt: nowIso() }; if (Array.isArray(d.examRuns)) state.examRuns = [...state.examRuns, ...d.examRuns].slice(-30); saveState(); updateStats(); toast("기록을 가져왔습니다 · 서버에 저장 중"); } catch { toast("올바른 기록 파일이 아닙니다"); } };
    fr.readAsText(file);
  }

  // ---------- 초기화 ----------
  function bind() {
    $("startSession").addEventListener("click", () => startSession({ title: "연습" }));
    $("quickStart").addEventListener("click", () => startSession({ filter: "all", order: "sequential", title: "연습" }));
    $("examStart").addEventListener("click", startExamSession); $("examStartSide").addEventListener("click", startExamSession);
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
    $("themeToggle").addEventListener("click", () => { state.theme = state.theme === "dark" ? "" : "dark"; saveTheme(); applyTheme(); });
    $("exportProgress").addEventListener("click", exportProgress);
    $("importProgress").addEventListener("change", e => { if (e.target.files[0]) importProgress(e.target.files[0]); e.target.value = ""; });
    $("resetProgress").addEventListener("click", async () => {
      if (!confirm("AZ-802 풀이 기록·북마크·모의고사 기록을 서버에서 삭제할까요? (AZ-104 기록은 그대로)")) return;
      try { await resetRemote(); updateStats(); showWelcome(); toast("기록을 초기화했습니다"); } catch { toast("초기화 실패 · 잠시 후 다시 시도"); }
    });
    const lo = $("logoutBtn"); if (lo) lo.addEventListener("click", logout);
    const sn = $("syncNow"); if (sn) sn.addEventListener("click", async () => { await syncFlush(); await syncPull(); toast("서버와 동기화했습니다"); });
    $("menuToggle").addEventListener("click", () => { $("sidebar").classList.add("open"); $("sidebarOverlay").hidden = false; document.body.classList.add("sidebar-open"); });
    $("sidebarClose").addEventListener("click", closeSidebar); $("sidebarOverlay").addEventListener("click", closeSidebar);
    $("lightbox").addEventListener("click", () => $("lightbox").classList.add("hidden"));
    document.addEventListener("click", e => {
      const chip = e.target.closest(".img-chip"); const img = e.target.closest(".q-figure img");
      const q = currentQuestion(); if (!q) return;
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
    $("mcCount").textContent = QUESTIONS.filter(q => q.type === "multiple_choice").length;
    $("hsCount").textContent = QUESTIONS.filter(q => q.type === "dropdown").length;
    $("ddCount").textContent = QUESTIONS.filter(q => q.type === "drag_drop").length;
    $("ynCount").textContent = QUESTIONS.filter(q => q.type === "statements").length;
  }

  loadTheme(); applyTheme(); fillTopics(); bind();
  (async () => {
    await loadMe();
    await syncPull();
    updateStats();
    if (state.session && state.session.queue && state.session.queue.length) {
      showQuiz(); renderQuestion();
      if (state.session.mode === "exam" && state.session.timed) startExamTimer();
    } else showWelcome();
  })();
  window.addEventListener("beforeunload", () => { if (syncTimer) { clearTimeout(syncTimer); syncFlush(); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && syncTimer) { clearTimeout(syncTimer); syncFlush(); } });
})();
