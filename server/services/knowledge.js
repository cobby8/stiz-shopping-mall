// ============================================================
// 챗봇 "티즈" 지식베이스 로더 (K1)
// ============================================================
// 비유: 이 파일은 티즈의 "사내 매뉴얼 북 인덱스"다.
//  - 서버가 켜질 때 JSON 3권(회사/정책/FAQ)을 한 번만 읽어 메모리에 둔다.
//  - 이후 /api/chat 요청이 올 때마다 디스크 I/O 없이 즉시 참조한다.
// 이유: 정책값(전화·영업시간·할인율)은 운영 중 자주 바뀌지 않으므로
//       "부팅 1회 로드 + 메모리 캐시" 가 가장 단순하고 빠르다.
//       DB 가격은 여기서 캐싱 금지 — 상품 가격은 반드시 실시간 DB 조회.
// ============================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ES Module에서 __dirname 복원 (CommonJS의 __dirname과 동일 목적)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// knowledge JSON 3파일 경로 (server/data/knowledge/)
const KNOWLEDGE_DIR = join(__dirname, '..', 'data', 'knowledge');

// 부팅 시 1회 로드해 메모리에 캐시할 객체
let _company = null;
let _policies = null;
let _faq = null;
// K2: 상품 요약 JSON (scripts/build-knowledge.js가 생성)
let _products = null;

// 안전 로딩: 파일이 깨져도 서버가 죽지 않도록 try/catch로 감싼다
function _load() {
    try {
        _company = JSON.parse(readFileSync(join(KNOWLEDGE_DIR, 'company.json'), 'utf-8'));
        _policies = JSON.parse(readFileSync(join(KNOWLEDGE_DIR, 'policies.json'), 'utf-8'));
        _faq = JSON.parse(readFileSync(join(KNOWLEDGE_DIR, 'faq.json'), 'utf-8'));
        console.log(`[knowledge] 로드 완료 — FAQ ${_faq.items.length}개, company/policies OK`);
    } catch (e) {
        console.error('[knowledge] 지식베이스 로드 실패:', e.message);
        // 실패 시 빈 폴백으로 초기화 (챗봇이 Gemini 단독으로라도 동작하게)
        _company = _company || {};
        _policies = _policies || {};
        _faq = _faq || { items: [], intentIndex: {}, version: 'fallback' };
    }
}

// K2: 상품 요약 JSON 로더 (products.json 없어도 서버는 동작해야 함 = fail-safe)
// 비유: 상품 카드 묶음이 없으면 "카드 없이 근무하는 점원"으로 폴백
function _loadProducts() {
    try {
        _products = JSON.parse(readFileSync(join(KNOWLEDGE_DIR, 'products.json'), 'utf-8'));
        const cnt = Array.isArray(_products.items) ? _products.items.length : 0;
        console.log(`[knowledge] 상품 요약 로드 — ${cnt}개 (v${_products.version || 'unknown'})`);
    } catch (e) {
        // ENOENT(파일 없음) 또는 파싱 실패 — 서버는 계속 동작, K2 검색만 비활성
        console.warn('[knowledge] products.json 로드 실패(폴백 사용):', e.message);
        _products = { items: [], stats: {}, categoryTree: [], version: 'fallback' };
    }
}

// 모듈 import 즉시 1회 로드 (K1 + K2)
_load();
_loadProducts();

// ------------------------------------------------------------
// API 1. getCompany() — 회사 상수 반환
// ------------------------------------------------------------
// 사용처: ai.js 시스템 프롬프트 (전화/이메일/영업시간 삽입용)
export function getCompany() {
    return _company;
}

// ------------------------------------------------------------
// API 2. getPolicy(path) — 점 표기법 경로로 정책값 조회
//   예: getPolicy('shipping.freeThreshold') → 50000
//       getPolicy('bulk.discountTiers')     → [{min:15,max:29,...}, ...]
// ------------------------------------------------------------
// 비유: JSON을 "폴더 구조"로 본다면 path는 "경로 주소"다.
export function getPolicy(path) {
    if (!path) return _policies;
    return path.split('.').reduce((obj, key) => {
        return obj && typeof obj === 'object' ? obj[key] : undefined;
    }, _policies);
}

// ------------------------------------------------------------
// API 3. classifyIntent(message) — 메시지의 의도(intent) 추정
// ------------------------------------------------------------
// 비유: 안내데스크 직원이 손님 말을 듣고 "몇 층 부서"인지 판단하는 것.
// 우선순위: custom > product > shipping > refund > payment > company > member > coupon
//  - "사이즈"처럼 product/custom 양쪽에 걸칠 땐 단체주문이 비즈니스상 중요하므로 custom 우선.
//  - 매칭 실패 시 null 반환 → 호출자가 Gemini 폴백 결정.
//
// 키워드는 정적 배열(정규식 소스)로 직접 정의. faq.json의 keywords와 의도적으로 분리:
//  - faq.json keywords = FAQ 1개를 "매칭"할 때 쓰는 세밀 키워드
//  - INTENT_PATTERNS   = 카테고리 분류용 굵은 키워드 (faq 무관하게 priority 답변 찾기용)
// [Phase 2 개선] T1/T2 정규식 재분배 (2026-04-20)
//  - T1: refund 패턴에 "사이즈 불만형" (사이즈 안맞/커요/작게 왔어요 등) 공기어 추가
//         → 중립 문의("사이즈표", "XL 있어요?")는 불만 키워드 없어서 그대로 product 유지
//  - T2: product에서 "브랜드|STIZ" 제거 (브랜드명 단독은 상품 근거 약함)
//         + company에 브랜드 소개형("STIZ가 뭐", "스티즈 브랜드 소개") 추가
//  - 배열 순서(custom > product > shipping > refund > ...)는 절대 변경 금지.
const INTENT_PATTERNS = [
    { intent: 'custom',   re: /(커스텀|유니폼\s*제작|단체|몇\s*벌|MOQ|시안|마킹|승화전사|파일\s*규격|디자인\s*의뢰|Design\s*Lab|2D|3D)/i },
    // T2: '브랜드|STIZ' 제거 — 브랜드명 자체는 상품 의도 근거 약함
    // [Phase 2 2차] T1 보강:
    //  - "사이즈" 단독 매칭을 부정 전방탐색으로 좁힘 (불만/교환/환불/반품 키워드 공기 시 product 탈출 → refund로 하강)
    //  - 의류 사이즈 라벨 단독 질의(XL/XS/XXL/95/100/105) 추가
    { intent: 'product',  re: /(사이즈(?!.{0,6}(안\s*맞|커요|작아요|크게|작게|헐렁|타이트|교환|환불|반품))|XL|XS|XXL|95|100|105|원단|어센틱|스탠다드|베이직|프로\s*원단|재고|품절|종목|어떤\s*상품)/i },
    { intent: 'shipping', re: /(배송|택배|송장|배송조회|얼마나\s*걸|며칠|제주|도서산간|해외\s*배송|배송비|무료배송|배송\s*지연)/i },
    // T1: 사이즈 불만형(사이즈 안맞/커요/작아요/헐렁/타이트 + "안 맞/크게 왔어요" 형태) 추가
    { intent: 'refund',   re: /(환불|반품|교환|취소|단순\s*변심|하자|오배송|사이즈.{0,4}(안\s*맞|커요|작아요|크게|작게|헐렁|타이트)|(안\s*맞|크게|작게).{0,4}(와요|왔어요|나왔|받았))/i },
    { intent: 'payment',  re: /(결제|카드|무통장|계좌\s*이체|토스페이|세금계산서|현금영수증|법인|견적|입금\s*계좌)/i },
    // T2: company에 브랜드 소개형 추가 — "STIZ가 뭐/어떤 회사" / "브랜드 소개" 공기어 기반
    { intent: 'company',  re: /(전화|연락처|이메일|메일|주소|영업시간|운영시간|회사\s*정보|사업자|카카오톡|카톡|인스타|SNS|(STIZ|스티즈)\s*(?:가|는|이|을|를|의)?\s*(?:뭐|어떤|소개|누구|회사|브랜드)|(?:브랜드|회사).{0,3}(?:소개|어디|누구|뭐))/i },
    { intent: 'member',   re: /(회원가입|회원\s*탈퇴|등급|VIP|적립금|포인트|개인정보|소셜\s*로그인|카카오\s*로그인|네이버\s*로그인)/i },
    { intent: 'coupon',   re: /(쿠폰|할인\s*코드|이벤트|세일)/i }
];

export function classifyIntent(message) {
    if (!message || typeof message !== 'string') return null;
    for (const { intent, re } of INTENT_PATTERNS) {
        if (re.test(message)) return intent;
    }
    return null;
}

// ------------------------------------------------------------
// API 4. findFaqByIntent(intent, topN) — intent에 속한 FAQ 상위 N개 반환
// ------------------------------------------------------------
// 정렬: priority(high > medium > low) → items 원래 순서
// 반환: [{id, intent, priority, questions, answer, ...}, ...]
const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
export function findFaqByIntent(intent, topN = 5) {
    if (!intent || !_faq.intentIndex[intent]) return [];
    const ids = _faq.intentIndex[intent];
    const items = ids
        .map(id => _faq.items.find(it => it.id === id))
        .filter(Boolean)
        .sort((a, b) => (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0));
    return items.slice(0, topN);
}

// ------------------------------------------------------------
// API 5. buildSystemPrompt(intent, productContext) — ai.js용 동적 시스템 프롬프트 생성
// ------------------------------------------------------------
// 비유: 티즈가 출근 전에 "오늘 손님 질문 카테고리에 맞춰 참고 노트"를 손에 드는 것.
// - 회사 기본정보 + 정책 요약(배송/단체/환불/결제)은 항상 포함.
// - intent가 분류되면 해당 카테고리 FAQ top 3을 추가로 주입(지식 힌트).
// - productContext는 ai.js가 DB에서 뽑아온 상품 스니펫 (옵션).
export function buildSystemPrompt(intent, productContext = '') {
    const c = _company || {};
    const s = (_policies && _policies.shipping) || {};
    const b = (_policies && _policies.bulk) || {};
    const r = (_policies && _policies.refund) || {};
    const p = (_policies && _policies.payment) || {};

    // 단체 할인 구간 요약 문자열 만들기 (15~29벌 5% / 30~99벌 10% / 100벌 이상 협의)
    // ※ 단체 주문 접수는 10벌부터 가능하지만, 수량별 할인은 15벌부터 적용됨
    const tierText = (b.discountTiers || [])
        .map(t => {
            const range = t.max ? `${t.min}~${t.max}벌` : `${t.min}벌 이상`;
            return `${range} ${t.label}`;
        })
        .join(' / ') || '15~29벌 5% / 30~99벌 10% / 100벌 이상 협의';

    // intent별 FAQ top 3 힌트 블록 구성
    let faqHint = '';
    if (intent) {
        const top = findFaqByIntent(intent, 3);
        if (top.length) {
            const lines = top.map(f => `- Q: ${f.questions[0]}\n  A: ${f.answer}`).join('\n');
            faqHint = `\n\n관련 FAQ 참고(${intent}):\n${lines}`;
        }
    }

    // 시스템 프롬프트 본문 — 기존 ai.js L227~244의 하드코딩을 JSON 값으로 치환
    return `당신은 STIZ(스티즈) 스포츠 유니폼 전문 쇼핑몰의 상담봇 "티즈"입니다.
이름은 "티즈"이고, 친근하지만 전문적인 매장 직원처럼 답변합니다.

회사 정보:
- 브랜드: ${c.name || 'STIZ'}(${c.nameKo || '스티즈'}) — 축구/농구/배구/야구 등 팀 유니폼 커스텀 제작 전문
- 전화: ${c.phone || '070-4337-3000'} / 이메일: ${c.email || 'order@stiz.kr'} / 카카오톡: ${c.kakao || '@stiz'}
- 영업시간: 평일 ${c.businessHours?.weekday || '09:00~18:00'} / 토 ${c.businessHours?.saturday || '예약 상담'} / 일·공휴일 휴무

핵심 정책:
- 단체 주문: ${b.minQty || 10}벌부터 접수 가능 (10~14벌은 할인 없음, ${tierText})
- 커스텀 제작 기간: ${s.leadTime?.custom || '시안 확정 후 2~3주'} (100벌+ 는 ${s.leadTime?.bulk100plus || '3~4주'})
- 기성품 배송: ${s.leadTime?.ready || '2~3 영업일'} (${(s.freeThreshold || 50000).toLocaleString()}원 이상 무료배송, 미만 ${(s.baseFee || 3000).toLocaleString()}원)
- Design Lab에서 2D/3D 디자인 가능 (custom.html)
- 반품/교환: 수령 후 ${r.periodDays || 7}일 이내, 커스텀은 반품 불가
- 결제: 카드/토스페이/무통장(${_company?.bankAccount?.bank || '우리은행'} ${_company?.bankAccount?.number || ''})
- 세금계산서/현금영수증: ${p.taxInvoicePolicy || '요청 시 발행'}

응답 규칙:
- 한국어로 2~3문장 이내 간결하게
- 자신을 "티즈"라고 소개할 수 있지만 매번 반복하지 않음
- 확신 없는 상품/가격은 지어내지 말고 "상담원에게 연결해드릴까요?"로 유도
- 디자인/커스텀 질문은 custom.html 안내
- 주문 조회는 order-track.html(비회원) 또는 myshop.html(회원) 안내
- 모르는 것은 "카카오톡 ${c.kakao || '@stiz'} 또는 이메일 ${c.email || 'order@stiz.kr'}로 문의해주세요"로 안내${faqHint}${productContext || ''}`;
}

// ------------------------------------------------------------
// (선택) 디버그용: 로드된 지식베이스 버전/카운트 반환
// ------------------------------------------------------------
export function getKnowledgeInfo() {
    return {
        version: _faq?.version || 'unknown',
        faqCount: _faq?.items?.length || 0,
        intents: Object.keys(_faq?.intentIndex || {}),
        // K2 추가: 상품 요약 JSON 상태
        productsVersion: _products?.version || 'unknown',
        productsCount: _products?.items?.length || 0,
        loadedAt: new Date().toISOString()
    };
}

// ============================================================
// K2 확장 API (K1 5함수는 변경 없음. 아래는 신규 4함수)
// ============================================================
// 비유: K1이 "회사 매뉴얼 책자"라면, K2는 "상품 카탈로그 요약 카드 묶음".
//       챗봇이 "농구 3~5만원대 추천?"에 즉답하려면 카드 묶음에서 필터만 하면 된다.
//       DB를 매번 뒤지지 않고 메모리 배열 filter로 처리 → 빠르고 부담 없음.
// ============================================================

// ------------------------------------------------------------
// K2-API 1. searchProducts(opts) — 조건 필터로 상품 top N 반환
// ------------------------------------------------------------
// opts: { sport?, categoryId?, type?, priceMin?, priceMax?, limit? }
//   예: searchProducts({ sport:'농구', priceMin:30000, priceMax:50000, limit:3 })
// 반환: [{id, type, name, categoryName, price, isConsultPrice, sport, subCategory, url, ...}]
//
// 설계 주의:
//  - isConsultPrice=true 상품은 가격 필터가 걸리면 자동 제외 (참고가가 없으므로 범위 판정 불가)
//  - sport 필터는 정확 일치 (parseProductQuery가 "농구/축구/배구/팀웨어"로 정규화해서 넘김)
//  - products.json 없거나 빈 배열이면 [] 반환 — 호출자가 LIKE 폴백으로 넘어가게
export function searchProducts(opts = {}) {
    const { sport, categoryId, type, priceMin, priceMax, limit = 3 } = opts;
    const items = (_products && Array.isArray(_products.items)) ? _products.items : [];
    if (items.length === 0) return [];

    const filtered = items.filter(p => {
        // 종목 필터 (농구/축구/배구/팀웨어)
        if (sport && p.sport !== sport) return false;
        // 카테고리 ID 필터 (정확 매칭)
        if (categoryId && p.categoryId !== categoryId) return false;
        // 상품 타입 필터 (custom / ready)
        if (type && p.type !== type) return false;
        // 가격 범위: 참고가(isConsultPrice) 상품은 범위 필터 시 제외
        if (priceMin != null && (p.isConsultPrice || p.price < priceMin)) return false;
        if (priceMax != null && (p.isConsultPrice || p.price > priceMax)) return false;
        return true;
    });

    return filtered.slice(0, Math.max(0, limit | 0));
}

// ------------------------------------------------------------
// K2-API 2. parseProductQuery(message) — 자연어 → 필터 조건 추출
// ------------------------------------------------------------
// 예시:
//   "농구 유니폼 3~5만원대 추천" → { sport:'농구', priceMin:30000, priceMax:50000 }
//   "배구용품 뭐 있어?"         → { sport:'배구' }
//   "커스텀 상품 10만원 이상"    → { type:'custom', priceMin:100000 }
//   "기성품 5만원 이하"          → { type:'ready', priceMax:50000 }
//
// 설계 주의:
//  - 조건이 없으면 빈 객체 반환 → 호출자가 "구조 필터 불가능"으로 판정 후 LIKE 폴백
//  - 가격은 "만원" 단위 전용 (DB 실측상 주로 3~10만원대)
export function parseProductQuery(message) {
    const q = {};
    if (!message || typeof message !== 'string') return q;

    // 1) 종목(sport) 추출 — customMeta.sport 값과 일치시킴
    //    ⚠️ 순서 중요: "농구"는 "농구공" 등의 부분일치여도 농구로 분류 OK
    if (/농구/.test(message)) q.sport = '농구';
    else if (/축구/.test(message)) q.sport = '축구';
    else if (/배구/.test(message)) q.sport = '배구';
    else if (/팀웨어|단체복|팀복/.test(message)) q.sport = '팀웨어';

    // 2) 가격 범위 추출 — [Phase 2 T4 확장] 한국어 가격 표현 커버리지 확대
    //    비유: 손님이 "3만원대", "5만5천원", "50000원 이하" 같은 다양한 표현을 써도
    //          티즈가 전부 알아듣도록 다단계 파싱. 먼저 매칭된 블록이 승리(후속 블록 skip).
    //    우선순위(구체적 > 덜 구체적):
    //      (a) 만원 범위 "3~5만" → 기존 규칙 (가장 명확한 범위)
    //      (b) 원 단위 범위/이하/이상 "50000원 이하"
    //      (c) "N만원대" 접미사 → [N*10000, N*10000+9999]
    //      (d) 만원 이하/이상 "5만원 이하" → 기존 규칙
    //      (e) 만+천 조합 "5만 5천원" → 근사값 대역 [n, n+999]
    //      (f) 근사치 "3만원 정도" → ±15% 대역

    // (a) 만원 범위 "3~5만" / "3만~5만" (기존)
    const rangeMan = message.match(/(\d+)\s*만?\s*[~\-]\s*(\d+)\s*만/);
    if (rangeMan) {
        q.priceMin = parseInt(rangeMan[1], 10) * 10000;
        q.priceMax = parseInt(rangeMan[2], 10) * 10000;
    }

    // (b) 원 단위 범위/이하/이상 — \d{4,6}으로 1000~999999 범위 제한 (연도 등 오인 방지)
    if (q.priceMin == null && q.priceMax == null) {
        const wonRange = message.match(/(\d{4,6})\s*원?\s*[~\-]\s*(\d{4,6})\s*원/);
        if (wonRange) {
            q.priceMin = parseInt(wonRange[1], 10);
            q.priceMax = parseInt(wonRange[2], 10);
        } else {
            const wonUnder = message.match(/(\d{4,6})\s*원\s*(?:이하|미만|까지)/);
            const wonOver  = message.match(/(\d{4,6})\s*원\s*(?:이상|초과|부터)/);
            if (wonUnder) q.priceMax = parseInt(wonUnder[1], 10);
            if (wonOver)  q.priceMin = parseInt(wonOver[1], 10);
        }
    }

    // (c) "N만원대" / "N만대" 접미사 → [N*10000, N*10000+9999]
    //    예: "3만원대" → {priceMin:30000, priceMax:39999}
    if (q.priceMin == null && q.priceMax == null) {
        const manDae = message.match(/(\d+)\s*만\s*원?\s*대/);
        if (manDae) {
            q.priceMin = parseInt(manDae[1], 10) * 10000;
            q.priceMax = q.priceMin + 9999;
        }
    }

    // (d) 만원 이하/이상 (기존 유지) — "5만원 이하" / "10만원 이상"
    if (q.priceMin == null && q.priceMax == null) {
        const under = message.match(/(\d+)\s*만\s*원?\s*(?:이하|미만|까지)/);
        if (under) q.priceMax = parseInt(under[1], 10) * 10000;
        const over = message.match(/(\d+)\s*만\s*원?\s*(?:이상|초과|부터)/);
        if (over) q.priceMin = parseInt(over[1], 10) * 10000;
    }

    // (e) 만+천 조합 "5만 5천원" → 근사값 대역 [n, n+999]
    if (q.priceMin == null && q.priceMax == null) {
        const manChun = message.match(/(\d+)\s*만\s*(\d+)\s*천\s*원?/);
        if (manChun) {
            const approx = parseInt(manChun[1], 10) * 10000 + parseInt(manChun[2], 10) * 1000;
            q.priceMin = approx;
            q.priceMax = approx + 999;
        }
    }

    // (f) "정도/쯤/즈음/가량" 근사치 → ±15% 대역 (만원 우선, 없으면 원 단위)
    if (q.priceMin == null && q.priceMax == null) {
        const approxMan = message.match(/(\d+)\s*만\s*원?\s*(?:정도|쯤|즈음|가량)/);
        const approxWon = message.match(/(\d{4,6})\s*원\s*(?:정도|쯤|즈음|가량)/);
        const approx = approxMan ? parseInt(approxMan[1], 10) * 10000
                    : approxWon ? parseInt(approxWon[1], 10)
                    : null;
        if (approx) {
            q.priceMin = Math.floor(approx * 0.85);
            q.priceMax = Math.ceil(approx * 1.15);
        }
    }

    // 3) 상품 타입(type) 힌트 — custom(주문제작) vs ready(기성품)
    if (/기성품|완제품|바로\s*배송|재고\s*상품/.test(message)) q.type = 'ready';
    else if (/커스텀|제작|단체\s*주문|주문\s*제작|유니폼\s*제작/.test(message)) q.type = 'custom';

    return q;
}

// ------------------------------------------------------------
// K2-API 3. getProductStats() — 상품 통계 요약 반환
// ------------------------------------------------------------
// 챗봇이 "배구 뭐 있어?" 같은 집계 질문에 먼저 통계로 안내할 때 사용
// 반환: { totalActive, byType, withPrice, consultPrice, withCustomMeta, sportCounts, priceHistogram }
export function getProductStats() {
    return (_products && _products.stats) ? _products.stats : {};
}

// ------------------------------------------------------------
// K2-API 4. formatProductContext(items) — searchProducts 결과를 프롬프트 문자열로 포맷
// ------------------------------------------------------------
// 비유: 검색 결과를 "티즈가 손님에게 읽어줄 한 줄 카드"로 변환
// 반환 예시:
//   "\n\n현재 판매중인 관련 상품(참고용):\n- [농구] 농구 베이직 유니폼 / 참고가 33,000원 (상품ID: ...)\n..."
// 주의:
//  - isConsultPrice=true 상품은 "가격문의"로 표기 (실가격 노출 금지)
//  - 결과가 빈 배열이면 빈 문자열 반환 → 호출자가 폴백 판정하기 쉬움
export function formatProductContext(items) {
    if (!Array.isArray(items) || items.length === 0) return '';
    const lines = items.map(p => {
        const priceStr = p.isConsultPrice
            ? '가격문의'
            : (typeof p.price === 'number' && p.price > 0
                ? `참고가 ${p.price.toLocaleString()}원`
                : '가격문의');
        return `- [${p.categoryName || '기타'}] ${p.name} / ${priceStr} (상품ID: ${p.id})`;
    }).join('\n');
    // 꼬리 문구: "실제 가격/재고는 상담원 확인" — Gemini가 단정적으로 답하지 않도록 힌트
    return `\n\n현재 판매중인 관련 상품(참고용):\n${lines}\n※ 실제 가격·재고는 상담원 확인 권장 (일부는 제작 방식별 차등)`;
}
