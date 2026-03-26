/**
 * STIZ Design Lab - SVG 유니폼 템플릿 데이터
 * 4종목(축구/농구/배구/야구) x 앞뒤(front/back) = 8개 SVG
 *
 * 각 SVG path는 data-zone 역할의 id 속성을 가지며,
 * Fabric.js에서 id로 찾아 fill 색상을 변경한다.
 * viewBox="0 0 400 500" 통일 → 캔버스 600x700에 맞춰 스케일링
 */

const jerseyTemplates = {
    // ─────────────────────────────────────────
    // 축구 저지: V넥, 짧은 소매, 옆선 트림
    // ─────────────────────────────────────────
    soccer: {
        name: '축구 저지',
        icon: 'sports_soccer',
        zones: ['body', 'sleeve-left', 'sleeve-right', 'collar', 'side-trim'],
        zoneLabels: {
            'body': 'Body',
            'sleeve-left': 'L.Sleeve',
            'sleeve-right': 'R.Sleeve',
            'collar': 'Collar',
            'side-trim': 'Side Trim'
        },
        defaultColors: {
            'body': '#FFFFFF',
            'sleeve-left': '#111111',
            'sleeve-right': '#111111',
            'collar': '#333333',
            'side-trim': '#E63946'
        },
        basePrice: 45000,
        // 앞면: V넥이 깊고 소매 디테일 있음
        front: `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg">
            <path id="sleeve-left" d="M100,80 L40,120 L25,260 L50,265 L70,180 L100,170 Z" />
            <path id="sleeve-right" d="M300,80 L360,120 L375,260 L350,265 L330,180 L300,170 Z" />
            <path id="body" d="M100,80 L100,170 L70,180 L65,420 L80,440 L320,440 L335,420 L330,180 L300,170 L300,80 L260,50 L240,45 L200,40 L160,45 L140,50 Z" />
            <path id="collar" d="M140,50 L160,45 L200,40 L240,45 L260,50 L250,75 L230,85 L200,90 L170,85 L150,75 Z" />
            <path id="side-trim" d="M65,200 L75,200 L80,420 L65,420 Z M335,200 L325,200 L320,420 L335,420 Z" />
            <path id="outline" d="M100,80 L140,50 L160,45 L200,40 L240,45 L260,50 L300,80 L360,120 L375,260 L350,265 L330,180 L300,170 L335,420 L320,440 L80,440 L65,420 L100,170 L70,180 L50,265 L25,260 L40,120 Z" fill="none" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`,
        // 뒷면: 넥라인 얕음
        back: `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg">
            <path id="sleeve-left" d="M100,80 L40,120 L25,260 L50,265 L70,180 L100,170 Z" />
            <path id="sleeve-right" d="M300,80 L360,120 L375,260 L350,265 L330,180 L300,170 Z" />
            <path id="body" d="M100,80 L100,170 L70,180 L65,420 L80,440 L320,440 L335,420 L330,180 L300,170 L300,80 L260,55 L240,50 L200,48 L160,50 L140,55 Z" />
            <path id="collar" d="M140,55 L160,50 L200,48 L240,50 L260,55 L250,70 L200,75 L150,70 Z" />
            <path id="side-trim" d="M65,200 L75,200 L80,420 L65,420 Z M335,200 L325,200 L320,420 L335,420 Z" />
            <path id="outline" d="M100,80 L140,55 L160,50 L200,48 L240,50 L260,55 L300,80 L360,120 L375,260 L350,265 L330,180 L300,170 L335,420 L320,440 L80,440 L65,420 L100,170 L70,180 L50,265 L25,260 L40,120 Z" fill="none" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`
    },

    // ─────────────────────────────────────────
    // 농구 저지: 민소매(탱크탑), 넓은 넥라인, 어깨 스트랩
    // ─────────────────────────────────────────
    basketball: {
        name: '농구 저지',
        icon: 'sports_basketball',
        zones: ['body', 'shoulder-left', 'shoulder-right', 'collar', 'side-trim'],
        zoneLabels: {
            'body': 'Body',
            'shoulder-left': 'L.Shoulder',
            'shoulder-right': 'R.Shoulder',
            'collar': 'Neckline',
            'side-trim': 'Side Trim'
        },
        defaultColors: {
            'body': '#FFFFFF',
            'shoulder-left': '#0026E6',
            'shoulder-right': '#0026E6',
            'collar': '#0026E6',
            'side-trim': '#E63946'
        },
        basePrice: 42000,
        front: `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg">
            <path id="shoulder-left" d="M130,65 L60,100 L55,160 L80,155 L105,120 L130,100 Z" />
            <path id="shoulder-right" d="M270,65 L340,100 L345,160 L320,155 L295,120 L270,100 Z" />
            <path id="body" d="M130,65 L130,100 L105,120 L80,155 L55,160 L50,430 L65,445 L335,445 L350,430 L345,160 L320,155 L295,120 L270,100 L270,65 L240,48 L200,42 L160,48 Z" />
            <path id="collar" d="M160,48 L200,42 L240,48 L255,55 L240,80 L215,92 L200,95 L185,92 L160,80 L145,55 Z" />
            <path id="side-trim" d="M50,180 L62,180 L65,430 L50,430 Z M350,180 L338,180 L335,430 L350,430 Z" />
            <path id="outline" d="M130,65 L160,48 L200,42 L240,48 L270,65 L340,100 L345,160 L350,430 L335,445 L65,445 L50,430 L55,160 L60,100 Z" fill="none" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`,
        back: `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg">
            <path id="shoulder-left" d="M130,65 L60,100 L55,160 L80,155 L105,120 L130,100 Z" />
            <path id="shoulder-right" d="M270,65 L340,100 L345,160 L320,155 L295,120 L270,100 Z" />
            <path id="body" d="M130,65 L130,100 L105,120 L80,155 L55,160 L50,430 L65,445 L335,445 L350,430 L345,160 L320,155 L295,120 L270,100 L270,65 L240,52 L200,48 L160,52 Z" />
            <path id="collar" d="M160,52 L200,48 L240,52 L255,60 L245,72 L200,78 L155,72 L145,60 Z" />
            <path id="side-trim" d="M50,180 L62,180 L65,430 L50,430 Z M350,180 L338,180 L335,430 L350,430 Z" />
            <path id="outline" d="M130,65 L160,52 L200,48 L240,52 L270,65 L340,100 L345,160 L350,430 L335,445 L65,445 L50,430 L55,160 L60,100 Z" fill="none" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`
    },

    // ─────────────────────────────────────────
    // 배구 저지: 반소매, 라운드넥에 가까운 넥라인
    // ─────────────────────────────────────────
    volleyball: {
        name: '배구 저지',
        icon: 'sports_volleyball',
        zones: ['body', 'sleeve-left', 'sleeve-right', 'collar', 'side-trim'],
        zoneLabels: {
            'body': 'Body',
            'sleeve-left': 'L.Sleeve',
            'sleeve-right': 'R.Sleeve',
            'collar': 'Collar',
            'side-trim': 'Side Trim'
        },
        defaultColors: {
            'body': '#FFFFFF',
            'sleeve-left': '#111111',
            'sleeve-right': '#111111',
            'collar': '#E63946',
            'side-trim': '#E63946'
        },
        basePrice: 43000,
        front: `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg">
            <path id="sleeve-left" d="M105,78 L48,110 L35,220 L58,225 L72,165 L105,150 Z" />
            <path id="sleeve-right" d="M295,78 L352,110 L365,220 L342,225 L328,165 L295,150 Z" />
            <path id="body" d="M105,78 L105,150 L72,165 L60,425 L75,440 L325,440 L340,425 L328,165 L295,150 L295,78 L258,52 L200,42 L142,52 Z" />
            <path id="collar" d="M142,52 L200,42 L258,52 L248,72 L225,82 L200,86 L175,82 L152,72 Z" />
            <path id="side-trim" d="M60,190 L72,190 L75,425 L60,425 Z M340,190 L328,190 L325,425 L340,425 Z" />
            <path id="outline" d="M105,78 L142,52 L200,42 L258,52 L295,78 L352,110 L365,220 L342,225 L328,165 L295,150 L340,425 L325,440 L75,440 L60,425 L105,150 L72,165 L58,225 L35,220 L48,110 Z" fill="none" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`,
        back: `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg">
            <path id="sleeve-left" d="M105,78 L48,110 L35,220 L58,225 L72,165 L105,150 Z" />
            <path id="sleeve-right" d="M295,78 L352,110 L365,220 L342,225 L328,165 L295,150 Z" />
            <path id="body" d="M105,78 L105,150 L72,165 L60,425 L75,440 L325,440 L340,425 L328,165 L295,150 L295,78 L258,55 L200,48 L142,55 Z" />
            <path id="collar" d="M142,55 L200,48 L258,55 L248,68 L200,74 L152,68 Z" />
            <path id="side-trim" d="M60,190 L72,190 L75,425 L60,425 Z M340,190 L328,190 L325,425 L340,425 Z" />
            <path id="outline" d="M105,78 L142,55 L200,48 L258,55 L295,78 L352,110 L365,220 L342,225 L328,165 L295,150 L340,425 L325,440 L75,440 L60,425 L105,150 L72,165 L58,225 L35,220 L48,110 Z" fill="none" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`
    },

    // ─────────────────────────────────────────
    // 야구 저지: 긴 소매, V넥, 단추라인(button-placket)
    // ─────────────────────────────────────────
    baseball: {
        name: '야구 저지',
        icon: 'sports_baseball',
        zones: ['body', 'sleeve-left', 'sleeve-right', 'collar', 'button-placket'],
        zoneLabels: {
            'body': 'Body',
            'sleeve-left': 'L.Sleeve',
            'sleeve-right': 'R.Sleeve',
            'collar': 'Collar',
            'button-placket': 'Placket'
        },
        defaultColors: {
            'body': '#FFFFFF',
            'sleeve-left': '#1D3557',
            'sleeve-right': '#1D3557',
            'collar': '#1D3557',
            'button-placket': '#1D3557'
        },
        basePrice: 48000,
        // 앞면: 단추 디테일 포함
        front: `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg">
            <path id="sleeve-left" d="M100,85 L30,130 L15,290 L42,295 L60,195 L100,175 Z" />
            <path id="sleeve-right" d="M300,85 L370,130 L385,290 L358,295 L340,195 L300,175 Z" />
            <path id="body" d="M100,85 L100,175 L60,195 L55,425 L70,445 L330,445 L345,425 L340,195 L300,175 L300,85 L262,55 L240,48 L200,44 L160,48 L138,55 Z" />
            <path id="collar" d="M138,55 L160,48 L200,44 L240,48 L262,55 L252,78 L230,88 L200,92 L170,88 L148,78 Z" />
            <path id="button-placket" d="M195,92 L195,445 L205,445 L205,92 Z" />
            <path id="outline" d="M100,85 L138,55 L160,48 L200,44 L240,48 L262,55 L300,85 L370,130 L385,290 L358,295 L340,195 L300,175 L345,425 L330,445 L70,445 L55,425 L100,175 L60,195 L42,295 L15,290 L30,130 Z" fill="none" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
            <circle cx="200" cy="140" r="3" fill="#666" opacity="0.5"/>
            <circle cx="200" cy="190" r="3" fill="#666" opacity="0.5"/>
            <circle cx="200" cy="240" r="3" fill="#666" opacity="0.5"/>
            <circle cx="200" cy="290" r="3" fill="#666" opacity="0.5"/>
            <circle cx="200" cy="340" r="3" fill="#666" opacity="0.5"/>
        </svg>`,
        // 뒷면: 단추라인 없음
        back: `<svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg">
            <path id="sleeve-left" d="M100,85 L30,130 L15,290 L42,295 L60,195 L100,175 Z" />
            <path id="sleeve-right" d="M300,85 L370,130 L385,290 L358,295 L340,195 L300,175 Z" />
            <path id="body" d="M100,85 L100,175 L60,195 L55,425 L70,445 L330,445 L345,425 L340,195 L300,175 L300,85 L262,58 L240,52 L200,48 L160,52 L138,58 Z" />
            <path id="collar" d="M138,58 L160,52 L200,48 L240,52 L262,58 L252,72 L200,78 L148,72 Z" />
            <path id="outline" d="M100,85 L138,58 L160,52 L200,48 L240,52 L262,58 L300,85 L370,130 L385,290 L358,295 L340,195 L300,175 L345,425 L330,445 L70,445 L55,425 L100,175 L60,195 L42,295 L15,290 L30,130 Z" fill="none" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`
    }
};

// 전역 접근: product-data.js처럼 window 객체에 등록
window.jerseyTemplates = jerseyTemplates;
