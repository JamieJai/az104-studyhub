# Azure Study Home (구 AZ-104 Study Hub)

Cloudflare Pages 프로젝트 `az104-studyhub-p8` — https://az104-studyhub-p8.pages.dev

| 경로 | 내용 |
|---|---|
| `dist/` | 정적 사이트 — 로그인(`/`), 자격증 노선도 홈(`/map/`), AZ-104 CBT, AZ-802 CBT, Lab Portal, 관리자 `/admin/` |
| `dist/AZ-802_CBT/` | AZ-802 CBT (현행 63 + 구형 377문항, 한/영). 진도는 `/api/progress?exam=az802` 로 서버 저장 |
| `dist/SC-300_CBT/` | SC-300 CBT (434문항, 한/영). `exam=sc300` |

**모의고사 배점·구성 (AZ-104 · AZ-802 · SC-300 공통)** — 실제 시험과 같게 센다. 같은 지문 예/아니요(OX) 한 세트는 문장 수(3점)만큼, 그 밖에는 1문항 1점이고 OX 는 부분 점수도 준다. 사례 연구·OX 세트는 어떤 모드에서도 쪼개지지 않는다. 사이드바는 `0~10 / 10~20 / 20~30문제` 세 가지이고(값은 목표 점수 10·20·30), **실전 모의고사**는 실제 시험 구성 그대로 출제한다: 다지선다·짧은 HOTSPOT 40~45문항 → 같은 지문 OX 2세트 → 사례 연구 1세트. 구성은 각 app.js 의 `REAL_PLAN` 에서 조정한다. AZ-104 는 사례 연구 묶음 정보가 원본에 없어 지문 해시로 만들어 `data.js` 의 `caseSets` 에 저장했다(4세트, 2026 범위 내 2세트).

**문항 신고** — 세 CBT 모두 문항 화면의 🚩 버튼으로 `/api/report?exam=<id>` 에 보낸다. 시험별로 분리 저장되고 관리자 포털(`/admin/`)의 신고 표에 시험 배지와 함께 보인다.

**연습 모드 다시 풀기** — 채점은 그 세션 안에서만 잠기고, 세션을 새로 시작하면 이미 푼 문항도 처음처럼 다시 풀 수 있다(AZ-104 와 같은 방식). 같은 세션 안에서 다시 풀려면 "다시 풀기" 버튼을 쓴다. 기록은 마지막 결과로 갱신된다.

**빈 기록을 만들지 않는다** — 문항을 보기만 해도 progress 행이 생기던 문제를 고쳤다(`peekRecord` / `isEmptyRecord`). 결과·북마크·시도가 모두 없는 기록은 서버에 올리지 않는다.

**초기화 범위** — 전체 기록 초기화와 신고 초기화는 모두 그 시험(`?exam=`)만 지운다. AZ-104 는 파라미터 없이 호출해 기본값 az104 만 지운다.
| `dist/cbt-theme.css` | 세 CBT 공통 테마 — 노선도(`/map/`)와 같은 팔레트·서체. 각 `styles.css` 뒤에 로드되어 색·서체·모서리만 덮어쓴다. 기본 다크, `body.light` 로 라이트, 과목 색은 `body.exam-*` |
| `migrations/` | D1 스키마 변경 SQL (`0001_exam_column.sql`: 기록 테이블에 exam 컬럼 추가) |
| `tools/az802/`, `tools/sc300/` | 문항 빌드 스크립트(`build.py`)와 한국어 번역 원본 |
| `tools/sets/apply_sets.py` | AZ-802·SC-300 세트(공통 지문) 정보 부여 — 같은 Case Study 를 쓰는 문항을 `세트 1-1, 1-2…` 로 묶고 지문/질문을 분리(`caseEn/askEn`). data.js 를 다시 빌드하면 이 스크립트를 다시 돌린다 |
| `functions/` | Pages Functions — 인증(`/api/auth/*`), 진도(`/api/progress?exam=`), 신고(`/api/report?exam=`), 관리자(`/api/admin/*`). 시험 목록은 `_lib/exam.js` |
| `wrangler.toml` | 바인딩: D1 `DB`(사용자·진도·신고), KV `PROGRESS`(옛 진도 이관용), vars `ADMIN_USER`, `MAX_USERS` |
| `schema.sql` | D1 스키마 |
| `tools/apply_p119.js` | 문항 부분 패치 스크립트 예시 (`node tools/apply_p119.js dist --dry`) |
| `tools/preflight.js` | E2E 검증 (`node tools/preflight.js <base-url> <admin-pass> [nosignup]`) |

시크릿 `AUTH_SECRET`, `ADMIN_PASS` 는 Cloudflare 프로젝트에 저장되어 있다 (`npx wrangler pages secret put <NAME>`). **wrangler.toml 에 적지 않는다.**

## 배포

`main` 에 push 하면 GitHub Actions 가 검증 → 배포 → 프로덕션 검증을 자동으로 한다 (`.github/workflows/deploy.yml`).
PR 은 검증만 한다.

필요한 GitHub Secrets:

- `CLOUDFLARE_API_TOKEN` — dash.cloudflare.com → My Profile → API Tokens → Create Token, 권한: **Account · Cloudflare Pages · Edit**, **Account · D1 · Edit**, **Account · Workers KV Storage · Edit**
- `CLOUDFLARE_ACCOUNT_ID` — `d8aa1c9f61fde6667a1ff1da31c8a388`

수동 배포:

```
npx wrangler pages deploy dist --project-name az104-studyhub-p8 --branch main
node tools/preflight.js https://az104-studyhub-p8.pages.dev x nosignup
```

## 로컬 테스트

```
# .dev.vars (git 무시됨)
AUTH_SECRET=local-test-secret
ADMIN_PASS=localadmin

npx wrangler d1 execute az104-studyhub --local --file schema.sql   # 최초 1회
npx wrangler pages dev dist --port 8788
node tools/preflight.js http://127.0.0.1:8788 localadmin           # 가입~삭제 29단계 E2E
```

## 흐름

`/` 로그인(인트로 → 폼) → `/map/` 자격증 노선도(과목 클릭 → CBT/Lab 버튼) → `/AZ-104_CBT/` · `/AZ-802_CBT/` · `/AZ-104_Lab_Portal/`(로그인 불필요).
보호 경로는 `functions/_middleware.js` 의 PROTECTED 와 `dist/_routes.json` 에 같이 적는다.

새 시험을 추가하려면: `functions/_lib/exam.js` EXAMS 에 id 추가 → `dist/<폴더>/` 에 앱 배치(app.js 는 AZ-802 의 서버 동기화 부분을 복사) → 미들웨어·_routes.json·`dist/map/index.html` STUDY 에 링크.

## 주의

- Pages 는 배포마다 정적 파일 **과 Functions 를 통째로** 교체한다. `functions/` 없이 `dist/` 만 올리면 로그인이 죽는다 (2026-09-19 사고). 항상 이 저장소 루트에서 배포한다.
- `dist/` 를 바꾸면 `dist/service-worker.js` 의 `VERSION` 도 올려야 PWA 캐시가 갱신된다.
- `_headers`, `_redirects`, `_routes.json`, `functions/` 는 라이브 서버에서 다시 받아올 수 없다. 이 저장소가 유일한 원본이다.
- D1 스키마를 바꿀 때는 `npx wrangler d1 export az104-studyhub --remote --output backups/<날짜>.sql` 로 백업하고, `migrations/` 에 SQL 을 남긴 뒤 `--local` 로 리허설 → `--remote` 적용 → 배포 순서로 한다.
- 롤백: Cloudflare 대시보드 → Pages → az104-studyhub-p8 → Deployments → 이전 배포 "Rollback".
