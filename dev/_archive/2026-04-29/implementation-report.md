# STIZ 쇼핑몰 관리 시스템 - 구현 현황 보고서

작성일: 2026-03-31

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 프로젝트명 | STIZ 쇼핑몰 (스티즈 - 팀 유니폼 커스텀 제작) |
| 기술 스택 | HTML + Tailwind CSS + Vanilla JS (프론트), Express.js (서버) |
| 서버 | Node.js Express, 포트 4000 (`http://localhost:4000`) |
| 데이터베이스 | JSON 파일 기반 (server/data/ 폴더 내 .json 파일들) |
| 인증 방식 | JWT 토큰 + bcrypt 비밀번호 해싱 |
| 외부 라이브러리 | Tailwind CSS, Chart.js, Fabric.js, Three.js, Swiper.js (모두 CDN) |
| 원본 데이터 출처 | Google Sheets에서 임포트 (import-sheets.js) |

---

## 2. 시스템 구성도

### 2-1. 프론트엔드 페이지 목록 (총 20개)

**관리자 영역 (4개)**

| 파일명 | 역할 |
|--------|------|
| admin-login.html | 관리자 로그인 |
| admin.html | 관리자 대시보드 (주문 관리 메인) |
| admin-order.html | 주문 상세 보기/편집 |
| admin-customers.html | 고객 관리 |

**쇼핑몰 영역 (16개)**

| 파일명 | 역할 |
|--------|------|
| index.html | 메인 홈 (히어로, 카테고리, 베스트셀러) |
| list.html | 상품 목록 (필터, 정렬) |
| detail.html | 상품 상세 (사이즈 추천 포함) |
| basket.html | 장바구니 |
| order.html | 주문/결제 |
| order_result.html | 주문 결과 확인 |
| order-track.html | 주문 진행상황 조회 (비로그인 가능) |
| custom.html | 커스텀 디자인 허브 |
| custom_2d.html | 2D 디자인 랩 (Fabric.js) |
| custom_3d.html | 3D 디자인 랩 (Three.js) |
| custom_mockup.html | 목업 뷰어 |
| login.html | 로그인 |
| join.html | 회원가입 |
| myshop.html | 마이페이지 |
| lookbook.html | 룩북 갤러리 |
| notice.html | 공지사항 |
| inquiry.html | 문의하기 |

### 2-2. 백엔드 라우트 파일 (5개)

| 파일 | 마운트 경로 | 역할 |
|------|------------|------|
| routes/auth.js | /api/auth | 회원가입, 로그인, 토큰 검증 |
| routes/orders.js | /api/orders | 주문 생성, 목록 조회, 주문 추적 |
| routes/admin.js | /api/admin | 관리자 주문 관리, 통계, 입금 확인 |
| routes/customers.js | /api/admin/customers | 고객 CRUD, 병합, 통계 |
| routes/ai.js | /api/generate | AI 이미지 생성 (챗봇/디자인용) |

### 2-3. 데이터 파일 (JSON 기반)

| 파일 | 내용 | 현재 규모 |
|------|------|----------|
| orders.json | 전체 주문 데이터 | 약 7,980건 |
| customers.json | 고객 마스터 데이터 | 3,149명 |
| users.json | 시스템 사용자 (관리자/고객 계정) | 3명 |
| order-history.json | 주문 상태 변경 이력 | 동적 생성 |

---

## 3. 관리자 시스템 (Admin)

### 3-1. 관리자 로그인 (admin-login.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/admin-login.html` |
| 구현 상태 | ✅ 완성 |

**주요 기능:**
- 이메일 + 비밀번호 로그인 폼
- JWT 토큰 발급 후 localStorage에 저장 (키: `stiz_admin_token`)
- 관리자 권한(role: admin) 확인 -- 일반 사용자는 접근 차단
- 이미 유효한 토큰이 있으면 대시보드로 자동 이동 (중복 로그인 방지)
- 토큰 만료 시간 확인 (7일 유효)
- 로딩 스피너 + 에러 메시지 표시
- 검색엔진 노출 차단 (noindex, nofollow)

---

### 3-2. 관리자 대시보드 (admin.html + js/admin.js)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/admin.html` |
| 구현 상태 | ✅ 완성 |

**주요 기능 상세:**

#### 연도별 통계 카드
- 연도 드롭다운 (2023~2026)으로 해당 연도의 데이터만 조회
- 4개 상태 요약 카드: 시안 진행중 / 제작 진행중 / 배송 준비중 / 배송 완료
- 매출 요약 바: 총 주문수, 총 매출, 미수금, 보류 건수
- 카드 클릭 시 해당 상태 필터 자동 적용

#### 월별 매출 차트 (Chart.js)
- 막대그래프(매출) + 라인(주문수)을 한 차트에 표시
- 연도 드롭다운과 연동되어 연도 변경 시 차트도 함께 갱신
- 매출 기준일: orderReceiptDate (주문서 접수일) 기준

#### 담당자별 실적
- 테이블 형태로 담당자 이름, 주문수, 매출, 완료율, 평균 처리일 표시
- 매출 내림차순 정렬
- 연도별 조회 가능

#### 고객별 매출 랭킹 TOP 20
- 순위, 고객명, 팀명, 거래유형, 주문수, 총매출, 재주문 여부, 최근 주문일 표시
- 재주문율 배지 (전체 고객 중 2회 이상 주문 고객 비율)
- 연도별 조회 가능

#### 주문 목록 (테이블)
- **3개 탭**: 진행중 / 전체 / 미수금
  - 진행중: 배송완료/취소 제외한 진행 중인 주문만 표시
  - 전체: 모든 주문 표시
  - 미수금: 결제일 없고 금액 있는 주문만 표시
- **미수금 요약 패널**: 미수금 탭 선택 시 고객별 미수금 TOP 리스트 표시

#### 필터 기능
- 1줄: 상태, 담당자, 종목, 거래유형, 텍스트 검색, 필터 초기화
- 2줄: 접수일 범위 (시작~끝), 금액 범위 (최소~최대)
- 모든 필터는 실시간 적용 (드롭다운 변경 시 즉시 재조회)

#### 일괄 상태 변경
- 체크박스로 여러 주문 선택
- 상태 드롭다운에서 변경할 상태 선택 후 "일괄 변경" 클릭
- 변경 이력 자동 기록

#### CSV 내보내기
- 현재 필터 조건의 주문 데이터를 CSV 파일로 다운로드
- 한글 인코딩 지원

#### 기타
- 페이지네이션 (20건 단위)
- 주문 행 클릭 시 주문 상세 페이지로 이동
- 새로고침 버튼
- 로그아웃 기능

---

### 3-3. 주문 상세 (admin-order.html + js/admin-order.js)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/admin-order.html?id={주문ID}` |
| 구현 상태 | ✅ 완성 |

**주요 기능:**
- 주문 정보 탭 형태로 표시 (기본 정보, 고객 정보, 디자인 정보, 제작 정보, 배송 정보, 결제 정보)
- 상태 변경 기능 + 변경 이력 타임라인 표시
- 주문 필드 직접 편집 (PUT API)
- 입금 확인 기능: 입금일, 입금액, 메모를 입력하여 미수금을 입금 완료로 처리
- 수동 알림 발송 트리거 (카카오 알림 연동 준비 -- 현재는 로그만 기록)
- 주문 상태 변경 이력 조회 (누가, 언제, 어떤 상태로 변경했는지)

---

### 3-4. 고객 관리 (admin-customers.html + js/admin-customers.js)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/admin-customers.html` |
| 구현 상태 | ✅ 완성 |

**주요 기능:**
- 고객 목록 테이블 (이름, 팀명, 연락처, 거래유형, 주문수, 총매출)
- 텍스트 검색 (이름, 팀명, 전화번호, 이메일)
- 거래유형 필터
- 정렬 (기본: 주문수 내림차순 = 단골 순)
- 고객 상세 조회 (해당 고객의 주문 목록 포함)
- 고객 정보 수정
- 고객 병합 기능 (중복 고객을 하나로 합치기)
- 고객 통계 요약 (거래유형별 집계, 재주문 고객 비율)
- 페이지네이션

---

## 4. 쇼핑몰 프론트엔드

### 4-1. 메인 페이지 (index.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/index.html` |
| 구현 상태 | ✅ 완성 |

- 히어로 배너 (브랜드 메인 비주얼)
- 카테고리 섹션 (종목별 유니폼)
- 베스트셀러 상품 노출
- AI 챗봇 위젯 (product-data.js 기반 규칙 매칭)
- FOMO 토스트 알림 (최근 주문 알림 팝업)
- 인스타그램 피드 (Mock 데이터)

### 4-2. 상품 목록 (list.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/list.html` |
| 구현 상태 | ✅ 완성 |

- 상품 카드 그리드 표시
- 필터 (종목, 카테고리)
- 정렬 기능

### 4-3. 상품 상세 (detail.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/detail.html?id={상품ID}` |
| 구현 상태 | ✅ 완성 |

- 상품 이미지, 가격, 설명 표시
- 사이즈 추천 기능 통합
- 장바구니 담기

### 4-4. 장바구니 (basket.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/basket.html` |
| 구현 상태 | ✅ 완성 |

- 장바구니에 담긴 상품 목록
- 수량 변경, 상품 삭제
- 총 금액 계산
- 주문하기 버튼

### 4-5. 주문/결제 (order.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/order.html` |
| 구현 상태 | ✅ 완성 |

- 배송 정보 입력 (이름, 연락처, 주소)
- 주문 상품 요약
- 결제 진행 (PG 결제 통합 준비)
- 주문 생성 API 호출

### 4-6. 주문 결과 (order_result.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/order_result.html` |
| 구현 상태 | ✅ 완성 |

- 주문 완료 메시지
- 주문번호 표시

### 4-7. 주문 진행상황 조회 (order-track.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/order-track.html` |
| 구현 상태 | ✅ 완성 |

- 주문번호 입력으로 비로그인 조회 가능 (택배 송장 조회와 같은 방식)
- 4단계 진행 상태 시각적 표시 (시안진행 / 제작진행 / 배송준비 / 배송완료)
- 상태 변경 이력 타임라인
- 송장번호/택배사 정보 표시

### 4-8. 커스텀 디자인 허브 (custom.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/custom.html` |
| 구현 상태 | ✅ 완성 |

- 2D 디자인 랩, 3D 디자인 랩, 목업 뷰어로의 진입점
- 종목별/디자인 방식별 안내

### 4-9. 2D 디자인 랩 (custom_2d.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/custom_2d.html` |
| 구현 상태 | ✅ 완성 |

- Fabric.js 기반 캔버스 디자인 도구
- 종목별 SVG 유니폼 템플릿 (축구, 농구, 배구, 야구 -- 앞/뒤)
- 색상, 텍스트, 로고 편집
- AI 이미지 생성 API 연동 (localhost:4000/api/generate)

### 4-10. 3D 디자인 랩 (custom_3d.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/custom_3d.html` |
| 구현 상태 | ✅ 완성 |

- Three.js 기반 3D 렌더링
- AI 이미지 생성 연동

### 4-11. 목업 뷰어 (custom_mockup.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/custom_mockup.html` |
| 구현 상태 | 🔨 부분구현 |

- 디자인 결과물을 목업 이미지로 표시
- 2D 디자인에서 목업으로의 데이터 전달 미연결 (localStorage 키 불일치)
- 서버 미호출, 3.5초 딜레이 후 고정 이미지 표시

### 4-12. 로그인 (login.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/login.html` |
| 구현 상태 | ✅ 완성 |

- 이메일 + 비밀번호 로그인
- JWT 토큰 발급 및 저장

### 4-13. 회원가입 (join.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/join.html` |
| 구현 상태 | ✅ 완성 |

- 이름, 이메일, 비밀번호 입력
- 비밀번호 8자 이상 검증
- 이메일 중복 확인

### 4-14. 마이페이지 (myshop.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/myshop.html` |
| 구현 상태 | ✅ 완성 |

- 내 정보 확인
- 주문 내역 조회

### 4-15. 룩북 (lookbook.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/lookbook.html` |
| 구현 상태 | ✅ 완성 |

- 갤러리 형태 이미지 목록 (Mock 데이터 14개)
- 필터 기능
- 이미지 모달 (클릭 시 확대)

### 4-16. 공지사항 (notice.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/notice.html` |
| 구현 상태 | ✅ 완성 |

- 공지사항 목록 표시

### 4-17. 문의하기 (inquiry.html)

| 항목 | 내용 |
|------|------|
| 접속 URL | `http://localhost:4000/inquiry.html` |
| 구현 상태 | ✅ 완성 |

- 문의 폼

---

## 5. API 엔드포인트 목록

### 5-1. 인증 API (`/api/auth`)

| 메서드 | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | /api/auth/register | 회원가입 (이름, 이메일, 비밀번호) | 불필요 |
| POST | /api/auth/login | 로그인 (이메일, 비밀번호 -> JWT 토큰 발급) | 불필요 |
| GET | /api/auth/me | 현재 로그인 사용자 정보 확인 | 필요 |

### 5-2. 주문 API (`/api/orders`)

| 메서드 | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | /api/orders | 새 주문 생성 | 불필요 |
| GET | /api/orders | 전체 주문 목록 조회 | 불필요 |
| GET | /api/orders/track/:orderNumber | 주문번호로 진행상황 조회 (비로그인) | 불필요 |
| GET | /api/orders/:orderNumber | 주문번호로 상세 조회 | 불필요 |

### 5-3. 관리자 주문 관리 API (`/api/admin`) -- 관리자 토큰 필수

| 메서드 | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | /api/admin/orders | 전체 주문 목록 (필터/검색/정렬/페이지네이션) | 관리자 |
| GET | /api/admin/orders/:id | 주문 상세 조회 | 관리자 |
| PUT | /api/admin/orders/:id | 주문 정보 전체 수정 | 관리자 |
| PATCH | /api/admin/orders/:id/status | 주문 상태 변경 (+ 이력 자동 기록) | 관리자 |
| PATCH | /api/admin/orders/bulk-status | 주문 일괄 상태 변경 | 관리자 |
| GET | /api/admin/orders/:id/history | 주문 상태 변경 이력 조회 | 관리자 |
| PATCH | /api/admin/orders/:id/payment | 입금 확인 처리 (미수금 -> 입금 완료) | 관리자 |
| POST | /api/admin/orders/:id/notify | 수동 알림 발송 (로그만 기록, 미구현) | 관리자 |

### 5-4. 관리자 통계 API (`/api/admin/stats`) -- 관리자 토큰 필수

| 메서드 | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | /api/admin/stats | 대시보드 통계 (상태별, 매출, 미수금 등) | 관리자 |
| GET | /api/admin/stats/monthly | 월별 매출/주문수 집계 | 관리자 |
| GET | /api/admin/stats/staff | 담당자별 실적 (주문수, 매출, 완료율, 평균 처리일) | 관리자 |
| GET | /api/admin/stats/top-customers | 고객별 매출 랭킹 TOP 20 + 재주문율 | 관리자 |

### 5-5. 고객 관리 API (`/api/admin/customers`) -- 관리자 토큰 필수

| 메서드 | URL | 설명 | 인증 |
|--------|-----|------|------|
| GET | /api/admin/customers | 고객 목록 (검색/정렬/페이지네이션) | 관리자 |
| GET | /api/admin/customers/:id | 고객 상세 + 연결된 주문 목록 | 관리자 |
| PUT | /api/admin/customers/:id | 고객 정보 수정 | 관리자 |
| POST | /api/admin/customers/merge | 중복 고객 병합 | 관리자 |
| GET | /api/admin/customers/stats/summary | 고객 통계 요약 (거래유형별 집계 등) | 관리자 |

### 5-6. AI API (`/api/generate`)

| 메서드 | URL | 설명 | 인증 |
|--------|-----|------|------|
| POST | /api/generate | AI 이미지 생성 (Google Generative AI / OpenAI) | 불필요 |

---

## 6. 데이터 구조

### 6-1. orders.json 주요 필드

```
{
  id: 숫자 (고유 식별자, 타임스탬프 기반),
  orderNumber: "ORD-YYYYMMDD-NNN" (예: ORD-20260326-001),
  groupId: 그룹 ID (같은 주문 묶음),
  status: 주문 상태 (15단계 중 하나),

  customer: {
    name: 고객명,
    phone: 연락처,
    email: 이메일,
    teamName: 팀명,
    dealType: 거래유형 (동호회, 대학동아리, 학원SC 등)
  },
  customerId: customers.json의 고객 ID (연결 키),

  items: [{
    name: 품목명,
    sport: 종목 (basketball, soccer 등),
    category: 카테고리,
    method: 제작방식,
    quantity: 수량,
    unitPrice: 단가,
    subtotal: 소계
  }],

  design: {
    status: 시안 상태,
    revisionCount: 수정 횟수,
    designer: 최종작업자,
    orderSheetUrl: 주문서 링크
  },

  production: {
    status: 제작 상황,
    factory: 제작공장,
    gradingDone: 그레이딩 완료 여부
  },

  shipping: {
    address: 배송 주소,
    desiredDate: 희망 납기일,
    releaseDate: 출고일,
    shippedDate: 발송일,
    trackingNumber: 송장번호,
    carrier: 택배사
  },

  payment: {
    totalAmount: 총금액,
    paidDate: 입금일,
    paymentType: 주문서/입금 구분,
    transactionMethod: 거래방식,
    quoteUrl: 견적서 링크
  },

  manager: 담당자명,
  memo: 비고,
  createdAt: 상담개시일 (최초 접촉 날짜),
  designRequestDate: 시안요청일,
  orderReceiptDate: 주문서접수일 (매출 기준일),
  updatedAt: 최종 수정일
}
```

### 6-2. customers.json 주요 필드

```
{
  id: 숫자 (고유 식별자),
  name: 대표자/담당자명,
  phone: 연락처,
  email: 이메일,
  teamName: 팀명 (고객 식별 주요 키),
  dealType: 거래유형,
  orderCount: 총 주문 건수,
  totalSpent: 총 거래 금액,
  orderIds: [연결된 주문 ID 배열],
  memo: 메모,
  createdAt: 첫 주문일,
  updatedAt: 최종 수정일
}
```

### 6-3. users.json 주요 필드

```
{
  id: 숫자,
  name: 사용자명,
  email: 이메일,
  password: bcrypt 해싱된 비밀번호,
  role: "admin" 또는 "customer",
  joinedAt: 가입일
}
```

---

## 7. 최근 개발 이력 (시간순)

| 날짜 | 작업 내용 | 결과 |
|------|----------|------|
| 2026-03-31 | Phase A+B: 진행중/완료 분리 + 연도별 통계 (4파일, 테스트 25건 통과) | 완료 |
| 2026-03-31 | 주문 필터 확장: 날짜/금액 범위 + 거래유형 (4파일, 테스트 19건 통과) | 완료 |
| 2026-03-31 | Phase C: 미수금 관리 강화 (5파일, 테스트 22건 통과) | 완료 |
| 2026-03-31 | D-1~D-3: 월별 차트 + 담당자 실적 + 고객 랭킹 (3개 API 추가) | 완료 |
| 2026-03-31 | D-4: 주문 일괄 상태 변경 (3파일, +205줄) | 완료 |
| 2026-03-31 | D-5: CSV 내보내기 (admin.html + admin.js, +100줄) | 완료 |
| 2026-03-31 | 시트 원본 vs 시스템 비교분석 + 미반영 필드(주문서접수일) 발견 | 완료 |
| 2026-04-01 | E-1: 임포트 날짜 매핑 수정 + 재임포트(8,084건) + hold 104건 삭제 | 완료 |
| 2026-04-01 | E-2: 매출 통계 기준일을 orderReceiptDate로 변경 (4파일) | 완료 |
| 2026-04-01 | Phase E 통합 테스트 (20건: 19통과 + 1주의) | 완료 |

---

## 8. 향후 개발 계획

### 우선순위 높음
- **D-6: 카카오 알림 연동** -- 주문 상태 변경 시 고객에게 카카오 알림톡 자동 발송. 현재는 POST /api/admin/orders/:id/notify API가 로그만 기록하는 상태

### 개선 사항
- **입금 취소 기능**: 현재 PATCH /payment에 입금 확인만 있고, 실수로 입금 처리한 경우 되돌리는 기능 없음
- **목업 뷰어 연동 수정**: custom_2d.html에서 custom_mockup.html로 데이터 전달 시 localStorage 키 불일치 문제 해결 필요
- **2D 디자인 포트 설정**: custom_2d.js에서 localhost:4000/api/generate를 호출하도록 수정 필요 (현재 포트 불일치 버그)
- **hold 주문 엣지케이스**: ORD-20260101-001 주문의 createdAt과 orderReceiptDate 불일치 (1건, 실질적 영향 낮음)

---

## 주문 상태 흐름도 (15단계)

```
시안 요청 -> 초안 완료 -> 수정 중 -> 디자인 확정
  -> 결제 대기 -> 결제 완료
  -> 그레이딩 -> 라인 작업 -> 생산 중 -> 생산 완료
  -> 출고 -> 배송 중 -> 배송 완료

별도 상태: 보류 (hold), 취소 (cancelled)
```

고객에게 보이는 4단계 매핑:
- **시안 진행중**: 시안 요청, 초안 완료, 수정 중, 디자인 확정
- **제작 진행중**: 결제 대기, 결제 완료, 그레이딩, 라인 작업, 생산 중, 생산 완료
- **배송 준비중**: 출고, 배송 중
- **배송 완료**: 배송 완료
