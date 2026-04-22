# 관리자 FAQ CMS 브라우저 수동 테스트 체크리스트

> 작성일: 2026-04-23 (tester)
> 배경: [2번] 관리자 FAQ CMS 브라우저 실제 테스트 — AI가 할 수 없는 UI/UX 검증 영역
> 참고: API 레벨 스모크는 tester가 이미 자동 검증 완료 (scratchpad "테스트 결과 (tester) — FAQ CMS API 스모크" 참조)
> 대상 페이지: `admin-faq.html` (관리자 FAQ CMS)
> 관련 지식: A-22(CMS 라우트), D-81(K3 설계), D-94(태블릿 대응)

## 사전 준비
- [ ] 서버 기동: 프로젝트 루트에서 `npm run dev` → http://localhost:4000 접속 가능 확인
- [ ] 최신 Chrome 또는 Edge (DevTools 반응형 모드 지원)
- [ ] 관리자 계정 로그인
  - 테스트용: `qa@test.com` / `test1234` (role=admin, scopes=["all"])
  - 또는 `.env`의 별도 admin 계정
- [ ] 로그인 후 `/admin-faq.html` 경로로 접속

## 테스트 시나리오

### Sc1. 목록 조회 + 통계
- [ ] 페이지 진입 직후 FAQ 테이블이 로드됨 (loading 스켈레톤 → 실제 목록)
- [ ] 상단 통계 영역에 총 개수(45건) 표시
- [ ] intent 분류 집계 노출 (shipping 6 / refund 6 / custom 10 / product 5 / payment 6 / member 4 / company 5 / coupon 3)
- [ ] 각 행에 id, intent, priority, 질문 요약, 답변 요약, needsReview 뱃지 표시
- [ ] 버전(`version: k1-2026-04-15`) 또는 마지막 갱신 정보 표기

### Sc2. 필터 + 검색
- [ ] "intent" 드롭다운(`#filter-intent`)에서 `shipping` 선택 → 6건만 표시
- [ ] 드롭다운을 "전체"로 되돌리면 45건 전부 복원
- [ ] "검수 필요" 체크박스(`#filter-review`) 토글 → needsReview=true 항목만 필터링
- [ ] 검색 input(`#filter-q`)에 "배송" 입력 → 300ms debounce 후 10건 매칭 표시
- [ ] 검색어 지우면 다시 전체 복원
- [ ] 필터 조합 (intent=shipping + q=배송) 시 교집합만 표시

### Sc3. 신규 FAQ 추가
- [ ] "신규 FAQ 추가" 버튼(`#btn-create`) 클릭 → 편집 모달 오픈
- [ ] intent 드롭다운에 8종(custom/product/shipping/refund/payment/company/member/coupon) 모두 표시
- [ ] priority 드롭다운에 3종(high/medium/low) 표시
- [ ] 필수 필드 입력 후 저장(`#btn-form-submit`) 클릭
  - intent, priority, questions(1개 이상), answer 필수
- [ ] 저장 성공 시 모달 닫힘 + 목록 즉시 반영 + 토스트/알림 노출
- [ ] 새로 생성된 id 형식 확인 (예: `FAQ-SHIP-007`, intent prefix + 3자리 zero-pad)
- [ ] 페이지 새로고침해도 유지됨

### Sc4. FAQ 수정
- [ ] 기존 FAQ 행의 "수정" 버튼 클릭 → 모달에 기존 값 프리필
- [ ] id(`#form-id`)는 hidden, 수정 불가 확인
- [ ] answer 텍스트 수정 후 저장
- [ ] 목록에 즉시 반영, id 유지
- [ ] needsReview 체크박스 토글 후 저장 → 뱃지 상태 변경 확인

### Sc5. FAQ 삭제 (2단계 confirm)
- [ ] 삭제 버튼 클릭 → 첫 번째 confirm 다이얼로그 노출
- [ ] 확인 시 두 번째 confirm (또는 추가 경고) — D-81 "confirm 2단계" 설계
- [ ] 최종 승인 시 목록에서 제거
- [ ] 중간에 "취소" 시 삭제 안 됨
- [ ] 삭제 후 페이지 새로고침해도 복구되지 않음 (하드 삭제)

### Sc6. K1 반영 확인 (reloadKnowledge)
- [ ] 신규 FAQ 추가 후 챗봇 "티즈" 열어서 해당 키워드로 질문
- [ ] 서버 재시작 없이도 신규 FAQ 답변이 즉시 반영 (reloadKnowledge 메커니즘)
- [ ] 수정한 답변도 다음 /api/chat 호출부터 반영되는지 확인

### Sc7. K2 재빌드
- [ ] "상품 지식 재빌드 (K2)" 버튼(`#btn-rebuild`) 노출 확인
- [ ] 클릭 시 재빌드 진행 모달 오픈 + 스피너 표시
- [ ] 진행 중에는 버튼 비활성화 (동시 실행 차단)
- [ ] 1~3초 내 완료 + 성공 결과 표시 (productsCount, durationMs, stdout 요약)
- [ ] 실패 시 stderr/에러 메시지 모달 내 표시
- [ ] 재빌드 진행 중에 다시 클릭 → 409 에러 처리 UX

### Sc8. 검증 실패 케이스 (에러 UX)
- [ ] answer 빈 상태로 저장 시도 → 400 에러 + 인라인 메시지
- [ ] questions 배열 비어있으면 저장 거부
- [ ] answer 2000자 초과 입력 시 에러 (또는 글자수 카운터)
- [ ] keywords 20개 초과 시 에러 (쉼표 구분 입력에서 21개 이상)
- [ ] 네트워크 오프라인 상태 저장 시도 → 적절한 에러 표시 (스피너 무한 방지)

### Sc9. 인증 가드
- [ ] 로그아웃 상태에서 `/admin-faq.html` 직접 접근 → 로그인 페이지로 리다이렉트 또는 guard 메시지
- [ ] 로그아웃 버튼 동작 확인
- [ ] 토큰 만료 시 API 401 → 재로그인 유도

### Sc10. 태블릿 반응형 (D-94 PC 권장 배너)
- [ ] DevTools 뷰포트 1000px (태블릿) → admin-faq는 `data-pc-only="true"` 속성 보유 → 상단 노란 "PC 권장" 배너 노출
- [ ] 햄버거 메뉴(`#adminMobileToggle`) 동작 — 좌측 드로어 열림 + 관리자 메뉴 접근
- [ ] 배너 X 버튼(`data-drawer-close` 또는 배너 dismiss) → 세션 내 재노출 안 됨
- [ ] 1920px (PC) 뷰포트로 전환 → 배너 미노출 + 햄버거 미노출

### Sc11. 접근성 & 키보드
- [ ] Tab 키로 input/button/select 순차 포커스 이동
- [ ] ESC 키로 편집 모달 닫기
- [ ] 모달 열린 상태에서 배경 클릭 시 처리 (dismissable or modal lock)
- [ ] form-submit 엔터키 제출 동작

### Sc12. 회귀 체크 (다른 페이지 영향 없음)
- [ ] `/admin-home.html` 대시보드 정상 로드
- [ ] `/admin-order.html` 주문 관리 정상 로드
- [ ] `/admin-calendar.html` 캘린더 정상 로드
- [ ] 챗봇 "티즈" 이전과 동일하게 FAQ 45건 응답

## 발견된 이슈 기록

| # | 영역 | 증상 | 재현 경로 | 우선순위 |
|---|------|------|----------|---------|
|   |      |      |          |         |

## 테스트 완료
- [ ] 모든 시나리오 통과
- [ ] 발견된 이슈 없음 또는 `.claude/scratchpad.md`의 "수정 요청" 테이블에 등록
- [ ] 테스트 중 생성한 QA FAQ는 전부 삭제 확인 (원본 45건 유지)

## 참고: API 직접 호출 팁 (브라우저 DevTools Console)

```js
// 1. 토큰 가져오기
const token = localStorage.getItem('adminToken');

// 2. 목록 조회
fetch('/api/admin/knowledge/faq', { headers: { Authorization: `Bearer ${token}` } })
  .then(r => r.json()).then(d => console.log(d.totalCount, d.byIntent));

// 3. 특정 intent 필터
fetch('/api/admin/knowledge/faq?intent=shipping', { headers: { Authorization: `Bearer ${token}` } })
  .then(r => r.json()).then(console.log);

// 4. 재빌드
fetch('/api/admin/knowledge/rebuild', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ target: 'products' })
}).then(r => r.json()).then(console.log);
```
