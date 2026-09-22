# Azure Study Home (구 AZ-104 Study Hub)

Cloudflare Pages 프로젝트 `az104-studyhub-p8` — https://az104-studyhub-p8.pages.dev

| 경로 | 내용 |
|---|---|
| `dist/` | 정적 사이트 — 로그인(`/`), 자격증 노선도 홈(`/map/`), AZ-104 CBT, AZ-802 CBT, Lab Portal, 관리자 `/admin/` |
| `dist/AZ-802_CBT/` | AZ-802 CBT (현행 63 + 구형 377문항, 한/영). 진도는 `/api/progress?exam=az802` 로 서버 저장 |
| `dist/SC-300_CBT/` | SC-300 CBT (434문항, 한/영). `exam=sc300` |
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
