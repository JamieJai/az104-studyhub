# AZ-802 CBT

`D:\Users\USER\Downloads\az104-studyhub` 의 AZ-104 CBT 폼을 따라 만든 AZ-802 연습 시스템 (독립 정적 사이트, 로그인 없음).

## 실행

`index.html` 을 브라우저에서 바로 열면 됩니다. (또는 폴더에서 `python -m http.server 8802` → http://localhost:8802)

진행 기록·북마크·모의고사 기록은 브라우저 localStorage 에 저장됩니다. 다른 기기로 옮기려면 사이드바 "기록 내보내기/가져오기" 를 쓰세요.

## 문항 카드 순서

1. 원본 이미지 (표·그림, 클릭하면 확대)
2. 한국어 번역 텍스트 — 아래 "EN · 영어 원문 보기" 를 펼치면 실제 시험 표현 확인
3. 답 입력 (객관식 / HOTSPOT 드롭다운 / DRAG DROP / 예·아니요)
4. 정답 및 해설 (한국어 해설 + 영어 원문 해설 + Learn more 링크)

## 파일

| 경로 | 내용 |
|---|---|
| `index.html`, `app.js`, `styles.css` | 앱 본체 (styles.css 는 AZ-104 CBT 것을 가져와 확장) |
| `data.js` | 63문항 데이터 (영어 원문 + 한국어 번역 + 정답 + 해설 + 이미지 경로 + 출제 영역) |
| `assets/` | 문항 이미지 12장 (examcademy CDN 원본) |
| `tools/build.py` | `..\az-802\az802.json` + `tools/topics.json` + `tools/ko/*.json` → `data.js` 생성·검증 스크립트 |
| `tools/ko/*.json` | 문항별 한국어 번역 원본 (수정 후 `python tools/build.py .` 로 재빌드) |

## 데이터 출처·주의

- 문제·정답·해설: https://examcademy.com/exams/microsoft/az-802 (63문항, 2026-09-19 수집)
- Q10·12·13·46 (BitLocker), Q31·39·40·41 (보안 채널), Q49·50·52·53 (사이트) 은 원본 사이트에 시나리오 본문이 빠진 "Solution: … Does this meet the goal?" 시리즈 문항입니다. 카드 상단에 해설로 추정한 시나리오를 참고 표시로 넣어 두었습니다.
- 번역은 학습 이해용입니다. 실제 시험은 영어이므로 선택지 밑의 영어 원문 표기를 같이 보세요.
