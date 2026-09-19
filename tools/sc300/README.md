# SC-300 CBT

`D:\Users\USER\Downloads\az802-cbt` (AZ-802 CBT) 폼을 그대로 따라 만든 SC-300 (Microsoft Identity and Access Administrator) 연습 시스템. 독립 정적 사이트, 로그인 없음.

- 문항 434개 (examcademy.com SC-300 18페이지 전부, 2026-09-19 수집) — 전 문항 한국어 번역 완료
- 문항 번호는 원본 사이트 번호 그대로 (1~463, 은퇴 문항 자리는 비어 있음)
- 출제 영역 4개 (공식 비중): 사용자 ID 구현 및 관리 20–25% · 인증 및 액세스 관리 구현 25–30% · 워크로드 ID 계획 및 구현 20–25% · ID 거버넌스 계획 및 구현 20–25%

## 실행

`index.html` 을 브라우저에서 바로 열면 됩니다. (또는 폴더에서 `python -m http.server 8300` → http://localhost:8300)

진행 기록·북마크·모의고사 기록은 브라우저 localStorage 에 저장됩니다. 다른 기기로 옮기려면 사이드바 "기록 내보내기/가져오기" 를 쓰세요.

## 문항 카드 순서

1. 원본 이미지 (표·그림, 클릭하면 확대)
2. 한국어 번역 텍스트 — 아래 "EN · 영어 원문 보기" 를 펼치면 실제 시험 표현 확인
3. 답 입력 (객관식 / HOTSPOT 드롭다운 / DRAG DROP / 예·아니요 / 자기 채점)
4. 정답 및 해설 (한국어 해설 + 영어 원문 해설 + Learn more 링크)

## 파일

| 경로 | 내용 |
|---|---|
| `index.html`, `app.js`, `styles.css` | 앱 본체 (AZ-802 CBT 에서 구형 문항 기능만 뺀 것) |
| `data.js` | 434문항 데이터 (`window.SC300_DATA`: 영어 원문 + 한국어 번역 + 정답 + 해설 + 이미지 경로 + 출제 영역) |
| `assets/` | 문항 이미지 225장 |
| `tools/build.py` | `..\sc-300\sc300.json` + `tools/ko/*.json` → `data.js` 생성·검증 (이미지 자리표시자 수, 선택지/빈칸/문장/드래그 항목 번역 누락 검사) |
| `tools/ko/q001-012.json …` | 한국어 번역 원본 (원본 번호 구간별 파일, 키는 문항 번호 문자열) |
| `tools/tdigest.py` | `python tools/tdigest.py 30 45 [--todo]` — 영어 원문 요약 출력 (번역 작업용) |

재빌드: 폴더에서 `PYTHONIOENCODING=utf-8 python tools/build.py` → `OK 434문항 (번역 434/434)` 이 나와야 정상.

## 스크래핑 (`..\sc-300\`)

| 경로 | 내용 |
|---|---|
| `sc300_flight.json` | 브라우저(로그인 세션)에서 18페이지를 fetch 해 모은 Next.js flight 페이로드 원본 |
| `scripts/parse.py` | `python scripts/parse.py ../sc-300/sc300_flight.json` → `sc300.json` (문항 + 문항별 topic-badge 영역) |
| `scripts/images_md.py` | cdn 이미지 다운로드 → `images/`, 경로 치환, `sc300.md` 생성 |
| `sc300.json`, `sc300.md`, `images/` | 결과물 |

페이지 2 이후는 examcademy 로그인이 있어야 문항 데이터가 내려오므로 curl 로는 1페이지만 받아집니다. Chrome 에서 로그인한 뒤 `javascript_tool` 로 `fetch('/exams/microsoft/sc-300/N', {credentials:'include'})` 를 돌려 `self.__next_f.push` 청크를 모아 파일로 내려받았습니다.

## 데이터 출처·주의

- 문제·정답·해설: https://examcademy.com/exams/microsoft/sc-300 (434문항, 18페이지) — 2026-09-19 수집
- 원본 사이트에 시나리오/사례 연구 본문이 빠진 문항 ("Solution: … Does this meet the goal?" 시리즈, "You need to meet the technical requirements…" 류) 은 카드 상단에 `(참고: …)` 로 해설에서 추정한 시나리오를 표시해 두었습니다. ADatum 사례 연구 본문은 Q129 에 전문이 있어 관련 문항(Q141·150~157·317·337·374)은 Q129 를 참조하도록 적었습니다.
- 자기 채점 유형 3문항 (Q21·335·390, 정답이 이미지로만 제공) 은 정답 공개 후 맞음/틀림을 직접 표시하며 모의고사에서는 제외됩니다.
- 번역은 학습 이해용입니다. 실제 시험은 영어이므로 선택지 밑의 영어 원문 표기를 같이 보세요.
