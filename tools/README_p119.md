# p119 부분 패치 — src 229 / 520 / 285

파일을 통째로 교체하지 않는다. 지금 쓰고 있는 `dist/AZ-104_CBT/choices.js` 안의
해당 항목 **세 개만** 고치므로, 그동안 따로 수정한 다른 내용은 건드리지 않는다.

## 실행
```
node apply_p119.js              # ./dist 대상
node apply_p119.js /경로/dist    # 경로 지정
node apply_p119.js --dry        # 미리보기 (저장 안 함)
```
원본은 `choices.js.bak-p119`, `service-worker.js.bak-p119` 로 백업된다.
두 번 실행해도 안전하다.

## 내용

### src 229 (화면 P226) — 보기 전체 교체
앱에 들어 있던 보기(`*`, `Microsoft.Compute/*`, `NotActions에 적힌 항목` …)가
원본 전시와 완전히 달랐다. 채점도 틀리게 나오던 상태.

- 가상 네트워크에서 모든 작업 수행
  `"Microsoft.Network/virtualNetworks/*"` / `.../delete` / `.../write`
  → 정답 `"Microsoft.Network/virtualNetworks/*"`
- 스토리지 계정의 구성 데이터 조회
  `"Microsoft.Storage/storageAccounts/*"` / `.../read` / `.../blobServices/containers/blob/read`
  → 정답 `"Microsoft.Storage/storageAccounts/read"`

구성 데이터 "조회"이므로 `*` 가 아니라 `read`, 최소 권한 원칙에 맞는다.
`blob/read` 는 계정 구성이 아니라 blob 데이터 읽기라 요구와 다르다.
전시 이미지에는 `StorageAccounts` 로 보이지만 실제 리소스 종류 표기는 `storageAccounts` 이므로
신고 메모대로 소문자를 썼다.

### src 520 (화면 P517) — 2번 보기 마지막 항목 삭제
`Standard SKU with a dynamic allocation` 제거. Azure Bastion 의 공용 IP 는
표준 SKU 정적 할당만 가능해서 원본에 없는 항목이다.
정답 `Standard SKU with a static allocation` 은 인덱스가 밀리지 않아 그대로 유효하다.
마지막 항목이 예상과 다르면 지우지 않고 경고만 낸다.

### src 285 (화면 P282) — 2번 보기 교체
`no email notifications will be sent each month` 가 빠져 있었다. 4개로 맞췄다.

정답은 `one email notification will be sent each month`.
Budget1 범위가 RG1 뿐이라 VM1(하루 20 EUR) 만 계산되어 월 약 600 EUR.
50% (500 EUR, AG1, Email) 만 넘고 70% (700 EUR, AG2, SMS) 는 넘지 않으므로 메일은 한 통.
70% 는 SMS, 100% 는 Azure 앱이라 애초에 메일이 아니다.

### service-worker.js
`VERSION` 뒤에 `-p119` 를 붙인다. 이미 붙어 있으면 건너뛴다.

## 배포
```
npx wrangler pages deploy dist --project-name az104-studyhub-p8 --branch main --commit-dirty=true
```
