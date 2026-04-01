/**
 * 팀명 정리 스크립트
 * orders.json의 teamName에서 연도/종목/품목 등을 분리하여 정리한다.
 *
 * 비유: 주문서에 "2026 방이중 남자농구"라고 적혀있으면,
 *       팀명은 "방이중", 종목은 "남자농구"로 분리해서 정리하는 것.
 *
 * 실행: node dev/clean-order-teamnames.cjs
 */

const fs = require('fs');
const path = require('path');

const ORDERS_PATH = path.join(__dirname, '..', 'server', 'data', 'orders.json');
const BACKUP_PATH = ORDERS_PATH.replace('.json', '.json.pre-clean');

// ===== 한글 종목 → 영문 매핑 =====
const SPORT_MAP = {
    '남자농구': 'basketball', '여자농구': 'basketball', '농구': 'basketball',
    '남자축구': 'soccer', '여자축구': 'soccer', '축구': 'soccer',
    '남자배구': 'volleyball', '여자배구': 'volleyball', '배구': 'volleyball',
    '배드민턴': 'badminton',
    '탁구': 'tabletennis',
    '야구': 'baseball',
    '핸드볼': 'handball',
    '풋살': 'futsal',
    '테니스': 'tennis',
    '소프트볼': 'softball',
};

// 종목 키워드 (긴 것부터 매칭해야 "남자농구"가 "농구"보다 먼저 잡힘)
const SPORT_KEYWORDS = Object.keys(SPORT_MAP).sort((a, b) => b.length - a.length);

// 품목 키워드 (팀명 뒤에 붙는 제품명)
const ITEM_KEYWORDS = [
    '반팔슈팅셔츠', '긴팔슈팅셔츠', '슈팅셔츠', '슈팅저지',
    '반팔슈팅저지', '긴팔슈팅저지',
    '반팔티', '긴팔티', '유니폼', '져지', '저지',
    '조끼', '패딩', '점퍼', '바지', '반바지',
    '상의', '하의', '티셔츠', '셔츠', '자켓', '후드',
    '트레이닝', '세트', '스타킹', '트렉탑', '후드티',
    '상의만', '하의만', '바지만',
].sort((a, b) => b.length - a.length); // 긴 것부터 매칭

// 규칙 적용 건수 카운터
const stats = { B: 0, A: 0, C: 0, D: 0, E: 0 };
const changes = []; // 변경 로그

// ===== 1. 백업 =====
console.log('[1/5] 백업 중...');
const ordersRaw = fs.readFileSync(ORDERS_PATH, 'utf-8');
fs.writeFileSync(BACKUP_PATH, ordersRaw, 'utf-8');
console.log(`  백업 완료: ${BACKUP_PATH}`);

const orders = JSON.parse(ordersRaw);
console.log(`  주문 ${orders.length}건 로드`);

// ===== 유틸리티 함수 =====

/**
 * items[0].sport에 값 설정 (비어있을 때만)
 * "other"도 비어있는 것으로 취급 (기본값이므로)
 */
function setSport(order, sportKr) {
    if (!order.items || !order.items[0]) return;
    const item = order.items[0];
    const current = (item.sport || '').trim();
    // 비어있거나 "other"(기본값)일 때만 설정
    if (!current || current === 'other') {
        item.sport = SPORT_MAP[sportKr] || 'other';
    }
}

/**
 * items[0].name에 값 추가 (비어있을 때만)
 */
function setItemName(order, itemName) {
    if (!order.items || !order.items[0]) return;
    const item = order.items[0];
    if (!item.name || item.name.trim() === '') {
        item.name = itemName;
    }
}

/**
 * order.detail 또는 order.memo에 정보 추가
 */
function appendDetail(order, text) {
    if (!order.detail) {
        order.detail = text;
    } else if (!order.detail.includes(text)) {
        order.detail += ' / ' + text;
    }
}

/**
 * 변경 기록 추가
 */
function logChange(rule, before, after, extra) {
    changes.push({ rule, before, after, extra: extra || '' });
}

// ===== 2. 규칙 적용 =====
console.log('\n[2/5] 팀명 정리 중...');

orders.forEach(order => {
    if (!order.customer || !order.customer.teamName) return;

    let teamName = order.customer.teamName.trim();
    const originalTeamName = teamName;

    // --- 규칙 B: 연도 접두사 제거 ---
    // "2026 방이중 남자농구" → "방이중 남자농구" (연도 제거)
    const yearMatch = teamName.match(/^(20[2-9]\d)\s+(.+)$/);
    if (yearMatch) {
        teamName = yearMatch[2];
        stats.B++;
    }

    // --- 규칙 A: 괄호 안 종목 분리 ---
    // "동마중학교 (농구)" → "동마중학교" + sport: basketball
    // 주의: "완도(WANDO)" 같은 영문은 건드리지 않음
    const bracketMatch = teamName.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
    if (bracketMatch) {
        const inside = bracketMatch[2].trim();
        // 괄호 안에 종목 키워드가 포함되어 있는지 확인
        const hasSport = SPORT_KEYWORDS.some(s => inside.includes(s));
        if (hasSport) {
            teamName = bracketMatch[1].trim();
            // 괄호 안에서 종목 추출
            for (const sportKr of SPORT_KEYWORDS) {
                if (inside.includes(sportKr)) {
                    setSport(order, sportKr);
                    break;
                }
            }
            // 괄호 안에 종목 외 추가 정보가 있으면 detail에 기록
            // 예: "경희대 축구 GK" → GK는 detail로
            let extraInfo = inside;
            for (const sportKr of SPORT_KEYWORDS) {
                extraInfo = extraInfo.replace(sportKr, '').trim();
            }
            if (extraInfo) {
                appendDetail(order, extraInfo);
            }
            stats.A++;
        }
    }

    // --- 규칙 C: SCOOP 라인 정리 ---
    // "성균관대 SCOOP 베이직 두세트" → "성균관대 SCOOP" + detail: "베이직 두세트"
    const scoopMatch = teamName.match(/^(.+?\s*SCOOP)\s+(.+)$/);
    if (scoopMatch) {
        const scoopBase = scoopMatch[1].trim();
        const scoopDetail = scoopMatch[2].trim();

        // SCOOP 뒤의 정보를 detail에 추가
        // 농구 키워드면 sport로 분리
        let detailText = scoopDetail;
        for (const sportKr of SPORT_KEYWORDS) {
            if (detailText.includes(sportKr)) {
                setSport(order, sportKr);
                detailText = detailText.replace(sportKr, '').trim();
                break;
            }
        }
        if (detailText) {
            appendDetail(order, detailText);
        }
        teamName = scoopBase;
        stats.C++;
    }

    // --- 규칙 D: 종목 접미사 분리 ---
    // "방이중 남자농구" → "방이중" + sport: basketball
    // 주의: "농구지도실", "농구감독" 등은 제외
    if (!teamName.match(/지도실|감독|코치|교실|클럽|동호회|의\s*민족|협회/)) {
        for (const sportKr of SPORT_KEYWORDS) {
            // 공백 + 종목으로 끝나는 경우만 (단어 경계)
            if (teamName.endsWith(' ' + sportKr)) {
                teamName = teamName.slice(0, -(sportKr.length + 1)).trim();
                setSport(order, sportKr);
                stats.D++;
                break;
            }
        }
    }

    // --- 규칙 E: 품목 접미사 분리 ---
    // "서울대 배구부 반팔티" → "서울대 배구부" + itemName: "반팔티"
    for (const itemKw of ITEM_KEYWORDS) {
        if (teamName.endsWith(' ' + itemKw)) {
            teamName = teamName.slice(0, -(itemKw.length + 1)).trim();
            setItemName(order, itemKw);
            stats.E++;
            break;
        }
    }

    // 변경이 있으면 적용
    if (teamName !== originalTeamName) {
        order.customer.teamName = teamName;
        logChange(
            '', // 규칙은 stats에서 별도 추적
            originalTeamName,
            teamName,
            order.items?.[0]?.sport || ''
        );
    }
});

// ===== 3. 저장 =====
console.log('\n[3/5] 저장 중...');
fs.writeFileSync(ORDERS_PATH, JSON.stringify(orders, null, 2), 'utf-8');
console.log('  orders.json 저장 완료');

// ===== 4. 결과 출력 =====
console.log('\n[4/5] 변경 결과:');
console.log('='.repeat(60));
console.log(`총 주문: ${orders.length}건`);
console.log(`총 변경: ${changes.length}건`);
console.log(`\n규칙별 적용 건수:`);
console.log(`  B (연도 제거):    ${stats.B}건`);
console.log(`  A (괄호 종목):    ${stats.A}건`);
console.log(`  C (SCOOP 정리):   ${stats.C}건`);
console.log(`  D (종목 접미사):  ${stats.D}건`);
console.log(`  E (품목 접미사):  ${stats.E}건`);

// 변경 샘플 출력 (최대 50건)
const sample = changes.slice(0, 50);
if (sample.length > 0) {
    console.log(`\n변경 샘플 (${Math.min(50, changes.length)}/${changes.length}건):`);
    console.log('-'.repeat(80));
    sample.forEach(c => {
        console.log(`  "${c.before}" → "${c.after}"${c.extra ? '  [sport:' + c.extra + ']' : ''}`);
    });
    if (changes.length > 50) {
        console.log(`  ... 외 ${changes.length - 50}건`);
    }
}

// 정리 후 고유 팀명 수 확인
const afterTeams = new Set();
orders.forEach(o => {
    if (o.customer?.teamName) afterTeams.add(o.customer.teamName.trim());
});
console.log(`\n정리 전 고유 팀명: (백업 참조)`);
console.log(`정리 후 고유 팀명: ${afterTeams.size}개`);

console.log('\n[5/5] 다음 단계: node server/data/migrate-customers.js 실행 필요');
console.log('='.repeat(60));
