/**
 * STIZ Analytics - Google Analytics 4 + 네이버 애널리틱스
 *
 * 사용법:
 * 1. GA_MEASUREMENT_ID에 GA4 측정 ID 입력 (예: 'G-XXXXXXXXXX')
 * 2. NAVER_SITE_ID에 네이버 사이트 ID 입력
 * 3. 각 페이지 <head>에 <script src="js/analytics.js"></script> 추가
 */

(function () {
    // ============================================
    // 설정값 — 실제 ID를 입력하세요
    // ============================================
    const GA_MEASUREMENT_ID = ''; // 예: 'G-XXXXXXXXXX'
    const NAVER_SITE_ID = '';     // 네이버 애널리틱스 사이트 ID

    // ============================================
    // Google Analytics 4
    // ============================================
    if (GA_MEASUREMENT_ID) {
        const gaScript = document.createElement('script');
        gaScript.async = true;
        gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
        document.head.appendChild(gaScript);

        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        window.gtag = gtag;
        gtag('js', new Date());
        gtag('config', GA_MEASUREMENT_ID);
    }

    // ============================================
    // 네이버 애널리틱스
    // ============================================
    if (NAVER_SITE_ID) {
        const naScript = document.createElement('script');
        naScript.src = 'https://wcs.naver.net/wcslog.js';
        naScript.onload = function () {
            if (typeof wcs_add !== 'undefined') {
                window.wcs_add = {};
                window.wcs_add['wa'] = NAVER_SITE_ID;
                if (typeof wcs_do === 'function') {
                    wcs_do();
                }
            }
        };
        document.head.appendChild(naScript);
    }

    // ============================================
    // E-Commerce 이벤트 헬퍼
    // ============================================
    window.stizAnalytics = {
        // 상품 조회
        viewProduct: function (product) {
            if (!window.gtag) return;
            gtag('event', 'view_item', {
                currency: 'KRW',
                value: product.price,
                items: [{
                    item_id: product.id,
                    item_name: product.name,
                    item_category: product.category,
                    price: product.price,
                }]
            });
        },

        // 장바구니 추가
        addToCart: function (product, quantity) {
            if (!window.gtag) return;
            gtag('event', 'add_to_cart', {
                currency: 'KRW',
                value: product.price * quantity,
                items: [{
                    item_id: product.id,
                    item_name: product.name,
                    item_category: product.category,
                    price: product.price,
                    quantity: quantity,
                }]
            });
        },

        // 결제 시작
        beginCheckout: function (cart, total) {
            if (!window.gtag) return;
            gtag('event', 'begin_checkout', {
                currency: 'KRW',
                value: total,
                items: cart.map(item => ({
                    item_id: item.id,
                    item_name: item.name,
                    price: item.price,
                    quantity: item.qty,
                }))
            });
        },

        // 구매 완료
        purchase: function (orderData) {
            if (!window.gtag) return;
            gtag('event', 'purchase', {
                transaction_id: orderData.orderNumber,
                value: orderData.total,
                currency: 'KRW',
                shipping: orderData.shippingCost,
                items: orderData.items.map(item => ({
                    item_id: item.id,
                    item_name: item.name,
                    price: item.price,
                    quantity: item.qty,
                }))
            });

            // 네이버 전환 추적
            if (typeof wcs !== 'undefined') {
                var _nasa = {};
                _nasa['cnv'] = wcs.cnv('1', orderData.total.toString());
            }
        },
    };
})();
