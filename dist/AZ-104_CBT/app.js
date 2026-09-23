(() => {
  "use strict";

  const dataset = window.AZ104_DATA;
  const annotations = window.AZ104_ANNOTATIONS;
  const hotspotKeys = window.AZ104_HOTSPOT_KEYS || {};
  const explanationsV2 = window.AZ104_EXPLANATIONS_V2 || {};
  const currentVerified = window.AZ104_CURRENT_VERIFIED || {};
  if (!dataset || !Array.isArray(dataset.questions)) {
    document.body.innerHTML = "<p style='padding:30px'>문제 데이터를 불러오지 못했습니다. data.js 파일을 확인하세요.</p>";
    return;
  }

  const STORAGE_KEY = "az104-cbt-progress";
  const SYNC_ID_KEY = "az104-sync-id";
  const REPORT_API = "/api/report";
  let myReports = [];           // 버전 무관 고정 키
  const LEGACY_KEY_RE = /^az104-cbt-progress-/;        // 예전 버전별 키
  const $ = (id) => document.getElementById(id);
  const els = {
    sidebar: $("sidebar"), menuToggle: $("menuToggle"), themeToggle: $("themeToggle"),
    sidebarOverlay: $("sidebarOverlay"), sidebarClose: $("sidebarClose"),
    questionFilter: $("questionFilter"), questionOrder: $("questionOrder"),
    startSession: $("startSession"), quickStart: $("quickStart"), examStart: $("examStart"), welcome: $("welcome"), quiz: $("quiz"), examResult: $("examResult"),
    examScore: $("examScore"), examPercent: $("examPercent"), examSummary: $("examSummary"), reviewExamWrong: $("reviewExamWrong"), backHome: $("backHome"),
    questionJump: $("questionJump"), jumpButton: $("jumpButton"),
    statAnswered: $("statAnswered"), statCorrect: $("statCorrect"), statWrong: $("statWrong"), statBookmarked: $("statBookmarked"),
    progressRing: $("progressRing"), progressPercent: $("progressPercent"),
    datasetCount: $("datasetCount"), autoCount: $("autoCount"), selfCount: $("selfCount"),
    kindBadge: $("kindBadge"), sourceNumber: $("sourceNumber"), bookmarkButton: $("bookmarkButton"), questionStatus: $("questionStatus"),
    sessionPosition: $("sessionPosition"), topicName: $("topicName"), sessionBar: $("sessionBar"),
    questionImages: $("questionImages"), questionText: $("questionText"), answerControls: $("answerControls"),
    feedback: $("feedback"), explanation: $("explanation"),
    prevButton: $("prevButton"), nextButton: $("nextButton"),
    exportProgress: $("exportProgress"), importProgress: $("importProgress"), resetProgress: $("resetProgress"),
    toast: $("toast"),
    examSize: $("examSize"), examTimer: $("examTimer"), examIncludeOut: $("examIncludeOut"), examIncludeHotspot: $("examIncludeHotspot"),
    examStartSide: $("examStartSide"), realExamStart: $("realExamStart"), realExamStartSide: $("realExamStartSide"), examTimerDisplay: $("examTimerDisplay"),
    hintBox: $("hintBox"), hintToggle: $("hintToggle"), hintBody: $("hintBody"),
    imageWrap: $("imageWrap"), imageSummary: $("imageSummary"),
    syncNow: $("syncNow"), syncStatus: $("syncStatus"), logoutBtn: $("logoutBtn"), whoamiName: $("whoamiName"), gateExpired: $("gateExpired"),
    reportBar: $("reportBar"), reportOpen: $("reportOpen"), reportState: $("reportState"), reportModal: $("reportModal"),
    reportQ: $("reportQ"), reportKind: $("reportKind"), reportNote: $("reportNote"), reportCtx: $("reportCtx"),
    reportSend: $("reportSend"), reportCancel: $("reportCancel"), reportMsg: $("reportMsg"),
    openReports: $("openReports"), reportCount: $("reportCount"), clearReports: $("clearReports"),
    gate: $("gate"), gateName: $("gateName"), gateStart: $("gateStart"), gateGuest: $("gateGuest"), gateError: $("gateError"),
    wrongNote: $("wrongNote"), wnStats: $("wnStats"), wnList: $("wnList"), wnClose: $("wnClose"),
    wnStartAll: $("wnStartAll"), wnStartRepeat: $("wnStartRepeat"), openWrongNote: $("openWrongNote"),
    wnTitle: $("wnTitle"), wnActions: $("wnActions"),
    openExamRuns: $("openExamRuns"), openExamRuns2: $("openExamRuns2"),
    navHome: $("navHome"), navWrongNote: $("navWrongNote"), navExamRuns: $("navExamRuns"), navAccounts: $("navAccounts"),
    resultEyebrow: $("resultEyebrow"), resultTitle: $("resultTitle"), resultChapters: $("resultChapters"),
    resultWrong: $("resultWrong"), openWrongNote2: $("openWrongNote2")
  };
  const hints = window.AZ104_HINTS || {};
  const CH_NAME = {1:"1장 ID·거버넌스",2:"2장 Storage",3:"3장 Compute",4:"4장 Networking",5:"5장 모니터링·유지관리"};
  const CH_WEIGHT = {1:[20,25],2:[15,20],3:[20,25],4:[15,20],5:[10,15]};
  let examTimerId = null, examDeadline = 0;

  const defaults = { progress: {}, queue: [], cursor: 0, order: "sequential", filter: "all", light: false, sessionMode: "study", examSessionResults: {}, examHistory: [], examRuns: [] };
  let state = { ...defaults, owner: null };   // 메모리에만 둔다. 저장소는 서버(D1)뿐이다.
  let view = { selected: new Set(), revealed: false, graded: false, hotspots: {}, hotspotOrder: [], binaryAnswers: {}, selfBinaryRows: 3 };

  // 상태가 바뀔 때마다 호출된다. 로컬에는 아무것도 남기지 않고 서버로 보낼 것만 표시한다.
  function saveState() {
    updateStats();
    syncPush();
  }

  // ===== 서버 동기화 (D1) =====
  // 서버가 유일한 기준이다. 로그인 세션은 HttpOnly 쿠키에 있어 fetch 가 자동으로 들고 간다.
  // 저장은 "마지막으로 서버에 보낸 내용"과 달라진 문항만 보내고, 서버는 문항별 updated_at 이 큰 쪽을 남긴다.
  const PROGRESS_API = "/api/progress";
  let me = null;                 // { name, admin }
  let syncTimer = null;
  let syncBusy = false;
  let syncReady = false;         // 서버에서 한 번 받아오기 전에는 올리지 않는다
  let pendingPush = false;
  let lastSent = {};             // source → 마지막으로 서버와 맞춘 레코드 JSON
  let lastSession = "";          // 마지막으로 서버와 맞춘 세션 JSON
  let sentRuns = new Set();      // 서버에 이미 있는 모의고사 회차 id

  function syncId() { return me ? me.name : ""; }

  function setSyncStatus(text, tone) {
    if (!els.syncStatus) return;
    els.syncStatus.textContent = text;
    els.syncStatus.className = `sync-status${tone ? " " + tone : ""}`;
  }

  function nowLabel() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }

  // 세션이 끝났으면(401) 로그인 화면으로 보낸다. 돌아올 주소를 next 로 넘긴다.
  function goLogin() {
    location.replace(`/?next=${encodeURIComponent(location.pathname + location.search)}`);
  }
  async function api(path, opts) {
    const r = await fetch(path, { cache: "no-store", credentials: "same-origin", ...opts });
    if (r.status === 401) { goLogin(); throw new Error("unauthorized"); }
    return r;
  }

  function sessionOf() {
    return { queue: state.queue || [], cursor: state.cursor || 0, filter: state.filter, order: state.order, light: !!state.light };
  }
  function runIdOf(run) { return String(run?.id || run?.at || run?.finishedAt || ""); }

  // 서버 데이터를 그대로 채택하고, "서버와 맞춘 상태"를 기억한다.
  function adoptRemote(remote) {
    state.progress = (remote && typeof remote.progress === "object") ? remote.progress : {};
    state.examRuns = Array.isArray(remote?.examRuns) ? remote.examRuns : [];
    const ses = remote && remote.session;
    if (ses && Array.isArray(ses.queue) && ses.queue.length) {
      state.queue = ses.queue; state.cursor = ses.cursor || 0;
      if (ses.filter) state.filter = ses.filter;
      if (ses.order) state.order = ses.order;
    } else { state.queue = []; state.cursor = 0; }
    if (ses && typeof ses.light === "boolean") { state.light = ses.light; document.body.classList.toggle("light", ses.light); }
    lastSent = {};
    for (const [k, v] of Object.entries(state.progress)) lastSent[k] = JSON.stringify(v);
    lastSession = JSON.stringify(sessionOf());
    sentRuns = new Set(state.examRuns.map(runIdOf).filter(Boolean));
    return Object.keys(state.progress).length;
  }

  async function syncPull(silent) {
    try {
      setSyncStatus("서버에서 불러오는 중…");
      const r = await api(PROGRESS_API);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || r.status);
      const n = adoptRemote(data);
      updateStats();
      syncReady = true;
      setSyncStatus(`서버 기준 ${n}건 · ${nowLabel()}`, "ok");
      if (!silent) toast(`서버에서 ${n}건을 불러왔습니다.`);
      if (pendingPush) { pendingPush = false; syncFlush(); }
      return true;
    } catch (e) {
      if (String(e?.message) === "unauthorized") return false;
      syncReady = false;
      setSyncStatus("서버 연결 실패 · 저장 보류", "bad");
      return false;
    }
  }

  function syncPush() {
    if (!syncReady) { pendingPush = true; return; }
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncFlush, 2000);          // 2초 디바운스
  }

  // 서버와 달라진 것만 골라낸다
  function buildDelta() {
    const records = {};
    for (const [k, v] of Object.entries(state.progress || {})) {
      const j = JSON.stringify(v);
      if (lastSent[k] !== j) records[k] = v;
    }
    const sesJson = JSON.stringify(sessionOf());
    const examRuns = (state.examRuns || []).filter(r => !sentRuns.has(runIdOf(r)));
    const body = {};
    if (Object.keys(records).length) body.records = records;
    if (sesJson !== lastSession) body.session = sessionOf();
    if (examRuns.length) body.examRuns = examRuns;
    return { body, sesJson, empty: !body.records && !body.session && !body.examRuns };
  }

  async function syncFlush() {
    clearTimeout(syncTimer); syncTimer = null;
    if (!syncReady) { pendingPush = true; return; }
    if (syncBusy) { pendingPush = true; return; }
    const d = buildDelta();
    if (d.empty) return;
    syncBusy = true;
    try {
      setSyncStatus("저장 중…");
      const r = await api(PROGRESS_API, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d.body)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || r.status);
      for (const k of Object.keys(d.body.records || {})) lastSent[k] = JSON.stringify(state.progress[k]);
      if (d.body.session) lastSession = d.sesJson;
      for (const run of d.body.examRuns || []) sentRuns.add(runIdOf(run));
      setSyncStatus(`저장됨 · ${data.count ?? Object.keys(state.progress).length}건 · ${nowLabel()}`, "ok");
    } catch (e) {
      if (String(e?.message) !== "unauthorized") setSyncStatus("저장 실패 · 잠시 후 다시 시도", "bad");
    } finally {
      syncBusy = false;
      if (pendingPush) { pendingPush = false; syncPush(); }
    }
  }

  function renderWhoami() {
    if (els.whoamiName) els.whoamiName.textContent = syncId() || "…";
  }

  async function logout() {
    await syncFlush();
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    location.replace("/");
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  }

  function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function recordFor(source) {
    return state.progress[String(source)] || {};
  }

  function updateStats() {
    const records = Object.values(state.progress);
    const answered = records.filter(r => r.result === "correct" || r.result === "wrong").length;
    const correct = records.filter(r => r.result === "correct").length;
    const wrong = records.filter(r => r.result === "wrong").length;
    const bookmarked = records.filter(r => r.bookmarked).length;
    const percent = Math.round(answered / dataset.questionCount * 100);
    els.statAnswered.textContent = answered;
    els.statCorrect.textContent = correct;
    els.statWrong.textContent = wrong;
    els.statBookmarked.textContent = bookmarked;
    els.progressPercent.textContent = `${percent}%`;
    els.progressRing.style.setProperty("--progress", `${percent * 3.6}deg`);
  }

  function candidatesFor(filter) {
    return dataset.questions.filter(q => {
      const r = recordFor(q.source);
      const assessment = annotations?.assessQuestion(q);
      if (filter === "unanswered") return !r.result;
      if (filter === "wrong") return r.result === "wrong";
      if (filter === "bookmarked") return Boolean(r.bookmarked);
      if (filter === "current-scope") return q.inScope !== false && q.legacy !== true;
      if (filter === "out-of-scope") return q.inScope === false;
      if (filter === "legacy-only") return q.legacy === true;
      if (filter === "verify") return q.verify === true;
      if (filter === "verify-options") return (q.verifyReason || []).includes("선택지 확인 필요");
      if (filter === "confirmed") return q.confirmed === true;
      if (filter === "verify-answer") return q.verify === true && (q.verifyReason || []).some(r => r === "정답 수정" || r === "정답 미확보" || r === "링크 오매핑");
      if (filter === "verify-auto") return q.verify === true && (q.verifyReason || []).some(r => r.includes("자동채점"));
      if (filter === "verify-expl") return q.verify === true && (q.verifyReason || []).some(r => r === "해설 재작성" || r === "번역 수정");
      if (/^ch[1-5]$/.test(filter)) return q.chapter === Number(filter.slice(2)) && q.inScope !== false && q.legacy !== true;
      if (filter === "term-change") return q.termUpdated === true || Boolean(assessment?.terms.length);
      if (filter === "legacy-change") return q.legacy === true || Boolean(assessment?.legacy.length);
      return true;
    });
  }

  // ---------- 배점 · 세트 ----------
  // 실제 시험처럼 "같은 지문 예/아니요(OX)" 한 문항은 문장 수만큼 배점된다. 그 밖에는 1문항 1점.
  function pointsOfQ(q) {
    if (!q) return 0;
    const seq = binaryAnswerSequence(q);
    return seq.length >= 2 ? seq.length : 1;
  }
  function pointsOfSources(list) { return list.reduce((a, src) => a + pointsOfQ(questionBySource(src)), 0); }
  // OX 채점 결과에서 맞힌 문장 수 (부분 점수)
  function earnedOfQ(q, result, selected) {
    const seq = binaryAnswerSequence(q);
    if (seq.length >= 2) {
      if (Array.isArray(selected) && selected.length === seq.length) return selected.filter((v, i) => v === seq[i]).length;
      return result === "correct" ? seq.length : 0;
    }
    return result === "correct" ? 1 : 0;
  }
  const CASE_SETS = Array.isArray(dataset.caseSets) ? dataset.caseSets : [];
  const CASE_OF = new Map();
  CASE_SETS.forEach(set => set.members.forEach(n => CASE_OF.set(Number(n), set)));
  function caseSetOf(src) { return CASE_OF.get(Number(src)) || null; }
  // 후보 목록 → [문항] 또는 [사례 연구 멤버들...] 단위. 세트는 첫 멤버 자리에 통째로 놓인다.
  function unitsOf(list) {
    const inList = new Set(list.map(Number)); const done = new Set(); const units = [];
    for (const src of list.map(Number)) {
      if (done.has(src)) continue;
      const set = caseSetOf(src);
      const unit = set ? set.members.map(Number).filter(m => inList.has(m)) : [src];
      unit.forEach(m => done.add(m)); units.push(unit);
    }
    return units;
  }
  function questionBySource(src) { return dataset.questions.find(q => String(q.source) === String(src)); }

  function startSession({ filter, order } = {}) {
    state.sessionMode = "study";
    state.examSessionResults = {};
    state.filter = filter || els.questionFilter.value;
    state.order = order || els.questionOrder.value;
    let questions = candidatesFor(state.filter).map(q => q.source);
    if (!questions.length) {
      toast(state.filter === "wrong" ? "기록된 오답이 없습니다." : "조건에 맞는 문제가 없습니다.");
      return;
    }
    questions = (state.order === "random" ? shuffle(unitsOf(questions)) : unitsOf(questions)).flat();   // 사례 연구는 묶음 유지
    state.queue = questions;
    state.cursor = 0;
    saveState();
    showQuiz();
  }

  function allocateExam(total) {
    const lo = {}, hi = {}, alloc = {};
    Object.keys(CH_WEIGHT).forEach(c => {
      lo[c] = Math.ceil(total * CH_WEIGHT[c][0] / 100);
      hi[c] = Math.floor(total * CH_WEIGHT[c][1] / 100);
      if (hi[c] < lo[c]) hi[c] = lo[c];        // 문항 수가 적으면 상·하한이 뒤집힐 수 있다
      alloc[c] = lo[c];
    });
    // 비중이 큰 장부터 채운다
    const order = Object.keys(CH_WEIGHT).sort((a, b) => CH_WEIGHT[b][1] - CH_WEIGHT[a][1]);
    let rem = total - order.reduce((s, c) => s + alloc[c], 0);

    while (rem > 0) {
      let moved = false;
      for (const c of order) { if (rem > 0 && alloc[c] < hi[c]) { alloc[c]++; rem--; moved = true; } }
      if (!moved) break;
    }
    // 상한에 막혀 남으면 비중 순으로 한 개씩 더 얹어 총합을 맞춘다
    while (rem > 0) {
      for (const c of order) { if (rem > 0) { alloc[c]++; rem--; } }
    }
    while (rem < 0) {
      let moved = false;
      for (const c of order) { if (rem < 0 && alloc[c] > lo[c]) { alloc[c]--; rem++; moved = true; } }
      if (!moved) break;
    }
    while (rem < 0) {
      for (const c of order) { if (rem < 0 && alloc[c] > 0) { alloc[c]--; rem++; } }
    }
    return alloc;
  }

  // 최근 시험에 나온 문항 기억 (연속 출제 방지)
  function recentExamSources() {
    const hist = Array.isArray(state.examHistory) ? state.examHistory : [];
    return new Set(hist.slice(-2).flat());
  }

  function pickWeighted(pool, count) {
    const recent = recentExamSources();
    const fresh = [], wrong = [], done = [];
    pool.forEach(q => {
      const r = recordFor(q.source);
      if (!r.result) fresh.push(q.source);
      else if (r.result === "wrong") wrong.push(q.source);
      else done.push(q.source);
    });
    // 맞힌 문항은 오래된 순으로 정렬한 뒤 앞쪽 절반만 섞어 쓴다 (매번 같은 순서 방지)
    done.sort((a, b) => new Date(recordFor(a).updatedAt || 0) - new Date(recordFor(b).updatedAt || 0));
    const doneHalf = shuffle(done.slice(0, Math.max(count * 3, Math.ceil(done.length / 2))));

    // 비율 배분: 안 푼 것 우선, 틀린 것은 최대 40%까지만, 나머지는 복습
    const wantWrong = Math.min(wrong.length, Math.ceil(count * 0.4));
    const buckets = [
      { list: shuffle(fresh), take: count },
      { list: shuffle(wrong), take: wantWrong },
      { list: doneHalf, take: count },
      { list: shuffle(wrong), take: count },   // 그래도 모자라면 틀린 것 더
      { list: shuffle(done), take: count }
    ];
    const out = [], used = new Set();
    // 1차: 최근 출제분 제외
    for (const b of buckets) {
      let n = 0;
      for (const src of b.list) {
        if (out.length >= count || n >= b.take) break;
        if (used.has(src) || recent.has(src)) continue;
        out.push(src); used.add(src); n++;
      }
      if (out.length >= count) break;
    }
    // 2차: 풀이 모자라면 최근 출제분도 허용
    if (out.length < count) {
      for (const b of buckets) {
        for (const src of b.list) {
          if (out.length >= count) break;
          if (used.has(src)) continue;
          out.push(src); used.add(src);
        }
        if (out.length >= count) break;
      }
    }
    return out;
  }

  // 실전 모의고사 구성 — 실제 시험과 같은 순서: 다지선다·짧은 HOTSPOT → 같은 지문 OX → 사례 연구
  const REAL_PLAN = { singleMin: 40, singleMax: 45, oxSets: 2, caseSets: 1 };

  function examBasePool() {
    const includeOut = Boolean(els.examIncludeOut?.checked);
    const includeHotspot = Boolean(els.examIncludeHotspot?.checked);
    const gradable = q => q.kind === "auto" || (includeHotspot && (hasBinaryGrading(q) || hasChoiceGrading(q) || hasPosGrading(q)));
    return dataset.questions.filter(q => gradable(q) && q.legacy !== true && (includeOut || q.inScope !== false));
  }
  // 실전 모의고사는 OX·사례 연구가 반드시 필요해서 HOTSPOT 체크와 무관하게 자동채점 가능한 문항을 모두 쓴다
  function realBasePool() {
    const includeOut = Boolean(els.examIncludeOut?.checked);
    const gradable = q => q.kind === "auto" || hasBinaryGrading(q) || hasChoiceGrading(q) || hasPosGrading(q);
    return dataset.questions.filter(q => gradable(q) && q.legacy !== true && (includeOut || q.inScope !== false));
  }

  function startExamSession(real) {
    const base = real ? realBasePool() : examBasePool();
    const queue = real ? buildRealExam(base) : buildPointExam(base, Number(els.examSize?.value || 20));
    if (!queue.length) { toast("모의고사용 문항이 부족합니다."); return; }
    state.examHistory = Array.isArray(state.examHistory) ? state.examHistory : [];
    state.examHistory.push(queue.slice());
    if (state.examHistory.length > 4) state.examHistory = state.examHistory.slice(-4);
    state.sessionMode = "exam";
    state.examSessionResults = {};
    state.filter = els.examIncludeOut?.checked ? "all" : "current-scope";
    state.order = "random";
    state.queue = queue;
    state.cursor = 0;
    state.examTotal = queue.length;
    state.examPoints = pointsOfSources(queue);
    state.examReal = !!real;
    state.examPlan = real ? lastRealPlan : null;
    saveState();
    startExamTimer(state.examPoints);
    toast(real
      ? `실전 모의고사 · ${queue.length}문항 ${state.examPoints}점`
      : `모의고사 · ${queue.length}문항 ${state.examPoints}점`);
    showQuiz();
  }

  // 10/20/30… = 총 배점. 장별 비중대로 뽑되 사례 연구·OX 세트는 쪼개지 않는다.
  function buildPointExam(base, totalPoints) {
    const alloc = allocateExam(totalPoints);
    const units = unitsOf(base.map(q => q.source));
    const picked = []; const used = new Set(); let got = 0;
    const take = u => { picked.push(u); u.forEach(n => used.add(n)); got += pointsOfSources(u); };
    const chapterOf = u => String((questionBySource(u[0]) || {}).chapter);
    Object.keys(alloc).forEach(c => {
      let cp = 0;
      for (const u of orderUnits(units.filter(u => chapterOf(u) === String(c) && !u.some(n => used.has(n))))) {
        if (cp >= alloc[c] || got >= totalPoints) break;
        const p = pointsOfSources(u);
        if (got + p > totalPoints + 2) continue;      // 세트가 커서 총점을 크게 넘기면 건너뛴다
        take(u); cp += p;
      }
    });
    for (const u of orderUnits(units.filter(u => !u.some(n => used.has(n))))) {
      if (got >= totalPoints) break;
      const p = pointsOfSources(u);
      if (got + p > totalPoints + 2) continue;
      take(u);
    }
    return shuffle(picked).flat();
  }

  // 출제 우선순위: 안 푼 문항 → 틀린 문항 → 맞힌 문항
  function unitPriority(unit) {
    return Math.min(...unit.map(src => { const r = state.progress[String(src)]; if (!r || !r.result) return 0; return r.result === "wrong" ? 1 : 2; }));
  }
  function orderUnits(units) { return [0, 1, 2].map(p => shuffle(units.filter(u => unitPriority(u) === p))).flat(); }

  function buildRealExam(base) {
    const inPool = new Set(base.map(q => q.source));
    const isOx = q => binaryAnswerSequence(q).length >= 2;
    const single = base.filter(q => !caseSetOf(q.source) && !isOx(q)).map(q => [q.source]);
    const ox = base.filter(q => !caseSetOf(q.source) && isOx(q)).map(q => [q.source]);
    const sets = CASE_SETS.map(s => s.members.map(Number).filter(n => inPool.has(n))).filter(m => m.length);
    const target = Math.min(single.length, REAL_PLAN.singleMin + Math.floor(Math.random() * (REAL_PLAN.singleMax - REAL_PLAN.singleMin + 1)));
    const alloc = allocateExam(target);
    const partA = []; const usedA = new Set();
    Object.keys(alloc).forEach(c => {
      let n = 0;
      for (const u of orderUnits(single.filter(u => String((questionBySource(u[0]) || {}).chapter) === String(c) && !usedA.has(u[0])))) {
        if (n >= alloc[c] || partA.length >= target) break;
        partA.push(u); usedA.add(u[0]); n++;
      }
    });
    for (const u of orderUnits(single.filter(u => !usedA.has(u[0])))) { if (partA.length >= target) break; partA.push(u); usedA.add(u[0]); }
    const partB = orderUnits(ox).slice(0, REAL_PLAN.oxSets);
    const partC = shuffle(sets).slice(0, REAL_PLAN.caseSets);
    lastRealPlan = { single: partA.length, ox: partB.length, cases: partC.flat().length };
    return [...shuffle(partA), ...partB, ...partC].flat();
  }
  let lastRealPlan = null;
  function realPartLabel() {
    const p = state.examPlan;
    if (!state.examReal || !p) return "";
    const a = p.single, b = a + p.ox;
    if (state.cursor < a) return ` · 1부 단답 ${state.cursor + 1}/${a}`;
    if (state.cursor < b) return ` · 2부 예/아니요 ${state.cursor - a + 1}/${p.ox}세트`;
    return ` · 3부 사례 연구 ${state.cursor - b + 1}/${p.cases}`;
  }

  function startExamTimer(count) {
    stopExamTimer();
    if (!els.examTimer?.checked) { els.examTimerDisplay?.classList.add("hidden"); return; }
    examDeadline = Date.now() + count * 2 * 60 * 1000;   // count = 총 배점
    els.examTimerDisplay?.classList.remove("hidden");
    tickExamTimer();
    examTimerId = setInterval(tickExamTimer, 1000);
  }

  function tickExamTimer() {
    const left = Math.max(0, Math.round((examDeadline - Date.now()) / 1000));
    const mm = String(Math.floor(left / 60)).padStart(2, "0");
    const ss = String(left % 60).padStart(2, "0");
    if (els.examTimerDisplay) {
      els.examTimerDisplay.textContent = `⏱ ${mm}:${ss}`;
      els.examTimerDisplay.classList.toggle("urgent", left <= 300);
    }
    if (left <= 0) { stopExamTimer(); toast("시간이 종료되었습니다."); finishExam(); }
  }

  function stopExamTimer() {
    if (examTimerId) { clearInterval(examTimerId); examTimerId = null; }
    els.examTimerDisplay?.classList.add("hidden");
  }

  function currentQuestion() {
    const source = state.queue[state.cursor];
    return dataset.questions.find(q => q.source === source);
  }

  function syncLocation() {
    const q = currentQuestion();
    if (!q) return;
    const url = `${location.pathname}?q=${q.practice}`;
    if (location.search !== `?q=${q.practice}`) history.replaceState(null, "", url);
  }

  function showQuiz() {
    els.gate?.classList.add("hidden");
    els.wrongNote?.classList.add("hidden");
    els.welcome.classList.add("hidden");
    els.examResult.classList.add("hidden");
    els.quiz.classList.remove("hidden");
    setSidebar(false);
    renderQuestion();
    syncLocation();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderQuestion() {
    const q = currentQuestion();
    if (!q) { els.quiz.classList.add("hidden"); els.welcome.classList.remove("hidden"); return; }
    syncLocation();
    view = { selected: new Set(), revealed: false, graded: false, hotspots: {}, hotspotOrder: [], binaryAnswers: {}, selfBinaryRows: 3 };
    const prior = recordFor(q.source);
    const assessment = annotations?.assessQuestion(q);

    els.kindBadge.textContent = state.sessionMode === "exam" ? "실전 연습 · 정답 비공개" : (q.kind === "auto" ? "자동 채점" : "HOTSPOT · 인터랙티브");
    els.kindBadge.classList.toggle("self", q.kind !== "auto");
    els.sourceNumber.textContent = `연습 ${String(q.practice).padStart(3,"0")} · 원본 Q${q.source}`;
    els.topicName.textContent = `${CH_NAME[q.chapter] || ""} · ${q.topic}`;
    els.sessionPosition.textContent = `${state.cursor + 1} / ${state.queue.length}${state.sessionMode === "exam" ? realPartLabel() : ""}`;
    els.sessionBar.style.width = `${(state.cursor + 1) / state.queue.length * 100}%`;
    els.bookmarkButton.classList.toggle("active", Boolean(prior.bookmarked));
    els.bookmarkButton.textContent = prior.bookmarked ? "★ 북마크됨" : "☆ 북마크";
    els.questionStatus.innerHTML = `${state.sessionMode === "exam" ? `<div class="exam-mode-banner">모의고사 ${state.queue.length}문항 · 답안을 제출해도 정답과 해설은 세션이 끝날 때까지 표시되지 않습니다.</div>` : ""}${assessment ? `
      <div class="status-badges">${assessment.badges.map(b => `<span class="status-badge ${b.type}">${escapeHtml(b.label)}</span>`).join("")}</div>
      ${assessment.scope === "out" ? `<p><strong>범위 안내:</strong> ${escapeHtml(assessment.scopeNote)} 원본 문제의 역사적 정답은 그대로 채점하지만 현재 시험 대비 우선순위는 낮추세요.</p>` : ""}
      ${assessment.terms.length ? `<p><strong>용어 안내:</strong> ${assessment.terms.map(t => `${escapeHtml(t.old)} → ${escapeHtml(t.now)}`).join(" · ")}</p>` : ""}` : ""}`;
    if (q.confirmed === true && state.sessionMode !== "exam") {
      els.questionStatus.innerHTML = `<div class="status-badges"><span class="status-badge confirmed">검증 완료</span></div><p>신고를 받아 수정하고 확인까지 마친 문항입니다.${q.reportFixed ? ` <strong>${escapeHtml(q.reportFixed)}</strong>` : ""}</p>` + els.questionStatus.innerHTML;
    }
    if (q.verify === true && state.sessionMode !== "exam") {
      const rs = (q.verifyReason || []).map(r => `<span class="status-badge verify">${escapeHtml(r)}</span>`).join("");
      const fixed = q.reportFixed ? `<p class="report-fixed">✅ 신고 반영: ${escapeHtml(q.reportFixed)}</p>` : "";
      els.questionStatus.innerHTML = `<div class="status-badges">${rs}</div><p><strong>검증 요청:</strong> 이 문항은 최근에 손본 곳이 있습니다. 정답·해설·선택지 번호가 맞는지 확인해 주시고, 틀린 데가 있으면 아래 신고 버튼으로 알려주세요.</p>${fixed}` + els.questionStatus.innerHTML;
    }
    if (q.legacy === true && state.sessionMode !== "exam") {
      els.questionStatus.innerHTML = `<div class="status-badges"><span class="status-badge legacy">레거시</span></div><p><strong>레거시 안내:</strong> 이 문항이 다루는 기능이나 절차는 이후 변경·폐기되었습니다. 원본 정답은 그대로 채점하되 해설의 현행 참고를 함께 보세요. 과목별 풀이와 모의고사에서는 제외됩니다.</p>` + els.questionStatus.innerHTML;
    }
    if (q.inScope === false && state.sessionMode !== "exam") {
      els.questionStatus.innerHTML = `<div class="status-badges"><span class="status-badge out">출제범위 밖</span></div><p><strong>범위 안내:</strong> 2026년 4월 17일 기준 AZ-104 기술 목록에 직접 대응하는 항목이 없습니다. 개념 학습용으로는 유효하지만 우선순위는 낮추세요.</p>` + els.questionStatus.innerHTML;
    }
    if (state.sessionMode === "exam") els.questionStatus.innerHTML = `<div class="exam-mode-banner">모의고사 ${state.queue.length}문항 · 답안을 제출해도 정답/해설은 세션 종료 전까지 표시되지 않습니다.</div>`;
    renderHint(q);
    renderReportBar(q);
    els.questionImages.innerHTML = renderQuestionImages(q);
    bindImageZoomButtons();
    if (q.kind !== "auto" && !binaryAnswerSequence(q).length && q.source !== 132) bindInteractiveAnswerArea(q);
    els.questionText.textContent = q.questionText;
    if (els.imageWrap) {
      const t = q.questionText || "";
      const hasExhibit = /다음 표|전시|그림|HOTSPOT|핫스팟|끌어서|드래그/.test(t);
      const imgCount = (q.questionImages || []).length;
      els.imageWrap.open = hasExhibit || imgCount > 1;
      els.imageWrap.classList.toggle("hidden", imgCount === 0);
      if (els.imageSummary) els.imageSummary.textContent = hasExhibit
        ? "원본 이미지 · 표와 전시는 여기서 확인"
        : "원본 이미지 보기 · 위 텍스트가 교정본입니다";
    }
    els.feedback.className = "feedback hidden";
    els.explanation.className = "explanation hidden";
    els.explanation.innerHTML = "";
    renderControls(q, prior);
    els.questionJump.disabled = state.sessionMode === "exam";
    els.jumpButton.disabled = state.sessionMode === "exam";
    els.prevButton.disabled = state.cursor === 0;
    els.nextButton.textContent = state.cursor === state.queue.length - 1 ? "세션 완료" : "다음 →";
  }


  function hotspotMeta(q) {
    return q ? (hotspotKeys[String(q.source)] || null) : null;
  }

  const CBT_ASSET_BASE = (() => {
    const path = window.location.pathname || "";
    return new URL(path.includes("/AZ-104_CBT/") ? "./" : "./AZ-104_CBT/", document.baseURI);
  })();

  function resolveCbtAsset(src) {
    const value = String(src || "");
    if (!value || /^(?:https?:|data:|blob:|\/)/i.test(value)) return value;
    if (value.startsWith("assets/")) return new URL(value, CBT_ASSET_BASE).href;
    return value;
  }

  function effectiveQuestionImages(q) {
    const meta = hotspotMeta(q);
    const original = q?.questionImages || [];
    const replacements = meta?.questionImageReplacements;
    if (q?.kind !== "auto" && Array.isArray(replacements) && replacements.length === original.length) {
      // 정답 캔버스에는 PDF에서 추출한 교체 이미지를 절대 쓰지 않는다.
      // 문제/정답 페이지 오매핑 또는 정답 마킹 노출을 막기 위한 안전장치다.
      const protectedIndex = Number.isInteger(meta?.canvasIndex) ? meta.canvasIndex : original.length - 1;
      return original.map((src, i) => resolveCbtAsset((i === protectedIndex || i === original.length - 1) ? src : (replacements[i] || src)));
    }
    return original.map(resolveCbtAsset);
  }

  function effectiveAnswerImages(q) {
    const meta = hotspotMeta(q);
    const original = q?.answerImages || [];
    const replacements = meta?.answerImageReplacements;
    if (q?.kind !== "auto" && Array.isArray(replacements) && replacements.length === original.length) {
      return original.map((src, i) => resolveCbtAsset(replacements[i] || src));
    }
    return original.map(resolveCbtAsset);
  }

  function normalizedDecodedText(value) {
    return String(value || "")
      .replace(/앆\s*돼요/g, "아니요")
      .replace(/아니오/g, "아니요")
      .replace(/\r/g, "")
      .trim();
  }


  function settingValuePairs(q) {
    const meta = hotspotMeta(q);
    const text = normalizedDecodedText(meta?.sourceAnswerText || "");
    if (!text) return [];
    const pairs = [...text.matchAll(/(?:^|\n)\s*(\d+)\.\s*(.*?)\s*=\s*(Yes|No|예|아니요)\s*(?=\n|$)/gi)]
      .map(m => ({ index: Number(m[1]), label: m[2].trim(), value: m[3] }));
    return pairs.length >= 1 ? pairs : [];
  }

  const YN_PATTERN = /각 문에 대해|각 문장에 대해|참이면 예|예를 선택합니다|아니요를 선택/;
  function needsSelfBinary(q) {
    return q.kind !== "auto" && !binaryAnswerSequence(q).length && q.source !== 132 && YN_PATTERN.test(q.questionText || "");
  }

  function binaryAnswerSequence(q) {
    const ext = (window.AZ104_YN_ANSWERS || {})[String(q.source)];
    if (ext && Array.isArray(ext.answers) && ext.answers.length >= 2) return ext.answers.slice();
    const meta = hotspotMeta(q);
    const text = normalizedDecodedText(meta?.sourceAnswerText || "");
    if (!text) return [];
    const tokens = text.match(/아니요|예/g) || [];
    const residue = text.replace(/아니요|예|[\s,;:\-/]+/g, "");
    return tokens.length >= 2 && residue.length === 0 ? tokens : [];
  }

  function decodedAnswerItems(q) {
    const meta = hotspotMeta(q);
    const recognized = Array.isArray(meta?.recognizedAnswers) ? meta.recognizedAnswers.filter(Boolean) : [];
    if (recognized.length) return recognized.map((text, i) => ({ index: i + 1, text: normalizedDecodedText(text) }));
    const text = normalizedDecodedText(meta?.sourceAnswerText || "");
    if (!text) return [];
    const binary = binaryAnswerSequence(q);
    if (binary.length) return binary.map((value, i) => ({ index: i + 1, text: value }));
    const numbered = [...text.matchAll(/(?:^|\n)\s*(\d+)\.\s*([\s\S]*?)(?=(?:\n\s*\d+\.\s)|$)/g)]
      .map(m => ({ index: Number(m[1]), text: m[2].replace(/\s+/g, " ").trim() }))
      .filter(x => x.text);
    if (numbered.length) return numbered;
    const slash = text.split(/\s*\/\s*/).map(v => v.trim()).filter(Boolean);
    if (slash.length > 1) return slash.map((v, i) => ({ index: i + 1, text: v }));
    return [{ index: 1, text: text.replace(/\s+/g, " ") }];
  }

  function bindImageZoomButtons() {
    els.questionImages.querySelectorAll(".image-open-button").forEach(btn => btn.addEventListener("click", event => {
      event.stopPropagation();
      const src = btn.dataset.src;
      if (src) window.open(src, "_blank", "noopener");
    }));
  }

  function selfQuestionType(q) {
    const text = String(q.questionText || "").toLowerCase();
    if (/hotspot|핫\s*영역|hot\s*area|드롭다운 메뉴/.test(text)) return "hotspot";
    if (/선택 및 배치|드래그|drag and drop|drag-and-drop/.test(text)) return "placement";
    return "visual";
  }

  function posSpec(q) {
    const p = (window.AZ104_POSITIONS || {})[String(q.source)];
    return p && Array.isArray(p.boxes) && p.boxes.length ? p : null;
  }
  function hasPosGrading(q) {
    const p = posSpec(q);
    return q.kind !== "auto" && Boolean(p) && p.boxes.every(b => Number.isInteger(b.answer));
  }

  function choiceSpec(q) {
    const c = (window.AZ104_CHOICES || {})[String(q.source)];
    return c && Array.isArray(c.boxes) && c.boxes.length ? c : null;
  }
  function hasChoiceGrading(q) { return q.kind !== "auto" && Boolean(choiceSpec(q)); }

  function hasBinaryGrading(q) {
    return q.kind !== "auto" && binaryAnswerSequence(q).length >= 2;
  }

  function renderQuestionImages(q) {
    const type = q.kind === "auto" ? "auto" : selfQuestionType(q);
    const meta = hotspotMeta(q);
    const sources = effectiveQuestionImages(q);
    let canvasIndex = sources.length - 1;
    return sources.map((src, i) => {
      const hires = q.kind !== "auto" && Boolean(meta?.questionImageReplacements?.[i]);
      const img = `<img src="${escapeHtml(src)}" alt="원본 Q${q.source} 문제${sources.length > 1 ? ` ${i+1}` : ""}" loading="${i ? "lazy" : "eager"}">`;
      if (q.kind === "auto") return img;
      const binaryMode = hasBinaryGrading(q) || hasChoiceGrading(q) || Boolean(posSpec(q));
      const isAnswerCanvas = i === canvasIndex && !binaryMode;
      // 전 문항이 자동채점으로 전환되어 좌표 클릭은 쓰이지 않는다. 이미지와 확대 버튼만 둔다.
      return `<div class="hotspot-image-block reference-canvas">
        <div class="hotspot-canvas-label muted"><span></span><button type="button" class="image-open-button" data-src="${escapeHtml(src)}">원본 크기 보기</button></div>
        <div class="hotspot-stage" data-hotspot-index="${i}">${img}</div>
      </div>`;
    }).join("");
  }

  function bindInteractiveAnswerArea(q) {
    const stage = els.questionImages.querySelector(".hotspot-stage.interactive");
    if (!stage) return;
    stage.addEventListener("click", (event) => {
      if (view.revealed || view.graded || event.target.closest(".hotspot-marker")) return;
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const marker = {
        id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2,5)}`,
        x: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)),
        y: Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))
      };
      const key = stage.dataset.hotspotIndex;
      view.hotspots[key] = view.hotspots[key] || [];
      view.hotspots[key].push(marker);
      view.hotspotOrder.push({ key, id: marker.id });
      drawHotspotMarkers();
      updateHotspotToolbar(q);
    });
    drawHotspotMarkers();
  }

  function hotspotTotal() {
    return Object.values(view.hotspots).reduce((sum, list) => sum + list.length, 0);
  }

  function drawHotspotMarkers() {
    els.questionImages.querySelectorAll(".hotspot-marker-layer").forEach(layer => {
      const stage = layer.closest(".hotspot-stage");
      const key = stage?.dataset.hotspotIndex;
      const list = view.hotspots[key] || [];
      layer.innerHTML = list.map((m, idx) => `<button type="button" class="hotspot-marker" data-marker-id="${m.id}" style="left:${m.x}%;top:${m.y}%" title="선택 ${idx + 1} 제거"><span>${idx + 1}</span></button>`).join("");
      layer.querySelectorAll(".hotspot-marker").forEach(btn => btn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (view.revealed || view.graded) return;
        const id = btn.dataset.markerId;
        view.hotspots[key] = (view.hotspots[key] || []).filter(m => m.id !== id);
        view.hotspotOrder = view.hotspotOrder.filter(item => item.id !== id);
        drawHotspotMarkers();
        updateHotspotToolbar(currentQuestion());
      }));
    });
  }

  function undoHotspot() {
    const last = view.hotspotOrder.pop();
    if (!last) return;
    view.hotspots[last.key] = (view.hotspots[last.key] || []).filter(m => m.id !== last.id);
    drawHotspotMarkers();
    updateHotspotToolbar(currentQuestion());
  }

  function clearHotspots() {
    view.hotspots = {};
    view.hotspotOrder = [];
    drawHotspotMarkers();
    updateHotspotToolbar(currentQuestion());
  }

  function updateHotspotToolbar(q) {
    if (!q || q.kind === "auto") return;
    const count = hotspotTotal();
    const countEl = $("hotspotCount");
    if (countEl) countEl.textContent = `${count}개 선택`;
    const reveal = $("revealAnswer");
    if (reveal) reveal.disabled = count === 0 || view.revealed;
    const undo = $("undoHotspot");
    if (undo) undo.disabled = count === 0 || view.revealed;
    const clear = $("clearHotspot");
    if (clear) clear.disabled = count === 0 || view.revealed;
  }

  function q132Settings() {
    return [
      { key:"registerApps", label:"Users can register applications", values:["변경 안 함","Yes","No"], correct:"No" },
      { key:"createTenants", label:"Restrict non-admin users from creating tenants", values:["변경 안 함","Yes","No"], correct:"변경 안 함" },
      { key:"createGroups", label:"Users can create security groups", values:["변경 안 함","Yes","No"], correct:"변경 안 함" },
      { key:"adminPortal", label:"Restrict access to Azure AD administration portal", values:["변경 안 함","Yes","No"], correct:"Yes" },
      { key:"linkedin", label:"Allow users to connect their work or school account with LinkedIn", values:["변경 안 함","Yes","No"], correct:"변경 안 함" },
      { key:"keepSignedIn", label:"Show keep user signed in", values:["변경 안 함","Yes","No"], correct:"변경 안 함" }
    ];
  }

  function selectQ132Setting(key, value) {
    if (view.graded) return;
    view.binaryAnswers[key] = value;
    els.answerControls.querySelectorAll(`[data-q132-key="${key}"]`).forEach(btn => btn.classList.toggle("selected", btn.dataset.q132Value === value));
    const complete = q132Settings().every(row => Boolean(view.binaryAnswers[row.key]));
    const submit = $("submitQ132");
    if (submit) submit.disabled = !complete;
  }

  function submitQ132() {
    const q = currentQuestion();
    if (!q || q.source !== 132 || view.graded) return;
    const rows = q132Settings();
    const isCorrect = rows.every(row => view.binaryAnswers[row.key] === row.correct);
    view.graded = true; view.revealed = true;
    updateRecord(q, isCorrect ? "correct" : "wrong", rows.map(r => `${r.label}=${view.binaryAnswers[r.key]}`), { decodedSettingAutoGrade:true, antiLeakUI:true });
    els.answerControls.querySelectorAll("button").forEach(btn => btn.disabled = true);
    els.feedback.className = `feedback ${isCorrect ? "correct" : "wrong"}`;
    els.feedback.innerHTML = `<strong>${isCorrect ? "정답입니다." : "오답입니다."}</strong><span>정답 설정은 제출 후 해설에서 확인하세요.</span>`;
    showExplanation(q);
  }

  function optionTextMap(q) {
    const map = {};
    const re = /^([A-F])\.[ \t]*(.+?)[ \t]*$/gm;
    let mm;
    while ((mm = re.exec(q.questionText || "")) !== null) {
      const body = mm[2].trim();
      if (body && !map[mm[1]]) map[mm[1]] = body;
    }
    return map;
  }

  function renderControls(q, prior) {
    const opts = optionTextMap(q);
    const hasText = q.options.some(l => opts[l]);
    const priorLabel = state.sessionMode === "exam" ? "<small>답안을 선택하고 제출하세요. 이전 학습 기록은 표시하지 않습니다.</small>" : (prior.result ? `<small>이전 기록: ${prior.result === "correct" ? "정답" : "오답"} · ${prior.attempts || 1}회 풀이</small>` : (hasText ? "<small>아래 보기는 원문 대조로 교정된 텍스트입니다. 문제 이미지의 번역과 다르면 이쪽이 맞습니다.</small>" : "<small>선택지는 문제 이미지에서 확인하세요.</small>"));
    if (q.kind === "auto") {
      els.answerControls.innerHTML = `
        <h2 class="answer-title">답을 선택하세요 <span style="font-weight:400;color:var(--muted)">(복수 선택 가능)</span></h2>
        <div class="choice-row${hasText ? " with-text" : ""}">${q.options.map((letter, i) => `<button class="choice" data-letter="${letter}" title="키보드 ${i+1}"><span class="choice-letter">${letter}</span>${opts[letter] ? `<span class="choice-text">${escapeHtml(opts[letter])}</span>` : ""}</button>`).join("")}</div>
        <div class="submit-row">${priorLabel}<button class="primary" id="submitAnswer" disabled>정답 확인</button></div>`;
      els.answerControls.querySelectorAll(".choice").forEach(btn => btn.addEventListener("click", () => toggleChoice(btn.dataset.letter)));
      $("submitAnswer").addEventListener("click", submitAutoAnswer);
    } else {
      const selfType = selfQuestionType(q);
      const meta = hotspotMeta(q);
      const pairs = settingValuePairs(q);
      const binary = binaryAnswerSequence(q);
      const title = selfType === "placement" ? "선택 및 배치 인터랙티브 연습" : (selfType === "hotspot" ? "HOTSPOT 인터랙티브 연습" : "이미지형 인터랙티브 연습");
      if (q.source === 132) {
        const rows = q132Settings();
        els.answerControls.innerHTML = `
          <h2 class="answer-title">${title} · 설정 선택 자동채점</h2>
          <p class="self-instruction">정답 설정 이름을 미리 보여주지 않습니다. 문제의 요구사항을 보고 아래 전체 설정 중 무엇을 바꿀지 직접 결정하세요. 각 행은 '변경 안 함'을 포함해 하나를 선택합니다.</p>
          <div class="binary-answer-grid">${rows.map(row => `<div class="binary-answer-row decoded-setting-row"><strong>${escapeHtml(row.label)}</strong><div>${row.values.map(v => `<button data-q132-key="${row.key}" data-q132-value="${v}">${v}</button>`).join("")}</div></div>`).join("")}</div>
          <div class="submit-row">${priorLabel}<button class="primary" id="submitQ132" disabled>정답 확인</button></div>`;
        els.answerControls.querySelectorAll("[data-q132-key]").forEach(btn => btn.addEventListener("click", () => selectQ132Setting(btn.dataset.q132Key, btn.dataset.q132Value)));
        $("submitQ132").addEventListener("click", submitQ132);
      } else if (binary.length) {
        els.answerControls.innerHTML = `
          <h2 class="answer-title">${title} · Yes/No 응답 자동채점</h2>
          <p class="self-instruction">문제 이미지의 각 문장을 직접 판단해 예/아니요를 선택하세요. 정답 판독 데이터는 제출할 때까지 숨겨져 있으며 문제 화면에는 사용되지 않습니다.</p>
          <div class="binary-answer-grid">${binary.map((_, i) => `<div class="binary-answer-row"><strong>문장 ${i+1}</strong><div><button data-binary-slot="${i}" data-binary-value="예">예</button><button data-binary-slot="${i}" data-binary-value="아니요">아니요</button></div></div>`).join("")}</div>
          <div class="submit-row">${priorLabel}<button class="primary" id="submitBinaryHotspot" disabled>정답 확인</button></div>`;
        els.answerControls.querySelectorAll("[data-binary-slot]").forEach(btn => btn.addEventListener("click", () => selectBinaryAnswer(Number(btn.dataset.binarySlot), btn.dataset.binaryValue)));
        $("submitBinaryHotspot").addEventListener("click", submitBinaryHotspot);
      } else if (posSpec(q)) {
        const spec = posSpec(q);
        const gradable = hasPosGrading(q);
        els.answerControls.innerHTML = `
          <h2 class="answer-title">${title} · 위치 선택</h2>
          <p class="self-instruction">위 답안 영역 이미지에서 각 드롭다운을 펼친 순서대로 <strong>몇 번째 항목</strong>이 정답인지 고르세요. 자동으로 채점됩니다.</p>
          <div class="pos-boxes">${spec.boxes.map((b, i) => `
            <div class="pos-box"><strong>${escapeHtml(b.label || ("항목 " + (i + 1)))}</strong>
              <div class="pos-row">${Array.from({ length: b.count || 5 }, (_, j) => `<button class="pos-btn" data-box="${i}" data-pick="${j + 1}">${j + 1}</button>`).join("")}</div>
            </div>`).join("")}</div>
          <div class="submit-row">${priorLabel}<button class="primary" id="submitPos" disabled>답안 제출</button></div>`;
        view.posPicks = {};
        els.answerControls.querySelectorAll(".pos-btn").forEach(btn => btn.addEventListener("click", () => {
          const b = btn.dataset.box;
          view.posPicks[b] = Number(btn.dataset.pick);
          els.answerControls.querySelectorAll(`.pos-btn[data-box="${b}"]`).forEach(x => x.classList.remove("selected"));
          btn.classList.add("selected");
          $("submitPos").disabled = spec.boxes.some((_, i) => !view.posPicks[String(i)]);
        }));
        $("submitPos").addEventListener("click", () => submitPositions(spec, gradable));
      } else if (hasChoiceGrading(q)) {
        const spec = choiceSpec(q);
        els.answerControls.innerHTML = `
          <h2 class="answer-title">${title} · 선택지 응답</h2>
          <p class="self-instruction">각 항목에서 올바른 값을 고르세요. 자동으로 채점됩니다.</p>
          <div class="choice-boxes">${spec.boxes.map((b, i) => `
            <div class="choice-box"><strong>${escapeHtml(b.label || ("항목 " + (i + 1)))}</strong>
              <select data-box="${i}"><option value="">선택하세요</option>${b.options.map((o, j) => `<option value="${j}">${escapeHtml(o)}</option>`).join("")}</select>
            </div>`).join("")}</div>
          <div class="submit-row">${priorLabel}<button class="primary" id="submitChoices" disabled>답안 제출</button></div>`;
        const sels = [...els.answerControls.querySelectorAll("select[data-box]")];
        const sync = () => { $("submitChoices").disabled = sels.some(x => x.value === ""); };
        sels.forEach(x => x.addEventListener("change", sync));
        $("submitChoices").addEventListener("click", () => submitChoices(spec, sels));
      } else if (needsSelfBinary(q)) {
        const n = view.selfBinaryRows || 3;
        els.answerControls.innerHTML = `
          <h2 class="answer-title">${title} · Yes/No 응답</h2>
          <p class="self-instruction">문제의 각 문장을 판단해 예/아니요를 선택하세요. 이 문항은 정답 판독 데이터가 없어 제출 후 원본 정답 이미지와 직접 비교합니다.</p>
          <div class="rowcount-row">문장 수 <button id="rowMinus">−</button><strong id="rowCount">${n}</strong><button id="rowPlus">+</button></div>
          <div class="binary-answer-grid">${Array.from({length:n},(_,i)=>`<div class="binary-answer-row"><strong>문장 ${i+1}</strong><div><button data-binary-slot="${i}" data-binary-value="예">예</button><button data-binary-slot="${i}" data-binary-value="아니요">아니요</button></div></div>`).join("")}</div>
          <div class="submit-row">${priorLabel}<button class="primary" id="submitSelfBinary" disabled>답안 제출 · 정답 비교</button></div>`;
        els.answerControls.querySelectorAll("[data-binary-slot]").forEach(btn => btn.addEventListener("click", () => selectBinaryAnswer(Number(btn.dataset.binarySlot), btn.dataset.binaryValue)));
        $("rowMinus").addEventListener("click", () => { view.selfBinaryRows = Math.max(2, (view.selfBinaryRows || 3) - 1); view.binaryAnswers = {}; renderControls(q, prior); });
        $("rowPlus").addEventListener("click", () => { view.selfBinaryRows = Math.min(6, (view.selfBinaryRows || 3) + 1); view.binaryAnswers = {}; renderControls(q, prior); });
        $("submitSelfBinary").addEventListener("click", submitSelfBinary);
        updateBinaryButtons(q);
      } else {
        const decoded = decodedAnswerItems(q);
        const instruction = selfType === "placement"
          ? "답변 영역에서 배치할 항목을 순서대로 클릭하세요. 클릭 순서가 1, 2, 3…으로 표시됩니다."
          : "답변 영역을 실제 시험처럼 클릭하세요. 선택 위치가 번호 마커로 남습니다.";
        const decodeNote = decoded.length ? " 정답 판독 데이터는 채점용으로만 보관되며 제출 전에는 어떤 항목도 공개하지 않습니다." : " 좌표 판독이 불확실한 문항은 제출 후 원본 정답과 비교합니다.";
        els.answerControls.innerHTML = `
          <h2 class="answer-title">${title}${meta?.autoGrade ? " · 자동 좌표 채점" : ""}</h2>
          <p class="self-instruction">${instruction}${decodeNote}</p>
          <div class="hotspot-toolbar"><strong id="hotspotCount">0개 선택</strong><div><button id="undoHotspot" disabled>마지막 선택 취소</button><button id="clearHotspot" disabled>전체 지우기</button></div></div>
          <div class="submit-row">${priorLabel}<button class="primary" id="revealAnswer" disabled>답안 제출 · 정답 판독</button></div>`;
        $("undoHotspot").addEventListener("click", undoHotspot);
        $("clearHotspot").addEventListener("click", clearHotspots);
        $("revealAnswer").addEventListener("click", revealSelfAnswer);
        updateHotspotToolbar(q);
      }
    }
  }



  function selectDecodedPair(slot, value) {
    if (view.graded) return;
    view.binaryAnswers[String(slot)] = value;
    els.answerControls.querySelectorAll(`[data-pair-slot="${slot}"]`).forEach(btn => btn.classList.toggle("selected", btn.dataset.pairValue === value));
    const expected = settingValuePairs(currentQuestion());
    const complete = expected.every((_, i) => Boolean(view.binaryAnswers[String(i)]));
    const submit = $("submitDecodedPairs");
    if (submit) submit.disabled = !complete;
  }

  function submitDecodedPairs() {
    const q = currentQuestion();
    const pairs = settingValuePairs(q);
    if (!q || view.graded || !pairs.length) return;
    const selected = pairs.map((_, i) => view.binaryAnswers[String(i)] || "");
    if (selected.some(v => !v)) return;
    const isCorrect = selected.every((v, i) => v.toLowerCase() === String(pairs[i].value).toLowerCase());
    view.graded = true;
    view.revealed = true;
    updateRecord(q, isCorrect ? "correct" : "wrong", selected, { selfType: selfQuestionType(q), decodedSettingAutoGrade: true });
    els.answerControls.querySelectorAll("button").forEach(btn => btn.disabled = true);
    els.feedback.className = `feedback ${isCorrect ? "correct" : "wrong"}`;
    els.feedback.innerHTML = `<strong>${isCorrect ? "정답입니다." : "오답입니다."}</strong><span>내 설정: ${escapeHtml(selected.join(" / "))} · 원본 PDF 판독 정답: ${escapeHtml(pairs.map(p => p.value).join(" / "))}</span>`;
    showExplanation(q);
  }

  function selectBinaryAnswer(slot, value) {
    if (view.graded) return;
    view.binaryAnswers[String(slot)] = value;
    els.answerControls.querySelectorAll(`[data-binary-slot="${slot}"]`).forEach(btn => btn.classList.toggle("selected", btn.dataset.binaryValue === value));
    const q = currentQuestion();
    const expected = binaryAnswerSequence(q);
    const rows = expected.length || (view.selfBinaryRows || 3);
    const complete = Array.from({ length: rows }).every((_, i) => Boolean(view.binaryAnswers[String(i)]));
    const submit = $("submitBinaryHotspot") || $("submitSelfBinary");
    if (submit) submit.disabled = !complete;
  }

  function updateBinaryButtons(q) {
    els.answerControls.querySelectorAll("[data-binary-slot]").forEach(btn => {
      btn.classList.toggle("selected", view.binaryAnswers[btn.dataset.binarySlot] === btn.dataset.binaryValue);
    });
  }

  function submitPositions(spec, gradable) {
    const q = currentQuestion();
    if (!q || view.graded) return;
    const picks = spec.boxes.map((_, i) => view.posPicks[String(i)]);
    view.revealed = true;
    els.answerControls.querySelectorAll("button").forEach(b => b.disabled = true);
    if (gradable) {
      const ok = spec.boxes.every((b, i) => picks[i] === b.answer);
      view.graded = true;
      const detail = spec.boxes.map((b, i) => {
        const good = picks[i] === b.answer;
        return `<li class="${good ? "ok" : "bad"}"><strong>${escapeHtml(b.label || ("항목 " + (i + 1)))}</strong> — 내 답 ${picks[i]}번${good ? "" : ` · 정답 ${b.answer}번`}</li>`;
      }).join("");
      updateRecord(q, ok ? "correct" : "wrong", picks.map(String), { selfType: "positions" });
      els.feedback.className = `feedback ${ok ? "correct" : "wrong"}`;
      els.feedback.innerHTML = `<strong>${ok ? "정답입니다." : "오답입니다."}</strong><ul class="choice-result">${detail}</ul>`;
      if (state.sessionMode !== "exam") showExplanation(q);
    } else {
      showExplanation(q);
      els.feedback.className = "feedback neutral";
      els.feedback.innerHTML = `<strong>내 답: ${picks.join(" / ")}번</strong><span>이 문항은 정답 데이터가 아직 없습니다. 해설과 원본 답안 이미지로 확인한 뒤 기록하세요.</span><div class="self-grade"><button class="correct-button" id="selfCorrect">맞음</button><button class="wrong-button" id="selfWrong">틀림</button></div>`;
      $("selfCorrect").addEventListener("click", () => selfGradeBinary("correct", picks.map(String)));
      $("selfWrong").addEventListener("click", () => selfGradeBinary("wrong", picks.map(String)));
    }
  }

  function submitChoices(spec, sels) {
    const q = currentQuestion();
    if (!q || view.graded) return;
    const picked = sels.map(x => Number(x.value));
    const okAll = spec.boxes.every((b, i) => picked[i] === b.answer);
    view.graded = true;
    view.revealed = true;
    sels.forEach(x => x.disabled = true);
    $("submitChoices").disabled = true;
    const detail = spec.boxes.map((b, i) => {
      const good = picked[i] === b.answer;
      return `<li class="${good ? "ok" : "bad"}"><strong>${escapeHtml(b.label || ("항목 " + (i + 1)))}</strong> — 내 답 ${escapeHtml(b.options[picked[i]] || "-")}${good ? "" : ` · 정답 ${escapeHtml(b.options[b.answer])}`}</li>`;
    }).join("");
    updateRecord(q, okAll ? "correct" : "wrong", picked.map(String), { selfType: "choices" });
    if (state.sessionMode === "exam") {
      els.feedback.className = "feedback neutral";
      els.feedback.innerHTML = `<strong>답안이 저장되었습니다.</strong><span>정답과 해설은 모의고사를 모두 마친 뒤 확인할 수 있습니다.</span>`;
      return;
    }
    els.feedback.className = `feedback ${okAll ? "correct" : "wrong"}`;
    els.feedback.innerHTML = `<strong>${okAll ? "정답입니다." : "오답입니다."}</strong><ul class="choice-result">${detail}</ul>`;
    showExplanation(q);
  }

  function submitSelfBinary() {
    const q = currentQuestion();
    if (!q || view.graded) return;
    const rows = view.selfBinaryRows || 3;
    const selected = Array.from({ length: rows }, (_, i) => view.binaryAnswers[String(i)] || "");
    if (selected.some(v => !v)) return;
    view.revealed = true;
    els.answerControls.querySelectorAll("button").forEach(btn => btn.disabled = true);
    showExplanation(q);
    els.feedback.className = "feedback neutral";
    els.feedback.innerHTML = `<strong>내 답: ${escapeHtml(selected.join(" / "))}</strong><span>이 문항은 정답 판독 데이터가 없습니다. 아래 해설의 원본 정답 이미지와 비교한 뒤 결과를 기록하세요.</span><div class="self-grade"><button class="correct-button" id="selfCorrect">내 답안이 맞음</button><button class="wrong-button" id="selfWrong">내 답안이 틀림</button></div>`;
    $("selfCorrect").addEventListener("click", () => selfGradeBinary("correct", selected));
    $("selfWrong").addEventListener("click", () => selfGradeBinary("wrong", selected));
  }

  function selfGradeBinary(result, selected) {
    const q = currentQuestion();
    if (!q || view.graded) return;
    view.graded = true;
    updateRecord(q, result, selected, { selfType: selfQuestionType(q), selfBinary: true });
    els.feedback.className = `feedback ${result === "correct" ? "correct" : "wrong"}`;
    els.feedback.innerHTML = `<strong>${result === "correct" ? "정답으로 기록했습니다." : "오답으로 기록했습니다."}</strong><span>내 답: ${escapeHtml(selected.join(" / "))}</span>`;
  }

  function submitBinaryHotspot() {
    const q = currentQuestion();
    const expected = binaryAnswerSequence(q);
    if (!q || view.graded || !expected.length) return;
    const selected = expected.map((_, i) => view.binaryAnswers[String(i)] || "");
    if (selected.some(v => !v)) return;
    const isCorrect = selected.every((v, i) => v === expected[i]);
    view.graded = true;
    view.revealed = true;
    updateRecord(q, isCorrect ? "correct" : "wrong", selected, { selfType: selfQuestionType(q), decodedAutoGrade: true });
    els.answerControls.querySelectorAll("button").forEach(btn => btn.disabled = true);
    if (state.sessionMode === "exam") {
      els.feedback.className = "feedback neutral";
      els.feedback.innerHTML = `<strong>답안이 저장되었습니다.</strong><span>정답과 해설은 모의고사를 모두 마친 뒤 확인할 수 있습니다.</span>`;
      return;
    }
    els.feedback.className = `feedback ${isCorrect ? "correct" : "wrong"}`;
    els.feedback.innerHTML = `<strong>${isCorrect ? "정답입니다." : "오답입니다."}</strong><span>내 답: ${escapeHtml(selected.join(" / "))} · 정답: ${escapeHtml(expected.join(" / "))}</span>`;
    showExplanation(q);
  }

  function pointInRegion(point, region) {
    return point.x >= region.x && point.x <= region.x + region.w && point.y >= region.y && point.y <= region.y + region.h;
  }

  function gradeHotspotRegions(q) {
    const meta = hotspotMeta(q);
    if (!meta?.autoGrade || !Array.isArray(meta.regions) || !meta.regions.length) return null;
    const points = Object.values(view.hotspots).flat();
    if (points.length !== meta.regions.length) return false;
    const used = new Set();
    return meta.regions.every(region => {
      const idx = points.findIndex((point, i) => !used.has(i) && pointInRegion(point, region));
      if (idx < 0) return false;
      used.add(idx);
      return true;
    });
  }

  function toggleChoice(letter) {
    if (view.graded) return;
    view.selected.has(letter) ? view.selected.delete(letter) : view.selected.add(letter);
    els.answerControls.querySelectorAll(".choice").forEach(btn => btn.classList.toggle("selected", view.selected.has(btn.dataset.letter)));
    $("submitAnswer").disabled = view.selected.size === 0;
  }

  function sameSet(a, b) {
    return a.length === b.length && a.every(value => b.includes(value));
  }

  function submitAutoAnswer() {
    const q = currentQuestion();
    if (!q || view.graded || !view.selected.size) return;
    const selected = [...view.selected].sort();
    const correct = [...q.correct].sort();
    const isCorrect = sameSet(selected, correct);
    view.graded = true;
    view.revealed = state.sessionMode !== "exam" && !isCorrect;
    if (state.sessionMode === "exam") {
      updateRecord(q, isCorrect ? "correct" : "wrong", selected);
      els.feedback.className = "feedback neutral";
      els.feedback.innerHTML = `<strong>답안이 저장되었습니다.</strong><span>정답과 해설은 모의고사를 모두 마친 뒤 확인할 수 있습니다.</span>`;
    } else {
      updateRecord(q, isCorrect ? "correct" : "wrong", selected);
      showFeedback(isCorrect, q);
      if (!isCorrect) showExplanation(q);
      else {
        els.feedback.insertAdjacentHTML("beforeend", `<button id="optionalExplanation" style="margin-top:10px">해설 보기</button>`);
        $("optionalExplanation").addEventListener("click", () => showExplanation(q));
      }
    }
    els.answerControls.querySelectorAll("button").forEach(btn => btn.disabled = true);
  }

  function revealSelfAnswer() {
    const q = currentQuestion();
    if (!q || view.revealed || hotspotTotal() === 0) return;
    view.revealed = true;
    els.questionImages.querySelectorAll(".hotspot-stage.interactive").forEach(stage => stage.classList.add("locked"));
    const autoResult = gradeHotspotRegions(q);
    showExplanation(q);
    if (autoResult !== null) {
      view.graded = true;
      const hotspotSnapshot = JSON.parse(JSON.stringify(view.hotspots));
      updateRecord(q, autoResult ? "correct" : "wrong", [], { hotspots: hotspotSnapshot, selfType: selfQuestionType(q), coordinateAutoGrade: true });
      els.feedback.className = `feedback ${autoResult ? "correct" : "wrong"}`;
      els.feedback.innerHTML = `<strong>${autoResult ? "정답입니다." : "오답입니다."}</strong><span>원본 답안 이미지에서 검증한 선택 영역과 클릭 위치를 자동 비교했습니다. 아래에서 각 설정이 실제로 무엇을 바꾸는지도 확인하세요.</span>`;
    } else {
      const decoded = decodedAnswerItems(q);
      els.feedback.className = "feedback neutral";
      els.feedback.innerHTML = `<strong>내 답안 ${hotspotTotal()}개가 고정되었습니다.</strong><span>${decoded.length ? "원본 PDF에서 판독한 정답 항목을 아래 해설에 표시했습니다. 클릭 위치와 정답 항목을 비교한 뒤 결과를 기록하세요." : "이 문항은 좌표 판독 신뢰도가 충분하지 않아 고화질 원본 정답과 직접 비교합니다."}</span><div class="self-grade"><button class="correct-button" id="selfCorrect">내 답안이 맞음</button><button class="wrong-button" id="selfWrong">내 답안이 틀림</button></div>`;
      $("selfCorrect").addEventListener("click", () => selfGrade("correct"));
      $("selfWrong").addEventListener("click", () => selfGrade("wrong"));
    }
    updateHotspotToolbar(q);
  }

  function selfGrade(result) {
    const q = currentQuestion();
    if (!q || view.graded) return;
    view.graded = true;
    const hotspotSnapshot = JSON.parse(JSON.stringify(view.hotspots));
    updateRecord(q, result, [], { hotspots: hotspotSnapshot, selfType: selfQuestionType(q) });
    els.feedback.className = `feedback ${result}`;
    els.feedback.innerHTML = `<strong>${result === "correct" ? "정답으로 기록했습니다." : "오답으로 기록했습니다."}</strong><span>${result === "wrong" ? "클릭 위치도 저장했습니다. 오답 세션에서 다시 비교해보세요." : "클릭 위치가 기록되었습니다. 다음 문제로 진행하세요."}</span>`;
  }

  function updateRecord(q, result, selected, extra = {}) {
    // 모의고사 중에는 학습 기록을 바꾸지 않는다. 채점은 세션 종료 시 한 번에 반영한다.
    if (state.sessionMode === "exam") {
      if (result === "correct" || result === "wrong") {
        state.examSessionResults = state.examSessionResults || {};
        state.examSessionResults[String(q.source)] = { result, selected };
      }
      saveState();
      return;
    }
    const old = recordFor(q.source);
    state.progress[String(q.source)] = {
      ...old, result, selected, ...extra, attempts: (old.attempts || 0) + 1, updatedAt: new Date().toISOString()
    };
    saveState();
  }

  function showFeedback(isCorrect, q) {
    els.feedback.className = `feedback ${isCorrect ? "correct" : "wrong"}`;
    els.feedback.innerHTML = isCorrect
      ? "<strong>정답입니다.</strong><span>판단이 정확합니다. 다음 문제로 진행하거나 해설을 확인할 수 있습니다.</span>"
      : `<strong>오답입니다.</strong><span>선택: ${escapeHtml([...view.selected].sort().join(", "))} · 정답: ${escapeHtml(q.correct.join(", "))}</span>`;
  }

  function extractOptionTexts(q) {
    const found = {};
    const text = String(q.questionText || "").replace(/\r/g, "");
    const matches = [...text.matchAll(/(?:^|\n)([A-H])\.\s*([\s\S]*?)(?=\n[A-H]\.\s|$)/g)];
    matches.forEach(match => { found[match[1]] = match[2].replace(/\s+/g, " ").trim(); });
    return found;
  }

  function specificChoiceReason(text, isCorrect, assessment) {
    const value = String(text || "");
    if (/\bReader\b/i.test(value)) return "Reader는 읽기만 허용하고 쓰기/삭제/권한 부여는 하지 못합니다.";
    if (/\bContributor\b/i.test(value)) return "Contributor는 리소스를 수정할 수 있지만 다른 사용자에게 권한을 부여하는 역할은 아닙니다.";
    if (/User Access Administrator/i.test(value)) return "User Access Administrator는 Azure 리소스 변경권보다 권한 관리에 초점이 있습니다.";
    if (/\bOwner\b/i.test(value)) return "Owner는 가장 넓은 범위의 권한을 가지며, 권한 위임도 가능합니다.";
    if (/CanNotDelete|삭제 방지/i.test(value)) return "CanNotDelete는 삭제만 막고 속성 변경은 허용합니다.";
    if (/ReadOnly|읽기 전용/i.test(value)) return "ReadOnly는 변경과 삭제를 모두 막기 때문에 CanNotDelete보다 더 강합니다.";
    if (/\bAudit\b/i.test(value)) return "Audit은 차단이 아니라 기록입니다.";
    if (/\bDeny\b/i.test(value)) return "Deny는 정책 조건을 만족하면 작업 자체를 막습니다.";
    if (/DeployIfNotExists/i.test(value)) return "DeployIfNotExists는 조건 충족 시 보완 리소스를 자동으로 붙입니다.";
    if (/\bModify\b/i.test(value)) return "Modify는 정책이나 태그 같은 속성을 자동 수정하는 효과입니다.";
    if (/\bLRS\b/i.test(value)) return "LRS는 단일 지역 내 복제라서 지역 장애까지는 대비하지 않습니다.";
    if (/\bZRS\b/i.test(value)) return "ZRS는 동일 지역 내 가용영역 복제로, 지역 간 복제는 아닙니다.";
    if (/\bRA-GRS\b|\bRA-GZRS\b/i.test(value)) return "RA 계열은 보조 지역 읽기 가능 여부를 함께 봐야 합니다.";
    if (/\bGRS\b|\bGZRS\b/i.test(value)) return "GRS 계열은 보조 지역 복제가 핵심입니다.";
    if (/deallocate|할당 취소/i.test(value)) return "할당 취소는 VM을 완전히 멈추고 컴퓨트 과금을 중지할 때 사용합니다.";
    if (/availability zone|가용성 영역/i.test(value)) return "가용성 영역은 Azure 지역 내 물리적으로 분리된 위치입니다.";
    if (/availability set|가용성 집합/i.test(value)) return "가용성 집합은 같은 데이터센터 안에서 분산합니다.";
    if (/service SAS|서비스 SAS/i.test(value)) return "서비스 SAS는 Storage 서비스의 특정 리소스에 대한 위임에 사용합니다.";
    if (/account SAS|계정 SAS/i.test(value)) return "계정 SAS는 여러 Storage 서비스에 걸친 더 넓은 범위를 가질 수 있습니다.";
    if (/user delegation SAS|사용자 위임 SAS/i.test(value)) return "사용자 위임 SAS는 계정 키가 아니라 Microsoft Entra 자격 증명으로 서명합니다.";
    if (/peering|피어링/i.test(value)) return "VNet 피어링은 네트워크 연결 자체를 여는 것이고, 주소 공간이 겹치면 안 됩니다.";
    if (/Azure Monitor$/i.test(value) || /^Azure 모니터$/i.test(value)) return "Azure Monitor는 Azure 리소스의 메트릭·로그·경고를 통합 관찰하는 서비스입니다. 성능 메트릭 원인 분석은 이 범주에서 시작합니다.";
    if (/Activity Log|활동 로그/i.test(value)) return "Activity Log는 구독 수준의 제어 평면 작업(생성, 삭제, 설정 변경 등)을 기록합니다. VM 내부 성능 메트릭을 대신하는 도구는 아닙니다.";
    if (/Advisor|어드바이저|고문/i.test(value)) return "Azure Advisor는 비용, 신뢰성, 성능, 보안 등의 권장 사항을 제시합니다. 원시 메트릭을 직접 분석하는 화면과 목적이 다릅니다.";
    if (/Traffic Analytics|트래픽 분석/i.test(value)) return "Traffic Analytics는 네트워크 흐름 데이터를 집계해 통신 패턴을 분석하는 기능입니다. 일반 리소스 성능 메트릭 전체를 보는 도구는 아닙니다.";
    if (/New-AzVM/i.test(value)) return "New-AzVM은 현재 Az PowerShell 모듈에서 Azure VM을 만드는 cmdlet입니다.";
    if (/New-AzureRmVM/i.test(value)) return "New-AzureRmVM은 폐기된 AzureRM PowerShell 계열 cmdlet입니다. 현행 자동화는 Az 모듈을 기준으로 봅니다.";
    if (/az vm create/i.test(value)) return "az vm create는 Azure CLI에서 VM을 생성하는 명령입니다. 문제에서 PowerShell cmdlet을 요구하는지 CLI 명령을 요구하는지 구분해야 합니다.";
    if (/Network Watcher|네트워크 감시/i.test(value)) return "Network Watcher는 연결 진단, 토폴로지, 흐름/패킷 수준의 네트워크 문제 해결에 사용합니다.";
    if (/Private Endpoint|프라이빗 엔드포인트/i.test(value)) return "Private Endpoint는 PaaS 서비스에 VNet의 사설 IP를 제공해 사설 경로로 접근하게 합니다.";
    if (/Service Endpoint|서비스 엔드포인트/i.test(value)) return "Service Endpoint는 서브넷의 ID를 PaaS 서비스 방화벽에 확장하지만 서비스 자체에 VNet 사설 IP를 만드는 것은 아닙니다.";
    if (/Bastion/i.test(value)) return "Azure Bastion은 VM에 공용 IP를 직접 노출하지 않고 Azure Portal을 통한 RDP/SSH 관리 접속을 제공합니다.";
    if (/ExpressRoute/i.test(value)) return "ExpressRoute는 인터넷을 통하지 않는 사설 전용 연결이며, VPN Gateway와 연결 매체와 라우팅 특성이 다릅니다.";
    if (/VPN Gateway|가상 네트워크 게이트웨이/i.test(value)) return "VPN Gateway는 암호화된 터널로 Azure VNet과 온프레미스 또는 클라이언트를 연결합니다.";
    if (/Site Recovery|사이트 복구/i.test(value)) return "Azure Site Recovery는 워크로드를 다른 위치로 복제하고 장애 조치를 수행하는 재해 복구 서비스입니다.";
    if (/Azure Backup|백업/i.test(value)) return "Azure Backup은 복구 지점을 보존해 데이터와 VM을 특정 시점으로 복원하는 서비스입니다.";
    if (/App Service|웹앱|Web App/i.test(value)) return "App Service는 웹 애플리케이션을 관리형으로 실행하며, 가격 계층과 App Service Plan이 확장·슬롯·백업 같은 기능 가용성에 영향을 줍니다.";
    if (/VM Scale Set|VMSS|가상 머신 확장 집합/i.test(value)) return "VM Scale Sets는 동일한 VM 인스턴스를 집합으로 배포하고 자동 확장·업데이트를 관리합니다.";
    if (/태그|tag/i.test(value)) return "태그는 리소스의 부서·환경·비용 분류용 메타데이터이며 리소스의 실제 배치나 권한을 바꾸지 않습니다.";
    return isCorrect ? `이 선택지는 문제의 요구사항과 현재 시험 기준을 함께 만족합니다. ${assessment.principle}` : assessment.reject;
  }

  function extractQuestionGoal(q) {
    let text = String(q.questionText || "").replace(/\r/g, "");
    const optionIndex = text.search(/\nA\.\s/);
    if (optionIndex > 0) text = text.slice(0, optionIndex);
    const lines = text.split(/\n+/).map(v => v.replace(/\s+/g, " ").trim()).filter(Boolean);
    const meaningful = lines.filter(line => !/^참고[:：]?/i.test(line) && !/^NOTE[:：]?/i.test(line));
    const questionish = meaningful.filter(line => /\?|합니까|할까요|해야 합니까|무엇입니까|어떻게|식별해야|구성해야|선택해야|먼저 무엇|예를 선택|아니요를 선택/.test(line));
    let goal = questionish.at(-1) || meaningful.at(-1) || "문제의 요구사항을 충족하는 Azure 구성을 선택합니다.";
    goal = goal.replace(/^질문\s*/i, "").trim();
    if (goal.length > 280) goal = goal.slice(-280);
    return goal;
  }

  function decisionReason(q, assessment) {
    const correct = (q.correctText || []).join(" ");
    const text = `${q.questionText || ""} ${correct}`;
    const rules = [
      [/태그|\btag\b/i, "태그는 리소스를 부서·환경·비용센터 같은 메타데이터와 연결할 때 쓰며, 리소스를 다른 그룹으로 이동시키지 않고도 분류할 수 있습니다."],
      [/동적 그룹|dynamic group/i, "동적 그룹은 사용자 속성 규칙을 기준으로 멤버십을 자동 갱신하므로 부서 같은 속성 기반 대상 관리에 적합합니다."],
      [/CanNotDelete|삭제만 막|삭제 방지/i, "CanNotDelete 잠금은 리소스 변경은 허용하면서 삭제만 차단하므로 '삭제 방지' 요구와 정확히 일치합니다."],
      [/ReadOnly|읽기 전용 잠금/i, "ReadOnly 잠금은 제어 평면의 수정과 삭제를 모두 막기 때문에 단순 삭제 방지보다 더 강한 제한입니다."],
      [/\bReader\b/i, "Reader는 리소스를 조회할 수 있지만 생성·수정·삭제나 역할 할당은 수행하지 못합니다."],
      [/\bContributor\b/i, "Contributor는 리소스 생성·수정·삭제는 가능하지만 다른 사용자에게 Azure RBAC 역할을 할당할 권한은 없습니다."],
      [/\bOwner\b/i, "Owner는 리소스 관리 권한과 역할 할당 권한을 모두 포함하므로 권한 위임까지 필요한 경우에 맞습니다."],
      [/User Access Administrator/i, "User Access Administrator는 리소스 자체의 일반 관리보다 Azure RBAC 역할 할당 관리에 초점이 있는 역할입니다."],
      [/\bDeny\b/i, "Azure Policy의 Deny 효과는 조건을 위반하는 생성·변경 요청 자체를 차단합니다."],
      [/\bAudit\b/i, "Audit 효과는 리소스를 차단하지 않고 비준수 상태로 기록하므로 감시 목적에 맞습니다."],
      [/DeployIfNotExists/i, "DeployIfNotExists는 필요한 관련 리소스나 설정이 없을 때 배포 작업을 통해 보완하는 정책 효과입니다."],
      [/\bModify\b/i, "Modify는 태그나 지원되는 속성 값을 정책 평가 과정에서 수정·보완하는 데 사용합니다."],
      [/\bLRS\b/i, "LRS는 한 지역의 단일 물리 위치 안에서 데이터를 복제하는 가장 기본적인 중복성 옵션입니다."],
      [/\bZRS\b/i, "ZRS는 같은 Azure 지역의 여러 가용성 영역에 동기 복제하므로 단일 데이터센터/영역 장애에도 가용성을 유지하는 요구에 적합합니다."],
      [/\bRA-GRS\b|\bRA-GZRS\b/i, "RA 계열은 보조 지역 복제뿐 아니라 보조 엔드포인트에 대한 읽기 접근까지 제공하는 것이 핵심입니다."],
      [/\bGRS\b|\bGZRS\b/i, "GRS 계열은 보조 Azure 지역으로 비동기 복제해 지역 단위 재해에 대비합니다."],
      [/user delegation sas|사용자 위임 sas/i, "사용자 위임 SAS는 저장소 계정 키가 아니라 Microsoft Entra 자격 증명으로 서명하므로 키 노출을 줄일 수 있습니다."],
      [/account sas|계정 sas/i, "Account SAS는 여러 Storage 서비스와 더 넓은 리소스 형식을 한 토큰으로 위임할 수 있습니다."],
      [/service sas|서비스 sas/i, "Service SAS는 Blob·File·Queue·Table 중 특정 Storage 서비스의 리소스에 범위와 권한을 제한해 위임합니다."],
      [/peering|피어링/i, "VNet 피어링은 겹치지 않는 두 가상 네트워크를 Azure 백본에서 직접 연결하는 가장 단순한 방법입니다."],
      [/network security group|\bnsg\b|보안 그룹/i, "NSG는 서브넷이나 NIC에 연결해 방향·주소·포트·프로토콜 기준으로 트래픽을 허용하거나 차단합니다."],
      [/private endpoint|프라이빗 엔드포인트/i, "Private Endpoint는 PaaS 서비스에 VNet의 사설 IP를 부여해 인터넷 공개 경로가 아닌 사설 연결을 사용하게 합니다."],
      [/route table|사용자 정의 경로|\budr\b/i, "UDR은 서브넷의 다음 홉을 직접 지정해 트래픽 경로를 제어할 때 사용합니다."],
      [/bastion/i, "Azure Bastion은 VM에 공용 IP를 직접 부여하지 않고 포털을 통해 RDP/SSH 관리 접속을 제공하는 서비스입니다."],
      [/load balancer|부하 분산/i, "Azure Load Balancer는 프런트엔드 IP, 백엔드 풀, 상태 프로브, 부하 분산 규칙을 조합해 L4 트래픽을 분산합니다."],
      [/\bdns\b|cname|a 레코드|a record/i, "DNS 문제는 네트워크 연결 자체가 아니라 이름을 올바른 IP나 호스트 이름으로 해석하도록 레코드와 영역을 구성하는 문제입니다."],
      [/deallocate|할당 취소|할당 해제/i, "VM을 deallocate하면 컴퓨트 리소스 할당이 해제되어 VM 컴퓨트 과금이 중지됩니다. 단순 OS 종료와 구분해야 합니다."],
      [/data disk|데이터 디스크|디스크를 분리|detach/i, "Azure 관리 디스크를 다른 VM에 연결하려면 현재 연결 상태와 분리/연결 순서를 지켜야 하며, 불필요한 VM 삭제는 요구되지 않습니다."],
      [/vm scale set|\bvmss\b|scale set/i, "VM Scale Sets는 동일한 VM 구성을 여러 인스턴스로 관리하고 메트릭 기반 자동 확장 규칙을 적용하는 서비스입니다."],
      [/availability zone|가용성 영역/i, "Availability Zone은 한 Azure 지역 안의 물리적으로 분리된 데이터센터 단위이므로 데이터센터 장애 격리가 필요한 경우 사용합니다."],
      [/availability set|가용성 집합/i, "Availability Set은 같은 지역·데이터센터 안에서 장애 도메인과 업데이트 도메인으로 VM을 분산합니다."],
      [/deployment slot|배포 슬롯/i, "App Service 배포 슬롯은 별도 URL과 설정을 가진 스테이징 환경에 배포한 뒤 production과 swap할 수 있게 합니다."],
      [/app service|web app|webapp/i, "App Service 문제는 앱 설정과 App Service Plan의 가격 계층·확장 용량을 나눠서 봐야 합니다."],
      [/action group|작업 그룹/i, "Azure Monitor에서 경고 규칙은 조건을 평가하고 Action Group은 이메일·SMS·웹후크 같은 후속 작업을 실행합니다."],
      [/log analytics|kql|azure monitor logs/i, "Azure Monitor Logs의 데이터 조회와 분석에는 Log Analytics 작업 영역과 KQL을 사용합니다."],
      [/advisor|어드바이저/i, "Azure Advisor는 저활용 VM 등 비용·성능·신뢰성·보안 관점의 최적화 권장 사항을 빠르게 찾는 데 적합합니다."],
      [/backup|백업/i, "Azure Backup은 복구 지점을 보존해 특정 시점의 데이터나 VM을 복원하는 서비스이며 재해 복제와 목적이 다릅니다."],
      [/site recovery|failover|장애 조치|복제되어야/i, "Azure Site Recovery는 워크로드를 다른 위치로 지속 복제하고 장애 조치를 수행하는 재해 복구 서비스입니다."],
      [/arm template|resource manager.*template|bicep|템플릿/i, "ARM 템플릿과 Bicep은 원하는 Azure 리소스 상태를 선언하는 IaC 방식이며, 리소스 ID·매개 변수·종속성과 배포 범위를 정확히 맞춰야 합니다."],
      [/azcopy/i, "AzCopy는 Blob과 Azure Files 등 Azure Storage 데이터를 고성능으로 복사하는 명령줄 도구입니다."],
      [/sspr|password reset|암호 재설정/i, "SSPR은 사용자가 관리자 도움 없이 자신의 암호를 재설정하도록 하며, 대상 그룹 범위를 Selected로 제한할 수 있습니다."],
      [/conditional access|조건부 액세스/i, "Conditional Access는 대상 사용자/그룹, 대상 리소스, 조건, Grant 제어를 조합해 MFA 같은 액세스 요구사항을 적용합니다."],
      [/container apps/i, "Azure Container Apps는 컨테이너 이미지를 실행하면서 ingress와 replica 범위 기반 확장을 관리형으로 구성할 수 있습니다."],
      [/container instance|\baci\b/i, "Azure Container Instances는 VM을 직접 관리하지 않고 단일/소규모 컨테이너를 빠르게 실행할 때 적합합니다."]
    ];
    for (const [re, reason] of rules) if (re.test(text)) return reason;
    return assessment.principle;
  }

  function choiceReasonV2(q, text, isCorrect, assessment) {
    const value = String(text || "").trim();
    if (q.source === 340) {
      if (/Instance1만/i.test(value)) return "Instance1은 Windows Server 2019 Nano Server 기반입니다. ACI에서 Windows 컨테이너 자체는 실행할 수 있지만, 문제는 여러 인스턴스를 하나의 container group에 함께 넣는 조합을 묻고 있습니다. Windows multi-container group 제한 때문에 정답 조합이 아닙니다.";
      if (/Instance2만/i.test(value)) return "Instance2도 Windows Server 2019 Server Core 기반이라 같은 이유로 multi-container group 조합의 정답이 아닙니다.";
      if (/Instance1.*Instance2/i.test(value)) return "두 인스턴스가 모두 Windows입니다. Windows 컨테이너를 ACI에서 실행할 수 있다는 사실과 Windows에서 여러 컨테이너를 한 group에 묶을 수 있다는 것은 다른 문제입니다.";
      if (/Instance3.*Instance4/i.test(value)) return "Instance3과 Instance4는 모두 Linux이므로 ACI의 multi-container group 구성에 함께 배포할 수 있습니다.";
    }
    if (/^(예|아니요|yes|no)$/i.test(value)) {
      return isCorrect
        ? `제시된 솔루션이 문제의 목표를 ${/예|yes/i.test(value) ? "충족하므로" : "충족하지 못하므로"} 이 응답이 맞습니다.`
        : `제시된 솔루션에 대한 판정이 반대입니다. 실제 요구사항과 솔루션이 만드는 최종 상태를 다시 비교해야 합니다.`;
    }
    const specific = specificChoiceReason(value, isCorrect, assessment);
    if (isCorrect && specific.includes("현재 시험 기준을 함께 만족")) return decisionReason(q, assessment);
    if (!isCorrect && specific === assessment.reject) return `이 선택지는 문제에서 요구한 최종 상태를 직접 만들지 못하거나 적용 범위·선행 조건이 맞지 않습니다. 정답 선택지와 '${extractQuestionGoal(q)}' 요구를 비교하세요.`;
    return specific;
  }

  function questionSpecificNotes(q, assessment) {
    const text = `${q.questionText || ""} ${(q.correctText || []).join(" ")} ${(q.options || []).join(" ")}`.toLowerCase();
    const notes = [];
    const add = (title, body) => notes.push(`<section class="explanation-section"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(body)}</p></section>`);

    const scopeLine = assessment.scope === "out"
      ? "이 문항은 개정 전 흐름이 섞였거나 현재 우선순위가 낮은 영역일 수 있습니다. 원본 정답은 유지하되, 현재 AZ-104 기준으로는 무엇을 우선해야 하는지 같이 봐야 합니다."
      : "이 문항은 현재 AZ-104에서 그대로 쓰는 판단 흐름을 익히는 용도입니다.";
    add("시험 범위 판단", scopeLine);

    if (/management group|subscription|resource group|\brg\b|scope/i.test(text)) {
      add("범위 계층", "관리 그룹 → 구독 → 리소스 그룹 → 리소스 순서로 먼저 계층을 그리면 정책, RBAC, 예산, 태그의 적용 범위를 빠르게 판단할 수 있습니다.");
    }
    if (/lock|can not delete|cannot delete|readonly|read only/i.test(text)) {
      add("리소스 잠금", "CanNotDelete는 삭제만 막고 수정은 허용합니다. ReadOnly는 수정과 삭제를 모두 막습니다. 문제는 '무엇을 허용하고 무엇을 막는지'를 먼저 분리해야 합니다.");
    }
    if (/policy|deny|deployifnotexists|modify|audit/i.test(text)) {
      add("정책 판단", "Deny는 차단, Audit는 기록, DeployIfNotExists는 누락 리소스 보완, Modify는 속성 자동 수정입니다. 시험에서는 제어 수준을 먼저 구분해야 합니다.");
    }
    if (/rbac|role assignment|owner|contributor|reader/i.test(text)) {
      add("RBAC 판단", "Owner는 권한 부여까지 가능한 가장 넓은 역할입니다. Contributor는 리소스 변경은 가능하지만 권한 부여는 못 합니다. Reader는 읽기 전용입니다.");
    }
    if (/tag|tags/i.test(text)) {
      add("태그 판단", "태그는 권한이 아니라 메타데이터입니다. 비용 분류, 검색, 정리 목적이며 정책과 헷갈리면 안 됩니다.");
    }
    if (/availability zone|availability set|zone redundant|availability/i.test(text)) {
      add("가용성 판단", "Availability zone은 물리적으로 분리된 Azure 데이터센터 단위입니다. Availability set은 같은 데이터센터 안에서 장애 도메인과 업데이트 도메인을 나눕니다.");
    }
    if (/deallocate|stop-deallocated|vm size|resize|size change/i.test(text)) {
      add("VM 판단", "중지와 deallocate는 다릅니다. 과금과 재할당 가능 여부가 달라집니다. 크기 변경은 지원 여부와 계열 차이를 함께 확인해야 합니다.");
    }
    if (/virtual network|vnet|peering|nsg|route table|dns|private endpoint|bastion|vpn/i.test(text)) {
      add("네트워크 판단", "VNet 피어링은 네트워크를 연결하는 기능이고, NSG는 트래픽 허용/차단, DNS는 이름 해석, Private Endpoint는 PaaS를 사설 IP로 연결하는 기능입니다. '접속이 안 된다'면 경로와 이름 해석을 분리해서 봐야 합니다.");
    }
    if (/storage account|shared access signature|sas|container|blob|queue|file|table/i.test(text)) {
      add("스토리지 판단", "SAS는 저장소 계정 전체 권한이 아니라 제한된 범위와 만료 시간을 가진 위임 토큰입니다. 서비스 SAS, 계정 SAS, 사용자 위임 SAS의 범위를 구분해야 합니다. 컨테이너 접근 문제라면 키, 토큰, 방화벽, 공개 수준을 같이 봐야 합니다.");
    }
    if (/encrypted|encryption|key vault|cmk|sse/i.test(text)) {
      add("암호화 판단", "플랫폼 관리형 암호화인지, 고객 관리형 키인지 구분해야 합니다. Key Vault 권한이 없으면 암호화 기능이 아니라 키 접근 문제일 수 있습니다.");
    }
    if (/arm|bicep|template|json|deployment/i.test(text)) {
      add("배포 판단", "ARM JSON과 Bicep은 선언형입니다. parameters, resources, properties, dependsOn, location, sku, tags, identity의 위치를 먼저 확인하고, 새로 만드는지 기존 리소스를 수정하는지 구분해야 합니다.");
    }
    if (/conditional access|mfa|access reviews|identity governance|sspr|emergency access|break glass/i.test(text)) {
      add("Entra 판단", "조건부 액세스는 사용자, 앱, 조건, Grant를 함께 봐야 합니다. Access reviews는 거버넌스/P2 성격이라 AZ-104 핵심 범위 밖일 수 있습니다. 비상 계정은 일반 MFA 정책에서 제외해 테넌트 잠금을 방지합니다.");
    }
    if (/license|group-based licensing|group license|product license/i.test(text)) {
      add("라이선스 판단", "그룹 기반 라이선스는 Azure RBAC가 아니라 Entra 라이선스 배포 기능입니다. 동적 그룹 규칙과 라이선스 적용 흐름을 분리해서 봐야 합니다.");
    }
    if (q.source === 44 || /access review|access reviews|identity governance/i.test(text)) {
      add("문항 44 계열", "Access reviews는 리뷰 대상, 리뷰어, 스코프를 같이 판단해야 합니다. 그룹에 guest를 넣었는지, user가 그룹 구성원인지, 멤버/게스트 대상이 무엇인지 분리해서 보세요.");
    }
    if (q.source === 51 || /license|licen[cs]e/i.test(text)) {
      add("문항 51 계열", "라이선스는 Azure RBAC와 다른 축입니다. 사용자에게 직접 주는지, 그룹 단위로 상속되는지, P1/P2 또는 거버넌스 기능이 필요한지 먼저 구분해야 합니다.");
    }
    if (q.source === 65 || /json|arm|bicep|template|deployment/i.test(text)) {
      add("문항 65 계열", "JSON 배포는 값 하나를 맞히는 문제가 아니라 전체 구조를 맞히는 문제입니다. parameters, resources, properties, dependsOn, location, sku, tags, identity의 위치를 먼저 확인하세요.");
    }
    if (q.source === 68 || /conditional access|mfa|emergency access|break glass/i.test(text)) {
      add("문항 68 계열", "관리자 MFA 정책은 좋지만, 비상 액세스 계정까지 같이 묶으면 잠금 사고가 납니다. 따라서 예외 계정을 분리하는 것이 정답 흐름입니다.");
    }

    return notes.join("");
  }

  function renderChoiceAnalysis(q, assessment) {
    if (q.kind !== "auto") return `<p class="analysis-note">이 문항은 이미지형 응답입니다. 위에 찍은 번호 마커와 원본 정답 이미지를 비교하고, 각 선택 위치가 같은 행/열/드롭다운 항목을 가리키는지 확인하세요.</p>`;
    const optionTexts = extractOptionTexts(q);
    return `<div class="choice-analysis">${q.options.map(letter => {
      const isCorrect = q.correct.includes(letter);
      const wasSelected = view.selected.has(letter);
      const text = optionTexts[letter] || `${letter} 선택지`;
      return `<article class="choice-review ${isCorrect ? "right" : "not-right"} ${wasSelected ? "chosen" : ""}"><header><span>${letter}</span><strong>${isCorrect ? "정답" : "오답"}${wasSelected ? " · 내가 선택" : ""}</strong></header><p>${escapeHtml(text)}</p><small>${escapeHtml(choiceReasonV2(q, text, isCorrect, assessment))}</small></article>`;
    }).join("")}</div>`;
  }


  function cleanAnswerLabel(text) {
    return String(text || "").replace(/^\s*[A-H]\.\s*/, "").replace(/\s+/g, " ").trim();
  }

  function exactAnswerItems(q) {
    if (q.kind !== "auto") return decodedAnswerItems(q);
    const values = (q.correctText || []).map(cleanAnswerLabel).filter(Boolean);
    return values.map((text, i) => ({ index: i + 1, text }));
  }

  function answerEffect(text, q) {
    const value = String(text || "").trim();
    const rules = [
      [/Users can register applications\s*=\s*No/i, "일반 사용자가 Microsoft Entra ID에서 애플리케이션을 등록하는 기본 권한을 끕니다. 앱 등록 과정에서 애플리케이션 객체와 서비스 주체가 만들어질 수 있으므로, 표준 사용자의 새 서비스 주체 생성 능력을 제한하려는 요구와 연결됩니다."],
      [/Restrict access to (?:Azure AD|Microsoft Entra) administration portal\s*=\s*Yes/i, "비관리 사용자의 Entra 관리 센터 웹 UI 접근을 제한합니다. 이 설정은 포털 진입을 막는 것이 핵심이며 PowerShell 또는 Microsoft Graph를 통한 허용된 작업 자체를 모두 제거하는 설정은 아닙니다."],
      [/Network Contributor|네트워크 기여자/i, "가상 네트워크, 서브넷, NIC, Load Balancer 같은 네트워크 리소스를 관리할 수 있는 기본 제공 역할입니다. 역할을 상위 범위인 리소스 그룹에 주면 그 안의 네트워크 리소스에 상속됩니다."],
      [/\bReader\b|리더/i, "대상 범위의 리소스와 설정을 조회할 수 있지만 생성·수정·삭제는 할 수 없습니다."],
      [/\bContributor\b|기여자|기부자/i, "대상 범위의 리소스를 생성·수정·삭제할 수 있지만 Azure RBAC 역할을 다른 사용자에게 부여하는 권한은 포함하지 않습니다."],
      [/\bOwner\b/i, "리소스 관리와 Azure RBAC 역할 할당을 모두 수행할 수 있는 넓은 권한입니다."],
      [/태그|\btag(s)?\b/i, "리소스에 부서·환경·비용센터 같은 메타데이터를 붙입니다. 권한이나 네트워크 동작을 바꾸지 않고 분류·검색·비용 분석에 활용합니다."],
      [/관리 그룹|Management Group/i, "여러 Azure 구독을 상위 계층으로 묶어 Azure Policy와 RBAC 같은 거버넌스 설정을 일관되게 상속시킬 수 있습니다."],
      [/리소스 그룹|Resource Group/i, "관련 Azure 리소스의 관리 수명 주기와 RBAC/Policy 범위를 묶는 논리 컨테이너입니다. 리소스가 같은 리소스 그룹에 있다고 해서 자동으로 같은 네트워크에 놓이는 것은 아닙니다."],
      [/CanNotDelete|삭제 잠금|삭제 방지/i, "리소스의 수정은 허용하지만 삭제 작업을 막는 관리 잠금입니다. 삭제만 방지해야 할 때 ReadOnly보다 요구사항에 정확히 맞습니다."],
      [/ReadOnly|읽기 전용 잠금/i, "Azure Resource Manager 제어 평면에서 수정과 삭제를 모두 차단하는 잠금입니다. 단순 삭제 방지보다 강한 제약입니다."],
      [/DeployIfNotExists/i, "정책 조건을 충족하는 데 필요한 관련 설정이나 리소스가 없으면 배포 작업으로 보완합니다. 기존 리소스에는 remediation 작업이 필요할 수 있습니다."],
      [/\bDeny\b/i, "Azure Policy 조건을 위반하는 생성·수정 요청을 거부해 비준수 상태가 만들어지는 것 자체를 막습니다."],
      [/\bAudit\b/i, "요청을 차단하지 않고 비준수 상태로 기록합니다. 배포를 허용하면서 규정 위반을 식별해야 할 때 사용합니다."],
      [/\bModify\b/i, "지원되는 리소스 속성이나 태그를 정책 평가 과정에서 추가·변경하도록 구성합니다."],
      [/\bRA-GRS\b|읽기 전용 지리적 중복/i, "기본 지역의 복제본과 보조 지역 복제본을 유지하고 보조 지역에도 읽기 엔드포인트를 제공합니다. 지역 장애 대비와 보조 읽기가 모두 필요할 때 사용합니다."],
      [/\bRA-GZRS\b/i, "기본 지역에서는 영역 중복, 보조 지역에는 지리 복제를 제공하며 보조 지역 읽기도 허용합니다."],
      [/\bGZRS\b/i, "기본 지역의 여러 가용성 영역에 복제하면서 보조 지역에도 지리 복제해 영역 장애와 지역 재해를 함께 대비합니다."],
      [/\bGRS\b|지리적 중복/i, "기본 지역 데이터를 보조 Azure 지역에 비동기 복제합니다. 보조 지역 읽기 요구가 있다면 RA-GRS 계열과 구분해야 합니다."],
      [/\bZRS\b|Zone-Redundant/i, "동일 Azure 지역의 여러 가용성 영역에 데이터를 동기 복제합니다. 단일 영역 장애 시에도 스토리지 가용성을 유지하는 데 사용합니다."],
      [/\bLRS\b|로컬 중복/i, "한 지역의 단일 물리 위치 안에서 여러 복사본을 유지하는 기본 중복성입니다. 가용성 영역이나 다른 지역 장애까지 보호하지는 않습니다."],
      [/사용자 위임 SAS|User delegation SAS/i, "Microsoft Entra 자격 증명으로 서명하는 Blob용 SAS입니다. Storage 계정 키를 직접 사용하지 않고 제한된 데이터 접근을 위임할 수 있습니다."],
      [/계정 SAS|Account SAS/i, "한 Storage 계정에서 여러 서비스와 리소스 형식에 대한 제한된 권한을 하나의 SAS로 위임할 수 있습니다."],
      [/서비스 SAS|Service SAS/i, "Blob·File·Queue·Table 중 특정 Storage 서비스의 리소스에 권한과 기간을 제한해 접근을 위임합니다."],
      [/VNet.*피어링|가상 네트워크 피어링|peering/i, "주소 공간이 겹치지 않는 두 VNet을 Azure 백본에서 직접 연결합니다. 기본적으로 전이 라우팅은 제공하지 않으므로 허브를 거친 연결은 별도 설계가 필요합니다."],
      [/네트워크 보안 그룹|\bNSG\b/i, "서브넷 또는 NIC에 적용해 방향, 원본/대상, 포트, 프로토콜을 기준으로 트래픽을 허용하거나 차단합니다. 숫자가 작은 우선순위부터 첫 일치 규칙이 적용됩니다."],
      [/사용자 정의 경로|Route table|\bUDR\b/i, "서브넷 트래픽의 다음 홉을 직접 지정해 방화벽·가상 어플라이언스·게이트웨이 등 원하는 경로로 보내는 기능입니다."],
      [/Private Endpoint|프라이빗 엔드포인트/i, "PaaS 서비스에 VNet 내부 사설 IP를 제공해 사설 네트워크 경로로 접근하게 합니다. DNS가 해당 서비스 이름을 사설 IP로 해석하도록 구성하는 것도 중요합니다."],
      [/Service Endpoint|서비스 엔드포인트/i, "서브넷의 ID를 지원되는 PaaS 서비스 방화벽까지 확장해 특정 서브넷에서의 접근을 허용합니다. 서비스 자체에 VNet 사설 IP를 생성하는 Private Endpoint와 다릅니다."],
      [/Azure Bastion|\bBastion\b/i, "VM에 직접 공용 IP를 노출하지 않고 Azure Portal을 통해 RDP/SSH 관리 접속을 제공합니다."],
      [/Load Balancer|부하 분산 장치/i, "프런트엔드 IP로 들어온 L4 트래픽을 상태 프로브가 정상으로 판단한 백엔드 인스턴스에 분산합니다. 프런트엔드·백엔드 풀·프로브·규칙을 함께 구성합니다."],
      [/가용성 영역|Availability Zone/i, "한 Azure 지역 안에서 물리적으로 분리된 데이터센터 단위에 워크로드를 배치해 데이터센터/영역 장애를 격리합니다."],
      [/가용성 집합|Availability Set/i, "같은 지역에서 VM을 장애 도메인과 업데이트 도메인으로 분산해 하드웨어 장애와 계획된 유지보수의 동시 영향을 줄입니다."],
      [/VM Scale Set|VMSS|가상 머신 확장 집합/i, "동일한 VM 구성을 여러 인스턴스로 관리하고 메트릭 기반 자동 확장과 업데이트를 적용할 수 있습니다."],
      [/deallocate|할당 취소|할당 해제/i, "VM의 컴퓨트 리소스 할당을 해제해 VM 컴퓨트 과금을 중지합니다. 게스트 OS에서 단순 종료한 상태와 구분해야 합니다."],
      [/배포 슬롯|Deployment slot/i, "App Service의 별도 스테이징 환경에 새 버전을 배포하고 검증한 뒤 production과 swap하여 다운타임과 배포 위험을 줄입니다."],
      [/App Service Plan|앱 서비스 계획/i, "App Service 앱이 사용할 지역, 운영체제, 가격 계층, 컴퓨트 용량을 제공하는 호스팅 단위입니다. 확장과 일부 기능 가용성은 Plan SKU에 좌우됩니다."],
      [/Azure Monitor/i, "Azure 리소스의 메트릭과 로그를 수집·분석하고 경고를 구성하는 통합 모니터링 서비스입니다. 성능 메트릭 원인 분석 문제에서는 핵심 도구입니다."],
      [/Activity Log|활동 로그/i, "Azure Resource Manager 제어 평면에서 누가 어떤 리소스 작업을 수행했는지 기록합니다. 게스트 OS 내부 로그나 애플리케이션 로그와는 다릅니다."],
      [/Azure Advisor|어드바이저/i, "비용, 성능, 신뢰성, 운영 우수성, 보안 관점에서 Azure 리소스 최적화 권장 사항을 제공합니다. 저활용 리소스 식별에 유용합니다."],
      [/Network Watcher|네트워크 감시/i, "연결 문제 해결, IP flow verify, next hop, 패킷 캡처 등 Azure 네트워크 진단 기능을 제공합니다."],
      [/Action Group|작업 그룹/i, "Azure Monitor 경고가 발생했을 때 이메일, SMS, 웹후크, 자동화 같은 후속 알림/작업을 실행하는 재사용 가능한 대상 집합입니다."],
      [/Recovery Services vault|Recovery Services 볼트/i, "Azure VM 및 지원 워크로드의 Backup/일부 Site Recovery 메타데이터와 복구 지점을 관리하는 볼트입니다."],
      [/Azure Backup|백업/i, "정책에 따라 복구 지점을 생성·보존하고 파일이나 VM을 특정 시점으로 복원합니다. 지속 복제와 장애 조치를 제공하는 Site Recovery와 목적이 다릅니다."],
      [/Site Recovery|사이트 복구|장애 조치/i, "워크로드를 다른 위치로 복제하고 계획/비계획 장애 조치를 수행하는 재해 복구 서비스입니다. 백업 보존과는 목적이 다릅니다."],
      [/ARM 템플릿|Resource Manager.*template/i, "Azure 리소스의 원하는 상태를 JSON으로 선언해 반복 가능하게 배포합니다. 매개 변수, 리소스 ID, 종속성과 배포 범위를 정확히 지정해야 합니다."],
      [/\bBicep\b/i, "ARM 리소스 모델을 더 간결한 문법으로 선언하는 IaC 언어입니다. 컴파일되면 ARM 템플릿으로 배포됩니다."],
      [/SSPR|암호 재설정/i, "사용자가 관리자 개입 없이 본인 인증을 거쳐 자신의 암호를 재설정할 수 있게 합니다. 전체 또는 선택 그룹을 대상으로 활성화할 수 있습니다."],
      [/조건부 액세스|Conditional Access/i, "대상 사용자/그룹, 대상 리소스, 조건, Grant 제어를 조합해 MFA나 준수 장치 같은 액세스 요구사항을 적용합니다."],
      [/\bAzCopy\b/i, "Azure Storage의 Blob과 Files 데이터를 고성능으로 복사하는 명령줄 도구입니다. 대량 데이터 업로드·다운로드·계정 간 복사에 사용합니다."],
      [/Container Apps/i, "컨테이너 이미지를 서버리스에 가까운 관리형 환경에서 실행하고 ingress와 최소/최대 replica 기반 확장을 구성합니다."],
      [/Container Instances|\bACI\b/i, "VM이나 오케스트레이터를 직접 관리하지 않고 컨테이너를 빠르게 실행하는 Azure 서비스입니다."],
      [/Container Registry|\bACR\b/i, "컨테이너 이미지를 저장·버전 관리하고 Azure 컨테이너 실행 서비스에 제공하는 사설 레지스트리입니다."],
      [/dataActions/i, "사용자 지정 역할 정의에서 Blob 읽기·쓰기 같은 데이터 평면 작업을 허용하는 위치입니다. 리소스 관리 작업인 actions와 구분해야 합니다."],
      [/assignableScopes/i, "사용자 지정 역할을 어느 관리 그룹·구독·리소스 그룹 범위에서 할당할 수 있는지 제한하는 속성입니다."],
      [/액세스 제어\s*\(IAM\)|Access control\s*\(IAM\)/i, "Azure RBAC 역할 할당을 확인하거나 추가하는 메뉴입니다. 리소스에 누가 어떤 관리/데이터 권한을 갖는지 제어할 때 사용합니다."],
      [/공유 액세스 서명|Shared Access Signature|\bSAS\b/i, "Storage 데이터에 대해 권한 종류와 유효 기간을 제한한 위임 토큰을 발급합니다. 계정 키 전체를 넘기지 않고 제한된 접근을 제공할 때 사용합니다."],
      [/관리되는 ID|Managed Identity/i, "애플리케이션이나 Azure 리소스가 자격 증명을 코드에 저장하지 않고 Microsoft Entra 토큰을 받을 수 있게 합니다. 실제 대상 리소스 권한은 별도 RBAC가 필요합니다."],
      [/B2B 협업|B2B collaboration/i, "외부 조직 사용자를 게스트로 초대해 자신의 Entra 테넌트 리소스에 협업 접근을 제공하는 기능입니다."],
      [/속성 편집|Edit properties/i, "기존 사용자/게스트 객체의 속성을 변경합니다. 초대 방식이나 사용자 유형 자체를 만드는 메뉴와는 역할이 다릅니다."],
      [/ZRS|Zone-Redundant/i, "동일 Azure 지역의 여러 가용성 영역에 데이터를 동기 복제합니다. 단일 영역 장애 시에도 스토리지 가용성을 유지하는 데 사용합니다."],
      [/읽기 전용|read.?only/i, "해당 리소스나 복제 위치에서 읽기만 허용하고 쓰기 변경은 허용하지 않는 상태/권한을 의미합니다."],
      [/저장소 동기화 서비스|Storage Sync Service/i, "Azure File Sync의 최상위 Azure 리소스로, 등록 서버와 동기화 그룹을 관리합니다."],
      [/동기화 그룹|Sync group/i, "Azure 파일 공유의 클라우드 엔드포인트와 Windows Server의 서버 엔드포인트 사이 동기화 관계를 정의합니다."],
      [/Azure Automation State Configuration/i, "PowerShell DSC 구성을 Azure Automation에 저장하고 노드 구성으로 컴파일·적용해 구성 상태를 관리하는 기능입니다."],
      [/노드 구성으로 컴파일|compile/i, "DSC 구성 스크립트를 실제 노드가 적용할 수 있는 MOF 기반 노드 구성으로 변환하는 단계입니다."],
      [/규정 준수 상태|compliance status/i, "노드가 원하는 DSC 구성과 일치하는지 확인하는 상태입니다."],
      [/Log Analytics 작업 공간|Log Analytics workspace/i, "Azure Monitor 로그 데이터를 저장하고 KQL로 조회하는 작업 영역입니다."],
      [/Log Analytics 에이전트|Log Analytics agent/i, "원본 문제의 레거시 수집 에이전트 표현입니다. 현재는 Azure Monitor Agent와 DCR을 우선 사용합니다."],
      [/Windows 성능 카운터|performance counter/i, "CPU·메모리 같은 Windows 성능 카운터를 모니터링 데이터로 수집하도록 지정합니다."],
      [/알림 규칙|경고 규칙|alert rule/i, "메트릭이나 로그 조건을 평가해 임계값을 충족하면 경고를 발생시키는 규칙입니다."],
      [/업데이트/i, "기존 리소스의 설정이나 배포 상태를 변경하는 작업입니다. 문항에서는 생성/삭제가 아니라 기존 개체의 수정이 필요한지 확인해야 합니다."],
      [/--max-surge/i, "업데이트 동안 원하는 인스턴스 수보다 일시적으로 추가 생성할 수 있는 최대 비율/수를 정해 가용성을 유지하는 옵션입니다."],
      [/네트워킹/i, "리소스의 VNet 통합, 인바운드/아웃바운드 연결, 사설 엔드포인트 같은 네트워크 관련 설정을 관리하는 메뉴입니다."],
      [/속성$/i, "리소스의 ID, 구독, 리소스 그룹, 위치 같은 기본 메타데이터를 확인하는 메뉴입니다. 실제 기능 설정 메뉴와 구분해야 합니다."],
      [/주소 공간 추가|address space/i, "VNet이 사용할 수 있는 CIDR 주소 범위를 추가합니다. 서브넷은 이 주소 공간 안에서 생성되어야 합니다."],
      [/서브넷 추가|subnet/i, "VNet 주소 공간을 더 작은 네트워크 구간으로 나눠 VM/NIC 같은 리소스를 배치할 범위를 만듭니다."],
      [/아웃바운드/i, "리소스에서 외부 대상으로 나가는 방향의 트래픽을 뜻합니다. NSG·라우팅·NAT 문제에서는 방향 구분이 핵심입니다."],
      [/사용자 지정 DNS 서버|custom DNS/i, "VNet의 DNS 질의를 Azure 제공 DNS 대신 지정한 DNS 서버로 보내도록 합니다. VM은 VNet 설정을 상속할 수 있으므로 변경 후 갱신/재시작이 필요할 수 있습니다."],
      [/자동으로 IP 주소를 얻|automatically obtain/i, "게스트 OS에서 Azure DHCP가 제공하는 IP/DNS 구성을 사용하게 합니다. Azure VM NIC의 사설 IP는 Azure 플랫폼에서 관리하는 것이 일반적입니다."],
      [/VNET\s*3|VNet3/i, "정답으로 지정된 가상 네트워크 범위입니다. 실제 효과는 해당 문제의 피어링·주소 공간·리소스 배치 조건과 함께 판단해야 합니다."],
      [/\/23/i, "CIDR /23은 512개 주소 규모의 네트워크 블록입니다. 필요한 서브넷 크기와 기존 주소 공간 중첩 여부를 함께 확인해야 합니다."],
      [/허용된 리소스 유형:\s*컨테이너/i, "SAS가 컨테이너 수준 리소스에 적용되도록 범위를 제한합니다."],
      [/허용된 권한:\s*읽기,\s*목록/i, "SAS로 데이터 읽기와 목록 조회만 허용하며 쓰기·삭제 권한은 주지 않습니다. 최소 권한 요구에 맞는 조합입니다."],
      [/매일/i, "백업·스케줄 정책에서 하루에 한 번 실행되는 빈도를 뜻합니다. 보존 기간과 실행 빈도는 별개입니다."],
      [/4시간마다/i, "정해진 간격마다 작업을 반복하도록 하는 빈도입니다. 문제에서 요구하는 RPO/수집 빈도와 비교해야 합니다."],
      [/예$/i, "원본 정답에서 해당 문장이 참이라고 판정된 것입니다. 문장 자체의 조건을 문제 이미지와 대조해야 합니다."],
      [/아니요$/i, "원본 정답에서 해당 문장이 거짓이라고 판정된 것입니다. 어떤 전제나 범위 때문에 성립하지 않는지 문제 이미지에서 확인해야 합니다."]
    ];
    for (const [re, explanation] of rules) if (re.test(value)) return explanation;
    return "원본 답안에서 선택된 실제 값입니다. 이 값이 바꾸는 대상 리소스·권한·범위를 문제의 요구사항과 직접 연결해서 보는 것이 핵심입니다.";
  }

  function renderExactAnswerSection(q) {
    const items = exactAnswerItems(q);
    if (!items.length) return "";
    const label = q.kind === "auto" ? "원본 정답 데이터" : "원본 PDF 답안 판독";
    return `<section class="explanation-section decoded-answer"><h4>② 실제 정답 항목 <span class="source-label">${label}</span></h4><ol>${items.map(item => `<li><strong>${escapeHtml(item.text)}</strong></li>`).join("")}</ol></section>`;
  }

  function renderAnswerEffects(q) {
    const items = exactAnswerItems(q);
    if (!items.length) return "";
    return `<section class="explanation-section answer-effects"><h4>③ 이 메뉴/설정이 실제로 하는 일 <span class="source-label">학습 해설</span></h4>${items.map(item => `<article><strong>${item.index}. ${escapeHtml(item.text)}</strong><p>${escapeHtml(answerEffect(item.text, q))}</p></article>`).join("")}</section>`;
  }

  function deepExplanation(q) {
    const text = String(q.questionText || "");
    if (q.source === 135) {
      return {
        rule:"이 ARM 템플릿은 구독 범위 배포에서 Microsoft.Resources/resourceGroups 리소스를 선언합니다. copy.count가 2이면 첫 번째 리소스 정의가 두 번 만들어지고, 뒤에 별도 resourceGroups 정의가 두 개 더 있으므로 총 4개의 리소스 그룹이 생성됩니다. copyIndex()는 기본적으로 0부터 시작하며, length()를 object에 적용하면 최상위 속성 개수를 반환합니다. last()는 배열의 마지막 값을 반환합니다.",
        apply:"첫 번째 정의는 copy.count=2이므로 RG50과 RG51 두 개를 eastus에 만듭니다. 두 번째 정의는 last(var1) = eastus이고 이름은 ResGrp8입니다. 세 번째 정의는 par1의 기본값 eastus를 사용하고, obj1의 최상위 속성이 propA/propB/propC/propD 네 개이므로 이름은 RGroup4가 됩니다. 따라서 '3개가 생성된다'는 아니요, 'RGroup5가 생성된다'는 아니요, '모든 리소스 그룹이 East US에 생성된다'는 예입니다.",
        exam:"ARM 템플릿 HOTSPOT은 함수 이름만 외우기보다 실제 값을 한 줄씩 계산하세요. copy.count → 생성 개수, copyIndex() → 0부터, last(array) → 마지막 원소, length(object) → 최상위 속성 수 순서로 풀면 됩니다."
      };
    }
    if (q.source === 340 || (/컨테이너 그룹|container group/i.test(text) && /Nano Server|Server Core/i.test(text) && /Linux/i.test(text))) {
      return {
        rule:"Azure Container Instances(ACI)는 Linux와 Windows 컨테이너를 모두 실행할 수 있지만, 여러 컨테이너를 하나의 container group에 넣는 multi-container group 구성은 Linux 컨테이너에서 지원됩니다. Windows 컨테이너 그룹은 단일 컨테이너 구성으로 봐야 합니다.",
        apply:"표의 Instance1은 Windows Server 2019 Nano Server, Instance2는 Windows Server 2019 Server Core이므로 Windows 컨테이너입니다. Instance3과 Instance4는 둘 다 Linux입니다. 따라서 같은 컨테이너 그룹에 함께 배포할 수 있는 조합은 Linux인 Instance3 + Instance4입니다.",
        exam:"ACI 문제에서는 'Windows 컨테이너를 실행할 수 있는가'와 'Windows에서 multi-container group을 지원하는가'를 분리해서 보세요. 전자는 가능하지만 후자는 Linux 중심 제한이 핵심입니다."
      };
    }
    if (/CanNotDelete|ReadOnly|리소스 잠금|lock/i.test(text)) return {
      rule:"Azure Resource Lock에는 CanNotDelete와 ReadOnly가 있습니다. CanNotDelete는 수정은 허용하지만 삭제를 막고, ReadOnly는 제어 평면의 수정과 삭제를 모두 막습니다.",
      apply:"문제에서 '삭제만 막아야 하는지' 또는 '변경까지 모두 막아야 하는지'를 먼저 구분하면 두 잠금을 바로 결정할 수 있습니다.",
      exam:"삭제만 방지 = CanNotDelete, 변경+삭제 방지 = ReadOnly로 기억하세요."
    };
    if (/Azure Policy|DeployIfNotExists|Modify|Audit|Deny/i.test(text)) return {
      rule:"Azure Policy 효과는 결과가 다릅니다. Deny는 요청을 차단하고, Audit는 허용하되 비준수로 기록하며, Modify는 지원되는 속성을 변경하고, DeployIfNotExists는 누락된 관련 리소스/설정을 배포합니다.",
      apply:"문제의 요구가 '막기', '기록만 하기', '값을 고치기', '없으면 배포하기' 중 무엇인지 한 단어로 바꾸면 올바른 effect를 고를 수 있습니다.",
      exam:"Deny=차단, Audit=기록, Modify=값 수정, DeployIfNotExists=누락 보완."
    };
    if (/Private Endpoint|프라이빗 엔드포인트/i.test(text)) return {
      rule:"Private Endpoint는 지원되는 PaaS 리소스에 VNet 내부의 사설 IP를 할당해 사설 경로로 접근하게 합니다. 정상 동작하려면 해당 서비스 FQDN이 그 사설 IP로 해석되도록 DNS도 맞아야 합니다.",
      apply:"인터넷 공개를 줄이면서 Storage/SQL 같은 PaaS를 VNet에서 사설 주소로 접근해야 한다면 Private Endpoint가 핵심입니다. Service Endpoint는 서비스 자체에 사설 IP를 만드는 기능이 아닙니다.",
      exam:"Private Endpoint = PaaS에 사설 IP, Service Endpoint = 서브넷 ID를 서비스 방화벽까지 확장."
    };
    if (/Load Balancer|부하 분산/i.test(text)) return {
      rule:"Azure Load Balancer는 프런트엔드 IP, 백엔드 풀, health probe, load-balancing rule을 조합해 L4 트래픽을 정상 백엔드로 분산합니다.",
      apply:"문제의 각 작업이 '어디로 받을지(프런트엔드)', '누구에게 보낼지(백엔드)', '정상 여부를 어떻게 판단할지(probe)', '어떤 포트로 분산할지(rule)' 중 무엇인지 나눠보세요.",
      exam:"LB 문제는 Frontend → Backend pool → Probe → Rule 네 칸을 순서대로 그리면 실수가 줄어듭니다."
    };
    if (/Availability Zone|가용성 영역|Availability Set|가용성 집합/i.test(text)) return {
      rule:"Availability Set은 같은 지역에서 장애 도메인/업데이트 도메인으로 VM을 분산하고, Availability Zone은 한 Azure 지역 안의 물리적으로 분리된 데이터센터 단위로 장애를 격리합니다.",
      apply:"문제가 호스트/랙/계획 유지보수 수준의 동시 장애를 줄이는지, 데이터센터/영역 장애까지 격리하려는지에 따라 Set과 Zone을 구분합니다.",
      exam:"Set = fault/update domain, Zone = 물리적으로 분리된 데이터센터."
    };
    if (/App Service|Web App|웹앱/i.test(text)) return {
      rule:"App Service Plan은 지역·OS·SKU·컴퓨트 용량을 제공하고 Web App은 그 Plan에서 실행됩니다. 슬롯, 자동 확장, 백업, TLS 같은 기능은 앱 설정뿐 아니라 Plan SKU 제한을 받습니다.",
      apply:"문제에서 '앱 하나의 설정'을 바꾸는지, '호스팅 용량/SKU'를 바꾸는지 구분한 뒤 대상이 Web App인지 App Service Plan인지 결정해야 합니다.",
      exam:"App Service 문제는 App(설정/코드)과 Plan(SKU/컴퓨트/확장)을 분리해서 보세요."
    };
    if (/ARM 템플릿|Resource Manager.*template|Bicep/i.test(text)) return {
      rule:"ARM/Bicep은 선언형 배포입니다. 배포 범위와 resource type, name, location, parameters, variables, dependsOn을 실제 값으로 계산해 최종 리소스 상태를 판단해야 합니다.",
      apply:"함수나 표현식이 나오면 문자열 그대로 보지 말고 concat, length, first/last, copyIndex 같은 결과를 먼저 계산한 뒤 리소스 이름·개수·위치를 확인하세요.",
      exam:"ARM HOTSPOT은 '함수 계산 → 최종 이름/개수/위치' 순서로 풀면 됩니다."
    };
    if (/SSPR|암호 재설정|password reset/i.test(text)) return {
      rule:"Self-Service Password Reset은 사용자가 관리자 도움 없이 본인 인증 후 암호를 재설정하도록 하는 기능입니다. 대상은 None/Selected/All처럼 범위로 지정할 수 있습니다.",
      apply:"특정 그룹만 SSPR을 사용해야 한다면 Selected를 고르고 대상 그룹을 지정해야 합니다. 사용자 생성/그룹 라이선스와는 별개입니다.",
      exam:"SSPR은 '누가 사용할 수 있는가'와 '몇 가지 인증 방법이 필요한가'를 따로 확인하세요."
    };
    if (/VM.*크기|resize|size/i.test(text) && /virtual machine|가상 머신|VM/i.test(text)) return {
      rule:"VM 크기 변경은 해당 클러스터에서 원하는 크기를 사용할 수 있는지에 영향을 받습니다. 가용성 집합에 속한 VM은 같은 클러스터 제약을 공유하므로 경우에 따라 집합의 VM을 모두 deallocate해야 원하는 크기를 확보할 수 있습니다.",
      apply:"문제에서 '할당 실패'가 나오면 단순 OS 재부팅이 아니라 Azure compute allocation 제약을 의심하고, 가용성 집합의 다른 VM 상태까지 함께 봐야 합니다.",
      exam:"resize 실패 + availability set이 보이면 '같은 집합 VM 모두 deallocate 필요 여부'를 확인하세요."
    };
    if (/보조 위치.*읽|secondary.*read/i.test(text) && /중복|redundan/i.test(text)) return {
      rule:"GRS는 보조 지역으로 복제하지만 일반적으로 보조 엔드포인트 읽기를 제공하지 않습니다. 보조 지역에서도 읽어야 하면 RA-GRS 또는 RA-GZRS처럼 RA(read-access) 계열이 필요합니다.",
      apply:"문제 요구사항이 '다른 지리적 위치에 복제'와 '기본/보조 위치 모두에서 읽기'를 동시에 요구하므로 단순 GRS가 아니라 읽기 가능한 RA 계열을 선택해야 합니다.",
      exam:"스토리지 중복성은 먼저 장애 범위(LRS/ZRS/GRS/GZRS)를 고르고, 보조 지역 읽기 요구가 있으면 RA 접두사를 확인하세요."
    };
    if (/성능.*메트릭|metrics.*performance/i.test(text) && /Azure Monitor|Azure 모니터/i.test(text)) return {
      rule:"Azure Monitor는 Azure 리소스의 메트릭과 로그를 수집·분석하는 통합 모니터링 서비스입니다. Activity Log는 제어 평면 변경 이력, Advisor는 권장 사항, Traffic Analytics는 네트워크 흐름 분석에 초점이 있습니다.",
      apply:"문제는 '인프라 메트릭과 관련된 성능 문제의 원인'을 찾으라고 했으므로 메트릭을 직접 조회하고 분석하는 Azure Monitor가 맞습니다.",
      exam:"메트릭/성능 = Azure Monitor, 누가 리소스를 변경했는지 = Activity Log, 최적화 권장 = Advisor로 구분하세요."
    };
    if (/P2S|Point-to-Site|원격.*사용자|remote.*user/i.test(text) && /VPN/i.test(text)) return {
      rule:"Point-to-Site(P2S) VPN은 개별 클라이언트가 Azure VNet에 암호화된 터널로 접속하는 방식입니다. Site-to-Site는 네트워크 대 네트워크 연결입니다.",
      apply:"문제의 주체가 '원격 근무자의 개별 PC'이므로 지사 네트워크 전체를 연결하는 S2S가 아니라 P2S가 맞습니다.",
      exam:"개별 사용자/노트북 → P2S, 온프레미스 사이트 전체 → S2S라고 먼저 구분하면 빠릅니다."
    };
    if (/역할.*할당|role assignment/i.test(text) && /Reader|Contributor|Owner/i.test(text)) return {
      rule:"Azure RBAC는 역할 정의(무엇을 할 수 있는지)와 할당 범위(어디까지 적용되는지)를 함께 봅니다. Reader는 조회, Contributor는 리소스 변경, Owner는 리소스 변경과 역할 할당까지 가능합니다.",
      apply:"정답을 고를 때 문제에서 요구하는 작업이 단순 조회인지, 리소스 수정인지, 다른 사용자에게 권한을 부여하는 것인지 먼저 표시한 뒤 가장 좁은 역할과 범위를 선택해야 합니다.",
      exam:"최소 권한 문제는 '작업 권한'과 '범위'를 각각 한 번씩 확인하세요."
    };
    if (/NSG|network security group|네트워크 보안 그룹/i.test(text)) return {
      rule:"NSG 규칙은 방향, 프로토콜, 원본/대상, 포트, 우선순위로 평가하며 숫자가 작은 우선순위부터 첫 일치 규칙에서 결정됩니다. NSG는 서브넷 또는 NIC에 연결될 수 있습니다.",
      apply:"각 선택지가 실제 트래픽의 방향과 주소/포트에 일치하는지, 그리고 더 높은 우선순위 규칙이 먼저 허용·차단하는지 순서대로 확인해야 합니다.",
      exam:"NSG는 '낮은 숫자 우선 → 첫 일치 종료'를 먼저 적고 문제를 푸세요."
    };
    if (/VNet.*피어|peering/i.test(text)) return {
      rule:"VNet peering은 주소 공간이 겹치지 않는 두 VNet을 Azure 백본으로 직접 연결합니다. 피어링은 기본적으로 전이적이지 않습니다.",
      apply:"두 VNet 사이의 직접 통신이 목적이면 UDR이나 NSG가 아니라 peering 자체가 연결 기능입니다. 허브를 경유해야 한다면 게이트웨이 전송/UDR 같은 추가 조건을 따로 봐야 합니다.",
      exam:"연결 기능(peering)과 트래픽 제어(NSG/UDR)를 섞지 마세요."
    };
    if (/SAS|Shared Access Signature|공유 액세스 서명/i.test(text)) return {
      rule:"SAS는 Storage 데이터에 대해 서비스/리소스 범위, 권한, 시작·만료 시간을 제한해 위임하는 토큰입니다. Service SAS, Account SAS, User Delegation SAS는 서명 방식과 범위가 다릅니다.",
      apply:"문제에서 필요한 서비스 수와 권한 종류, 계정 키 사용 여부를 먼저 확인한 다음 최소한의 범위를 갖는 SAS 형식을 선택합니다.",
      exam:"SAS 문제는 '누가 서명하는가 + 어느 서비스까지 + 어떤 권한까지' 세 칸으로 정리하세요."
    };
    if (/Backup|백업/i.test(text) && /Site Recovery|복구/i.test(text)) return {
      rule:"Azure Backup은 복구 지점을 보존해 특정 시점으로 복원하는 서비스이고, Site Recovery는 지속 복제와 장애 조치를 제공하는 재해 복구 서비스입니다.",
      apply:"문제가 시점 복원/보존을 묻는지, 다른 위치로 복제 후 failover를 묻는지 구분해야 합니다.",
      exam:"Backup = 복구 지점, Site Recovery = 복제 + failover로 기억하세요."
    };
    return null;
  }

  function detailedReason(q, assessment) {
    if (q.source === 132) {
      return "첫 번째 요구는 표준 사용자가 새 서비스 주체를 만들 수 없게 하는 것입니다. 그래서 'Users can register applications'를 No로 바꿔 일반 사용자의 앱 등록 권한을 제한합니다. 두 번째 요구는 표준 사용자가 웹 관리 포털 대신 PowerShell 또는 Microsoft Graph만 사용하도록 하는 것입니다. 따라서 'Restrict access to Azure AD administration portal'을 Yes로 설정해 관리 센터 UI 접근을 제한합니다. 두 설정은 서로 다른 요구사항을 하나씩 직접 충족합니다.";
    }
    const deep = deepExplanation(q);
    if (deep) return `${deep.rule} ${deep.apply}`;
    const items = exactAnswerItems(q);
    if (items.length) {
      const effects = items.map(item => answerEffect(item.text, q));
      const useful = effects.filter(v => !v.startsWith("원본 답안에서 선택된 실제 값"));
      if (useful.length) return useful.join(" ");
    }
    return decisionReason(q, assessment);
  }

  function examPointFor(q, assessment) {
    if (q.source === 132) return "Entra의 기본 사용자 권한 문제는 '무엇을 못 하게 할 것인가'를 기능별로 나눠 봅니다. 앱 등록/서비스 주체 생성 제한과 관리 포털 접근 제한은 서로 다른 설정입니다. 포털 접근 제한을 PowerShell/Graph 권한 제한과 같은 것으로 해석하면 안 됩니다.";
    const deep = deepExplanation(q);
    if (deep) return deep.exam;
    return q.tip || assessment.principle;
  }

  function explanationV2For(q) {
    return explanationsV2[String(q.source)] || explanationsV2[q.source] || null;
  }

  function formatStudyText(value = "") {
    let text = escapeHtml(value == null ? "" : value);
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return text;
  }

  function normalizeAnswerValue(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(v => String(v).trim()).filter(Boolean);
    if (value == null || value === "") return [];
    return [String(value).trim()];
  }

  function isGenericPdfAnswer(values) {
    return values.some(v => /아래 설명|설명을 참조|정답 이미지 참고/i.test(v));
  }

  function v2AnswerLines(q, v2) {
    const resolved = normalizeAnswerValue(v2?.resolved_answer);
    if (resolved.length && !isGenericPdfAnswer(resolved)) return resolved;
    const pdf = normalizeAnswerValue(v2?.pdf_answer);
    if (pdf.length && !isGenericPdfAnswer(pdf)) return pdf;
    const exact = exactAnswerItems(q);
    if (exact.length) return exact.map(item => item.text);
    if (Array.isArray(q.correctText) && q.correctText.length) return q.correctText;
    if (Array.isArray(q.correct) && q.correct.length) return q.correct;
    return ["원본 PDF 정답 이미지 참고"];
  }

  function usefulOptionAnalysis(lines) {
    if (!Array.isArray(lines)) return [];
    const genericPatterns = [
      /문제의 핵심 규칙\/필수 조건을 직접 충족하지 않거나/i,
      /문제에서 요구하는 실제 기능\/권한\/범위를 정답 선택지처럼 직접 충족하지 못한다/i,
      /요구사항과 맞지 않습니다/i,
      /최종 상태를 직접 만들지 못하거나 적용 범위·선행 조건이 맞지 않습니다/i
    ];
    return lines
      .map(line => (line && typeof line === "object")
        ? `${line.letter ? line.letter + ". " : ""}${line.note || line.text || ""}`.trim()
        : line)
      .filter(line => line && !genericPatterns.some(re => re.test(line)));
  }

  function normText(v) {
    return String(v || "").replace(/[\s`"'“”‘’.,·]/g, "").toLowerCase();
  }
  function dedupeAgainst(lines, refs) {
    const seen = new Set(refs.map(normText).filter(Boolean));
    const out = [];
    for (const line of lines) {
      const key = normText(line);
      if (!key || seen.has(key)) continue;
      if ([...seen].some(r => r.length > 25 && (r.includes(key) || key.includes(r)))) continue;
      seen.add(key);
      out.push(line);
    }
    return out;
  }

  function renderV2Explanation(q, v2, assessment) {
    const detail = v2?.detailed_explanation || {};
    const goal = detail.what_is_asked || v2?.goal || extractQuestionGoal(q);
    const answers = v2AnswerLines(q, v2);
    const rule = detail.key_rule_and_top_comment_logic || v2?.community_top_summary || "문제의 리소스, 작업, 범위와 선행 조건을 실제 값에 대입해 정답을 판단합니다.";
    const application = dedupeAgainst(Array.isArray(detail.application) ? detail.application.filter(Boolean) : [], [rule, goal]);
    const optionLines = usefulOptionAnalysis(detail.option_analysis);
    let examPoint = detail.exam_point || "";
    if (!dedupeAgainst([examPoint], [rule, ...application]).length) examPoint = "";
    if (!examPoint) examPoint = q.tip || assessment.principle || "";
    if (!dedupeAgainst([examPoint], [rule, ...application]).length) examPoint = "";
    const verified = currentVerified[String(q.source)] || currentVerified[q.source] || [];
    const answerImageSources = effectiveAnswerImages(q);
    const answerText = v2?.answerText || "";
    const answerNote = v2?.answerNote || "";   // 원본 PDF 답안을 버리고 현행 자료로 재확인한 문항의 안내문
    const explainImg = v2?.explainImage
      ? `<section class="explanation-section explain-figure">
           <h4>${escapeHtml(v2.explainTitle || "판단 흐름")}</h4>
           <img src="${escapeHtml(v2.explainImage)}" alt="해설 도해" loading="lazy">
           <p class="explain-figure-open"><button type="button" class="image-open-button" data-src="${escapeHtml(v2.explainImage)}">원본 크기 보기</button></p>
         </section>` : "";
    const answerImages = answerImageSources.length
      ? `<div class="answer-images"><strong>원본 PDF 정답 이미지</strong><p class="answer-image-help">HOTSPOT·배치형은 원본 답안 이미지를 함께 두어 드롭다운/영역 값을 직접 확인할 수 있게 했습니다.</p>${answerImageSources.map(src => `<div class="answer-image-item"><img src="${escapeHtml(src)}" alt="Q${q.source} 정답 영역" loading="lazy"><a class="image-open-link" href="${escapeHtml(src)}" target="_blank" rel="noopener">원본 크기로 보기</a></div>`).join("")}</div>`
      : (q.kind !== "auto"
        ? `<div class="answer-images answer-missing"><strong>정답 확인</strong>
             <p class="answer-image-help">${answerNote ? escapeHtml(answerNote) : `이 문항은 원본 PDF의 Answer Area가 비어 있어 정답 이미지가 없습니다.${answerText ? " 아래 정답과 해설로 판정하세요." : " 아래 해설과 원문 토론으로 판정하세요."}`}</p>
             ${answerText ? `<p class="answer-text">${formatStudyText(answerText)}</p>` : ""}
             ${(q.discussionUrl || v2?.discussionUrl) ? `<p class="dist-link"><a href="${escapeHtml(q.discussionUrl || v2.discussionUrl)}" target="_blank" rel="noopener">원문 토론에서 정답 확인</a></p>` : ""}
           </div>`
        : "");
    const discussionUrl = v2?.discussion_url || q.discussionUrl || "";
    const votes = Number.isFinite(v2?.community_upvotes) ? ` · 추천 ${v2.community_upvotes}` : "";
    const communityLabel = v2?.community_status === "retrieved"
      ? `ExamTopics 상위 해설 참고${votes}`
      : (discussionUrl ? "PDF 원문 + Azure 규칙 · 토론 링크 보존" : "PDF 원문 + Azure 규칙");
    const conflict = /conflict|mixed/i.test(v2?.agreement || "") || /이견|충돌/.test(v2?.agreement_label || "");
    const conflictBlock = conflict
      ? `<section class="explanation-section explanation-caution"><h4>⚠ 원본 답안과 토론 의견 확인</h4><p>${formatStudyText(v2?.agreement_label || "상위 댓글에 이견이 있습니다.")} CBT 채점 기준은 원본 PDF 답안을 유지하고, 해설에는 이견이 있다는 사실을 표시했습니다.</p></section>`
      : "";
    const currentBlock = verified.length
      ? `<section class="explanation-section current-difference"><h4>2026 현재 Azure에서 달라진 점</h4>${verified.map(item => `<article><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.note)}</p><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Microsoft Learn에서 현재 기준 확인</a></article>`).join("")}</section>`
      : "";
    const dist = Array.isArray(v2?.answerDistribution) ? v2.answerDistribution : [];
    const agree = v2?.answerAgreement || null;
    const linkBad = v2?.linkMismatch === true;
    const distBlock = (dist.length && !linkBad)
      ? `<section class="explanation-section answer-dist"><h4>원문 토론 답안 분포</h4>
          <div class="dist-rows">${dist.map(x => `<div class="dist-row"><span class="dist-ans">${escapeHtml(x.answer)}</span><span class="dist-bar"><i style="width:${Math.min(100, Math.round(x.votes / Math.max(1, dist[0].votes) * 100))}%"></i></span><span class="dist-num">댓글 ${x.comments} · 추천 ${x.votes}</span></div>`).join("")}</div>
          ${agree ? `<p class="dist-note">ExamTopics 제안답 <strong>${escapeHtml(agree.suggested || "-")}</strong> · 이 앱의 정답 <strong>${escapeHtml(agree.app)}</strong>${agree.status !== "일치" ? ` <span class="dist-warn">(${escapeHtml(agree.status)} — 공식 문서 기준으로 재판정한 문항)</span>` : ""}</p>` : ""}
          ${v2?.discussionUrl ? `<p class="dist-link"><a href="${escapeHtml(v2.discussionUrl)}" target="_blank" rel="noopener">원문 토론 열기</a></p>` : ""}
        </section>`
      : "";
    const currentNote = detail.current_note || "";
    const currentNoteBlock = currentNote
      ? `<section class="explanation-section current-difference"><h4>현행 Azure 기준 참고</h4><p>${formatStudyText(currentNote)}</p></section>`
      : "";
    const scopeBlock = assessment.scope === "out"
      ? `<section class="explanation-section scope-note"><h4>현행 AZ-104 범위 참고</h4><p>${escapeHtml(assessment.scopeNote)}</p></section>`
      : "";
    const optionBlock = optionLines.length
      ? `<section class="explanation-section"><h4>⑤ 선택지별 판정</h4><div class="choice-analysis-v2">${optionLines.map(line => `<p>${formatStudyText(line)}</p>`).join("")}</div></section>`
      : "";
    const applicationBlock = application.length
      ? `<section class="explanation-section explanation-focus"><h4>④ 문제 조건에 적용하면</h4><ol class="application-steps">${application.map(line => `<li>${formatStudyText(line)}</li>`).join("")}</ol></section>`
      : "";
    const answerSource = v2?.answer_source ? `<span class="answer-source-note">${escapeHtml(v2.answer_source)}</span>` : "";
    const sourceActions = [
      `<a href="https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/az-104" target="_blank" rel="noopener">2026 AZ-104 공식 기술 목록</a>`,
      discussionUrl ? `<a href="${escapeHtml(discussionUrl)}" target="_blank" rel="noopener">원본 토론 보기</a>` : ""
    ].filter(Boolean).join("");

    els.explanation.className = "explanation";
    els.explanation.innerHTML = `
      <h3>문항 해설</h3>
      <div class="answer-summary"><strong>정답</strong><br>${answers.map((a, i) => `<span>${answers.length > 1 ? `${i + 1}. ` : ""}${formatStudyText(a)}</span>`).join("<br>")}${answerSource}</div>
      <section class="explanation-section explanation-focus"><h4>① 문제에서 묻는 것</h4><p>${formatStudyText(goal)}</p></section>
      <section class="explanation-section answer-ground${answerNote ? " answer-rechecked" : ""}"><h4>② 정답 기준</h4><p>${answerNote ? `<strong>현행 자료 기준으로 재확인한 문항</strong> — ${escapeHtml(answerNote)}` : "원본 PDF 정답을 채점 기준으로 유지합니다. 이미지형 문항은 판독·복원된 실제 선택값을 우선 표시하고 원본 정답 이미지를 함께 제공합니다."}</p></section>
      <section class="explanation-section core-rule"><h4>③ 왜 이 답인가 <span class="source-label">${escapeHtml(communityLabel)}</span></h4><p>${formatStudyText(rule)}</p></section>
      ${applicationBlock}
      ${optionBlock}
      ${examPoint ? `<section class="explanation-section exam-point"><h4>${optionLines.length ? "⑥" : "⑤"} 시험장에서 기억할 포인트</h4><p>${formatStudyText(examPoint)}</p></section>` : ""}
      ${conflictBlock}
      ${explainImg}
      ${distBlock}
      ${currentNoteBlock}
      ${currentBlock}
      ${scopeBlock}
      ${answerImages}
      <div class="explanation-actions">${sourceActions}</div>`;
  }

  function showExplanation(q) {
    view.revealed = true;
    const assessment = annotations?.assessQuestion(q) || { scope:"current", scopeNote:"", principle:q.tip || "", studyGuide:"https://learn.microsoft.com/en-us/credentials/certifications/resources/study-guides/az-104" };
    const v2 = explanationV2For(q);
    if (!v2) {
      els.explanation.className = "explanation";
      els.explanation.innerHTML = `<h3>문항 해설</h3><div class="answer-summary"><strong>정답</strong><br>${escapeHtml((q.correctText || []).join(" / ") || "원본 정답 참고")}</div><section class="explanation-section"><h4>해설 데이터</h4><p>이 문항의 v2 문항별 해설 데이터를 찾지 못했습니다.</p></section>`;
      return;
    }
    renderV2Explanation(q, v2, assessment);
    els.explanation.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function move(delta) {
    const next = state.cursor + delta;
    if (next < 0) return;
    if (next >= state.queue.length) {
      if (state.sessionMode === "exam") return finishExam();
      return finishPractice();
    }
    state.cursor = next;
    saveState();
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function wrongList(minAttempts) {
    return dataset.questions
      .map(q => ({ q, r: recordFor(q.source) }))
      .filter(x => x.r.result === "wrong" && (!minAttempts || (x.r.attempts || 1) >= minAttempts))
      .sort((a, b) => new Date(b.r.updatedAt || 0) - new Date(a.r.updatedAt || 0));
  }

  function setPanel(title, showActions) {
    if (els.wnTitle) els.wnTitle.textContent = title;
    if (els.wnActions) els.wnActions.classList.toggle("hidden", !showActions);
  }

  function openWrongNote() {
    setPanel("오답노트", true);
    const all = wrongList(0);
    const repeat = wrongList(2);
    const byCh = {};
    all.forEach(x => { byCh[x.q.chapter] = (byCh[x.q.chapter] || 0) + 1; });
    const CH = { 1: "1장 ID·거버넌스", 2: "2장 Storage", 3: "3장 Compute", 4: "4장 Networking", 5: "5장 모니터링" };

    els.wnStats.innerHTML = `
      <div class="wn-kpi"><strong>${all.length}</strong><span>틀린 문제</span></div>
      <div class="wn-kpi"><strong>${repeat.length}</strong><span>2회 이상 오답</span></div>
      ${Object.keys(CH).map(c => `<div class="wn-kpi small"><strong>${byCh[c] || 0}</strong><span>${CH[c]}</span></div>`).join("")}`;

    els.wnList.innerHTML = all.length
      ? all.map(x => `<button class="wn-item" data-src="${x.q.source}">
            <span class="wn-no">${x.q.practice}</span>
            <span class="wn-body"><strong>${CH[x.q.chapter] || ""} · ${escapeHtml(x.q.topic)}</strong>
            <em>${escapeHtml(String(x.q.questionText).replace(/\s+/g, " ").slice(0, 78))}…</em></span>
            <span class="wn-cnt">${x.r.attempts || 1}회</span>
          </button>`).join("")
      : `<p class="wn-empty">아직 틀린 문제가 없습니다. 문제를 풀면 여기에 쌓입니다.</p>`;

    els.wnList.querySelectorAll(".wn-item").forEach(btn => btn.addEventListener("click", () => {
      const src = Number(btn.dataset.src);
      state.queue = all.map(x => x.q.source);
      state.cursor = state.queue.indexOf(src);
      state.sessionMode = "practice";
      saveState();
      els.wrongNote.classList.add("hidden");
      showQuiz();
    }));

    els.wnStartAll.disabled = !all.length;
    els.wnStartRepeat.disabled = !repeat.length;
    els.welcome.classList.add("hidden");
    els.quiz.classList.add("hidden");
    els.examResult.classList.add("hidden");
    els.wrongNote.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const CH_S = { 1: "1장", 2: "2장", 3: "3장", 4: "4장", 5: "5장" };

  function showExamRuns() {
    setPanel("모의고사 기록", false);
    const runs = (Array.isArray(state.examRuns) ? state.examRuns : []).slice().reverse();
    if (!runs.length) { toast("아직 완료한 모의고사가 없습니다."); return; }
    const n = runs.length;
    const avg = Math.round(runs.reduce((s, r) => s + r.correct / Math.max(1, r.total) * 100, 0) / n);
    const best = Math.max(...runs.map(r => Math.round(r.correct / Math.max(1, r.total) * 100)));
    els.wnStats.innerHTML = `
      <div class="wn-kpi"><strong>${n}</strong><span>응시 횟수</span></div>
      <div class="wn-kpi"><strong>${avg}%</strong><span>평균 점수</span></div>
      <div class="wn-kpi"><strong>${best}%</strong><span>최고 점수</span></div>`;
    els.wnList.innerHTML = runs.map((r, i) => {
      const pct = Math.round(r.correct / Math.max(1, r.total) * 100);
      const no = n - i;
      const d = new Date(r.at);
      const date = `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
      const chs = Object.keys(r.byChapter || {}).sort().map(c => `${CH_S[c] || c} ${r.byChapter[c].c}/${r.byChapter[c].t}`).join(" · ");
      return `<div class="run-item">
        <div class="run-head"><span class="run-no">${no}회차</span><span class="run-date">${date}</span>
          <span class="run-score ${pct >= 80 ? "good" : pct >= 70 ? "mid" : "low"}">${r.correct} / ${r.total} · ${pct}%</span></div>
        <div class="run-ch">${escapeHtml(chs)}</div>
        <div class="run-act">
          <button class="run-btn" data-run="${r.id}" data-mode="wrong" ${r.wrong.length ? "" : "disabled"}>틀린 문제 ${r.wrong.length}개 복습</button>
          <button class="run-btn" data-run="${r.id}" data-mode="all">이 회차 다시 풀기</button>
        </div>
      </div>`;
    }).join("");
    els.wnList.querySelectorAll(".run-btn").forEach(b => b.addEventListener("click", () => {
      const run = (state.examRuns || []).find(x => String(x.id) === b.dataset.run);
      if (!run) return;
      const list = b.dataset.mode === "wrong" ? run.wrong : run.queue;
      if (!list || !list.length) { toast("해당 문항이 없습니다."); return; }
      state.queue = list.slice();
      state.cursor = 0;
      state.sessionMode = "practice";
      saveState();
      els.wrongNote.classList.add("hidden");
      showQuiz();
    }));
    els.wnStartAll.disabled = true;
    els.wnStartRepeat.disabled = true;
    els.welcome.classList.add("hidden");
    els.quiz.classList.add("hidden");
    els.examResult.classList.add("hidden");
    els.wrongNote.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startWrongSession(minAttempts) {
    const list = wrongList(minAttempts);
    if (!list.length) { toast("해당하는 오답이 없습니다."); return; }
    state.queue = shuffle(list.map(x => x.q.source));
    state.cursor = 0;
    state.sessionMode = "practice";
    state.filter = "wrong";
    saveState();
    els.wrongNote.classList.add("hidden");
    showQuiz();
  }

  // ===== 오답 신고 =====
  function reportedSources() { return new Set(myReports.map(r => String(r.source))); }

  function renderReportBar(q) {
    if (!els.reportBar) return;
    const done = reportedSources().has(String(q.source));
    els.reportState.textContent = done ? "신고함" : "";
    els.reportOpen.textContent = done ? "🚩 신고 내용 수정" : "🚩 이 문항 신고";
  }

  function openReport() {
    const q = currentQuestion();
    if (!q) return;
    const prior = myReports.find(r => String(r.source) === String(q.source));
    els.reportQ.textContent = `연습 ${q.practice}번 · 원본 Q${q.source} · ${q.topic}`;
    els.reportKind.value = prior?.kind || "wrong-answer";
    els.reportNote.value = prior?.note || "";
    const picked = [...view.selected].join("") || Object.values(view.binaryAnswers || {}).join("/") || "(미선택)";
    const app = q.kind === "auto" ? (q.correctText || []).join(" / ") : "(자기채점)";
    els.reportCtx.textContent = `함께 전송: 내가 고른 답 ${picked} · 앱 정답 ${app} · 채점 ${view.graded ? "완료" : "미채점"}`;
    els.reportMsg.textContent = "";
    els.reportMsg.className = "report-msg";
    els.reportModal.classList.remove("hidden");
    setTimeout(() => els.reportNote.focus(), 60);
  }

  async function sendReport() {
    const q = currentQuestion();
    const id = syncId();
    if (!q) return;
    if (!id) {
      els.reportMsg.textContent = "학습자 이름을 먼저 설정해야 신고가 저장됩니다. 사이드바에서 이름을 등록하세요.";
      els.reportMsg.className = "report-msg bad";
      return;
    }
    const payload = {
      source: q.source, practice: q.practice, kind: els.reportKind.value,
      myAnswer: [...view.selected].join("") || Object.values(view.binaryAnswers || {}).join("/"),
      graded: view.graded ? (recordFor(q.source).result || "none") : "none",
      appAnswer: (q.correctText || []).join(" / "),
      note: els.reportNote.value.trim()
    };
    els.reportSend.disabled = true;
    els.reportMsg.textContent = "전송 중…";
    els.reportMsg.className = "report-msg";
    try {
      const r = await fetch(REPORT_API, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || r.status);
      els.reportMsg.textContent = `신고했습니다. 누적 ${data.count}건.`;
      els.reportMsg.className = "report-msg ok";
      await loadReports();
      renderReportBar(q);
      setTimeout(() => els.reportModal.classList.add("hidden"), 900);
    } catch (e) {
      const msg = String(e?.message || e);
      const hint = msg.includes("429") || msg.toLowerCase().includes("limit")
        ? "오늘 저장 한도에 걸린 것 같습니다. 아래 내용을 복사해 두셨다가 나중에 다시 보내세요."
        : msg.includes("kv_not_bound") ? "서버 저장소가 연결되어 있지 않습니다."
        : msg.includes("invalid_id") ? "학습자 이름 형식이 맞지 않습니다. 영문·숫자 3자 이상으로 바꿔주세요."
        : "전송에 실패했습니다.";
      els.reportMsg.innerHTML = `${escapeHtml(hint)} <small>(${escapeHtml(msg)})</small><br>
        <button id="reportCopy" class="linklike">신고 내용 복사</button>`;
      els.reportMsg.className = "report-msg bad";
      $("reportCopy")?.addEventListener("click", () => {
        const txt = `${q.practice}번 (원본 Q${q.source})\n${els.reportKind.value}\n${els.reportNote.value}`;
        navigator.clipboard?.writeText(txt).then(() => toast("복사했습니다."), () => toast("복사 실패"));
      });
    } finally { els.reportSend.disabled = false; }
  }

  async function clearMyReports() {
    const id = syncId();
    if (!id) { toast("학습자 이름이 설정되어 있지 않습니다."); return; }
    if (!myReports.length) { toast("지울 신고가 없습니다."); return; }
    if (!confirm(`신고 ${myReports.length}건을 모두 지웁니다. 되돌릴 수 없습니다.`)) return;
    try {
      const r = await fetch(REPORT_API, { method: "DELETE" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || r.status);
      await loadReports();
      const q = currentQuestion();
      if (q) renderReportBar(q);
      toast("신고 기록을 초기화했습니다.");
    } catch (e) {
      toast("초기화 실패. 잠시 후 다시 시도하세요.");
    }
  }

  async function loadReports() {
    const id = syncId();
    if (!id) { myReports = []; if (els.reportCount) els.reportCount.textContent = "0"; return; }
    try {
      const r = await fetch(REPORT_API, { cache: "no-store" });
      const data = await r.json();
      myReports = Array.isArray(data?.reports) ? data.reports : [];
    } catch { myReports = []; }
    if (els.reportCount) els.reportCount.textContent = String(myReports.length);
  }

  const KIND_LABEL = { "wrong-answer": "정답 오류", "bad-explanation": "해설 문제", translation: "번역·오탈자", image: "이미지 문제", other: "기타" };

  function showReportList() {
    setPanel("내 신고 목록", false);
    if (!myReports.length) { toast("아직 신고한 문항이 없습니다."); return; }
    const rows = myReports.slice().reverse().map(r => {
      const q = dataset.questions.find(x => String(x.source) === String(r.source));
      return `<button class="wn-item" data-src="${r.source}">
        <span class="wn-no">${q ? q.practice : "?"}번</span>
        <span class="wn-body"><strong>${escapeHtml(KIND_LABEL[r.kind] || r.kind)}</strong>
        <em>${escapeHtml(r.note || "(메모 없음)")}</em></span>
        <span class="wn-cnt">${(r.at || "").slice(0, 10)}</span></button>`;
    }).join("");
    els.wnStats.innerHTML = `<div class="wn-kpi"><strong>${myReports.length}</strong><span>신고한 문항</span></div>`;
    els.wnList.innerHTML = rows;
    els.wnList.querySelectorAll(".wn-item").forEach(b => b.addEventListener("click", () => {
      const src = Number(b.dataset.src);
      state.queue = myReports.map(r => Number(r.source));
      state.cursor = state.queue.indexOf(src);
      state.sessionMode = "practice";
      saveState();
      els.wrongNote.classList.add("hidden");
      showQuiz();
    }));
    els.wnStartAll.disabled = true;
    els.wnStartRepeat.disabled = true;
    els.welcome.classList.add("hidden");
    els.quiz.classList.add("hidden");
    els.wrongNote.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderHint(q) {
    if (!els.hintBox) return;
    const text = hints[String(q.source)];
    els.hintBody.classList.add("hidden");
    els.hintBody.textContent = "";
    if (!text || state.sessionMode === "exam") { els.hintBox.classList.add("hidden"); return; }
    els.hintBox.classList.remove("hidden");
    els.hintToggle.textContent = "💡 힌트 보기";
    els.hintBody.textContent = text;
  }

  function chapterBreakdown() {
    const agg = {};
    Object.entries(state.examSessionResults || {}).forEach(([source, r]) => {
      const q = dataset.questions.find(item => String(item.source) === String(source));
      if (!q) return;
      const c = q.chapter || 0;
      agg[c] = agg[c] || { correct: 0, total: 0 };
      agg[c].total++;
      if (r.result === "correct") agg[c].correct++;
    });
    return Object.keys(agg).sort().map(c => {
      const a = agg[c];
      const pct = Math.round(a.correct / a.total * 100);
      return `${CH_NAME[c] || c}: ${a.correct}/${a.total} (${pct}%)`;
    }).join(" · ");
  }

  const CH_SHORT = { 1: "1장 ID·거버넌스", 2: "2장 Storage", 3: "3장 Compute", 4: "4장 Networking", 5: "5장 모니터링" };

  function renderResult({ mode, results, total, gotPoints, maxPoints, real }) {
    const correct = results.filter(r => r.result === "correct").length;
    const wrong = results.filter(r => r.result === "wrong");
    const answered = results.length;
    const hasPts = Number.isFinite(maxPoints) && maxPoints > 0;
    const pct = hasPts ? Math.round(gotPoints / maxPoints * 100) : (total ? Math.round(correct / total * 100) : 0);

    els.resultEyebrow.textContent = mode === "exam" ? "EXAM COMPLETE" : "SESSION COMPLETE";
    els.resultTitle.textContent = mode === "exam" ? (real ? "실전 모의고사 결과" : "모의고사 결과") : "학습 세션 결과";
    els.examScore.textContent = hasPts ? `${gotPoints} / ${maxPoints}` : `${correct} / ${total}`;
    els.examPercent.textContent = `${pct}%`;

    const missed = total - answered;
    const grade = pct >= 80 ? "합격권입니다." : pct >= 70 ? "합격선에 근접했습니다." : "더 다져야 합니다.";
    const ptsTxt = hasPts ? `${maxPoints}점 만점에 ${gotPoints}점 · ` : "";
    els.examSummary.textContent = missed > 0
      ? `${ptsTxt}${answered}문항 응답 · ${missed}문항 미응답 · 정답 ${correct} · 오답 ${wrong.length}. ${grade}`
      : `${ptsTxt}${total}문항 완료 · 정답 ${correct} · 오답 ${wrong.length}. ${grade}`;
    els.examSummary.style.whiteSpace = "pre-line";

    // 장별 정답률
    const agg = {};
    results.forEach(r => {
      const c = r.chapter || 0;
      agg[c] = agg[c] || { c: 0, t: 0 };
      agg[c].t++;
      if (r.result === "correct") agg[c].c++;
    });
    els.resultChapters.innerHTML = Object.keys(agg).sort().map(c => {
      const a = agg[c], p = Math.round(a.c / a.t * 100);
      return `<div class="result-ch${p < 70 ? " low" : ""}"><b>${CH_SHORT[c] || c}</b>
        <div class="rc-bar"><i style="width:${p}%"></i></div>
        <div class="rc-num">${a.c} / ${a.t} · ${p}%</div></div>`;
    }).join("");

    // 틀린 문제 목록
    els.resultWrong.innerHTML = wrong.length
      ? `<h3>틀린 문제 ${wrong.length}개</h3><div class="rw-list">${wrong.map(r => {
          const q = dataset.questions.find(x => String(x.source) === String(r.source));
          if (!q) return "";
          const body = String(q.questionText).replace(/\s+/g, " ").replace(/^\d+\.\s*/, "").slice(0, 70);
          return `<button class="rw-item" data-src="${q.source}"><span class="rw-no">${q.practice}번</span><span class="rw-txt">${escapeHtml(body)}…</span><span class="rw-topic">${escapeHtml(q.topic)}</span></button>`;
        }).join("")}</div>`
      : `<p class="rw-empty">틀린 문제가 없습니다. 전부 맞혔습니다.</p>`;
    els.resultWrong.querySelectorAll(".rw-item").forEach(b => b.addEventListener("click", () => {
      const src = Number(b.dataset.src);
      state.queue = wrong.map(r => Number(r.source));
      state.cursor = state.queue.indexOf(src);
      state.sessionMode = "practice";
      saveState();
      els.examResult.classList.add("hidden");
      showQuiz();
    }));

    els.reviewExamWrong.disabled = !wrong.length;
    els.quiz.classList.add("hidden");
    els.welcome.classList.add("hidden");
    els.wrongNote?.classList.add("hidden");
    els.examResult.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finishPractice() {
    const total = state.queue.length;
    const results = state.queue.map(src => {
      const q = dataset.questions.find(x => String(x.source) === String(src));
      const r = recordFor(src);
      return { source: src, result: r.result, chapter: q ? q.chapter : 0 };
    }).filter(r => r.result);
    renderResult({ mode: "practice", results, total });
  }

  function finishExam() {
    stopExamTimer();
    const results = Object.entries(state.examSessionResults || {});
    const correct = results.filter(([, r]) => r.result === "correct").length;
    const answered = results.length;
    const total = state.queue.length || 50;
    const maxPoints = pointsOfSources(state.queue || []);
    const gotPoints = results.reduce((a, [src, r]) => a + earnedOfQ(questionBySource(src), r.result, r.selected), 0);
    const pct = maxPoints ? Math.round(gotPoints / maxPoints * 100) : 0;
    results.forEach(([source, r]) => {
      const q = dataset.questions.find(item => String(item.source) === String(source));
      if (!q) return;
      const old = recordFor(q.source);
      state.progress[String(q.source)] = { ...old, result: r.result, selected: r.selected, attempts: (old.attempts || 0) + 1, updatedAt: new Date().toISOString() };
    });
    const rows = results.map(([source, r]) => {
      const q = dataset.questions.find(x => String(x.source) === String(source));
      return { source, result: r.result, chapter: q ? q.chapter : 0 };
    });
    // 회차 기록 저장
    const okCount = rows.filter(r => r.result === "correct").length;
    const rec = {
      id: Date.now(),
      at: new Date().toISOString(),
      total,
      points: gotPoints,
      maxPoints,
      real: !!state.examReal,
      answered: rows.length,
      correct: okCount,
      wrong: rows.filter(r => r.result === "wrong").map(r => Number(r.source)),
      queue: (state.queue || []).slice(),
      byChapter: rows.reduce((acc, r) => {
        const c = r.chapter || 0;
        acc[c] = acc[c] || { c: 0, t: 0 };
        acc[c].t++; if (r.result === "correct") acc[c].c++;
        return acc;
      }, {})
    };
    state.examRuns = Array.isArray(state.examRuns) ? state.examRuns : [];
    state.examRuns.push(rec);
    if (state.examRuns.length > 30) state.examRuns = state.examRuns.slice(-30);
    renderResult({ mode: "exam", results: rows, total, gotPoints, maxPoints, real: !!state.examReal });
    saveState();
    clearTimeout(syncTimer);
    syncFlush();   // 회차 기록은 바로 서버에 올린다
  }

  function reviewExamWrong() {
    const wrong = Object.entries(state.examSessionResults || {}).filter(([, r]) => r.result === "wrong").map(([source]) => Number(source));
    if (!wrong.length) { toast("이번 실전 연습에서 기록된 오답이 없습니다."); return; }
    state.sessionMode = "study";
    state.queue = wrong;
    state.cursor = 0;
    state.filter = "wrong";
    state.order = "sequential";
    saveState();
    showQuiz();
  }

  function backHome() {
    state.sessionMode = "study";
    state.queue = [];
    state.cursor = 0;
    saveState();
    els.quiz.classList.add("hidden");
    els.examResult.classList.add("hidden");
    els.wrongNote?.classList.add("hidden");
    els.gate?.classList.add("hidden");
    els.questionJump.disabled = false;
    els.jumpButton.disabled = false;
    els.welcome.classList.remove("hidden");
    if (location.search) history.replaceState(null, "", location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleBookmark() {
    const q = currentQuestion();
    if (!q) return;
    const old = recordFor(q.source);
    state.progress[String(q.source)] = { ...old, bookmarked: !old.bookmarked };
    saveState();
    renderQuestion();
    toast(!old.bookmarked ? "북마크에 추가했습니다." : "북마크를 해제했습니다.");
  }

  function jumpToQuestion() {
    const value = Number(els.questionJump.value.replace(/[^0-9]/g, ""));
    if (!value) return;
    const target = dataset.questions.find(q => q.source === value) || dataset.questions.find(q => q.practice === value);
    if (!target) { toast("해당 번호의 문제를 찾지 못했습니다."); return; }
    state.queue = dataset.questions.map(q => q.source);
    state.cursor = state.queue.indexOf(target.source);
    state.filter = "all";
    state.order = "sequential";
    state.sessionMode = "study";
    saveState();
    showQuiz();
    els.questionJump.value = "";
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify({ version: dataset.version, exportedAt: new Date().toISOString(), progress: state.progress }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `AZ-104_CBT_학습기록_${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  async function importProgress(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text());
      if (!incoming.progress || typeof incoming.progress !== "object") throw new Error("invalid");
      state.progress = { ...state.progress, ...incoming.progress };
      saveState();
      toast("학습 기록을 가져왔습니다.");
    } catch { toast("올바른 학습 기록 파일이 아닙니다."); }
    event.target.value = "";
  }

  async function resetProgress() {
    if (!confirm("정답·오답·북마크·모의고사 기록을 서버에서 모두 지울까요? 이 작업은 되돌릴 수 없습니다.")) return;
    try {
      const r = await api(PROGRESS_API, { method: "DELETE" });
      if (!r.ok) throw new Error(r.status);
    } catch (e) { toast("초기화 실패. 잠시 후 다시 시도하세요."); return; }
    state = { ...defaults, light: state.light };
    lastSent = {}; lastSession = ""; sentRuns = new Set();
    saveState();
    els.quiz.classList.add("hidden");
    els.welcome.classList.remove("hidden");
    toast("학습 기록을 초기화했습니다.");
  }

  // 기본은 다크(노선도와 동일). light 만 세션에 저장한다.
  function setTheme(light) {
    state.light = light;
    document.body.classList.toggle("light", light);
    saveState();
  }

  els.datasetCount.textContent = dataset.questionCount;
  els.autoCount.textContent = dataset.autoGradeCount;
  els.selfCount.textContent = dataset.selfGradeCount;
  document.body.classList.toggle("light", state.light);
  updateStats();

  els.startSession.addEventListener("click", () => startSession());
  els.quickStart.addEventListener("click", () => startSession({ filter: "all", order: "sequential" }));
  els.examStart.addEventListener("click", () => startExamSession(false));
  els.examStartSide?.addEventListener("click", () => startExamSession(false));
    els.realExamStart?.addEventListener("click", () => startExamSession(true));
    els.realExamStartSide?.addEventListener("click", () => startExamSession(true));
  els.logoutBtn?.addEventListener("click", async () => {
    if (!confirm("로그아웃할까요?")) return;
    closeSidebar?.();
    await logout();
  });
  els.openWrongNote?.addEventListener("click", openWrongNote);
  els.navHome?.addEventListener("click", () => { closeSidebar?.(); backHome(); });
  els.navWrongNote?.addEventListener("click", () => { closeSidebar?.(); openWrongNote(); });
  els.navExamRuns?.addEventListener("click", () => { closeSidebar?.(); showExamRuns(); });
  els.openExamRuns?.addEventListener("click", showExamRuns);
  els.openExamRuns2?.addEventListener("click", () => { els.examResult.classList.add("hidden"); showExamRuns(); });
  els.reportOpen?.addEventListener("click", openReport);
  els.reportCancel?.addEventListener("click", () => els.reportModal.classList.add("hidden"));
  els.reportSend?.addEventListener("click", sendReport);
  els.reportModal?.addEventListener("click", ev => { if (ev.target === els.reportModal) els.reportModal.classList.add("hidden"); });
  els.openReports?.addEventListener("click", () => { closeSidebar?.(); showReportList(); });
  els.clearReports?.addEventListener("click", clearMyReports);
  els.wnClose?.addEventListener("click", () => { els.wrongNote.classList.add("hidden"); els.welcome.classList.remove("hidden"); });
  els.wnStartAll?.addEventListener("click", () => startWrongSession(0));
  els.wnStartRepeat?.addEventListener("click", () => startWrongSession(2));
  els.openWrongNote2?.addEventListener("click", () => { els.examResult.classList.add("hidden"); openWrongNote(); });
  // 탭을 닫을 때 아직 안 보낸 변경분을 비컨으로 보낸다 (서버가 문항별로 병합하므로 안전)
  window.addEventListener("beforeunload", () => {
    if (!syncReady) return;
    clearTimeout(syncTimer);
    const d = buildDelta();
    if (d.empty) return;
    try { navigator.sendBeacon(PROGRESS_API, new Blob([JSON.stringify(d.body)], { type: "application/json" })); } catch {}
  });
  // 탭을 떠날 때는 올리고, 돌아올 때는 서버 기준으로 다시 맞춘다 (모의고사 진행 중이면 건드리지 않는다)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { syncFlush(); return; }
    if (state.sessionMode === "exam") return;
    syncFlush().then(() => syncPull(true));
  });

  els.hintToggle?.addEventListener("click", () => {
    const hidden = els.hintBody.classList.toggle("hidden");
    els.hintToggle.textContent = hidden ? "💡 힌트 보기" : "💡 힌트 숨기기";
  });
  els.reviewExamWrong.addEventListener("click", reviewExamWrong);
  els.backHome.addEventListener("click", backHome);
  els.prevButton.addEventListener("click", () => move(-1));
  els.nextButton.addEventListener("click", () => move(1));
  els.bookmarkButton.addEventListener("click", toggleBookmark);
  els.jumpButton.addEventListener("click", jumpToQuestion);
  els.questionJump.addEventListener("keydown", e => { if (e.key === "Enter") jumpToQuestion(); });
  function setSidebar(open) {
    els.sidebar.classList.toggle("open", open);
    if (els.sidebarOverlay) els.sidebarOverlay.hidden = !open;
    document.body.classList.toggle("sidebar-open", open);
    els.menuToggle?.setAttribute("aria-expanded", String(open));
  }
  function closeSidebar() { setSidebar(false); }

  els.menuToggle.addEventListener("click", () => setSidebar(!els.sidebar.classList.contains("open")));
  els.sidebarClose?.addEventListener("click", closeSidebar);
  els.sidebarOverlay?.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSidebar(); });
  // 사이드바에서 세션을 시작하거나 필터를 고르면 자동으로 닫는다
  els.sidebar.addEventListener("click", e => {
    if (e.target.closest("button") && window.matchMedia("(max-width: 900px)").matches) {
      if (!e.target.closest("#sidebarClose")) setTimeout(closeSidebar, 120);
    }
  });
  els.themeToggle.addEventListener("click", () => setTheme(!state.light));
  els.exportProgress.addEventListener("click", exportProgress);
  els.importProgress.addEventListener("change", importProgress);
  els.resetProgress.addEventListener("click", resetProgress);

  document.addEventListener("keydown", event => {
    if (event.target.matches("input, select, textarea") || els.quiz.classList.contains("hidden")) return;
    const q = currentQuestion();
    if (!q) return;
    if (/^[1-8]$/.test(event.key) && q.kind === "auto" && !view.graded) {
      const letter = q.options[Number(event.key) - 1];
      if (letter) toggleChoice(letter);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (q.kind === "auto" && !view.graded && view.selected.size) submitAutoAnswer();
      else if (q.kind === "self" && !view.revealed) revealSelfAnswer();
      else if (view.graded) move(1);
    } else if (event.key.toLowerCase() === "b") toggleBookmark();
    else if (event.key === "ArrowLeft") move(-1);
    else if (event.key === "ArrowRight") move(1);
  });

  if (state.queue.length && state.queue.every(source => dataset.questions.some(q => q.source === source))) {
    state.cursor = Math.min(state.cursor, state.queue.length - 1);
  } else {
    state.queue = [];
    state.cursor = 0;
  }

  // ===== 부팅 =====
  // 세션 확인 → 서버에서 진도 받기 → 홈(또는 풀던 문항). 세션이 없으면 api()가 로그인 화면으로 보낸다.
  const startupParams = new URLSearchParams(location.search);
  (async () => {
    try {
      const r = await api("/api/auth/me");
      me = (await r.json()).user;
    } catch { return; }
    renderWhoami();
    const ok = await syncPull(true);
    if (!ok) { toast("서버에 연결하지 못했습니다. 새로고침해 주세요."); return; }
    loadReports();
    els.welcome?.classList.remove("hidden");
    runDeepLink();
  })();

  function runDeepLink() {
    if (startupParams.get("q")) {
      const target = dataset.questions.find(q => q.source === Number(startupParams.get("q")) || q.practice === Number(startupParams.get("q")));
      if (target) {
        state.queue = dataset.questions.map(q => q.source);
        state.cursor = state.queue.indexOf(target.source);
        showQuiz();
      }
    } else if (startupParams.get("start") === "1") {
      startSession({ filter: "all", order: "sequential" });
    } else if (Array.isArray(state.queue) && state.queue.length && currentQuestion()) {
      // 새로고침·재방문 시 마지막으로 보던 문항으로 복귀 (로그인 시 서버 세션에서 큐·위치를 받아오므로 다른 기기에서도 이어진다)
      if (state.sessionMode === "exam") {
        // 모의고사는 타이머가 끊기므로 연습 모드로 되돌려 이어 풀게 한다
        state.sessionMode = "practice";
        saveState();
      }
      showQuiz();
    }
    startupParams.delete("q"); startupParams.delete("start");   // 한 번만 적용
  }

  if (startupParams.get("reveal") === "1" && currentQuestion()) showExplanation(currentQuestion());

  if (startupParams.get("selftest") === "1") {
    setTimeout(() => {
      const assessed = dataset.questions.map(q => annotations.assessQuestion(q));
      const checks = [
        ["dataset count 557", dataset.questions.length === 557],
        ["all questions assessed", assessed.length === 557 && assessed.every(x => x.badges.length && x.principle && x.scopeNote)],
        ["scope classification present", assessed.some(x => x.scope === "current") && assessed.some(x => x.scope === "out")],
        ["terminology annotations present", assessed.some(x => x.terms.length)],
        ["legacy annotations present", assessed.some(x => x.legacy.length)],
        ["all update links are Microsoft Learn", assessed.every(x => [...x.terms, ...x.legacy].every(n => /^https:\/\/learn\.microsoft\.com\//.test(n.url)))],
        ["question status rendered", Boolean(els.questionStatus)],
        ["scope filters available", ["current-scope","out-of-scope","term-change","legacy-change"].every(v => [...els.questionFilter.options].some(o => o.value === v))]
      ];
      const current = assessed.filter(x => x.scope === "current").length;
      const out = assessed.filter(x => x.scope === "out").length;
      const terms = assessed.filter(x => x.terms.length).length;
      const legacy = assessed.filter(x => x.legacy.length).length;
      document.body.innerHTML = `<pre style="margin:0;padding:30px;min-height:100vh;background:#111827;color:#e5e7eb;font:16px/1.8 Consolas,monospace;white-space:pre-wrap">SELFTEST ${checks.every(x=>x[1])?"PASS":"FAIL"}\n${checks.map(x=>`${x[1]?"PASS":"FAIL"} ${x[0]}`).join("\n")}\n\nCLASSIFICATION\ncurrent-linked ${current}\nout-of-list ${out}\nterminology-change ${terms}\nlegacy-change ${legacy}</pre>`;
    }, 100);
  }
})();
