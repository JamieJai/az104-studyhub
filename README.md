# AZ-104 Study Hub

[![Deploy to Cloudflare Pages](https://github.com/JamieJai/az104-studyhub/actions/workflows/deploy.yml/badge.svg)](https://github.com/JamieJai/az104-studyhub/actions/workflows/deploy.yml)

Cloudflare Pages 프로젝트 `az104-studyhub-p8` — https://az104-studyhub-p8.pages.dev

| 경로 | 내용 |
|---|---|
| `dist/` | 정적 사이트 (로그인 화면, CBT, Lab Portal, 관리자 `/admin/`, 문항 이미지 1,300여 장) |
| `functions/` | Pages Functions — 인증(`/api/auth/*`), 진도(`/api/progress`), 신고(`/api/report`), 관리자(`/api/admin/*`) |
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

## 주의

- Pages 는 배포마다 정적 파일 **과 Functions 를 통째로** 교체한다. `functions/` 없이 `dist/` 만 올리면 로그인이 죽는다 (2026-09-19 사고). 항상 이 저장소 루트에서 배포한다.
- `dist/` 를 바꾸면 `dist/service-worker.js` 의 `VERSION` 도 올려야 PWA 캐시가 갱신된다.
- `_headers`, `_redirects`, `_routes.json`, `functions/` 는 라이브 서버에서 다시 받아올 수 없다. 이 저장소가 유일한 원본이다.
- 롤백: Cloudflare 대시보드 → Pages → az104-studyhub-p8 → Deployments → 이전 배포 "Rollback".
