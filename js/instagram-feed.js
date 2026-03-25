/**
 * 인스타그램 피드 모듈 (Mock)
 * - 실제 Instagram API 없이 가짜 데이터로 피드를 보여줌
 * - 나중에 Instagram Basic Display API 연동 시 데이터 소스만 교체하면 됨
 */
(function () {
    'use strict';

    // --- Mock 인스타그램 게시물 데이터 ---
    // 각 항목은 실제 인스타 포스트와 동일한 구조
    const instagramPosts = [
        {
            id: 'post_1',
            imageUrl: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=600&auto=format&fit=crop',
            caption: '새 시즌 유니폼 도착! 올해도 STIZ와 함께 #STIZ #축구 #팀웨어',
            likes: 234,
            username: 'fc_seoul_jr',
            permalink: '#'
        },
        {
            id: 'post_2',
            imageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ee2?q=80&w=600&auto=format&fit=crop',
            caption: '농구부 새 저지 핏이 미쳤다 #STIZ #농구 #커스텀저지',
            likes: 187,
            username: 'hanyang_basketball',
            permalink: '#'
        },
        {
            id: 'post_3',
            imageUrl: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=600&auto=format&fit=crop',
            caption: '경기 전 단체샷! 우리만의 아이덴티티 #TeamIdentity #STIZ',
            likes: 312,
            username: 'busan_eagles',
            permalink: '#'
        },
        {
            id: 'post_4',
            imageUrl: 'https://images.unsplash.com/photo-1628779238951-be2c9f255902?q=80&w=600&auto=format&fit=crop',
            caption: '트레이닝 키트도 스타일리시하게 #STIZ #트레이닝 #팀복',
            likes: 156,
            username: 'stiz_official',
            permalink: '#'
        },
        {
            id: 'post_5',
            imageUrl: 'https://images.unsplash.com/photo-1515523110800-9415d13b84a8?q=80&w=600&auto=format&fit=crop',
            caption: '승리의 순간을 STIZ와 함께 #Victory #축구유니폼',
            likes: 421,
            username: 'incheon_united_u18',
            permalink: '#'
        },
        {
            id: 'post_6',
            imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=600&auto=format&fit=crop',
            caption: '배구부 신규 유니폼 언박싱 #STIZ #배구 #NewSeason',
            likes: 198,
            username: 'gangnam_volleyball',
            permalink: '#'
        },
        {
            id: 'post_7',
            imageUrl: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?q=80&w=600&auto=format&fit=crop',
            caption: '체육관에서도 스타일은 포기 못해 #STIZ #스포츠웨어',
            likes: 275,
            username: 'crossfit_alpha',
            permalink: '#'
        },
        {
            id: 'post_8',
            imageUrl: 'https://images.unsplash.com/photo-1544698310-74ea9d188d17?q=80&w=600&auto=format&fit=crop',
            caption: '마라톤 대회 완주! 팀복 덕분에 하나된 느낌 #STIZ #마라톤',
            likes: 143,
            username: 'urban_runners',
            permalink: '#'
        }
    ];

    // --- 인스타그램 SVG 아이콘 ---
    // Material Symbols에 인스타 로고가 없으므로 SVG 인라인으로 삽입
    const instagramSvgIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
    </svg>`;

    /**
     * 인스타그램 피드를 지정된 컨테이너에 렌더링
     * @param {string} containerId - 피드가 들어갈 div의 id
     */
    function renderInstagramFeed(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // 가로 스크롤 컨테이너 (snap 스크롤로 카드가 딱딱 맞춰짐)
        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 scrollbar-hide';
        // scrollbar-hide: 스크롤바 숨김 (CSS에서 처리)

        instagramPosts.forEach(post => {
            // 각 카드: 정사각형 이미지 + 호버 시 오버레이
            const card = document.createElement('a');
            card.href = post.permalink;
            card.target = '_blank';
            card.rel = 'noopener';
            // snap-start: 스크롤 시 카드 시작점에 맞춤 / flex-shrink-0: 축소 방지 / w-64: 카드 너비
            card.className = 'snap-start flex-shrink-0 w-64 group relative block rounded-lg overflow-hidden';

            card.innerHTML = `
                <!-- 정사각형 이미지 -->
                <div class="aspect-square w-full bg-gray-100">
                    <img src="${post.imageUrl}" alt="${post.caption}"
                        class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                        loading="lazy">
                </div>
                <!-- 호버 오버레이: 좋아요 수 + 캡션 -->
                <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-4 text-white text-center">
                    <!-- 하트 아이콘 + 좋아요 수 -->
                    <div class="flex items-center gap-2 mb-3">
                        <span class="material-symbols-outlined text-xl">favorite</span>
                        <span class="font-bold text-lg">${post.likes}</span>
                    </div>
                    <!-- 캡션 (2줄까지만 표시) -->
                    <p class="text-xs line-clamp-2 opacity-80">${post.caption}</p>
                    <!-- 유저네임 -->
                    <p class="text-[10px] mt-2 opacity-60">@${post.username}</p>
                </div>
            `;

            scrollWrapper.appendChild(card);
        });

        // CTA 카드: 맨 끝에 "팔로우하기" 카드 추가
        const ctaCard = document.createElement('a');
        ctaCard.href = 'https://www.instagram.com/stiz_official';
        ctaCard.target = '_blank';
        ctaCard.rel = 'noopener';
        ctaCard.className = 'snap-start flex-shrink-0 w-64 group relative block rounded-lg overflow-hidden';
        ctaCard.innerHTML = `
            <div class="aspect-square w-full bg-gray-900 flex flex-col items-center justify-center text-white">
                <div class="mb-4 opacity-80">${instagramSvgIcon}</div>
                <p class="font-bold text-sm mb-1">@stiz_official</p>
                <p class="text-xs text-gray-400">팔로우하고 최신 소식 받기</p>
                <div class="mt-4 px-4 py-2 border border-white rounded-full text-xs font-bold group-hover:bg-white group-hover:text-black transition-colors">
                    Follow Us
                </div>
            </div>
        `;
        scrollWrapper.appendChild(ctaCard);

        container.appendChild(scrollWrapper);
    }

    // --- 초기화 ---
    // DOM 준비 후 인스타 피드 렌더링
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            renderInstagramFeed('instagram-feed-container');
        });
    } else {
        renderInstagramFeed('instagram-feed-container');
    }
})();
