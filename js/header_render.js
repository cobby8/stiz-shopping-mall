/**
 * Common Header Renderer
 * Solves local file:// protocol CORS issues by injecting HTML directly via JS.
 */
document.addEventListener('DOMContentLoaded', () => {
    renderHeader();
    renderFooter();
});

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
            <img src="images/logo_white.png" alt="STIZ Home" class="h-8 md:h-10 w-auto object-contain logo-white ${isMainPage ? '' : 'hidden'}">
            <img src="images/logo_black.png" alt="STIZ Home" class="h-8 md:h-10 w-auto object-contain logo-black ${isMainPage ? 'hidden' : ''}">
        </a>

        <!-- Desktop Navigation (Centered 4-Column Layout) -->
        <nav class="hidden md:flex space-x-12 h-full items-center justify-center flex-1 ml-10">
            
            <!-- 1. BRAND (STIZ) -->
            <div class="group h-full flex items-center relative">
                <a href="#" class="font-bold text-sm tracking-widest hover:text-gray-500 transition-colors py-8 uppercase">STIZ</a>
                <div class="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full w-48 bg-white text-black shadow-lg border border-gray-100 py-4 z-40 text-center">
                    <a href="#" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">브랜드 스토리</a>
                    <a href="#" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">가치 (Values)</a>
                    <a href="lookbook.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">룩북 (Lookbook)</a>
                    <a href="notice.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">오시는 길</a>
                </div>
            </div>

            <!-- 2. TEAMWEAR (Mega Menu) - RESTORED & RENAMED -->
            <div class="group h-full flex items-center relative">
                <a href="list.html?type=custom" class="font-bold text-sm tracking-widest hover:text-gray-500 transition-colors py-8 uppercase text-blue-600">TEAMWEAR</a>
                <div class="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full w-[600px] bg-white text-black shadow-2xl border-t border-black py-8 z-40">
                    <div class="grid grid-cols-2 gap-8 px-8">
                        <div>
                            <h3 class="font-bold text-lg mb-4 border-b border-black pb-2">팀웨어 제작 (Teamwear)</h3>
                            <ul class="space-y-3 text-sm text-gray-600">
                                <li><a href="list.html?type=custom&category=basketball" class="hover:text-blue-600 font-medium">농구 유니폼 (Basketball)</a></li>
                                <li><a href="list.html?type=custom&category=soccer" class="hover:text-blue-600 font-medium">축구 유니폼 (Soccer)</a></li>
                                <li><a href="list.html?type=custom&category=volleyball" class="hover:text-blue-600 font-medium">배구 유니폼 (Volleyball)</a></li>
                                <!-- Baseball Removed -->
                                <li>
                                    <a href="list.html?type=custom&category=teamwear" class="hover:text-blue-600 font-medium flex items-center">
                                        트레이닝복 / 웜업
                                        <span class="ml-2 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold tracking-wider animate-pulse">NEW</span>
                                    </a>
                                </li>
                            </ul>
                        </div>
                        <div class="bg-gray-50 p-6 rounded-xl">
                            <h3 class="font-bold text-lg mb-4">Design Services</h3>
                            <div class="space-y-3">
                                <a href="inquiry.html" class="block bg-black text-white text-center py-3 text-sm font-bold hover:bg-gray-800 transition-colors">
                                    무료 시안 요청하기
                                </a>
                                <a href="list.html?type=custom" class="block border border-black text-black text-center py-3 text-sm font-bold hover:bg-white transition-colors">
                                    자동 견적 알아보기
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 3. STORE (Dropdown) -->
            <div class="group h-full flex items-center relative">
                <a href="list.html?type=store" class="font-bold text-sm tracking-widest hover:text-gray-500 transition-colors py-8 uppercase">STORE</a>
                <div class="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full w-48 bg-white text-black shadow-lg border border-gray-100 py-4 z-40 text-center">
                    <a href="list.html?type=store&category=sportswear" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">기능성 의류 (Apparel)</a>
                    <a href="list.html?type=store&category=accessories" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">용품 / 장비 (Equipment)</a>
                    <a href="list.html?type=store&category=kogas" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:text-blue-600 font-bold">KOGAS 공식 굿즈</a>
                </div>
            </div>

            <!-- 4. COMMUNITY -->
            <div class="group h-full flex items-center relative">
                <a href="notice.html" class="font-bold text-sm tracking-widest hover:text-gray-500 transition-colors py-8 uppercase">COMMUNITY</a>
                <div class="hidden group-hover:block absolute left-1/2 -translate-x-1/2 top-full w-48 bg-white text-black shadow-lg border border-gray-100 py-4 z-40 text-center">
                    <a href="notice.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">공지사항</a>
                    <a href="inquiry.html" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">문의하기 (Q&A)</a>
                    <a href="#" class="block px-4 py-2 text-sm hover:bg-gray-50 hover:font-bold">구매 후기 (Review)</a>
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
            
            <!-- User -->
            <a href="login.html" class="hover:opacity-70">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            </a>

            <!-- Cart (Store Only Ideally, but kept global) -->
            <a href="basket.html" class="hover:opacity-70 relative">
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
            <!-- TEAMWEAR Mobile Menu - RESTORED & RENAMED -->
            <div>
                <h3 class="font-bold text-gray-400 text-xs mb-2">TEAMWEAR</h3>
                <a href="list.html?type=custom" class="block text-xl font-bold mb-2">팀웨어 제작</a>
                <div class="pl-4 space-y-2 text-sm text-gray-600">
                    <a href="list.html?type=custom&category=soccer" class="block">축구</a>
                    <a href="list.html?type=custom&category=basketball" class="block">농구</a>
                    <!-- Baseball Removed -->
                    <a href="list.html?type=custom&category=teamwear" class="block flex items-center">
                        트레이닝복 / 웜업
                        <span class="ml-2 bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">NEW</span>
                    </a>
                </div>
            </div>
            <div class="border-t pt-4">
                <h3 class="font-bold text-gray-400 text-xs mb-2">STORE</h3>
                <a href="list.html?type=store" class="block text-xl font-bold mb-2">스토어</a>
                 <div class="pl-4 space-y-2 text-sm text-gray-600">
                    <a href="list.html?type=store&category=sportswear" class="block">의류</a>
                    <a href="list.html?type=store&category=accessories" class="block">용품</a>
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
                        We create the best teamwear for your victory. <br>
                        Design your identity with our premium quality gears.
                    </p>
                </div>
                <div class="col-span-1">
                    <h3 class="font-bold text-lg mb-4 text-white">SHOP</h3>
                    <ul class="space-y-2 text-sm text-gray-400">
                        <li><a href="list.html?category=soccer" class="hover:text-white">Soccer</a></li>
                        <li><a href="list.html?category=basketball" class="hover:text-white">Basketball</a></li>
 
                    </ul>
                </div>
                <div class="col-span-1">
                    <h3 class="font-bold text-lg mb-4 text-white">SUPPORT</h3>
                    <ul class="space-y-2 text-sm text-gray-400">
                        <li><a href="notice.html" class="hover:text-white">FAQ</a></li>
                        <li><a href="notice.html" class="hover:text-white">Contact Us</a></li>
                    </ul>
                </div>
                <div class="col-span-1">
                    <h3 class="font-bold text-lg mb-4 text-white">NEWSLETTER</h3>
                     <div class="flex">
                        <input type="email" placeholder="Your email" class="bg-gray-800 text-white px-4 py-2 text-sm w-full">
                        <button class="bg-white text-black px-4 py-2 font-bold text-sm">JOIN</button>
                    </div>
                </div>
            </div>
            <div class="border-t border-gray-800 mt-12 pt-8 text-xs text-gray-500 text-center">
                 &copy; 2024 STIZ Custom Teamwear.
            </div>
        </div>
    `;
}
