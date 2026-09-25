# CBT 다시 빌드할 때의 순서 — "빌드 후 다시 입히는" 패치 목록

`dist/<CBT>_CBT/data.js` 는 **손으로 고치는 파일이 아니라 빌더가 통째로 다시 찍어내는 파일**이다.
그래서 빌더를 한 번 돌리면 그동안 따로 넣어 둔 것(번역·세트·공통 지문 등)이 전부 날아간다.
날아가는 것들은 **저장소 안의 패치 스크립트로 다시 입히는 것이 원칙**이다. 아래 순서를 지킬 것.

> 실제로 사고가 났던 예: 2026-09-26 `build_cbt.js` 의 `templateMode` 게이트 때문에 드롭다운
> 빈칸 문장이 20문항에서 통째로 사라져 있었다(AZ-900 66번 "문제가 없습니다" 신고). 빌더가
> 원본의 한 필드를 버리면 그 자리에서는 티가 안 나고 한참 뒤 사용자 신고로 발견된다.

## 순서

| 순서 | 대상 | 명령 | 다시 입히는 것 |
|---|---|---|---|
| 1 | AZ-305 / AZ-900 / AI-103 / SC-100 | `node tools/build_cbt.js <examId> <제목> <원본.json> <이미지폴더> <dist폴더명>` | data.js 생성 |
| 1 | SC-300 | `python tools/sc300/build.py dist/SC-300_CBT` | data.js 생성 (번역 포함) |
| 1 | AZ-802 | `python tools/az802/build.py dist/AZ-802_CBT` | data.js 생성 (현행+구형, 번역 포함) |
| 2 | AZ-305 / AZ-900 / AI-103 / SC-100 | `node tools/ko_tools.js merge <CBT>_CBT tools/<slug>/ko` | 한국어 번역 (stemKo·해설·보기·빈칸 문장 templateKo) |
| 3 | AZ-802 / SC-300 | `python tools/sets/apply_sets.py` | 손으로 만든 사례 연구 세트 2개, 유실 이미지 표시 |
| 4 | 6개 CBT 전부 | `node tools/sets/apply_scenarios.js` | 공통 지문 58세트 232문항 (SC-100 은 스크랩에 처음부터 들어 있었다) |
| 5 | AZ-104 | `node tools/apply_p119.js` | choices.js 부분 패치 (src 229/520/285) |
| 6 | — | `dist/service-worker.js` VERSION, `dist/offline-assets.json` version·count 갱신 | PWA 캐시 무효화 |
| 7 | — | `node tools/preflight.js <URL> x nosignup` | 배포 후 17개 검사 |

3·4번은 `--check` 를 붙이면 파일을 쓰지 않고 결과만 보여 준다. 4번은 멱등이라 여러 번 돌려도 된다.

## 빌더가 버리면 안 되는 필드

빌더를 고칠 일이 있으면 아래가 살아 있는지 확인할 것. 원본 JSON에는 있는데 data.js 에 없으면
그 문항은 **풀 수 없는 문항이 된다.**

- `template` — 드롭다운 문항의 빈칸 문장/코드. 이게 없으면 "문장을 완성하세요"만 남는다.
  (2026-09-26 이전 `build_cbt.js` 는 `templateMode` 플래그가 있을 때만 살렸다 → 20문항 유실)
- `blanks[].label` / `slots[].label` — 없으면 `항목 blank1` 같은 자리표시자만 남는다.
- `images` 와 본문의 `[[IMGn]]` 자리표시자 — 번호가 배열 위치와 1:1 이어야 한다.
- `scenario`(원본) → `set`/`caseEn`/`caseKo`/`askEn`/`askKo`(data.js). 빌더는 이걸 모르므로
  4번 패치로 넣는다.

## 점검

재빌드 후 아래가 빌드 전과 같은지 확인한다.

```bash
node -e "global.window={};require('./dist/AZ-900_CBT/data.js');const d=window.AZ900_DATA;
const q=d.questions;console.log('문항',q.length,'| 번역',d.translated,'| 세트',d.sets.length,
'| template',q.filter(x=>x.template).length,'| case',q.filter(x=>x.caseEn).length);"
```

2026-09-26 기준 기대값 (SC-100 은 원본 스크랩에 `template=` 블록이 하나도 없어 template 0 이 정상):

| CBT | 문항 | 세트 | template | 공통 지문 문항 |
|---|---|---|---|---|
| AZ-305 | 285 | 4 | 1 | 16 |
| AZ-900 | 470 | 20 | 19 | 60 |
| AI-103 | 155 | 5 | 11 | 23 |
| SC-300 | 434 | 9 | 7 | 45 |
| AZ-802 | 440 | 15 | 20 | 67 |
| SC-100 | 360 | 7 | 0 | 32 |
