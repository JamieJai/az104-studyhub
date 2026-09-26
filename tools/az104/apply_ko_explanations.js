#!/usr/bin/env node
/**
 * p142: examcademy 한국어 해설을 AZ-104 CBT 해설에 덧붙인다.
 *
 * 기존 해설(explanations_v2.js 의 detailed_explanation)은 건드리지 않는다.
 * 각 항목에 `examcademyKo` 를 얹고, app.js 가 "examcademy 해설" 섹션으로 따로 렌더한다.
 *
 *   입력  tools/az104/ko_explanations.json   ( "<CBT문항번호>": { src, ko, pair, ... } )
 *   대상  dist/AZ-104_CBT/explanations_v2.js
 *
 * 사용: node tools/az104/apply_ko_explanations.js [--check]
 *   --check 를 붙이면 파일을 쓰지 않고 결과만 보여 준다. 멱등이라 여러 번 돌려도 된다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'tools', 'az104', 'ko_explanations.json');
const TARGET = path.join(ROOT, 'dist', 'AZ-104_CBT', 'explanations_v2.js');
const CHECK = process.argv.includes('--check');

/** `window.AZ104_EXPLANATIONS_V2 = { ... };` 의 객체 부분만 잘라낸다 */
function sliceObject(text, marker) {
  const at = text.indexOf(marker);
  if (at < 0) throw new Error(`${marker} 를 찾지 못했습니다`);
  const start = text.indexOf('{', at);
  let depth = 0, inStr = false, esc = false, quote = '';
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; quote = c; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { start, end: i + 1 };
  }
  throw new Error('객체가 닫히지 않았습니다');
}

const ko = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const text = fs.readFileSync(TARGET, 'utf8');
const { start, end } = sliceObject(text, 'AZ104_EXPLANATIONS_V2');
const data = JSON.parse(text.slice(start, end));

let added = 0, updated = 0, missing = [];
for (const [num, rec] of Object.entries(ko)) {
  const entry = data[num];
  if (!entry) { missing.push(num); continue; }
  if (entry.examcademyKo === rec.ko) continue;
  if (entry.examcademyKo) updated++; else added++;
  entry.examcademyKo = rec.ko;
  entry.examcademySrc = rec.src;                 // examcademy 쪽 문항 번호 (추적용)
  if (rec.pair && rec.pair !== '확정') entry.examcademyPair = rec.pair;
}

console.log(`대상 문항 ${Object.keys(ko).length} · 새로 붙임 ${added} · 갱신 ${updated}`);
if (missing.length) console.log(`  explanations_v2 에 없는 번호 ${missing.length}개: ${missing.slice(0, 10).join(', ')}`);
console.log(`  해설이 붙은 문항 총 ${Object.values(data).filter(v => v.examcademyKo).length}개`);

if (CHECK) { console.log('--check 이므로 쓰지 않았습니다.'); process.exit(0); }
if (!added && !updated) { console.log('바뀐 것이 없어 그대로 둡니다.'); process.exit(0); }

const out = text.slice(0, start) + JSON.stringify(data) + text.slice(end);
fs.writeFileSync(TARGET, out, 'utf8');
console.log(`${path.relative(ROOT, TARGET)} 갱신 (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
