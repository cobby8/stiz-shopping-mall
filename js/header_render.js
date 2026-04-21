/**
 * Common Header Renderer
 * Solves local file:// protocol CORS issues by injecting HTML directly via JS.
 */
document.addEventListener('DOMContentLoaded', () => {
    renderHeader();
    renderFooter();
    loadAnalytics();
    // SHOP 메뉴 카테고리를 비동기로 주입 (API 실패 시 기본 정적 메뉴 유지)
    injectShopCategories();
});

// 다른 탭에서 장바구니가 바뀌면(stiz_cart storage 이벤트) 이 탭의 뱃지도 갱신
window.addEventListener('storage', (e) => {
    if (e.key === 'stiz_cart' && typeof syncHeaderCartBadge === 'function') {
        syncHeaderCartBadge();
    }
});

/**
 * 카테고리 목록을 API에서 가져와 sessionStorage에 5분간 캐시
 * - 네비 드롭다운이 매 페이지마다 동일 API를 호출하는 낭비를 줄이기 위함
 * - 캐시 만료 또는 실패 시 fresh 호출
 */
async function fetchNavCategories() {
    const CACHE_KEY = 'stiz_nav_categories_v2';
    const CACHE_TTL = 5 * 60 * 1000; // 5분

    // 1) 세션 스토리지에서 캐시 확인
    try {
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
            const { ts, data } = JSON.parse(cached);
            if (Date.now() - ts < CACHE_TTL && Array.isArray(data)) {
                return data;
            }
        }
    } catch (_) { /* 캐시 오류는 무시하고 재요청 */ }

    // 2) API 호출
    try {
        const res = await fetch('/api/products/categories');
        const json = await res.json();
        if (!json.success || !Array.isArray(json.categories)) return [];
        // 새 카테고리 id 100~109만 사용 (구 카테고리는 active=0이지만 안전 장치)
        // 대분류(parentId null) 중 productCount > 0인 것만
        const list = json.categories.filter(c => (c.productCount || 0) > 0);
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: list }));
        return list;
    } catch (err) {
        console.warn('[header] 카테고리 API 실패, 기본 메뉴 유지:', err);
        return [];
    }
}

/**
 * SHOP(TEAMWEAR/STORE) 메뉴에 DB 카테고리 동적 주입
 * - 데스크톱 TEAMWEAR 메가메뉴 SPORT CATEGORY 리스트 (id=nav-teamwear-list)
 * - 데스크톱 STORE 드롭다운 리스트 (id=nav-store-list)
 * - 모바일 TEAMWEAR / STORE 리스트 (id=mobile-nav-teamwear-list / mobile-nav-store-list)
 */
async function injectShopCategories() {
    const categories = await fetchNavCategories();
    if (!categories.length) return; // API 실패 시 기본 정적 메뉴 유지

    // "스포츠 카테고리(농구/축구/배구/팀웨어/컴프레션/연습복)" vs "스토어(캐주얼/악세서리/MD/세일)" 분류 기준
    // 기획서 10개 카테고리를 팀웨어 쪽 / 스토어 쪽으로 나눔
    const TEAMWEAR_SLUGS = new Set(['basketball', 'soccer', 'volleyball', 'teamwear', 'compression', 'practice']);
    const STORE_SLUGS = new Set(['casual', 'accessories', 'md-picks', 'sale']);

    const teamwearCats = categories.filter(c => TEAMWEAR_SLUGS.has(c.slug));
    const storeCats = categories.filter(c => STORE_SLUGS.has(c.slug));

    // 데스크톱: TEAMWEAR 메가메뉴 SPORT CATEGORY 리스트 교체
    const twList = document.getElementById('nav-teamwear-list');
    if (twList && teamwearCats.length) {
        twList.innerHTML = teamwearCats.map(cat => `
            <li>
                <a href="list.html?category=${cat.slug}" class="hover:text-blue-600 block transition-transform hover:translate-x-1">
                    ${cat.name} <span class="text-xs text-gray-400">(${cat.productCount})</span>
                </a>
            </li>
        `).join('');
    }

    // 데스크톱: STORE 드롭다운 리스트 교체
    const stList = document.getElementById('nav-store-list');
    if (stList && storeCats.length) {
        stList.innerHTML = storeCats.map(cat => `
            <a href="list.html?category=${cat.slug}" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">
                ${cat.name} (${cat.productCount})
            </a>
        `).join('');
    }

    // 모바일: TEAMWEAR 리스트
    const mTwList = document.getElementById('mobile-nav-teamwear-list');
    if (mTwList && teamwearCats.length) {
        mTwList.innerHTML = teamwearCats.map(cat => `
            <a href="list.html?category=${cat.slug}" class="block">${cat.name}</a>
        `).join('');
    }

    // 모바일: STORE 리스트
    const mStList = document.getElementById('mobile-nav-store-list');
    if (mStList && storeCats.length) {
        mStList.innerHTML = storeCats.map(cat => `
            <a href="list.html?category=${cat.slug}" class="block">${cat.name}</a>
        `).join('');
    }
}

function loadAnalytics() {
    if (document.querySelector('script[src*="analytics.js"]')) return;
    const s = document.createElement('script');
    s.src = 'js/analytics.js';
    document.head.appendChild(s);
}

function renderHeader() {
    const isMainPage = document.querySelector('body').classList.contains('page-main');
    const headerEl = document.querySelector('header');

    if (!headerEl) return;

    // Define classes based on page type
    // Main page: transparent initially, valid for scroll effect.
    // Sub pages: white background, black text, fixed.
    const initialClass = isMainPage
        ? 'fixed w-full z-50 transition-all duration-300 bg-transparent text-white'
        : 'fixed w-full z-50 transition-all duration-300 bg-white text-black shadow-sm';

    headerEl.className = initialClass;

    const html = `
    <div class="container mx-auto px-6 h-20 flex items-center justify-between">
        <!-- Logo (Sticky Home Button) -->
        <a href="index.html" class="z-50 transition-transform duration-300 hover:scale-105 block">
            <img src="images/logo_white.png" alt="STIZ Home" class="h-8 md:h-10 w-auto object-contain logo-white ${isMainPage ? '' : 'hidden'}" width="120" height="40">
            <img src="images/logo_black.png" alt="STIZ Home" class="h-8 md:h-10 w-auto object-contain logo-black ${isMainPage ? 'hidden' : ''}" width="120" height="40">
        </a>

        <!-- Desktop Navigation (Centered 4-Column Layout) -->
        <nav class="hidden md:flex space-x-12 h-full items-center justify-center flex-1 ml-10">
            
            <!-- 1. BRAND (STIZ) -->
            <div class="group h-full flex items-center relative">
                <a href="index.html" class="font-bold text-sm tracking-widest hover:text-gray-500 transition-colors py-8 uppercase">STIZ</a>
                <div class="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full w-48 bg-white text-black shadow-lg border border-gray-100 py-4 z-40 text-center">
                    <a href="about.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">회사소개</a>
                    <a href="about.html#values" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">가치 (Values)</a>
                    <a href="lookbook.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">룩북 (Lookbook)</a>
                    <a href="about.html#contact" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">오시는 길</a>
                </div>
            </div>

            <!-- 2. TEAMWEAR (Mega Menu) - UPDATED -->
            <div class="group h-full flex items-center relative">
                <a href="list.html?type=custom" class="font-bold text-sm tracking-widest hover:text-gray-500 transition-colors py-8 uppercase text-blue-600">TEAMWEAR</a>
                <div class="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full w-[900px] bg-white text-black shadow-2xl border-t border-black py-10 z-40">
                    <div class="container mx-auto px-8 grid grid-cols-3 gap-12">
                        <!-- Column 1: Category -->
                        <div>
                            <h3 class="font-bold text-lg mb-6 border-b-2 border-black pb-2 inline-block">SPORT CATEGORY</h3>
                            <!-- nav-teamwear-list: injectShopCategories()가 동적으로 채움 (API 실패 시 아래 기본 목록 유지) -->
                            <ul id="nav-teamwear-list" class="space-y-4 text-sm text-gray-600 font-medium">
                                <li><a href="list.html?category=basketball" class="hover:text-blue-600 block transition-transform hover:translate-x-1">농구 유니폼 (Basketball)</a></li>
                                <li><a href="list.html?category=soccer" class="hover:text-blue-600 block transition-transform hover:translate-x-1">축구 유니폼 (Soccer)</a></li>
                                <li><a href="list.html?category=volleyball" class="hover:text-blue-600 block transition-transform hover:translate-x-1">배구 유니폼 (Volleyball)</a></li>
                                <li><a href="list.html?category=teamwear" class="hover:text-blue-600 block transition-transform hover:translate-x-1">팀웨어 / 트레이닝</a></li>
                            </ul>
                        </div>
                        
                        <!-- Column 2: Design Services -->
                        <div>
                            <h3 class="font-bold text-lg mb-6 border-b-2 border-black pb-2 inline-block">DESIGN SERVICES</h3>
                            <ul class="space-y-4 text-sm text-gray-600">
                                <li>
                                    <a href="custom.html" class="flex items-start group/item">
                                        <span class="text-2xl mr-3 text-gray-300 group-hover/item:text-blue-600">01</span>
                                        <div>
                                            <strong class="text-black block group-hover/item:text-blue-600">Smart Design Lab</strong>
                                            <span class="text-xs">3D/2D 실시간 커스텀 툴</span>
                                        </div>
                                    </a>
                                </li>
                                <li>
                                    <a href="inquiry.html" class="flex items-start group/item">
                                        <span class="text-2xl mr-3 text-gray-300 group-hover/item:text-blue-600">02</span>
                                        <div>
                                            <strong class="text-black block group-hover/item:text-blue-600">Free Design Request</strong>
                                            <span class="text-xs">디자이너 무료 시안 요청</span>
                                        </div>
                                    </a>
                                </li>
                            </ul>
                        </div>

                        <!-- Column 3: Promotion (Image) -->
                        <div class="relative overflow-hidden group/img h-full rounded-lg bg-gray-100">
                            <img src="https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=2071&auto=format&fit=crop" 
                                 class="w-full h-full object-cover transition-transform duration-700 group-hover/img:scale-110 opacity-90 hover:opacity-100" 
                                 alt="Mega Menu Promo" width="300" height="250">
                            <div class="absolute bottom-6 left-6 text-white">
                                <span class="bg-black text-white text-[10px] px-2 py-1 font-bold mb-2 inline-block">FEATURED</span>
                                <h4 class="font-bold text-xl leading-tight">NEW SEASON<br>COLLECTION</h4>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 3. STORE (Dropdown) -->
            <div class="group h-full flex items-center relative">
                <a href="list.html" class="font-bold text-sm tracking-widest hover:text-gray-500 transition-colors py-8 uppercase">STORE</a>
                <!-- nav-store-list: injectShopCategories()가 동적으로 채움 -->
                <div id="nav-store-list" class="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full w-48 bg-white text-black shadow-lg border border-gray-100 py-4 z-40 text-center">
                    <a href="list.html?category=casual" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">캐주얼</a>
                    <a href="list.html?category=accessories" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">악세서리&용품</a>
                    <a href="list.html?category=md-picks" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">MD제품</a>
                    <a href="list.html?category=sale" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:text-red-600 font-bold">시즌오프 SALE</a>
                </div>
            </div>

            <!-- 4. COMMUNITY — #13: 커뮤니티/룩북/단체주문 등 서브메뉴 확장 -->
            <div class="group h-full flex items-center relative">
                <a href="community.html" class="font-bold text-sm tracking-widest hover:text-gray-500 transition-colors py-8 uppercase">COMMUNITY</a>
                <div class="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full w-52 bg-white text-black shadow-lg border border-gray-100 py-4 z-40 text-center">
                    <a href="community.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">매거진 (Magazine)</a>
                    <a href="community.html?tab=celeb" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">셀럽 (Celeb)</a>
                    <a href="community.html?tab=process" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">제작 과정 (Process)</a>
                    <a href="community.html?tab=event" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">이벤트 (Event)</a>
                    <div class="border-t border-gray-100 my-2"></div>
                    <a href="lookbook.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">포트폴리오 (Lookbook)</a>
                    <a href="bulk-order.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">단체 주문 (Bulk Order)</a>
                    <div class="border-t border-gray-100 my-2"></div>
                    <a href="notice.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">공지사항</a>
                    <a href="inquiry.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">문의하기 (Q&A)</a>
                </div>
            </div>

        </nav>

        <!-- Utilities -->
        <div class="flex items-center space-x-6 text-current">
            <!-- Search -->
             <button class="hover:opacity-70">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </button>
            
            <!-- User: 로그인 상태면 마이페이지, 아니면 로그인 페이지로 -->
            <a href="#" onclick="goToUserPage(event)" class="hover:opacity-70" aria-label="내 계정">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            </a>

            <!-- Cart (장바구니 아이콘 + 배지) -->
            <a href="cart.html" class="hover:opacity-70 relative">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                 <span class="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full font-bold">0</span>
            </a>

             <button id="mobile-menu-btn" class="md:hidden hover:opacity-70">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>
        </div>
    </div>
    
    <!-- Mobile Menu -->
    <div id="mobile-menu" class="hidden md:hidden bg-white text-black absolute top-20 left-0 w-full shadow-lg border-t z-50">
        <div class="flex flex-col p-6 space-y-6">
            <!-- TEAMWEAR Mobile Menu -->
            <div>
                <h3 class="font-bold text-gray-400 text-xs mb-2">TEAMWEAR</h3>
                <a href="list.html?type=custom" class="block text-xl font-bold mb-2">팀웨어 제작</a>
                <!-- mobile-nav-teamwear-list: injectShopCategories()가 동적으로 채움 -->
                <div id="mobile-nav-teamwear-list" class="pl-4 space-y-2 text-sm text-gray-600">
                    <a href="list.html?category=basketball" class="block">농구</a>
                    <a href="list.html?category=soccer" class="block">축구</a>
                    <a href="list.html?category=volleyball" class="block">배구</a>
                    <a href="list.html?category=teamwear" class="block">팀웨어 / 트레이닝</a>
                </div>
            </div>
            <div class="border-t pt-4">
                <h3 class="font-bold text-gray-400 text-xs mb-2">STORE</h3>
                <a href="list.html" class="block text-xl font-bold mb-2">스토어</a>
                <!-- mobile-nav-store-list: injectShopCategories()가 동적으로 채움 -->
                <div id="mobile-nav-store-list" class="pl-4 space-y-2 text-sm text-gray-600">
                    <a href="list.html?category=casual" class="block">캐주얼</a>
                    <a href="list.html?category=accessories" class="block">악세서리&용품</a>
                    <a href="list.html?category=md-picks" class="block">MD제품</a>
                    <a href="list.html?category=sale" class="block">시즌오프</a>
                </div>
            </div>
            <!-- 모바일: COMMUNITY 메뉴 (#13) -->
            <div class="border-t pt-4">
                <h3 class="font-bold text-gray-400 text-xs mb-2">COMMUNITY</h3>
                <a href="community.html" class="block text-xl font-bold mb-2">커뮤니티</a>
                <div class="pl-4 space-y-2 text-sm text-gray-600">
                    <a href="community.html" class="block">매거진</a>
                    <a href="community.html?tab=celeb" class="block">셀럽</a>
                    <a href="community.html?tab=event" class="block">이벤트</a>
                    <a href="lookbook.html" class="block">포트폴리오</a>
                    <a href="bulk-order.html" class="block">단체 주문</a>
                    <a href="notice.html" class="block">공지사항</a>
                </div>
            </div>
            <div class="border-t pt-4 flex justify-between items-center">
                <a href="login.html" class="font-bold">로그인</a>
                <a href="join.html" class="font-bold">회원가입</a>
            </div>
        </div>
    </div>
    `;

    headerEl.innerHTML = html;

    // Re-attach mobile menu event
    const menuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (menuBtn && mobileMenu) {
        menuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    // 카트 뱃지: cart.js가 없어도 localStorage에서 직접 읽어 초기값 반영
    // (cart.js가 로드된 페이지에서는 updateCartCount()가 이후 덮어쓰므로 충돌 없음)
    syncHeaderCartBadge();

    // Search Functionality
    initSearchUI();

    // Scroll Logic for Main Page
    if (isMainPage) {
        window.addEventListener('scroll', () => {
            const logoWhite = document.querySelector('.logo-white');
            const logoBlack = document.querySelector('.logo-black');

            if (window.scrollY > 50) {
                headerEl.classList.add('bg-white', 'text-black', 'shadow-md');
                headerEl.classList.remove('bg-transparent', 'text-white');
                if (logoWhite) logoWhite.classList.add('hidden');
                if (logoBlack) logoBlack.classList.remove('hidden');
            } else {
                headerEl.classList.add('bg-transparent', 'text-white');
                headerEl.classList.remove('bg-white', 'text-black', 'shadow-md');
                if (logoWhite) logoWhite.classList.remove('hidden');
                if (logoBlack) logoBlack.classList.add('hidden');
            }
        });
    }
}

function renderFooter() {
    const footerEl = document.querySelector('footer');
    if (!footerEl || footerEl.innerHTML.trim().length > 50) return; // Skip if already populated (like in index.html inline)

    footerEl.innerHTML = `
    <div class="container mx-auto px-6 py-12">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div class="col-span-1 md:col-span-1">
                    <h2 class="text-2xl font-bold tracking-tighter mb-4">STIZ</h2>
                    <p class="text-gray-400 text-sm leading-relaxed mb-6">
                        최고의 팀웨어로 승리를 함께합니다. <br>
                        프리미엄 품질의 장비로 팀의 정체성을 디자인하세요.
                    </p>
                </div>
                <div class="col-span-1">
                    <h3 class="font-bold text-lg mb-4 text-white">쇼핑</h3>
                    <ul class="space-y-2 text-sm text-gray-400">
                        <li><a href="list.html?category=soccer" class="hover:text-white">축구</a></li>
                        <li><a href="list.html?category=basketball" class="hover:text-white">농구</a></li>
                        <li><a href="list.html?category=volleyball" class="hover:text-white">배구</a></li>
                        <li><a href="list.html?category=accessories" class="hover:text-white">악세서리</a></li>
                    </ul>
                </div>
                <div class="col-span-1">
                    <h3 class="font-bold text-lg mb-4 text-white">고객지원</h3>
                    <ul class="space-y-2 text-sm text-gray-400">
                        <li><a href="notice.html" class="hover:text-white">자주묻는질문</a></li>
                        <li><a href="inquiry.html" class="hover:text-white">문의하기</a></li>
                        <li><a href="notice.html" class="hover:text-white">사이즈 가이드</a></li>
                        <li><a href="notice.html" class="hover:text-white">개인정보처리방침</a></li>
                    </ul>
                </div>
                <div class="col-span-1">
                    <h3 class="font-bold text-lg mb-4 text-white">뉴스레터</h3>
                     <div class="flex">
                        <input type="email" id="footerNewsletterEmail" placeholder="이메일 주소" aria-label="이메일 주소" class="bg-gray-800 text-white px-4 py-2 text-sm w-full">
                        <button onclick="(async()=>{const e=document.getElementById('footerNewsletterEmail');if(!e.value){alert('이메일을 입력해주세요.');return;}try{const r=await fetch('/api/newsletter/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:e.value})});const d=await r.json();alert(d.message||'구독 완료!');e.value='';}catch(err){alert('구독 처리 중 오류가 발생했습니다.');}})()" class="bg-white text-black px-4 py-2 font-bold text-sm">구독</button>
                    </div>
                </div>
            </div>
            <div class="border-t border-gray-800 mt-12 pt-8 text-xs text-gray-500 text-center">
                 &copy; 2026 소명엔비씨(주) STIZ. 사업자등록번호: 119-86-78811 | 대표: 김수빈<br>
                 서울특별시 성동구 한림말길 33
            </div>
        </div>
    `;
}

function initSearchUI() {
    // Create search overlay
    const overlay = document.createElement('div');
    overlay.id = 'search-overlay';
    overlay.className = 'fixed inset-0 z-[100] hidden';
    overlay.innerHTML = `
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="search-backdrop"></div>
        <div class="absolute top-0 left-0 w-full bg-white shadow-lg p-6 transform -translate-y-full transition-transform duration-300" id="search-panel">
            <div class="container mx-auto max-w-2xl">
                <div class="flex items-center space-x-4">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input type="text" id="search-input" placeholder="상품 검색..." class="flex-1 text-lg font-medium border-none outline-none bg-transparent" autocomplete="off">
                    <button id="search-close" class="text-gray-400 hover:text-black">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div id="search-results" class="mt-4 max-h-80 overflow-y-auto"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    // Bind search button
    const searchBtn = document.querySelector('header button.hover\\:opacity-70');
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            overlay.classList.remove('hidden');
            setTimeout(() => {
                document.getElementById('search-panel').style.transform = 'translateY(0)';
                document.getElementById('search-input').focus();
            }, 10);
        });
    }

    const closeSearch = () => {
        document.getElementById('search-panel').style.transform = 'translateY(-100%)';
        setTimeout(() => overlay.classList.add('hidden'), 300);
    };

    const searchCloseEl = document.getElementById('search-close');
    const searchBackdropEl = document.getElementById('search-backdrop');
    const searchInputEl = document.getElementById('search-input');

    if (searchCloseEl) searchCloseEl.addEventListener('click', closeSearch);
    if (searchBackdropEl) searchBackdropEl.addEventListener('click', closeSearch);

    // Live search — API 기반 (300ms 디바운스 + AbortController로 이전 요청 취소)
    // 기존 전역 `products` 변수 의존 방식 → /api/products?search= 호출로 전환
    let searchTimer = null;
    let searchController = null;

    if (searchInputEl) searchInputEl.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        const resultsContainer = document.getElementById('search-results');

        clearTimeout(searchTimer);
        if (searchController) searchController.abort();

        if (query.length < 2) {
            resultsContainer.innerHTML = '<p class="text-sm text-gray-400 py-2">2글자 이상 입력해주세요.</p>';
            return;
        }

        resultsContainer.innerHTML = '<p class="text-sm text-gray-400 py-2">검색 중...</p>';

        // 디바운스: 300ms 동안 추가 입력이 없으면 API 호출
        searchTimer = setTimeout(async () => {
            try {
                searchController = new AbortController();
                const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&limit=8`, {
                    signal: searchController.signal
                });
                const data = await res.json();

                if (!data.success || !Array.isArray(data.products) || data.products.length === 0) {
                    resultsContainer.innerHTML = '<p class="text-sm text-gray-400 py-4">검색 결과가 없습니다.</p>';
                    return;
                }

                // 결과 렌더링 — 상품 카드 8개까지 표시, 클릭 시 detail.html로 이동
                resultsContainer.innerHTML = data.products.map(p => {
                    const thumb = p.thumbnail || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="%23f3f4f6"/></svg>';
                    const cat = p.categoryName || '';
                    const price = (p.price || 0).toLocaleString();
                    return `
                        <a href="detail.html?id=${p.id}" class="flex items-center space-x-4 p-3 hover:bg-gray-50 rounded-lg transition-colors">
                            <img src="${thumb}" alt="${p.name}" class="w-12 h-12 object-cover rounded">
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-bold truncate">${p.name}</p>
                                <p class="text-xs text-gray-500">${cat} · ₩${price}</p>
                            </div>
                        </a>
                    `;
                }).join('');
            } catch (err) {
                // AbortError는 무시 (새 입력으로 취소된 경우)
                if (err.name === 'AbortError') return;
                console.error('[header search] 검색 실패:', err);
                resultsContainer.innerHTML = '<p class="text-sm text-red-400 py-4">검색 중 오류가 발생했습니다.</p>';
            }
        }, 300);
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
            closeSearch();
        }
    });
}

/**
 * 헤더의 카트 뱃지를 localStorage('stiz_cart')에서 직접 계산해 반영한다.
 * cart.js가 없는 페이지에서도 정확한 개수가 보이도록 하는 보조 로직.
 */
function syncHeaderCartBadge() {
    try {
        const raw = localStorage.getItem('stiz_cart');
        const cart = raw ? JSON.parse(raw) : [];
        const count = Array.isArray(cart)
            ? cart.reduce((acc, it) => acc + (parseInt(it.qty, 10) || 0), 0)
            : 0;
        const badge = document.querySelector('header .bg-red-600');
        if (badge) {
            badge.innerText = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        }
    } catch (e) {
        console.warn('[header] cart badge sync failed:', e);
    }
}

/**
 * 헤더 유저 아이콘 클릭: stiz_token이 있으면 myshop으로, 없으면 login으로.
 * auth.js가 없는 페이지에서도 동작하도록 localStorage 직접 읽기.
 */
function goToUserPage(e) {
    // 기본 앵커 동작(#으로 이동) 막기
    if (e && e.preventDefault) e.preventDefault();
    // 토큰 유무로 로그인 상태 판별 — 만료 여부는 auth.js가 책임
    const token = localStorage.getItem('stiz_token');
    location.href = token ? 'myshop.html' : 'login.html';
}
