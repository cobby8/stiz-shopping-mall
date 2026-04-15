# 챗봇 "티즈" FAQ/정책 지식베이스 — 확정본 (K1)

**작성일**: 2026-04-15
**작성자**: planner-architect
**총 항목 수**: 45개 (카테고리 8개 + 추가 3개)
**버전**: `k1-2026-04-15`
**기반 문서**: `dev/chatbot-faq-draft.md` (394줄, 42개 초안) + 사용자 추가 3개
**검수 상태**: 사용자 승인 완료 (모든 needsReview=false)

---

## 📋 정책 확정 값 (불일치 3건 해결)

| 항목 | 확정 값 | 출처 |
|------|---------|------|
| 단체주문 할인율 | 10~29벌 **5%** / 30~99벌 **10%** / 100벌+ **협의** | bulk-order.html 공식 구간 채택 |
| 고객센터 연락처 | 📞 **070-4337-3000** / 📧 **order@stiz.kr** | 신규 통일 (기존 4종 전부 대체) |
| 영업시간 | 평일 **09:00~18:00** / 토 예약상담 / 일·공휴일 휴무 | bulk-order.html 기준으로 통일 |

---

## 🧭 intent 분류 (developer 매칭기용)

| intent | 담당 카테고리 | 키워드 예시 |
|--------|-------------|------------|
| `shipping` | 배송 | 배송, 택배, 도착, 송장, 제주, 해외 |
| `refund` | 교환/환불/취소 | 환불, 반품, 교환, 취소 |
| `custom` | 커스텀/단체/디자인/파일 | 커스텀, 단체, 유니폼, 시안, 마킹, 파일, 승화전사 |
| `product` | 상품/원단/사이즈/재고/브랜드 | 사이즈, 원단, 재고, 품절, 종목 |
| `payment` | 결제/세금계산서 | 결제, 카드, 무통장, 세금계산서, 계좌 |
| `member` | 회원/소셜/등급/탈퇴 | 회원, 가입, 카카오 로그인, 탈퇴, 적립금 |
| `company` | 회사정보/연락처/SNS/영업시간 | 전화, 이메일, 주소, 영업시간, 인스타 |
| `coupon` | 쿠폰 전용 | 쿠폰, 할인코드 |

> priority 값은 `high` / `medium` / `low` 3단계. 답변 매칭 실패 시 high 우선으로 제안.

---

## 카테고리 1. 배송 (6개)

### FAQ-SHIP-001 — 배송 기간
- **intent**: shipping
- **priority**: high
- **keywords**: ["배송", "얼마나", "며칠", "도착", "배송기간"]
- **questions**: ["배송 얼마나 걸려요?", "언제 도착해요?", "배송 기간이 어떻게 되나요?"]
- **answer**: 기성품은 결제 후 2~3 영업일 이내 배송됩니다. 커스텀 제작 상품은 시안 확정 후 약 2~3주 소요되고, 100벌 이상 대량 주문은 3~4주 정도 걸려요.
- **source**: chatbot.js:312~313, bulk-order.html:224, ai.js:233
- **needsReview**: false

### FAQ-SHIP-002 — 배송비
- **intent**: shipping
- **priority**: high
- **keywords**: ["배송비", "택배비", "무료배송", "얼마"]
- **questions**: ["배송비 얼마예요?", "무료배송 되나요?", "택배비는요?"]
- **answer**: 5만원 이상 구매 시 무료배송이고, 5만원 미만은 3,000원의 배송비가 부과됩니다. 단체 주문(10벌 이상)은 전국 무료 배송이에요.
- **source**: cart.js:13 (FREE_SHIPPING_THRESHOLD=50000), chatbot.js:314, bulk-order.html:236
- **needsReview**: false

### FAQ-SHIP-003 — 배송 지역 (제주/도서산간)
- **intent**: shipping
- **priority**: medium
- **keywords**: ["제주", "도서산간", "추가", "지역"]
- **questions**: ["제주도도 배송되나요?", "도서산간 추가 비용 있어요?"]
- **answer**: 전국 어디서나 배송 가능합니다. 일반 주문의 경우 제주·도서산간 지역은 3,000원의 추가 배송비가 부과돼요. 단체 주문(10벌 이상)은 제주·도서산간도 무료 배송입니다.
- **source**: bulk-order.html:236 + 사용자 확정 (일반주문 +3,000원)
- **needsReview**: false

### FAQ-SHIP-004 — 해외 배송
- **intent**: shipping
- **priority**: low
- **keywords**: ["해외", "외국", "글로벌", "international"]
- **questions**: ["해외 배송 되나요?", "외국으로 보내주세요"]
- **answer**: 현재 STIZ는 국내 배송만 진행하고 있어요. 해외 배송은 지원하지 않습니다.
- **source**: 사용자 확정 (국내만)
- **needsReview**: false

### FAQ-SHIP-005 — 출고 후 배송 조회
- **intent**: shipping
- **priority**: high
- **keywords**: ["송장", "배송조회", "추적", "어디까지"]
- **questions**: ["송장번호 어디서 봐요?", "배송 추적하고 싶어요"]
- **answer**: 회원이시면 마이페이지(myshop.html)에서 송장번호 확인이 가능해요. 비회원은 주문 조회(order-track.html)에서 주문번호 + 이름으로 조회하실 수 있어요.
- **source**: chatbot.js:288~303, order-track.html
- **needsReview**: false

### FAQ-SHIP-006 — 배송 지연
- **intent**: shipping
- **priority**: low
- **keywords**: ["늦어요", "지연", "왜"]
- **questions**: ["왜 이렇게 늦어요?", "배송이 왜 늦어지나요?"]
- **answer**: 정확한 배송 상태는 카카오톡 @stiz로 문의해주세요.
- **source**: 사용자 확정 (간결 모드)
- **needsReview**: false

---

## 카테고리 2. 교환/환불 (5개)

### FAQ-REFUND-001 — 교환/환불 가능 기간
- **intent**: refund
- **priority**: high
- **keywords**: ["교환", "환불", "기간", "며칠"]
- **questions**: ["교환 기간이 얼마나 돼요?", "환불은 며칠 안에 해야 하나요?"]
- **answer**: 상품 수령 후 7일 이내에 교환·반품 신청이 가능합니다. 단, 커스텀 제작 상품은 원칙적으로 교환·환불이 불가능해요.
- **source**: ai.js:236, chatbot.js:316
- **needsReview**: false

### FAQ-REFUND-002 — 커스텀 상품 환불 규정
- **intent**: refund
- **priority**: high
- **keywords**: ["커스텀", "유니폼", "환불", "반품", "제작"]
- **questions**: ["제작한 유니폼 환불 되나요?", "커스텀도 반품 가능해요?"]
- **answer**: 커스텀 제작 상품(로고·번호·이름 등이 인쇄된 유니폼)은 고객 맞춤 제작 특성상 환불이 불가합니다. 단, 제조 불량이나 배송 과정에서 하자가 발생한 경우에는 교환/환불 가능하니 카카오톡 @stiz로 사진과 함께 접수해주세요.
- **source**: ai.js:236
- **needsReview**: false

### FAQ-REFUND-003 — 교환/환불 절차
- **intent**: refund
- **priority**: medium
- **keywords**: ["절차", "어떻게", "신청", "방법"]
- **questions**: ["교환 어떻게 하나요?", "환불 신청 방법 알려주세요"]
- **answer**: 카카오톡 @stiz 또는 1:1 문의(inquiry.html)로 주문번호와 사유를 남겨주세요. 담당자가 수거 택배 예약 및 환불 일정을 안내해드려요.
- **source**: about.html:258~260
- **needsReview**: false

### FAQ-REFUND-004 — 교환/환불 배송비 부담
- **intent**: refund
- **priority**: medium
- **keywords**: ["배송비", "왕복", "단순변심", "하자"]
- **questions**: ["반품 배송비는 누가 내요?", "단순변심도 배송비 내야 하나요?"]
- **answer**: 단순 변심에 의한 교환·반품은 왕복 배송비를 고객님이 부담하세요. 상품 하자나 오배송 등 STIZ 책임일 경우에는 배송비를 저희가 부담해드려요.
- **source**: 일반 관행 + 사용자 승인
- **needsReview**: false

### FAQ-REFUND-005 — 환불 처리 기간
- **intent**: refund
- **priority**: low
- **keywords**: ["환불", "언제", "처리", "며칠"]
- **questions**: ["환불 언제 들어와요?", "환불 처리 며칠 걸려요?"]
- **answer**: 상품 회수 확인 후 영업일 기준 3~5일 이내에 결제 수단에 따라 환불됩니다. 카드 결제는 카드사 정책에 따라 다음 달 청구에서 차감될 수 있어요.
- **source**: 일반 관행 + 사용자 승인
- **needsReview**: false

---

## 카테고리 3. 커스텀/단체 주문 (9개)

### FAQ-CUSTOM-001 — 최소 주문 수량 (MOQ)
- **intent**: custom
- **priority**: high
- **keywords**: ["몇벌", "최소", "MOQ", "수량"]
- **questions**: ["몇 벌부터 주문 가능해요?", "최소 주문 수량이 있나요?"]
- **answer**: 단체 주문 할인은 10벌 이상부터 적용됩니다. 10벌 미만은 일반 주문으로 진행해주세요. 한 벌씩 주문도 가능하지만 할인 혜택은 없어요.
- **source**: bulk-order.html:220, ai.js:232, chatbot.js:343
- **needsReview**: false

### FAQ-CUSTOM-002 — 수량별 할인율
- **intent**: custom
- **priority**: high
- **keywords**: ["할인", "할인율", "몇프로", "얼마", "대량"]
- **questions**: ["몇 벌이면 얼마 할인돼요?", "대량 할인 있나요?"]
- **answer**: 수량별로 할인율이 달라요. 10~29벌은 5%, 30~99벌은 10%, 100벌 이상은 별도 협의로 진행됩니다.
- **source**: bulk-order.html:69~90 (확정)
- **needsReview**: false

### FAQ-CUSTOM-003 — 제작 기간
- **intent**: custom
- **priority**: high
- **keywords**: ["제작", "기간", "얼마나", "주"]
- **questions**: ["커스텀은 얼마나 걸려요?", "제작 기간 알려주세요"]
- **answer**: 시안 확정 후 일반 주문은 약 2~3주, 100벌 이상 대량 주문은 3~4주 정도 걸립니다. 긴급 제작이 필요하시면 상담원에게 별도 문의해주세요.
- **source**: bulk-order.html:224, chatbot.js:344
- **needsReview**: false

### FAQ-CUSTOM-004 — 디자인 시안 비용
- **intent**: custom
- **priority**: high
- **keywords**: ["시안", "무료", "디자인비", "작업비"]
- **questions**: ["시안은 공짜예요?", "디자인 작업비 있어요?"]
- **answer**: 단체 주문 고객께는 전담 디자이너가 배정되어 무료 시안을 제공해드립니다. 수정은 2회까지 무료예요.
- **source**: bulk-order.html:228
- **needsReview**: false

### FAQ-CUSTOM-005 — 시안 수정 횟수
- **intent**: custom
- **priority**: medium
- **keywords**: ["수정", "횟수", "몇번", "추가"]
- **questions**: ["시안 몇 번까지 수정 돼요?", "여러 번 수정 가능한가요?"]
- **answer**: 무료 시안 수정은 2회까지 제공됩니다. 추가 수정은 상담 후 진행되니 담당 디자이너와 편하게 협의해주세요.
- **source**: bulk-order.html:228 + 사용자 확정 (유연 모드)
- **needsReview**: false

### FAQ-CUSTOM-006 — 개별 사이즈/이름/번호 지정
- **intent**: custom
- **priority**: high
- **keywords**: ["개별", "선수", "이름", "번호", "마킹"]
- **questions**: ["선수마다 사이즈 달라도 되나요?", "이름이랑 번호 박아주세요"]
- **answer**: 네, 가능합니다. 주문 시 선수별 사이즈와 이름/등번호를 엑셀이나 메모로 보내주시면 개별 맞춤 제작해드려요.
- **source**: bulk-order.html:232
- **needsReview**: false

### FAQ-CUSTOM-007 — 디자인 방법 (2D / 3D / 목업)
- **intent**: custom
- **priority**: high
- **keywords**: ["디자인", "2D", "3D", "목업", "에디터"]
- **questions**: ["직접 디자인할 수 있나요?", "어떻게 디자인해요?"]
- **answer**: STIZ Design Lab에서 세 가지 방법을 제공합니다. ① 2D Editor — 기존 STIZ 상품에 로고·텍스트·색상을 얹는 커스텀(custom_2d.html). ② 3D AI Design — NanoBanana AI 엔진으로 독창적 디자인 생성(custom_3d.html). ③ Request Mockup — 시안을 실제 유니폼 목업으로 확인(custom_mockup.html). 디자인 랩 입구는 custom.html이에요.
- **source**: custom.html:90~176
- **needsReview**: false

### FAQ-CUSTOM-008 — 파일 업로드 규격
- **intent**: custom
- **priority**: medium
- **keywords**: ["파일", "AI", "PSD", "PNG", "해상도", "dpi", "벡터"]
- **questions**: ["어떤 파일 올려야 하나요?", "AI 파일도 돼요?", "해상도 몇이면 되나요?"]
- **answer**: AI / PSD / PNG / JPG 파일을 받습니다. 인쇄 품질을 위해 벡터 파일(AI) 또는 300dpi 이상 고해상도 이미지를 권장드려요. 정확한 규격은 담당 디자이너가 안내해드립니다.
- **source**: 사용자 확정 (AI/PSD/PNG/JPG, 벡터·300dpi)
- **needsReview**: false

### FAQ-CUSTOM-009 — 인쇄 방식 (승화전사)
- **intent**: custom
- **priority**: medium
- **keywords**: ["승화전사", "인쇄", "나염", "전사"]
- **questions**: ["승화전사가 뭐예요?", "나염이랑 뭐가 달라요?"]
- **answer**: STIZ는 승화전사 인쇄를 기본으로 합니다. 원단에 잉크가 스며들어 오래 입어도 색이 바래지 않고 촉감이 매끄러워요. 나염은 원단 위에 잉크를 얹는 방식이라 시간이 지나면 갈라질 수 있어요. 승화전사가 스포츠 유니폼에 훨씬 적합합니다.
- **source**: about.html:84, 124 / spreadsheet_orders.csv
- **needsReview**: false

### FAQ-CUSTOM-010 — 마킹(번호·이름) 추가금 (추가 FAQ)
- **intent**: custom
- **priority**: medium
- **keywords**: ["마킹", "번호", "이름", "추가금", "추가비용"]
- **questions**: ["마킹하면 추가금 있나요?", "이름 번호 박으면 비싸져요?"]
- **answer**: 승화전사 마킹(번호·이름)은 기본 요금에 포함돼 있어서 별도 추가금이 발생하지 않아요. 편하게 요청해주세요.
- **source**: 사용자 확정 (추가금 없음)
- **needsReview**: false

---

## 카테고리 4. 상품 (6개 — 5 + 추가 1)

### FAQ-PRODUCT-001 — 취급 종목
- **intent**: product
- **priority**: high
- **keywords**: ["종목", "스포츠", "어떤", "취급"]
- **questions**: ["어떤 종목 있어요?", "무슨 스포츠 취급해요?"]
- **answer**: 축구, 농구, 배구, 야구 등 주요 구기종목 유니폼과 팀웨어/트레이닝복, 악세서리·용품까지 제작합니다. 그 외 종목도 단체 주문 문의 시 상담 가능해요.
- **source**: footer, bulk-order.html:163~170, ai.js:231
- **needsReview**: false

### FAQ-PRODUCT-002 — 사이즈 범위
- **intent**: product
- **priority**: medium
- **keywords**: ["사이즈", "XL", "크기", "범위"]
- **questions**: ["XL도 있나요?", "사이즈 어디까지 나와요?"]
- **answer**: 기본 S/M/L 라인에 더해 커스텀 제작 특성상 5XS부터 5XL까지 넓은 사이즈 범위를 제공합니다. 상품마다 실제 제공 사이즈가 다를 수 있으니 상품 상세 페이지 사이즈표를 확인해주세요. 단체 주문은 선수별 개별 사이즈 지정이 가능합니다.
- **source**: 사용자 확정 (커스텀 5XS~5XL)
- **needsReview**: false

### FAQ-PRODUCT-003 — 원단 종류
- **intent**: product
- **priority**: medium
- **keywords**: ["원단", "어센틱", "스탠다드", "베이직", "프로"]
- **questions**: ["원단 뭐 써요?", "어센틱이 뭐예요?"]
- **answer**: 프리미엄 원단으로 어센틱 / 스탠다드 / 베이직 / 프로 등 여러 라인을 운영합니다. 상품마다 사용하는 원단이 다르고, 커스텀 주문 시 원단을 선택하실 수 있어요. 자세한 감촉과 차이는 카카오톡 @stiz로 샘플 문의해주세요.
- **source**: about.html:84 / spreadsheet_orders.csv
- **needsReview**: false

### FAQ-PRODUCT-004 — 브랜드 정체성
- **intent**: product
- **priority**: medium
- **keywords**: ["STIZ", "브랜드", "회사", "소개"]
- **questions**: ["STIZ가 뭐예요?", "어떤 회사예요?"]
- **answer**: STIZ(스티즈)는 2016년부터 스포츠 팀웨어 커스텀 제작을 전문으로 해온 브랜드입니다. 8,000건 이상의 누적 주문과 3,000개 이상의 파트너 팀과 함께 해왔어요. 승화전사 인쇄와 AI 디자인 랩으로 "팀의 정체성을 디자인"하는 것을 모토로 합니다.
- **source**: about.html:59, 94~99
- **needsReview**: false

### FAQ-PRODUCT-005 — 재고 / 품절 문의
- **intent**: product
- **priority**: low
- **keywords**: ["재고", "품절", "재입고", "언제"]
- **questions**: ["이거 재고 있어요?", "품절이면 언제 들어와요?"]
- **answer**: 기성품 재고는 상품 상세 페이지에서 실시간으로 확인하실 수 있어요. 품절 상품의 재입고 일정은 카카오톡 @stiz로 문의 부탁드립니다. 커스텀 주문은 재고와 무관하게 주문 제작돼요.
- **source**: 사용자 확정 (카톡 문의만)
- **needsReview**: false

### FAQ-PRODUCT-006 — 사이즈 교환 규정 (추가 FAQ)
- **intent**: product
- **priority**: medium
- **keywords**: ["사이즈교환", "사이즈 안맞", "작아요", "커요"]
- **questions**: ["사이즈 안 맞으면 교환 되나요?", "커스텀 사이즈 교환 되죠?"]
- **answer**: 기성품은 상품 수령 후 7일 이내 사이즈 교환이 가능하지만, 커스텀 제작 상품은 사이즈 교환이 불가능합니다. 번거로우시더라도 주문 전에 상품 상세 페이지의 사이즈표를 꼭 확인해주세요.
- **source**: 사용자 확정 (커스텀 사이즈 교환 불가)
- **needsReview**: false

---

## 카테고리 5. 결제 (6개 — 5 + 추가 1)

### FAQ-PAY-001 — 결제 수단
- **intent**: payment
- **priority**: high
- **keywords**: ["결제", "카드", "무통장", "토스페이", "수단"]
- **questions**: ["결제 뭐로 해요?", "카드 되나요?", "무통장 입금도 가능해요?"]
- **answer**: 카드 결제(신용/체크), 토스페이 간편결제, 무통장 입금 세 가지를 지원합니다. 결제 페이지에서 원하시는 방법을 선택하실 수 있어요.
- **source**: checkout.html:198~282
- **needsReview**: false

### FAQ-PAY-002 — 무통장 입금 계좌
- **intent**: payment
- **priority**: high
- **keywords**: ["계좌", "무통장", "입금", "우리은행"]
- **questions**: ["입금 계좌 어디예요?", "무통장 정보 알려주세요"]
- **answer**: 우리은행 1005-104-213186 (예금주: 소명엔비씨(주))로 입금해주시면 됩니다. 입금 확인 후 주문이 확정돼요.
- **source**: checkout.html:277~278, 358~359
- **needsReview**: false

### FAQ-PAY-003 — 세금계산서 / 현금영수증
- **intent**: payment
- **priority**: medium
- **keywords**: ["세금계산서", "현금영수증", "사업자", "법인"]
- **questions**: ["세금계산서 발행 되나요?", "현금영수증 해주세요"]
- **answer**: 결제 시 사업자 정보를 입력하시면 세금계산서와 현금영수증이 자동 발행됩니다. 추가 문의가 있으시면 order@stiz.kr 또는 카카오톡 @stiz로 연락해주세요.
- **source**: 사용자 확정 (자동 발행)
- **needsReview**: false
- **⚠️ developer 체크**: checkout.html에 사업자번호/이메일 입력 UI가 있는지 확인. 없다면 추가 기획 필요.

### FAQ-PAY-004 — 단체 주문 결제 방식
- **intent**: payment
- **priority**: medium
- **keywords**: ["단체", "견적", "법인카드", "계좌이체"]
- **questions**: ["단체주문은 어떻게 결제해요?", "학교라서 세금계산서 필요해요"]
- **answer**: 단체 주문은 견적서 확정 후 계좌이체 또는 법인카드 결제가 가능합니다. 학교·관공서 등 세금계산서가 필요하신 경우 사업자등록증을 함께 보내주시면 처리해드려요.
- **source**: bulk-order.html + spreadsheet_orders.csv
- **needsReview**: false

### FAQ-PAY-005 — 쿠폰 사용
- **intent**: payment
- **priority**: medium
- **keywords**: ["쿠폰", "할인코드", "받기"]
- **questions**: ["쿠폰 어디서 받아요?", "할인 코드 있어요?"]
- **answer**: STIZ는 정기 쿠폰을 운영하지 않습니다. 단체 주문 고객께는 담당자가 필요 시 수시로 쿠폰을 발급해드려요. 발급받으신 코드는 주문/결제 페이지에서 입력하시면 자동 할인 적용됩니다.
- **source**: 사용자 확정 (수시 발급)
- **needsReview**: false

### FAQ-PAY-006 — 결제 후 취소 규정 (추가 FAQ)
- **intent**: payment
- **priority**: medium
- **keywords**: ["취소", "결제취소", "주문취소", "환불"]
- **questions**: ["주문 취소 되나요?", "결제했는데 취소하고 싶어요"]
- **answer**: 커스텀 주문 취소는 진행 단계에 따라 환불률이 달라요. ① 시안 작업 전 취소: 100% 환불. ② 시안 확정 후 취소: 70% 환불(디자인 작업비 차감). ③ 제작 시작 후: 취소 불가(0%). 기성품은 배송 전까지 100% 취소 가능합니다.
- **source**: 사용자 확정 (단계별 차등)
- **needsReview**: false

---

## 카테고리 6. 회원 (4개)

### FAQ-MEMBER-001 — 회원가입 혜택
- **intent**: member
- **priority**: medium
- **keywords**: ["가입", "혜택", "회원"]
- **questions**: ["가입하면 뭐가 좋아요?", "회원 혜택 뭐 있어요?"]
- **answer**: 회원가입하시면 주문 내역 자동 관리, 배송지 저장, 할인 쿠폰 수령 등의 혜택이 있어요. 특히 단체 주문 이력도 한눈에 관리하실 수 있습니다.
- **source**: checkout.html:88~89
- **needsReview**: false

### FAQ-MEMBER-002 — 소셜 로그인
- **intent**: member
- **priority**: low
- **keywords**: ["카카오", "네이버", "소셜", "간편가입"]
- **questions**: ["카카오로 가입 돼요?", "네이버 로그인 지원해요?"]
- **answer**: 카카오와 네이버 간편 가입 버튼이 마련되어 있어요. 다만 현재 일부 소셜 연동은 준비 중이라 이메일 가입을 안내드리는 경우가 있으니 양해 부탁드려요.
- **source**: join.html:49~59, 168~179
- **needsReview**: false

### FAQ-MEMBER-003 — 등급제 / 적립금
- **intent**: member
- **priority**: low
- **keywords**: ["등급", "VIP", "적립금", "포인트"]
- **questions**: ["VIP 같은 거 있어요?", "적립금 쌓여요?"]
- **answer**: 현재 별도의 회원 등급제나 정기 적립금은 운영하지 않습니다. 단체 주문 재주문 고객께는 담당자가 개별 혜택을 안내해드려요.
- **source**: schema.sql:316 (테이블만 존재, 미운영)
- **needsReview**: false

### FAQ-MEMBER-004 — 개인정보 / 탈퇴
- **intent**: member
- **priority**: low
- **keywords**: ["탈퇴", "개인정보", "회원탈퇴"]
- **questions**: ["회원 탈퇴 어떻게 해요?", "내 정보 어디서 지워요?"]
- **answer**: 마이페이지(myshop.html)의 회원정보 수정에서 탈퇴 신청이 가능해요. 탈퇴 시 주문 이력 등 일부 정보는 전자상거래법에 따라 최대 5년간 보관됩니다. 자세한 사항은 개인정보처리방침을 확인해주세요.
- **source**: myshop.html + 개인정보처리방침
- **needsReview**: false

---

## 카테고리 7. 회사 정보 (5개)

### FAQ-COMPANY-001 — 회사 정보
- **intent**: company
- **priority**: medium
- **keywords**: ["회사", "사업자", "주소", "대표", "소명엔비씨"]
- **questions**: ["회사 어디 있어요?", "사업자 번호 알려주세요"]
- **answer**: 상호: 소명엔비씨(주)(브랜드명: STIZ) / 대표: 김수빈 / 사업자등록번호: 119-86-78811 / 통신판매업: 2019-서울강동-1084 / 주소: 서울특별시 성동구 한림말길 33, 지하2층(옥수동, 청훈빌딩)
- **source**: footer(header_render.js:392), about.html:200~230
- **needsReview**: false

### FAQ-COMPANY-002 — 대표 전화 / 이메일
- **intent**: company
- **priority**: high
- **keywords**: ["전화", "번호", "이메일", "연락처", "메일"]
- **questions**: ["전화번호 알려주세요", "이메일 주소가 뭐예요?"]
- **answer**: 전화는 070-4337-3000, 이메일은 order@stiz.kr 로 문의하실 수 있어요. 카카오톡 @stiz 채널이 가장 빠릅니다.
- **source**: 사용자 확정 (기존 4종 통일)
- **needsReview**: false

### FAQ-COMPANY-003 — 영업 시간
- **intent**: company
- **priority**: medium
- **keywords**: ["영업시간", "운영시간", "상담시간", "주말"]
- **questions**: ["영업시간 언제예요?", "주말에도 문의 되나요?"]
- **answer**: 평일 09:00~18:00에 상담 가능해요. 토요일은 예약 상담만 진행하고, 일요일과 공휴일은 휴무입니다.
- **source**: 사용자 확정 (09~18 통일)
- **needsReview**: false

### FAQ-COMPANY-004 — 상담 채널 (카카오톡)
- **intent**: company
- **priority**: high
- **keywords**: ["카카오톡", "카톡", "상담", "빠른"]
- **questions**: ["카카오톡 상담 돼요?", "빠르게 연락하려면요?"]
- **answer**: 가장 빠른 문의 채널은 카카오톡 @stiz 입니다. 1:1 문의(inquiry.html)에 글을 남겨주셔도 영업일 기준 1일 이내 답변드려요. 단체 주문 견적은 bulk-order.html에서 신청하시면 전담 디자이너가 배정됩니다.
- **source**: chatbot.js:328~333, bulk-order.html:250
- **needsReview**: false

### FAQ-COMPANY-005 — SNS / 소셜 채널
- **intent**: company
- **priority**: low
- **keywords**: ["인스타", "SNS", "페이스북", "유튜브"]
- **questions**: ["인스타 있어요?", "SNS 어디서 봐요?"]
- **answer**: 공식 인스타그램은 @stiz_official 입니다. 페이스북과 유튜브 채널은 준비 중이에요.
- **source**: footer(header_render.js) 인스타 실제 링크
- **needsReview**: false

---

## 카테고리 8. 쿠폰 / 이벤트 (3개)

### FAQ-COUPON-001 — 쿠폰 사용 방법
- **intent**: coupon
- **priority**: medium
- **keywords**: ["쿠폰", "사용", "입력", "코드"]
- **questions**: ["쿠폰 어떻게 써요?", "할인 코드 어디에 넣어요?"]
- **answer**: 주문/결제 페이지의 "쿠폰 코드" 입력란에 받으신 코드를 입력하시면 할인이 자동 적용돼요. 쿠폰은 유효기간 내에만 사용 가능하니 발급 후 빠르게 사용해주세요.
- **source**: schema.sql:288~316, checkout.html 쿠폰 입력란
- **needsReview**: false

### FAQ-COUPON-002 — 중복 사용
- **intent**: coupon
- **priority**: low
- **keywords**: ["중복", "두장", "여러", "같이"]
- **questions**: ["쿠폰 두 장 같이 돼요?", "여러 쿠폰 쓸 수 있어요?"]
- **answer**: 쿠폰은 1회 주문당 1장만 사용할 수 있어요.
- **source**: 사용자 확정 (단순 모드)
- **needsReview**: false

### FAQ-COUPON-003 — 이벤트 주기
- **intent**: coupon
- **priority**: low
- **keywords**: ["이벤트", "세일", "언제", "주기"]
- **questions**: ["세일 언제 해요?", "이벤트 자주 있어요?"]
- **answer**: STIZ는 정기 이벤트가 아닌 부정기 이벤트로 운영되고 있어요. 공지는 인스타그램 @stiz_official에서 확인해주세요.
- **source**: 사용자 확정 (부정기, 인스타 공지)
- **needsReview**: false

---

## 📦 JSON 스키마 설계 (developer 구현용)

### 1) `server/data/knowledge/company.json` — 회사 상수 (footer/about/챗봇 공용)

```jsonc
{
  "name": "STIZ",
  "nameKo": "스티즈",
  "fullName": "소명엔비씨(주)",
  "ceo": "김수빈",
  "bizNumber": "119-86-78811",
  "mailOrderNumber": "2019-서울강동-1084",
  "address": "서울특별시 성동구 한림말길 33, 지하2층 (옥수동, 청훈빌딩)",
  "phone": "070-4337-3000",
  "phoneLink": "tel:070-4337-3000",
  "email": "order@stiz.kr",
  "emailLink": "mailto:order@stiz.kr",
  "kakao": "@stiz",
  "kakaoLink": "https://pf.kakao.com/_xjxjxj",
  "instagram": "@stiz_official",
  "instagramLink": "https://instagram.com/stiz_official",
  "facebook": null,
  "youtube": null,
  "businessHours": {
    "weekday": "09:00~18:00",
    "saturday": "예약 상담",
    "sunday": "휴무",
    "holiday": "휴무"
  },
  "bankAccount": {
    "bank": "우리은행",
    "number": "1005-104-213186",
    "holder": "소명엔비씨(주)"
  },
  "foundedYear": 2016,
  "totalOrders": 8000,
  "partnerTeams": 3000
}
```

**참조 대상**: about.html, header_render.js(푸터), chatbot.js, ai.js, bulk-order.html, checkout.html.

---

### 2) `server/data/knowledge/policies.json` — 운영 규칙 원형 값

```jsonc
{
  "shipping": {
    "freeThreshold": 50000,
    "baseFee": 3000,
    "jejuSurcharge": 3000,
    "bulkFreeShipping": true,
    "bulkMinQty": 10,
    "internationalShipping": false,
    "leadTime": {
      "ready": "2~3 영업일",
      "custom": "시안 확정 후 2~3주",
      "bulk100plus": "3~4주"
    }
  },
  "refund": {
    "periodDays": 7,
    "customRefundable": false,
    "shippingFeeBearer": {
      "change": "customer",
      "defect": "stiz"
    },
    "processingDays": "3~5 영업일"
  },
  "bulk": {
    "minQty": 10,
    "discountTiers": [
      { "min": 10, "max": 29, "rate": 0.05, "label": "5%" },
      { "min": 30, "max": 99, "rate": 0.10, "label": "10%" },
      { "min": 100, "max": null, "rate": null, "label": "협의" }
    ],
    "freeDraft": true,
    "freeRevisionCount": 2,
    "individualSize": true,
    "markingSurcharge": 0,
    "acceptedFileFormats": ["AI", "PSD", "PNG", "JPG"],
    "recommendedResolution": "벡터 또는 300dpi 이상",
    "printMethod": "승화전사"
  },
  "payment": {
    "methods": ["card", "tossPay", "bankTransfer"],
    "taxInvoiceAuto": true,
    "cashReceiptAuto": true,
    "customCancellation": [
      { "stage": "beforeDraft", "refundRate": 1.00, "label": "시안 전" },
      { "stage": "afterDraftConfirm", "refundRate": 0.70, "label": "시안 확정 후" },
      { "stage": "afterProductionStart", "refundRate": 0.00, "label": "제작 시작 후" }
    ],
    "readyMadeCancellation": { "beforeShipping": 1.00 }
  },
  "coupon": {
    "stackable": false,
    "maxPerOrder": 1,
    "scheduleType": "부정기",
    "announceChannel": "instagram:@stiz_official"
  },
  "member": {
    "tierSystem": false,
    "pointSystem": false,
    "withdrawalRetainYears": 5
  }
}
```

**참조 대상**: ai.js 시스템 프롬프트, chatbot.js 배송·할인 버튼, cart.js `FREE_SHIPPING_THRESHOLD`, checkout.html 쿠폰/취소 UI, knowledge.js 로더.

---

### 3) `server/data/knowledge/faq.json` — Q&A 45개

```jsonc
{
  "version": "k1-2026-04-15",
  "totalCount": 45,
  "items": [
    {
      "id": "FAQ-SHIP-001",
      "intent": "shipping",
      "priority": "high",
      "keywords": ["배송", "얼마나", "며칠", "도착", "배송기간"],
      "questions": ["배송 얼마나 걸려요?", "언제 도착해요?"],
      "answer": "기성품은 결제 후 2~3 영업일 이내 배송됩니다. ...",
      "source": "chatbot.js:312~313, bulk-order.html:224, ai.js:233",
      "needsReview": false
    }
    // ... 총 45개 항목 (상단 45개 전체 변환)
  ],
  "intentIndex": {
    "shipping": ["FAQ-SHIP-001", "FAQ-SHIP-002", "FAQ-SHIP-003", "FAQ-SHIP-004", "FAQ-SHIP-005", "FAQ-SHIP-006"],
    "refund":   ["FAQ-REFUND-001", "FAQ-REFUND-002", "FAQ-REFUND-003", "FAQ-REFUND-004", "FAQ-REFUND-005"],
    "custom":   ["FAQ-CUSTOM-001", "FAQ-CUSTOM-002", "FAQ-CUSTOM-003", "FAQ-CUSTOM-004", "FAQ-CUSTOM-005", "FAQ-CUSTOM-006", "FAQ-CUSTOM-007", "FAQ-CUSTOM-008", "FAQ-CUSTOM-009", "FAQ-CUSTOM-010"],
    "product":  ["FAQ-PRODUCT-001", "FAQ-PRODUCT-002", "FAQ-PRODUCT-003", "FAQ-PRODUCT-004", "FAQ-PRODUCT-005", "FAQ-PRODUCT-006"],
    "payment":  ["FAQ-PAY-001", "FAQ-PAY-002", "FAQ-PAY-003", "FAQ-PAY-004", "FAQ-PAY-005", "FAQ-PAY-006"],
    "member":   ["FAQ-MEMBER-001", "FAQ-MEMBER-002", "FAQ-MEMBER-003", "FAQ-MEMBER-004"],
    "company":  ["FAQ-COMPANY-001", "FAQ-COMPANY-002", "FAQ-COMPANY-003", "FAQ-COMPANY-004", "FAQ-COMPANY-005"],
    "coupon":   ["FAQ-COUPON-001", "FAQ-COUPON-002", "FAQ-COUPON-003"]
  }
}
```

**카테고리별 개수**: 배송 6 + 교환/환불 5 + 커스텀 10 + 상품 6 + 결제 6 + 회원 4 + 회사 5 + 쿠폰 3 = **45개** ✅

**필수 필드**:
- `id`: FAQ-{CATEGORY}-{NNN} 유일 키
- `intent`: 8종 중 하나 (정규식 분류기 키와 1:1 매칭)
- `priority`: `high` / `medium` / `low`
- `keywords`: 한국어 키워드 배열 (구어체 포함)
- `questions`: 질문 예시 2~3개
- `answer`: 최종 답변 (1~3문장)
- `source`: 근거 위치 (파일:줄번호 or "사용자 확정")
- `needsReview`: 모두 `false` (사용자 승인 완료)

---

## 🔍 사이트 하드코딩 수정 목록 (developer 구현 시 통일)

### A. 전화번호 `010-9622-1428` / `02-1234-5678` → **`070-4337-3000`**
| 파일 | 줄 | 현재 값 | 변경값 |
|------|----|--------|--------|
| about.html | 216 | `<a href="tel:010-9622-1428">010-9622-1428</a>` | `<a href="tel:070-4337-3000">070-4337-3000</a>` |
| about.html | 263 | `<a href="tel:010-9622-1428"` | `<a href="tel:070-4337-3000"` |
| js/chatbot.js | 330 | `<p>• 전화: 02-1234-5678</p>` | `<p>• 전화: 070-4337-3000</p>` |
| js/chatbot.js | 433 | `<p>• 전화: 02-1234-5678</p>` | `<p>• 전화: 070-4337-3000</p>` |
| 스티즈쇼핑몰/index.html | 273 | `Customer Center: 02-1234-5678 | Mon-Fri 10:00 - 18:00` | (구 자료, 선택 수정) |

### B. 이메일 `stiz_@naver.com` / `info@stiz.co.kr` → **`order@stiz.kr`**
| 파일 | 줄 | 현재 값 | 변경값 |
|------|----|--------|--------|
| about.html | 222 | `<a href="mailto:stiz_@naver.com">stiz_@naver.com</a>` | `<a href="mailto:order@stiz.kr">order@stiz.kr</a>` |
| js/chatbot.js | 329 | `<p>• 이메일: info@stiz.co.kr</p>` | `<p>• 이메일: order@stiz.kr</p>` |
| js/chatbot.js | 432 | `<p>• 이메일: info@stiz.co.kr</p>` | `<p>• 이메일: order@stiz.kr</p>` |
| server/routes/ai.js | 215 | `카카오톡(@stiz) 또는 이메일(info@stiz.co.kr)로 문의해주세요.` | `카카오톡(@stiz) 또는 이메일(order@stiz.kr)로 문의해주세요.` |
| server/routes/ai.js | 244 | `"카카오톡 @stiz 또는 이메일 info@stiz.co.kr로 문의해주세요"` | `"카카오톡 @stiz 또는 이메일 order@stiz.kr로 문의해주세요"` |
| server/routes/ai.js | 274 | `카카오톡(@stiz) 또는 이메일(info@stiz.co.kr)로 문의해주세요.` | `카카오톡(@stiz) 또는 이메일(order@stiz.kr)로 문의해주세요.` |

### C. 영업시간 `10:00~18:00` → **`09:00~18:00`**
| 파일 | 줄 | 현재 값 | 변경값 |
|------|----|--------|--------|
| about.html | 242 | `<span class="font-medium">10:00 ~ 18:00</span>` (평일) | `<span class="font-medium">09:00 ~ 18:00</span>` |
| js/chatbot.js | 331 | `<p>• 운영시간: 평일 10:00~18:00</p>` | `<p>• 운영시간: 평일 09:00~18:00</p>` |

### D. 단체 할인율 `50벌 15%` 구식 구간 → **`10~29벌 5% / 30~99벌 10% / 100+ 협의`**
| 파일 | 줄 | 현재 값 | 변경값 |
|------|----|--------|--------|
| js/chatbot.js | 345 | `<li>• 10벌 이상 5% / 20벌 이상 10% / 50벌 이상 15% 할인</li>` | `<li>• 10~29벌 5% / 30~99벌 10% / 100벌 이상 협의</li>` |
| server/routes/ai.js | 232 | `- 최소 주문: 10벌부터 (10벌 5% / 20벌 10% / 50벌 15% 할인)` | `- 최소 주문: 10벌부터 (10~29벌 5% / 30~99벌 10% / 100벌 이상 협의)` |

### E. 이벤트 문구 (선택) — `community.html`
| 파일 | 줄 | 현재 값 | 처리 |
|------|----|--------|------|
| community.html | 193 | `3월 한 달간 30벌 이상 단체 주문 시 15% 특별 할인!` | 과거 이벤트 안내 문구 — K1 범위 밖, 추후 이벤트 관리 시 정리 |

### F. 참고 — 영향 없음(수정 불필요)
- `js/header_render.js:392` 푸터 — 사업자번호·대표명만 기재, 전화/이메일 없음 → **수정 불필요**
- `server/server.js:384~385`, `dev/order-flow-plan.md`, `js/admin-*.js`의 `15%` 는 **관리자 프로모션/마진 배지 로직** → 범위 제외
- `customers.json` / `orders.json` 의 `070-4337-3000` 은 **이미 운영 데이터**에 존재 → 확정 번호 맞음

### 총 수정 대상 요약
- **파일 5개**: about.html / js/chatbot.js / server/routes/ai.js / (선택: 스티즈쇼핑몰/index.html, community.html)
- **줄 수정 15건** (필수 13 + 선택 2)

---

## ⚠️ developer 구현 주의사항 (K1 착수 시)

1. **JSON 파일 생성 순서**: `company.json` → `policies.json` → `faq.json` 순. 상호 참조 없음(독립 파일).
2. **로더(`server/services/knowledge.js`)**:
   - 서버 부팅 시 1회 `require()` 로 메모리 캐시.
   - `getCompany()`, `getPolicy(path)`, `findFaqByIntent(intent, topN)`, `matchFaqByKeywords(message)` API 노출.
3. **intent 분류 정규식**: `keywords` 배열의 union을 카테고리별로 묶어 정규식 생성. 매칭 실패 시 Gemini 폴백.
4. **ai.js 통합**: 현재 하드코딩된 시스템 프롬프트 L227~244를 `knowledge.buildSystemPrompt(intent, productContext)`로 대체.
5. **하드코딩 제거 vs 공존**:
   - 사이트 HTML(`about.html`, `chatbot.js` HTML 리터럴)은 **직접 값 교체**로 처리(런타임 JSON 참조 안 함 — 정적 페이지 유지).
   - `server/routes/ai.js`는 **반드시 JSON 참조**로 전환.
6. **PAY-003 자동 세금계산서**: checkout.html의 사업자번호/이메일 입력 UI 유무를 developer가 먼저 확인. 없으면 planner-architect에 에스컬레이션.
7. **faq.json `intentIndex`**: 런타임 매칭 성능을 위해 정적 인덱스 포함. 배열 변경 시 인덱스도 동기화 필수.
8. **`keywords` 정규식 충돌**: "사이즈" 는 product/custom 양쪽에 등장 → intent 분류 우선순위 = `custom > product` (단체 주문 문의가 더 비즈니스 critical).
9. **DB 가격은 JSON 캐시 금지**: 상품 가격은 반드시 실시간 DB 조회. JSON은 정책/상수만.
10. **`needsReview` 플래그**: 전 항목 `false`로 확정됐지만, 운영 중 발견되는 오답은 해당 필드를 `true`로 토글해 검수 대기열 구성.

---

## 📌 다음 단계 (developer에게)

1. 본 문서 기반으로 `server/data/knowledge/` 하위에 3개 JSON 파일 생성.
2. `server/services/knowledge.js` 로더 구현 + `/api/chat` (ai.js) 통합.
3. 사이트 하드코딩 15건 일괄 교체 커밋 (별도 커밋 분리 권장: `refactor:` 또는 `chore:`).
4. tester: 챗봇 "영업시간 알려줘" / "전화번호 알려줘" / "30벌 할인" 등 스모크 테스트.
