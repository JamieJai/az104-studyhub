#!/usr/bin/env node
/**
 * AZ-104 Study Hub — p119 부분 패치 (src 229 / 520 / 285)
 *
 * 현재 쓰고 있는 dist/ 를 그 자리에서 고친다. 파일을 통째로 바꾸지 않고
 * choices.js 안의 해당 항목 세 개만 건드리므로, 그동안 따로 수정한 내용은 그대로 남는다.
 *
 * 사용법:
 *   node apply_p119.js              # ./dist 를 대상으로
 *   node apply_p119.js /경로/dist    # 경로 직접 지정
 *   node apply_p119.js --dry        # 바꾸지 않고 무엇이 바뀔지만 출력
 *
 * 원본은 choices.js.bak-p119 / service-worker.js.bak-p119 로 백업된다.
 * 두 번 실행해도 안전하다 (이미 적용된 항목은 건너뛴다).
 */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const DIST = path.resolve(args.find((a) => !a.startsWith("--")) || "dist");

const log = [];
const warn = [];

function readWrapped(file, marker) {
  const raw = fs.readFileSync(file, "utf8");
  const m = raw.indexOf(marker);
  if (m < 0) throw new Error(`${path.basename(file)} 에서 ${marker} 를 찾지 못했습니다.`);
  const start = raw.indexOf("{", m);
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error(`${path.basename(file)} 구조를 해석하지 못했습니다.`);
  return { head: raw.slice(0, start), data: JSON.parse(raw.slice(start, end + 1)), tail: raw.slice(end + 1) };
}

function setBox(box, label, options, answerText) {
  box.label = label;
  box.options = options.slice();
  const idx = options.indexOf(answerText);
  if (idx < 0) throw new Error(`정답 "${answerText}" 가 보기 목록에 없습니다.`);
  box.answer = idx;
  return idx;
}

// ---------------------------------------------------------------- choices.js
const choicesPath = path.join(DIST, "AZ-104_CBT", "choices.js");
const ch = readWrapped(choicesPath, "AZ104_CHOICES");

/* src229 — 보기 자체가 원본과 완전히 달랐다.
   앱: "*", "Microsoft.Compute/*", "NotActions에 적힌 항목" 같은 임의 항목.
   원본 전시: 아래 두 목록. 최소 권한 원칙이라 storageAccounts 는 read.       */
{
  const e = ch.data["229"];
  if (!e) warn.push("src229 항목이 choices.js 에 없습니다 — 건너뜁니다.");
  else {
    const b1 = [
      '"Microsoft.Network/virtualNetworks/*"',
      '"Microsoft.Network/virtualNetworks/delete"',
      '"Microsoft.Network/virtualNetworks/write"',
    ];
    const b2 = [
      '"Microsoft.Storage/storageAccounts/*"',
      '"Microsoft.Storage/storageAccounts/read"',
      '"Microsoft.Storage/storageAccounts/blobServices/containers/blob/read"',
    ];
    while (e.boxes.length < 2) e.boxes.push({});
    e.boxes.length = 2;
    const i1 = setBox(e.boxes[0], "가상 네트워크에서 모든 작업 수행", b1, b1[0]);
    const i2 = setBox(e.boxes[1], "스토리지 계정의 구성 데이터 조회", b2, b2[1]);
    log.push(`src229 보기 교체 — 정답 [${i1}] ${b1[i1]} / [${i2}] ${b2[i2]}`);
  }
}

/* src520 — 2번 보기(공용 IP)의 마지막 항목이 본문에 없는 내용.
   Azure Bastion 은 표준 SKU 정적 할당만 가능해서 'dynamic' 항목 자체가 원본에 없다. */
{
  const e = ch.data["520"];
  if (!e) warn.push("src520 항목이 choices.js 에 없습니다 — 건너뜁니다.");
  else {
    const box = e.boxes[1];
    if (!box) warn.push("src520 에 두 번째 보기가 없습니다 — 건너뜁니다.");
    else {
      const last = box.options[box.options.length - 1];
      if (!/dynamic|동적/i.test(String(last))) {
        warn.push(`src520 마지막 보기가 예상과 다릅니다 (${last}) — 안전을 위해 건너뜁니다. 직접 확인하세요.`);
      } else if (box.answer === box.options.length - 1) {
        warn.push("src520 의 정답이 지우려는 마지막 보기를 가리키고 있습니다 — 건너뜁니다. 직접 확인하세요.");
      } else {
        box.options = box.options.slice(0, -1);
        log.push(`src520 2번 보기에서 마지막 항목 삭제 — ${last} (정답 [${box.answer}] ${box.options[box.answer]} 유지)`);
      }
    }
  }
}

/* src285 — 2번 보기에 'no email notifications' 가 빠져 있었다.
   RG1 범위 월 예상 600 EUR → 50%(500, Email) 만 넘고 70%(700, SMS) 는 못 넘는다. */
{
  const e = ch.data["285"];
  if (!e) warn.push("src285 항목이 choices.js 에 없습니다 — 건너뜁니다.");
  else {
    const opts = [
      "no email notifications will be sent each month",
      "one email notification will be sent each month",
      "two email notifications will be sent each month",
      "three email notifications will be sent each month",
    ];
    while (e.boxes.length < 2) e.boxes.push({});
    const box = e.boxes[1];
    const label = box.label || "현재 사용량 기준 알림";
    const i = setBox(box, label, opts, opts[1]);
    log.push(`src285 2번 보기 교체 — 정답 [${i}] ${opts[i]}`);
  }
}

// ---------------------------------------------------- service-worker VERSION
const swPath = path.join(DIST, "service-worker.js");
let swOut = null;
if (fs.existsSync(swPath)) {
  const raw = fs.readFileSync(swPath, "utf8");
  const m = raw.match(/const VERSION\s*=\s*(['"])([^'"]+)\1/);
  if (!m) warn.push("service-worker.js 에서 VERSION 을 찾지 못했습니다 — 직접 올리세요.");
  else if (m[2].includes("-p119")) log.push(`service-worker VERSION 이미 적용됨 (${m[2]})`);
  else {
    const next = `${m[2]}-p119`;
    swOut = raw.replace(m[0], `const VERSION = ${m[1]}${next}${m[1]}`);
    log.push(`service-worker VERSION: ${m[2]} → ${next}`);
  }
} else {
  warn.push(`service-worker.js 를 찾지 못했습니다 (${swPath}) — 캐시 갱신을 위해 직접 올리세요.`);
}

// ------------------------------------------------------------------- 쓰기
console.log(`대상: ${DIST}`);
log.forEach((l) => console.log("  ✓ " + l));
warn.forEach((l) => console.log("  ! " + l));

if (DRY) {
  console.log("\n--dry 모드라 아무것도 저장하지 않았습니다.");
} else {
  fs.copyFileSync(choicesPath, choicesPath + ".bak-p119");
  fs.writeFileSync(choicesPath, ch.head + JSON.stringify(ch.data) + ch.tail, "utf8");
  if (swOut !== null) {
    fs.copyFileSync(swPath, swPath + ".bak-p119");
    fs.writeFileSync(swPath, swOut, "utf8");
  }
  console.log("\n저장 완료. 백업: choices.js.bak-p119" + (swOut !== null ? ", service-worker.js.bak-p119" : ""));
  console.log("배포: npx wrangler pages deploy dist --project-name az104-studyhub-p8 --branch main --commit-dirty=true");
}
