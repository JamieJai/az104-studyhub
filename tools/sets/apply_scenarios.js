/**
 * 복구한 공통 지문(시나리오·사례 연구)을 각 CBT 의 data.js 에 다시 입힌다.
 *
 *   node tools/sets/apply_scenarios.js            # dist/<CBT>_CBT/data.js 갱신
 *   node tools/sets/apply_scenarios.js --check    # 파일을 쓰지 않고 결과만 출력
 *
 * 왜 필요한가
 *   원본 스크래퍼가 문제 본문(mdxContent)만 훑고, 여러 문항이 공유하는 배경 지문이 담긴
 *   별도 group 객체를 건너뛰어서 지문이 통째로 빠져 있었다(2026-09-26 복구).
 *   그런데 data.js 는 빌더가 통째로 다시 찍어내는 파일이라, 빌더를 한 번 돌리면
 *   sets: [] 로 초기화되면서 이 복구분이 날아간다. ko_tools.js merge / apply_sets.py 와
 *   같은 성격의 "빌드 후 다시 입히는" 패치다. 실행 순서는 tools/README_patches.md 참고.
 *
 * 데이터
 *   tools/sets/scenarios/<CBT>.json  — 지문 원문·번역·멤버 문항·이미지 경로 스냅샷.
 *   Downloads 의 스크랩 폴더에 의존하지 않는다.
 *
 * 적용 결과 (앱이 읽는 모양 — casePanel 이 이 필드를 쓴다)
 *   DATA.sets[]          {id, no, titleEn, titleKo, members[]}
 *   question.set         {id, no, idx, size}
 *   question.caseEn/Ko   공통 지문 (이미지는 [[IMGn]] 자리표시자로)
 *   question.askEn/Ko    질문 부분 (원래 stemEn/stemKo 를 그대로 쓴다)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(__dirname, 'scenarios');
const CHECK = process.argv.includes('--check');
const IMG_RE = /!\[[^\]]*\]\(([^)]+)\)/g;

const CBTS = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
const rows = [];
let problems = 0;

for (const cbt of CBTS) {
  const snap = JSON.parse(fs.readFileSync(path.join(DATA_DIR, cbt + '.json'), 'utf8'));
  const distDir = path.join(ROOT, 'dist', cbt + '_CBT');
  const dataPath = path.join(distDir, 'data.js');
  if (!fs.existsSync(dataPath)) { console.log(`! ${cbt}: data.js 없음 — 건너뜀`); continue; }

  const raw = fs.readFileSync(dataPath, 'utf8');
  const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
  const data = JSON.parse(raw.slice(s, e + 1));
  const byN = new Map(data.questions.map(q => [q.n, q]));
  const byId = new Map();
  for (const q of data.questions) {
    const id = q.id || (q.legacy && q.legacy.id);
    if (id && !byId.has(id)) byId.set(id, q);
  }

  // 이미 적용돼 있으면 지우고 다시 넣는다(멱등).
  const mine = new Set(snap.groups.map(g => g.id));
  data.sets = (data.sets || []).filter(x => !mine.has(x.id));
  for (const q of data.questions) {
    if (q.set && mine.has(q.set.id)) { delete q.set; delete q.caseEn; delete q.caseKo; delete q.askEn; delete q.askKo; }
  }
  let no = data.sets.reduce((m, x) => Math.max(m, x.no || 0), 0);

  let applied = 0, missMember = [], missImage = [];
  for (const g of snap.groups) {
    const members = [];
    for (const m of g.members) {
      const q = (m.id && byId.get(m.id)) || byN.get(m.n);
      if (!q) { missMember.push(`${g.id}:${m.id || m.n}`); continue; }
      members.push(q);
    }
    if (!members.length) continue;
    no += 1;

    members.forEach((q, idx) => {
      q.images = q.images || [];
      let caseEn = g.contentEn, caseKo = g.contentKo;
      // 지문 속 마크다운 이미지를 문항의 images 배열에 이어 붙이고 [[IMGn]] 으로 바꾼다
      let m2; IMG_RE.lastIndex = 0;
      const refs = new Set();
      while ((m2 = IMG_RE.exec(g.contentEn))) refs.add(m2[0]);
      for (const md of refs) {
        const rel = md.match(/\(([^)]+)\)/)[1];
        const asset = g.assets[rel];
        if (!asset) { missImage.push(`${g.id}:${rel}`); continue; }
        if (!fs.existsSync(path.join(distDir, asset))) missImage.push(`${g.id}:${asset}(파일없음)`);
        let k = q.images.indexOf(asset);
        if (k < 0) { q.images.push(asset); k = q.images.length - 1; }
        const ph = `[[IMG${k + 1}]]`;
        caseEn = caseEn.split(md).join(ph);
        caseKo = caseKo.split(md).join(ph);
      }
      q.set = { id: g.id, no, idx: idx + 1, size: members.length };
      q.caseEn = caseEn;
      q.caseKo = caseKo;
      q.askEn = q.askEn || q.stemEn;
      q.askKo = q.askKo || q.stemKo;
      applied++;
    });

    data.sets.push({ id: g.id, no, titleEn: g.titleEn, titleKo: g.titleKo, members: members.map(q => q.n) });
  }

  if (!CHECK) fs.writeFileSync(dataPath, raw.slice(0, s) + JSON.stringify(data) + raw.slice(e + 1), 'utf8');
  if (missMember.length || missImage.length) problems++;
  rows.push({
    CBT: cbt, 세트: snap.groups.length, 문항: applied,
    '멤버 못 찾음': missMember.length ? missMember.join(' ') : '-',
    '이미지 문제': missImage.length ? missImage.join(' ') : '-',
  });
}

console.table(rows);
console.log(CHECK ? '(--check: 파일은 쓰지 않았다)' : '적용 완료');
if (problems) { console.error('문제가 있는 CBT 가 있다 — 위 표 확인'); process.exit(1); }
