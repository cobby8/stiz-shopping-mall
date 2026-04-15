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

// 모듈 import 즉시 1회 로드
_load();

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
//       getPolicy('bulk.discountTiers')     → [{min:10,max:29,...}, ...]
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
const INTENT_PATTERNS = [
    { intent: 'custom',   re: /(커스텀|유니폼\s*제작|단체|몇\s*벌|MOQ|시안|마킹|승화전사|파일\s*규격|디자인\s*의뢰|Design\s*Lab|2D|3D)/i },
    { intent: 'product',  re: /(사이즈|원단|어센틱|스탠다드|베이직|프로\s*원단|재고|품절|브랜드|STIZ|종목|어떤\s*상품)/i },
    { intent: 'shipping', re: /(배송|택배|송장|배송조회|얼마나\s*걸|며칠|제주|도서산간|해외\s*배송|배송비|무료배송|배송\s*지연)/i },
    { intent: 'refund',   re: /(환불|반품|교환|취소|단순\s*변심|하자|오배송)/i },
    { intent: 'payment',  re: /(결제|카드|무통장|계좌\s*이체|토스페이|세금계산서|현금영수증|법인|견적|입금\s*계좌)/i },
    { intent: 'company',  re: /(전화|연락처|이메일|메일|주소|영업시간|운영시간|회사\s*정보|사업자|카카오톡|카톡|인스타|SNS)/i },
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

    // 단체 할인 구간 요약 문자열 만들기 (10~29벌 5% / 30~99벌 10% / 100벌 이상 협의)
    const tierText = (b.discountTiers || [])
        .map(t => {
            const range = t.max ? `${t.min}~${t.max}벌` : `${t.min}벌 이상`;
            return `${range} ${t.label}`;
        })
        .join(' / ') || '10~29벌 5% / 30~99벌 10% / 100벌 이상 협의';

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
- 최소 주문: ${b.minQty || 10}벌부터 (${tierText})
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
        loadedAt: new Date().toISOString()
    };
}
