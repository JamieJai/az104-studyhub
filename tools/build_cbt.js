/**
 * 스크랩 JSON( examcademy 파서 산출물 ) → CBT 앱 한 벌 만들기
 *
 *   node tools/build_cbt.js <exam-id> "<표시 이름>" <원본 json> <원본 images 폴더> <dist 폴더명>
 *   예: node tools/build_cbt.js az305 "AZ-305" ../az-305/az305.json ../az-305/images AZ-305_CBT
 *
 * - 앱 본체(app.js/index.html/styles.css)는 SC-300 CBT 를 틀로 복사하고 시험 id·브랜딩만 바꾼다.
 *   (SC-300 판에는 서버 동기화·문항 신고·실전 모의고사·시리즈 묶음이 모두 들어 있다)
 * - 한국어 번역이 없는 시험은 koMissing: true 로 두고 영어 원문만 보여준다.
 */
const fs = require('fs'), path = require('path');

const [examId, title, srcJson, srcImages, distName] = process.argv.slice(2);
if (!distName) { console.error('usage: node tools/build_cbt.js <examId> <title> <json> <images> <distName>'); process.exit(1); }

const REPO = path.resolve(__dirname, '..');
const DIST = path.join(REPO, 'dist', distName);
const GV = examId.toUpperCase() + '_DATA';            // 예: AZ305_DATA
const TPL = path.join(REPO, 'dist', 'SC-300_CBT');

// 공식 스킬 비중 (Microsoft study guide)
const WEIGHTS = {
  az305: {
    'Design identity, governance, and monitoring solutions': [25, 30],
    'Design data storage solutions': [20, 25],
    'Design business continuity solutions': [15, 20],
    'Design infrastructure solutions': [30, 35],
  },
  az900: {
    'Describe cloud concepts': [25, 30],
    'Describe Azure architecture and services': [35, 40],
    'Describe Azure management and governance': [30, 35],
  },
  ai103: {
    'Plan and manage an Azure AI solution': [25, 30],
    'Implement generative AI and agentic solutions': [30, 35],
    'Implement computer vision solutions': [10, 15],
    'Implement text analysis solutions': [10, 15],
    'Implement information extraction solutions': [10, 15],
  },
};
const TOPIC_KO = {
  'Design identity, governance, and monitoring solutions': 'ID·거버넌스·모니터링 설계',
  'Design data storage solutions': '데이터 저장소 설계',
  'Design business continuity solutions': '업무 연속성 설계',
  'Design infrastructure solutions': '인프라 설계',
  'Describe cloud concepts': '클라우드 개념',
  'Describe Azure architecture and services': 'Azure 아키텍처·서비스',
  'Describe Azure management and governance': 'Azure 관리·거버넌스',
  'Plan and manage an Azure AI solution': 'Azure AI 솔루션 계획·관리',
  'Implement generative AI and agentic solutions': '생성형 AI·에이전트 구현',
  'Implement computer vision solutions': '컴퓨터 비전 구현',
  'Implement text analysis solutions': '텍스트 분석 구현',
  'Implement information extraction solutions': '정보 추출 구현',
};

const src = JSON.parse(fs.readFileSync(path.resolve(REPO, srcJson), 'utf8'));
const imgDir = path.resolve(REPO, srcImages);

fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });

// ---------- 본문에서 이미지 추출 → [[IMGn]] 자리표시자 ----------
const usedImages = new Set();
function extractImages(text) {
  const images = [];
  const out = String(text || '').replace(/!\[[^\]]*\]\(([^)]+)\)/g, (m, src) => {
    const file = src.split('/').pop().split('?')[0];
    images.push('assets/' + file); usedImages.add(file);
    return `[[IMG${images.length}]]`;
  });
  return { text: out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim(), images };
}
const pair = en => ({ en, ko: en });          // 번역 전 — 한국어 자리에 영어를 그대로 둔다

// ---------- 문항 변환 ----------
const questions = src.questions.map(q => {
  const stem = extractImages(q.stemRaw);
  const expl = extractImages(q.explanation);
  const out = {
    n: q.questionNumber,
    id: q.questionId || null,
    type: q.type,
    topic: q.topic || '(미분류)',
    topicKo: TOPIC_KO[q.topic] || q.topic || '(미분류)',
    koMissing: true,                            // 한국어 번역 전
    images: stem.images.concat(expl.images),
    stemEn: stem.text,
    stemKo: stem.text,
    explanationEn: expl.text,
    explanationKo: expl.text,
    learnMore: Array.isArray(q.learnMore) ? q.learnMore : [],
  };
  if (q.type === 'multiple_choice') {
    out.choices = (q.choices || []).map(c => ({ label: c.label, en: c.text, ko: c.text }));
    out.answers = q.answers || [];
  } else if (q.type === 'dropdown') {
    out.blanks = (q.blanks || []).map(b => ({
      id: String(b.id), labelEn: b.label || `항목 ${b.id}`, labelKo: b.label || `항목 ${b.id}`,
      options: (b.options || []).map(pair), answer: b.answer,
    }));
    out.template = q.templateMode ? (q.template || '') : '';
  } else if (q.type === 'statements') {
    out.statements = (q.statements || []).map(s => ({ en: s.text, ko: s.text, answer: s.answer }));
    out.columns = q.columns || ['Yes', 'No'];
  } else if (q.type === 'drag_drop') {
    out.items = (q.items || []).map(pair);
    out.slots = (q.slots || []).map(s => ({ id: String(s.id), labelEn: s.label || `항목 ${s.id}`, labelKo: s.label || `항목 ${s.id}`, answer: s.answer }));
    out.reuse = !!q.reuse;
  } else if (q.type === 'answer_reveal') {
    out.answerImages = [];
    out.answerTextEn = q.answerText || '';
    out.answerTextKo = q.answerText || '';
  }
  return out;
});

// ---------- 이미지 복사 ----------
let copied = 0;
for (const f of fs.readdirSync(imgDir)) if (usedImages.has(f)) { fs.copyFileSync(path.join(imgDir, f), path.join(DIST, 'assets', f)); copied++; }
const missing = [...usedImages].filter(f => !fs.existsSync(path.join(DIST, 'assets', f)));

// ---------- 출제 영역 ----------
const counts = {};
for (const q of questions) counts[q.topic] = (counts[q.topic] || 0) + 1;
const weights = WEIGHTS[examId] || {};
const topics = Object.keys(counts).map(en => ({
  en, ko: TOPIC_KO[en] || en,
  weight: weights[en] || [Math.round(counts[en] / questions.length * 100), Math.round(counts[en] / questions.length * 100)],
  count: counts[en],
}));

// ---------- 시리즈 (Solution … Does this meet the goal? 연속 구간) ----------
const isYN = q => q.type === 'multiple_choice' && (q.choices || []).length === 2 && q.choices.every(c => /^(yes|no)$/i.test(c.en.trim()));
const ynNs = questions.filter(isYN).map(q => q.n).sort((a, b) => a - b);
const runs = []; for (const n of ynNs) { const last = runs[runs.length - 1]; if (last && n - last[last.length - 1] === 1) last.push(n); else runs.push([n]); }
const series = runs.filter(r => r.length > 1).map((r, i) => ({
  id: `${examId}-series-${i + 1}`, no: i + 1, title: `솔루션 시리즈 Q${r[0]}~Q${r[r.length - 1]}`, members: r,
}));

const data = {
  version: new Date().toISOString().slice(0, 10) + '.v1',
  title: `${title} CBT`,
  source: src.source || '',
  scrapedAt: new Date().toISOString().slice(0, 10),
  questionCount: questions.length,
  translated: 0,
  topics, questions, sets: [], series,
};
fs.writeFileSync(path.join(DIST, 'data.js'), `window.${GV} = ${JSON.stringify(data)};\n`, 'utf8');

// ---------- 앱 본체 ----------
const brand = examId.replace(/[^0-9]/g, '').slice(-3);   // 사이드바 정사각 아이콘: 시험 번호 3자리로 통일
// 사이드바 제목 아래 한 줄 — 시험 내용과 연결되는 문구 (없으면 6번째 인자 → 출처 URL 순)
const SUBTITLES = {
  az104: 'Azure Administrator 연습',
  az305: 'Azure Solutions Architect 연습',
  az802: 'Windows Server Hybrid 연습',
  az900: 'Azure Fundamentals 연습',
  ai103: 'Azure AI Engineer 연습',
  sc300: 'Identity and Access Administrator 연습',
};
const subtitle = SUBTITLES[examId] || process.argv[8] || String(src.source || '').split('://').pop();
let app = fs.readFileSync(path.join(TPL, 'app.js'), 'utf8').split('\r\n').join('\n');
app = app.replace('window.SC300_DATA', `window.${GV}`)
  .replace(/const THEME_KEY = "sc300cbt\.theme"/, `const THEME_KEY = "${examId}cbt.theme"`)
  .replace(/const EXAM = "sc300"/, `const EXAM = "${examId}"`)
  .replace(/"SC-300 풀이 기록/, `"${title} 풀이 기록`)
  .replace(/app: "sc300-cbt"/g, `app: "${examId}-cbt"`)
  .replace(/!== "sc300-cbt"/g, `!== "${examId}-cbt"`)
  .replace(/sc300-progress-/g, `${examId}-progress-`);
fs.writeFileSync(path.join(DIST, 'app.js'), app, 'utf8');

let html = fs.readFileSync(path.join(TPL, 'index.html'), 'utf8').split('\r\n').join('\n');
html = html.replace(/<title>SC-300 CBT<\/title>/, `<title>${title} CBT</title>`)
  .replace(/<span class="brand-mark">300<\/span>/, `<span class="brand-mark">${brand}</span>`)
  .replace(/<strong>SC-300 CBT<\/strong><small>[^<]*<\/small>/, `<strong>${title} CBT</strong><small>${subtitle}</small>`)
  .replace(/<body class="exam-sc300">/, `<body class="exam-${examId}">`)   // 과목 색: dist/cbt-theme.css 의 body.exam-* 와 짝
  .replace(/SC-300 CBT · 진행상황/, `${title} CBT · 진행상황`)
  .replace(/SC-300 문제를<br>/, `${title} 문제를<br>`)
  .replace(/문항 번호로 이동 \(1~\d+\)/, `문항 번호로 이동 (1~${Math.max(...questions.map(q => q.n))})`)
  .replace(/출처: examcademy\.com SC-300[^<]*/, `출처: ${(src.source || '').replace(/^https?:\/\//, '')} · 번역 준비 중(영어 원문)`);
fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');
fs.copyFileSync(path.join(TPL, 'styles.css'), path.join(DIST, 'styles.css'));

console.log(`${title}: 문항 ${questions.length} · 영역 ${topics.length} · 이미지 ${copied}장${missing.length ? ` (누락 ${missing.length}: ${missing.slice(0, 3).join(',')})` : ''} · 시리즈 ${series.length}묶음`);
console.log('  유형:', JSON.stringify(questions.reduce((a, q) => (a[q.type] = (a[q.type] || 0) + 1, a), {})));
console.log('  영역:', topics.map(t => `${t.ko} ${t.count}문항 ${t.weight[0]}~${t.weight[1]}%`).join(' · '));
