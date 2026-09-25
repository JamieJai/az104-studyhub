/**
 * 한국어 번역 작업 도구
 *
 *   node tools/ko_tools.js dump  <dist폴더> <from> <to>   # 번역할 영어 원문을 compact 로 출력
 *   node tools/ko_tools.js merge <dist폴더> <ko폴더>       # ko/*.json 을 data.js 에 합치고 koMissing 을 끈다
 *   node tools/ko_tools.js stat  <dist폴더>               # 번역 진행 상황
 *
 * ko JSON 형식 (문항 번호를 키로):
 *   { "4": { "stem": "...", "expl": "...", "choices": ["..."],
 *            "blanks": [{"label":"...","options":["..."]}],
 *            "statements": ["..."], "items": ["..."], "slots": ["..."],
 *            "answerText": "..." } }
 *   - choices/options/statements/items 는 원문과 같은 순서·같은 개수
 *   - [[IMGn]] 자리표시자는 그대로 두기
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '..');
const cmd = process.argv[2];
const distDir = process.argv[3];

function loadData(dir) {
  const file = path.join(REPO, 'dist', dir, 'data.js');
  const raw = fs.readFileSync(file, 'utf8');
  const w = {}; vm.runInContext(raw, vm.createContext({ window: w }));
  const gv = Object.keys(w)[0];
  return { file, raw, gv, data: w[gv] };
}
function save(file, raw, gv, data) {
  const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
  fs.writeFileSync(file, raw.slice(0, a) + JSON.stringify(data) + raw.slice(b + 1), 'utf8');
}

if (cmd === 'dump') {
  const [from, to] = [Number(process.argv[4]), Number(process.argv[5])];
  const { data } = loadData(distDir);
  const out = {};
  for (const q of data.questions.filter(q => q.n >= from && q.n <= to)) {
    const e = { type: q.type, stem: q.stemEn, expl: q.explanationEn };
    if (q.choices) e.choices = q.choices.map(c => `${c.label}. ${c.en}`);
    if (q.blanks) e.blanks = q.blanks.map(b => ({ label: b.labelEn, options: b.options.map(o => o.en) }));
    if (q.statements) e.statements = q.statements.map(s => s.en);
    if (q.items) e.items = q.items.map(i => i.en);
    if (q.slots) e.slots = q.slots.map(s => s.labelEn);
    if (q.templateKo || q.template) e.template = q.templateKo || '';   // 빈칸 문장의 한국어 (코드·명령형은 비워 둔다)
    if (q.answerTextEn) e.answerText = q.answerTextEn;
    out[q.n] = e;
  }
  process.stdout.write(JSON.stringify(out, null, 1));
} else if (cmd === 'merge') {
  const koDir = path.resolve(REPO, process.argv[4]);
  const { file, raw, gv, data } = loadData(distDir);
  const ko = {};
  for (const f of fs.readdirSync(koDir).filter(f => f.endsWith('.json')).sort()) Object.assign(ko, JSON.parse(fs.readFileSync(path.join(koDir, f), 'utf8')));
  let done = 0; const warn = [];
  for (const q of data.questions) {
    const k = ko[String(q.n)];
    if (!k) continue;
    const count = (label, koArr, enArr) => { if (koArr && enArr && koArr.length !== enArr.length) warn.push(`Q${q.n} ${label} 개수 불일치 ${koArr.length}/${enArr.length}`); };
    if (k.stem) q.stemKo = k.stem;
    if (k.expl) q.explanationKo = k.expl;
    if (k.choices && q.choices) { count('choices', k.choices, q.choices); q.choices.forEach((c, i) => { if (k.choices[i]) c.ko = String(k.choices[i]).replace(/^[A-Z]\.\s*/, ''); }); }
    if (k.blanks && q.blanks) {
      count('blanks', k.blanks, q.blanks);
      q.blanks.forEach((b, i) => {
        const kb = k.blanks[i]; if (!kb) return;
        if (kb.label) b.labelKo = kb.label;
        count(`blanks[${i}].options`, kb.options, b.options);
        if (kb.options) b.options.forEach((o, j) => { if (kb.options[j]) o.ko = kb.options[j]; });
      });
    }
    if (k.statements && q.statements) { count('statements', k.statements, q.statements); q.statements.forEach((s, i) => { if (k.statements[i]) s.ko = k.statements[i]; }); }
    if (k.items && q.items) { count('items', k.items, q.items); q.items.forEach((it, i) => { if (k.items[i]) it.ko = k.items[i]; }); }
    if (k.slots && q.slots) { count('slots', k.slots, q.slots); q.slots.forEach((s, i) => { if (k.slots[i]) s.labelKo = k.slots[i]; }); }
    if (k.template) q.templateKo = k.template;
    if (k.answerText) q.answerTextKo = k.answerText;
    // 자리표시자 유실 검사
    const need = (q.stemEn.match(/\[\[IMG\d+\]\]/g) || []).join(',');
    const got = (q.stemKo.match(/\[\[IMG\d+\]\]/g) || []).join(',');
    if (need !== got) warn.push(`Q${q.n} 이미지 자리표시자 불일치 (${need || '없음'} → ${got || '없음'})`);
    q.koMissing = false; done++;
  }
  data.translated = data.questions.filter(q => !q.koMissing).length;
  save(file, raw, gv, data);
  console.log(`${distDir}: 번역 반영 ${done}문항 · 누적 ${data.translated}/${data.questions.length}`);
  if (warn.length) { console.log('경고:'); warn.slice(0, 40).forEach(x => console.log('  ' + x)); }
} else if (cmd === 'stat') {
  const { data } = loadData(distDir);
  const left = data.questions.filter(q => q.koMissing).map(q => q.n);
  console.log(`${distDir}: ${data.questions.length - left.length}/${data.questions.length} 번역됨 · 남은 번호 ${left.length ? left[0] + '~' + left[left.length - 1] + ` (${left.length}문항)` : '없음'}`);
} else {
  console.log('dump | merge | stat');
}
