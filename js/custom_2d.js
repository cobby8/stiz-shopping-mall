/**
 * STIZ Design Lab Core Logic - V3.0 SVG Jersey Templates
 * Powered by Fabric.js
 *
 * 주요 변경사항 (V2 → V3):
 * - Rect+ClipPath 기반 → SVG path 기반 유니폼 렌더링
 * - 4종목(축구/농구/배구/야구) x 앞뒤(front/back) 지원
 * - 영역별(body/sleeve/collar 등) 개별 색상 변경
 * - 앞뒤 전환 시 사용자 텍스트/로고 객체 보존
 */

document.addEventListener('DOMContentLoaded', () => {

    // ═══════════════════════════════════════════
    // 1. 캔버스 초기화
    // ═══════════════════════════════════════════
    const canvas = new fabric.Canvas('c', {
        preserveObjectStacking: true, // 레이어 순서 유지
        selection: true,
        backgroundColor: '#f3f4f6'
    });

    // ═══════════════════════════════════════════
    // 2. 디자인 상태 관리
    // ═══════════════════════════════════════════

    // 현재 디자인 상태를 한 곳에서 관리
    const designState = {
        sport: 'soccer',          // 현재 선택된 종목
        side: 'front',            // 'front' 또는 'back'
        colors: {},               // 영역별 현재 색상 (종목 변경 시 defaultColors로 리셋)
        activeZone: 'body',       // COLOR 탭에서 현재 선택된 영역
        userObjects: {
            front: [],            // front 면에 추가된 텍스트/로고의 JSON
            back: []              // back 면에 추가된 텍스트/로고의 JSON
        }
    };

    // SVG에서 파싱한 영역별 Fabric 객체 참조 (색상 변경에 사용)
    let svgZoneObjects = {};

    // 색상 팔레트 (기존과 동일)
    const colors = [
        '#ffffff', '#111111', '#e21818', '#0026e6', '#fae100',
        '#008000', '#800080', '#ffa500', '#555555', '#191970',
        '#1D3557', '#E63946', '#2A9D8F', '#F4A261', '#264653'
    ];

    // ═══════════════════════════════════════════
    // 3. SVG 유니폼 로드 (핵심 함수)
    // ═══════════════════════════════════════════

    /**
     * SVG 문자열을 파싱하여 캔버스에 유니폼을 그린다.
     * 각 path를 개별 객체로 추가하여 영역별 색상 변경이 가능하도록 한다.
     *
     * @param {string} sport - 종목 키 (soccer/basketball/volleyball/baseball)
     * @param {string} side - 면 ('front' 또는 'back')
     */
    function loadSVGJersey(sport, side) {
        const tmpl = window.jerseyTemplates[sport];
        if (!tmpl) return;

        const svgString = tmpl[side];

        // 1단계: 현재 면의 사용자 객체(텍스트/로고)를 임시 저장
        saveUserObjects();

        // 2단계: 캔버스 초기화
        canvas.clear();
        canvas.setBackgroundColor('#f3f4f6', canvas.renderAll.bind(canvas));

        // 3단계: SVG 파싱 후 개별 객체로 추가
        fabric.loadSVGFromString(svgString, function (objects, options) {
            svgZoneObjects = {};

            // outline을 마지막에 추가하기 위해 분리
            let outlineObj = null;
            const zoneObjects = [];
            const decorObjects = []; // 버튼 디테일(circle) 등

            objects.forEach(obj => {
                const zoneId = obj.id;

                if (zoneId === 'outline') {
                    // 윤곽선: 최상위 레이어, 색상 변경 불가
                    obj.set({ selectable: false, evented: false });
                    outlineObj = obj;
                } else if (zoneId && tmpl.zones.includes(zoneId)) {
                    // 색상 영역: 현재 상태의 색상 또는 기본 색상 적용
                    const fillColor = designState.colors[zoneId] || tmpl.defaultColors[zoneId];
                    obj.set({
                        fill: fillColor,
                        selectable: false,
                        evented: false
                    });
                    svgZoneObjects[zoneId] = obj;
                    zoneObjects.push(obj);
                } else {
                    // 장식 요소(버튼 circle 등)
                    obj.set({ selectable: false, evented: false });
                    decorObjects.push(obj);
                }
            });

            // 4단계: viewBox 400x500 → 캔버스 600x700에 맞춰 스케일링
            const scaleX = 600 / 400;
            const scaleY = 700 / 500;
            const scale = Math.min(scaleX, scaleY) * 0.85; // 여백 15% 확보
            const offsetX = (600 - 400 * scale) / 2;
            const offsetY = (700 - 500 * scale) / 2;

            // 모든 SVG 객체에 스케일 + 위치 적용 후 캔버스에 추가
            // 순서: 색상 영역 → 장식 → 윤곽선(최상위)
            const allObjs = [...zoneObjects, ...decorObjects];
            if (outlineObj) allObjs.push(outlineObj);

            allObjs.forEach(obj => {
                obj.set({
                    scaleX: (obj.scaleX || 1) * scale,
                    scaleY: (obj.scaleY || 1) * scale,
                    left: (obj.left || 0) * scale + offsetX,
                    top: (obj.top || 0) * scale + offsetY
                });
                canvas.add(obj);
            });

            // 5단계: 전환 대상 면의 사용자 객체 복원
            restoreUserObjects();

            canvas.requestRenderAll();
        });
    }

    // ═══════════════════════════════════════════
    // 4. 사용자 객체(텍스트/로고) 보존 로직
    // ═══════════════════════════════════════════

    /**
     * 현재 캔버스에서 사용자가 추가한 객체(텍스트, 로고)를 JSON으로 저장한다.
     * SVG 영역 객체(selectable:false)는 제외한다.
     */
    function saveUserObjects() {
        const currentSide = designState.side;
        designState.userObjects[currentSide] = [];

        canvas.getObjects().forEach(obj => {
            // selectable이 true인 것 = 사용자가 추가한 텍스트/로고
            if (obj.selectable === true) {
                designState.userObjects[currentSide].push(obj.toJSON());
            }
        });
    }

    /**
     * 저장해둔 사용자 객체를 캔버스에 복원한다.
     * fabric.util.enlivenObjects는 비동기이므로 콜백 안에서 canvas.add 호출
     */
    function restoreUserObjects() {
        const targetSide = designState.side;
        const saved = designState.userObjects[targetSide] || [];

        if (saved.length === 0) return;

        fabric.util.enlivenObjects(saved, function (enlivenedObjects) {
            enlivenedObjects.forEach(obj => {
                obj.set({ selectable: true, evented: true });
                canvas.add(obj);
            });
            canvas.requestRenderAll();
        });
    }

    // ═══════════════════════════════════════════
    // 5. 영역별 색상 변경
    // ═══════════════════════════════════════════

    /**
     * 특정 영역의 fill 색상을 변경한다.
     * svgZoneObjects에서 해당 영역을 찾아 색상 적용.
     */
    function changeZoneColor(zoneId, color) {
        if (svgZoneObjects[zoneId]) {
            svgZoneObjects[zoneId].set('fill', color);
            designState.colors[zoneId] = color;
            canvas.requestRenderAll();
            updateColorSummary();
            updateSummary();
        }
    }

    /**
     * 현재 선택된 영역을 시각적으로 강조한다 (stroke 두껍게).
     * 이전 강조는 해제한다.
     */
    function highlightZone(zoneId) {
        // 모든 영역의 stroke 초기화
        Object.keys(svgZoneObjects).forEach(key => {
            svgZoneObjects[key].set({
                stroke: 'transparent',
                strokeWidth: 0
            });
        });

        // 선택된 영역 강조
        if (svgZoneObjects[zoneId]) {
            svgZoneObjects[zoneId].set({
                stroke: '#E63946',
                strokeWidth: 2
            });
        }

        canvas.requestRenderAll();
    }

    // ═══════════════════════════════════════════
    // 6. 앞뒤 전환
    // ═══════════════════════════════════════════

    function switchSide(side) {
        if (designState.side === side) return;

        designState.side = side;
        loadSVGJersey(designState.sport, side);

        // 버튼 UI 토글
        const btnFront = document.getElementById('btn-front');
        const btnBack = document.getElementById('btn-back');

        if (side === 'front') {
            btnFront.className = 'flex-1 py-2.5 text-sm font-bold bg-black text-white transition-colors';
            btnBack.className = 'flex-1 py-2.5 text-sm font-bold bg-white text-gray-500 hover:bg-gray-50 transition-colors';
        } else {
            btnBack.className = 'flex-1 py-2.5 text-sm font-bold bg-black text-white transition-colors';
            btnFront.className = 'flex-1 py-2.5 text-sm font-bold bg-white text-gray-500 hover:bg-gray-50 transition-colors';
        }
    }

    // ═══════════════════════════════════════════
    // 7. 종목 선택
    // ═══════════════════════════════════════════

    function selectSport(sportKey) {
        const tmpl = window.jerseyTemplates[sportKey];
        if (!tmpl) return;

        // 사용자 객체 초기화 (종목이 바뀌면 이전 면에 그린 것은 유지 불가)
        designState.userObjects = { front: [], back: [] };

        // 종목 변경 → 기본 색상으로 리셋
        designState.sport = sportKey;
        designState.colors = { ...tmpl.defaultColors };
        designState.side = 'front';
        designState.activeZone = tmpl.zones[0]; // 첫 번째 영역 선택

        // SVG 로드
        loadSVGJersey(sportKey, 'front');

        // UI 갱신
        updateSportGrid(sportKey);
        updateZoneButtons(sportKey);
        updateColorSummary();
        updateSummary();

        // 앞뒤 토글 리셋
        const btnFront = document.getElementById('btn-front');
        const btnBack = document.getElementById('btn-back');
        if (btnFront) btnFront.className = 'flex-1 py-2.5 text-sm font-bold bg-black text-white transition-colors';
        if (btnBack) btnBack.className = 'flex-1 py-2.5 text-sm font-bold bg-white text-gray-500 hover:bg-gray-50 transition-colors';
    }

    // ═══════════════════════════════════════════
    // 8. UI 동적 생성 함수들
    // ═══════════════════════════════════════════

    /**
     * PRODUCT 탭: 4종목 그리드 생성
     * Material Symbols 아이콘 + 종목명 버튼
     */
    function buildSportGrid() {
        const grid = document.getElementById('sport-grid');
        if (!grid) return;
        grid.innerHTML = '';

        Object.keys(window.jerseyTemplates).forEach(key => {
            const tmpl = window.jerseyTemplates[key];
            const isActive = key === designState.sport;

            const btn = document.createElement('button');
            btn.className = `flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all ${isActive
                ? 'border-black bg-gray-50'
                : 'border-gray-200 hover:border-gray-400'}`;
            btn.setAttribute('data-sport', key);
            btn.innerHTML = `
                <span class="material-symbols-outlined text-3xl mb-2">${tmpl.icon}</span>
                <span class="text-xs font-bold">${tmpl.name}</span>
            `;
            btn.onclick = () => selectSport(key);
            grid.appendChild(btn);
        });
    }

    /**
     * 종목 그리드의 활성 상태 갱신 (선택된 종목 강조)
     */
    function updateSportGrid(activeKey) {
        const grid = document.getElementById('sport-grid');
        if (!grid) return;

        grid.querySelectorAll('button').forEach(btn => {
            const key = btn.getAttribute('data-sport');
            if (key === activeKey) {
                btn.className = 'flex flex-col items-center justify-center p-4 rounded-lg border-2 border-black bg-gray-50 transition-all';
            } else {
                btn.className = 'flex flex-col items-center justify-center p-4 rounded-lg border-2 border-gray-200 hover:border-gray-400 transition-all';
            }
        });
    }

    /**
     * COLOR 탭: 영역 선택 버튼 동적 생성
     * 종목이 바뀔 때마다 호출 (농구: shoulder / 축구: sleeve 등)
     */
    function updateZoneButtons(sportKey) {
        const container = document.getElementById('zone-buttons');
        if (!container) return;
        container.innerHTML = '';

        const tmpl = window.jerseyTemplates[sportKey];
        if (!tmpl) return;

        tmpl.zones.forEach(zoneId => {
            const isActive = zoneId === designState.activeZone;
            const btn = document.createElement('button');
            btn.className = `px-3 py-1.5 text-xs font-bold rounded-full border transition-all ${isActive
                ? 'bg-black text-white border-black'
                : 'bg-white text-gray-600 border-gray-300 hover:border-black'}`;
            btn.textContent = tmpl.zoneLabels[zoneId] || zoneId;
            btn.setAttribute('data-zone', zoneId);

            btn.onclick = () => {
                designState.activeZone = zoneId;
                // 버튼 UI 갱신
                container.querySelectorAll('button').forEach(b => {
                    b.className = 'px-3 py-1.5 text-xs font-bold rounded-full border transition-all bg-white text-gray-600 border-gray-300 hover:border-black';
                });
                btn.className = 'px-3 py-1.5 text-xs font-bold rounded-full border transition-all bg-black text-white border-black';

                // 라벨 갱신
                const label = document.getElementById('color-zone-label');
                if (label) label.textContent = (tmpl.zoneLabels[zoneId] || zoneId) + ' Color';

                // 캔버스에서 해당 영역 강조
                highlightZone(zoneId);
            };

            container.appendChild(btn);
        });

        // 라벨 초기값
        const label = document.getElementById('color-zone-label');
        if (label) {
            const firstZone = tmpl.zones[0];
            label.textContent = (tmpl.zoneLabels[firstZone] || firstZone) + ' Color';
        }
    }

    /**
     * COLOR 탭: 통합 색상 팔레트 생성
     * 선택된 영역(activeZone)에 색상을 적용한다.
     */
    function buildColorPalette() {
        const el = document.getElementById('color-palette-zone');
        if (!el) return;
        el.innerHTML = '';

        colors.forEach(color => {
            const btn = document.createElement('button');
            btn.className = 'w-10 h-10 rounded-full border border-gray-200 focus:ring-2 ring-offset-2 ring-black hover:scale-110 transition-transform';
            btn.style.backgroundColor = color;
            btn.onclick = () => {
                changeZoneColor(designState.activeZone, color);
            };
            el.appendChild(btn);
        });
    }

    /**
     * COLOR 탭 하단: 현재 영역별 색상 요약 표시
     */
    function updateColorSummary() {
        const container = document.getElementById('color-summary');
        if (!container) return;

        const tmpl = window.jerseyTemplates[designState.sport];
        if (!tmpl) return;

        container.innerHTML = '';
        tmpl.zones.forEach(zoneId => {
            const currentColor = designState.colors[zoneId] || tmpl.defaultColors[zoneId];
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between text-xs';
            div.innerHTML = `
                <span class="text-gray-600">${tmpl.zoneLabels[zoneId] || zoneId}</span>
                <div class="flex items-center gap-2">
                    <span class="w-4 h-4 rounded-full border border-gray-200 inline-block" style="background-color:${currentColor}"></span>
                    <span class="text-gray-400 font-mono">${currentColor}</span>
                </div>
            `;
            container.appendChild(div);
        });
    }

    // ═══════════════════════════════════════════
    // 9. Summary 패널 갱신
    // ═══════════════════════════════════════════

    function updateSummary() {
        const tmpl = window.jerseyTemplates[designState.sport];
        if (!tmpl) return;

        // 종목명
        const modelEl = document.getElementById('summary-model-name');
        if (modelEl) modelEl.textContent = tmpl.name;

        // 가격
        const priceEl = document.getElementById('summary-price');
        if (priceEl) priceEl.textContent = '\u20A9' + tmpl.basePrice.toLocaleString();

        // 모바일 가격
        const mobilePriceEl = document.getElementById('mobile-total-price');
        if (mobilePriceEl) mobilePriceEl.textContent = '\u20A9' + tmpl.basePrice.toLocaleString();

        // 영역별 색상 요약 (우측 패널)
        const summaryColor = document.getElementById('summary-color');
        if (summaryColor) {
            let html = '<div class="flex flex-col text-xs space-y-1">';
            tmpl.zones.forEach(zoneId => {
                const c = designState.colors[zoneId] || tmpl.defaultColors[zoneId];
                html += `<span class="flex items-center"><span class="w-3 h-3 rounded-full border border-gray-200 mr-2" style="background-color:${c}"></span>${tmpl.zoneLabels[zoneId]}: ${c}</span>`;
            });
            html += '</div>';
            summaryColor.innerHTML = html;
        }
    }

    // ═══════════════════════════════════════════
    // 10. 전역 함수 등록 (하위 호환)
    // ═══════════════════════════════════════════

    // 기존 changeBaseProduct 호환: PRODUCT 탭 외부에서 호출 시 사용
    window.changeBaseProduct = function (url, name) {
        const sport = name.toLowerCase().includes('soccer') ? 'soccer'
            : name.toLowerCase().includes('basket') ? 'basketball'
                : name.toLowerCase().includes('volley') ? 'volleyball'
                    : name.toLowerCase().includes('base') ? 'baseball'
                        : 'soccer';
        selectSport(sport);
    };

    // 기존 loadLayeredProduct 호환: RESET 버튼 등에서 호출
    window.loadLayeredProduct = function (type) {
        selectSport(type || designState.sport);
    };

    // ═══════════════════════════════════════════
    // 11. 초기화 실행
    // ═══════════════════════════════════════════

    // 초기 색상 상태 설정
    const initTmpl = window.jerseyTemplates['soccer'];
    designState.colors = { ...initTmpl.defaultColors };

    // UI 빌드
    buildSportGrid();
    updateZoneButtons('soccer');
    buildColorPalette();
    updateColorSummary();

    // 첫 유니폼 로드
    loadSVGJersey('soccer', 'front');
    updateSummary();

    // 앞뒤 전환 버튼 이벤트
    document.getElementById('btn-front').addEventListener('click', () => switchSide('front'));
    document.getElementById('btn-back').addEventListener('click', () => switchSide('back'));


    // ═══════════════════════════════════════════
    // 12. 텍스트 색상 팔레트 (기존 기능 유지)
    // ═══════════════════════════════════════════

    function createPalette(id, onClick) {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        colors.forEach(color => {
            const btn = document.createElement('button');
            btn.className = 'w-10 h-10 rounded-full border border-gray-200 focus:ring-2 ring-offset-2 ring-black hover:scale-110 transition-transform';
            btn.style.backgroundColor = color;
            btn.onclick = () => onClick(color);
            el.appendChild(btn);
        });
    }

    // 텍스트 색상 팔레트
    createPalette('text-color-palette', (color) => {
        const activeObj = canvas.getActiveObject();
        if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
            activeObj.set('fill', color);
            canvas.requestRenderAll();
        }
    });


    // ═══════════════════════════════════════════
    // 13. 폰트 & 텍스트 로직 (기존 기능 유지)
    // ═══════════════════════════════════════════

    const fonts = [
        { name: 'Noto Sans KR', label: '본고딕 (Sans)', family: "'Noto Sans KR', sans-serif" },
        { name: 'Black Han Sans', label: '블랙한산스 (Title)', family: "'Black Han Sans', sans-serif" },
        { name: 'Gmarket Sans', label: 'G마켓 산스 (Bold)', family: "'Gmarket Sans', sans-serif" },
        { name: 'Do Hyeon', label: '도현체', family: "'Do Hyeon', sans-serif" },
        { name: 'Jua', label: '주아체', family: "'Jua', sans-serif" },
        { name: 'Yeon Sung', label: '연성체', family: "'Yeon Sung', cursive" },
        { name: 'Nanum Brush Script', label: '나눔브러쉬', family: "'Nanum Brush Script', cursive" },
        { name: 'Song Myung', label: '송명체 (Serif)', family: "'Song Myung', serif" },
        { name: 'Anton', label: 'Anton (Eng)', family: "'Anton', sans-serif" }
    ];

    const fontList = document.getElementById('font-list');
    let currentFont = "'Noto Sans KR', sans-serif";

    if (fontList) {
        fontList.innerHTML = '';
        fonts.forEach((font, index) => {
            const div = document.createElement('div');
            div.className = `font-preview-btn p-2 rounded cursor-pointer border border-transparent ${index === 0 ? 'active' : ''}`;
            div.style.fontFamily = font.family;
            div.innerHTML = `<span class="text-sm">${font.label}</span> <span class="text-xs text-gray-400 block">${font.name}</span>`;

            // 마우스 올리면 선택된 텍스트에 미리보기 적용
            div.addEventListener('mouseenter', () => {
                const activeObj = canvas.getActiveObject();
                if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
                    activeObj.set('fontFamily', font.family);
                    canvas.requestRenderAll();
                }
            });

            div.onclick = () => {
                document.querySelectorAll('.font-preview-btn').forEach(b => {
                    b.classList.remove('active', 'border-black');
                    b.classList.add('border-transparent');
                });
                div.classList.add('active', 'border-black');
                div.classList.remove('border-transparent');

                currentFont = font.family;

                const activeObj = canvas.getActiveObject();
                if (activeObj && (activeObj.type === 'i-text' || activeObj.type === 'text')) {
                    activeObj.set('fontFamily', font.family);
                    canvas.requestRenderAll();
                }
            };
            fontList.appendChild(div);
        });
    }

    // 텍스트 추가 함수
    const addText = () => {
        const val = document.getElementById('text-input').value || 'STIZ';
        const text = new fabric.IText(val, {
            left: 200, top: 300,
            fontFamily: currentFont,
            fill: '#000000', fontSize: 60
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        document.getElementById('text-input').value = '';
    };

    document.getElementById('add-text-btn').addEventListener('click', addText);
    document.getElementById('text-input').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') addText();
    });


    // ═══════════════════════════════════════════
    // 14. 로고 업로드 (기존 기능 유지)
    // ═══════════════════════════════════════════

    const uploadInput = document.getElementById('logo-upload');
    if (uploadInput) {
        uploadInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function (f) {
                const data = f.target.result;
                fabric.Image.fromURL(data, function (img) {
                    img.scaleToWidth(150);
                    img.set({
                        left: 220, top: 250,
                        borderColor: 'red', cornerColor: 'red',
                        cornerSize: 8, transparentCorners: false
                    });
                    canvas.add(img);
                    canvas.setActiveObject(img);
                });
            };
            reader.readAsDataURL(file);
            uploadInput.value = '';
        });
    }


    // ═══════════════════════════════════════════
    // 15. AI 엠블럼 생성 (기존 기능 유지)
    // ═══════════════════════════════════════════

    window.generateAILogo = async function () {
        const teamName = document.getElementById('ai-team-name').value || 'STIZ FC';
        const slogan = document.getElementById('ai-slogan').value || '';
        const year = document.getElementById('ai-year').value || '';
        const style = document.getElementById('ai-logo-style').value || 'Emblem';
        const userRequest = document.getElementById('ai-logo-prompt').value || '';

        const fullPrompt = `Team Name: ${teamName}, Slogan: ${slogan}, Established: ${year}, Type: ${style}, Additional: ${userRequest}`;

        try {
            const response = await fetch('http://localhost:4000/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: fullPrompt, type: 'logo' })
            });

            const data = await response.json();

            if (data.success && data.imageUrl) {
                fabric.Image.fromURL(data.imageUrl, function (img) {
                    img.scaleToWidth(200);
                    img.set({
                        left: 200, top: 250,
                        cornerColor: '#E63946', cornerSize: 10,
                        transparentCorners: false, borderColor: '#E63946'
                    });
                    canvas.add(img);
                    canvas.setActiveObject(img);
                    canvas.requestRenderAll();
                    alert('AI Logo Generated Successfully!');
                });
            } else {
                alert('AI Generation Failed: ' + (data.message || 'Unknown Error'));
            }
        } catch (err) {
            console.error(err);
            alert('Server Error. Check console.');
        }
    };

    // AI 로고 생성 버튼 이벤트
    document.getElementById('btn-generate-ai-logo').addEventListener('click', () => {
        const btn = document.getElementById('btn-generate-ai-logo');
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Generating...`;
        btn.disabled = true;

        setTimeout(() => {
            generateAILogo();
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 800);
    });


    // ═══════════════════════════════════════════
    // 16. 줌 / 리셋 (기존 기능 유지)
    // ═══════════════════════════════════════════

    document.getElementById('zoom-in').addEventListener('click', () => canvas.setZoom(canvas.getZoom() * 1.1));
    document.getElementById('zoom-out').addEventListener('click', () => canvas.setZoom(canvas.getZoom() * 0.9));

    // RESET: 현재 종목을 처음 상태로 다시 로드
    document.getElementById('clear-canvas').addEventListener('click', () => {
        designState.userObjects = { front: [], back: [] };
        const tmpl = window.jerseyTemplates[designState.sport];
        if (tmpl) designState.colors = { ...tmpl.defaultColors };
        designState.side = 'front';
        canvas.setZoom(1); // 줌도 리셋
        loadSVGJersey(designState.sport, 'front');
        updateColorSummary();
        updateSummary();

        // 앞뒤 토글 UI 리셋
        const btnFront = document.getElementById('btn-front');
        const btnBack = document.getElementById('btn-back');
        if (btnFront) btnFront.className = 'flex-1 py-2.5 text-sm font-bold bg-black text-white transition-colors';
        if (btnBack) btnBack.className = 'flex-1 py-2.5 text-sm font-bold bg-white text-gray-500 hover:bg-gray-50 transition-colors';
    });


    // ═══════════════════════════════════════════
    // 17. Delete 키로 선택 객체 삭제 (기존 기능 유지)
    // ═══════════════════════════════════════════

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            // input 필드에 포커스가 있으면 삭제 동작 안 함
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

            const active = canvas.getActiveObjects();
            if (active.length) {
                canvas.discardActiveObject();
                active.forEach(o => {
                    // SVG 영역은 삭제 불가 (selectable이 false이므로 선택 자체가 안 되지만 방어)
                    if (o.selectable) canvas.remove(o);
                });
            }
        }
    });


    // ═══════════════════════════════════════════
    // 18. 저장 & 다운로드 (기존 기능 유지)
    // ═══════════════════════════════════════════

    window.saveDesign = function () {
        const designId = 'stiz_design_' + Date.now();
        let dataURL = '';
        let mockupSaved = false;

        try {
            dataURL = canvas.toDataURL({ format: 'png', multiplier: 0.5 });
            localStorage.setItem('stiz_mockup_source', dataURL);
            mockupSaved = true;
        } catch (e) {
            console.warn('Canvas tainted - 목업 소스 저장 불가', e);
        }

        const designData = {
            id: designId,
            date: new Date().toLocaleDateString(),
            preview: dataURL,
            productType: window.jerseyTemplates[designState.sport]?.name || 'Custom Kit',
            json: JSON.stringify(canvas.toJSON())
        };

        const savedDesigns = JSON.parse(localStorage.getItem('stiz_saved_designs') || '[]');
        savedDesigns.push(designData);
        localStorage.setItem('stiz_saved_designs', JSON.stringify(savedDesigns));

        if (mockupSaved) {
            const goMockup = confirm('디자인이 저장되었습니다. 목업에서 확인하시겠습니까?');
            if (goMockup) {
                window.location.href = 'custom_mockup.html';
                return;
            }
        } else {
            alert('디자인이 저장되었습니다.\n(외부 이미지가 포함되어 목업 전달이 불가합니다)');
            return;
        }

        alert('Design Saved! Check "My Shop".');
    };

    window.downloadDesign = function () {
        try {
            const dataURL = canvas.toDataURL({ format: 'png', multiplier: 2 });
            const link = document.createElement('a');
            link.download = 'stiz_custom_design.png';
            link.href = dataURL;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            alert('Cannot download (CORS issue with external images). Try without external logos.');
        }
    };

    // SAVE 버튼 연결
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => saveDesign());
    }


    // ═══════════════════════════════════════════
    // 19. 탭 전환 (기존 기능 유지)
    // ═══════════════════════════════════════════

    const tabs = document.querySelectorAll('button[data-tab]');
    const panels = document.querySelectorAll('#tool-panel > div');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => {
                t.classList.remove('border-b-2', 'border-black', 'text-black');
                t.classList.add('text-gray-400');
            });
            tab.classList.remove('text-gray-400');
            tab.classList.add('border-b-2', 'border-black', 'text-black');
            const target = tab.getAttribute('data-tab');
            panels.forEach(p => {
                p.classList.toggle('hidden', p.id !== `panel-${target}`);
            });

            // COLOR 탭 진입 시 영역 강조 표시
            if (target === 'color') {
                highlightZone(designState.activeZone);
            } else {
                // 다른 탭 진입 시 강조 해제
                highlightZone(null);
            }
        });
    });

    // Design Lab V3.0 초기화 완료
    console.log('[STIZ] Design Lab V3.0 (SVG Templates) initialized');
});
