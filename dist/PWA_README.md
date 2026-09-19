# AZ-104 Study Hub PWA — Cloudflare path fix v2

- CBT 버튼: `./cbt.html`
- Lab 버튼: `./lab.html`
- 기존 하위 폴더 URL도 유지
- `_redirects` 추가
- Service Worker/manifest를 절대경로(`/...`)가 아니라 배포 위치 기준 상대경로로 수정

Cloudflare Pages에는 이 `dist` 폴더의 **내용물 자체**를 배포하세요.

배포 후 확인:
- `/` 홈
- `/cbt.html` CBT
- `/lab.html` Lab
- `/AZ-104_CBT/index.html` 직접 접근
- `/AZ-104_Lab_Portal/index.html` 직접 접근
