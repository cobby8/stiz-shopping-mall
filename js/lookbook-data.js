/**
 * 제작 사례 갤러리 데이터 (Mock)
 * - lookbook.js에서 이 데이터를 기반으로 카드를 렌더링
 * - 나중에 실제 DB 연동 시 이 파일만 교체하면 됨
 */

// eslint-disable-next-line no-unused-vars
const lookbookItems = [
    {
        id: 1,
        teamName: 'FC 서울 주니어',
        sport: 'soccer',
        sportLabel: '축구',
        image: 'https://images.unsplash.com/photo-1517466787929-bc90951d0974?q=80&w=800&auto=format&fit=crop',
        description: '서울 주니어 리그 공식 유니폼으로 STIZ 커스텀 저지를 선택했습니다. 홈/어웨이 세트와 트레이닝 키트까지 풀 패키지로 제작했습니다.',
        products: ['축구 홈 저지', '축구 어웨이 저지', '트레이닝 키트'],
        year: 2024
    },
    {
        id: 2,
        teamName: 'Seoul Knights',
        sport: 'basketball',
        sportLabel: '농구',
        image: 'https://images.unsplash.com/photo-1546519638-68e109498ee2?q=80&w=800&auto=format&fit=crop',
        description: '서울 나이츠 프로 농구단의 2024 시즌 유니폼입니다. 통기성 좋은 메시 원단에 팀 컬러를 반영한 커스텀 디자인입니다.',
        products: ['농구 홈 저지', '농구 어웨이 저지', '워밍업 셔츠'],
        year: 2024
    },
    {
        id: 3,
        teamName: '강남 배구 클럽',
        sport: 'volleyball',
        sportLabel: '배구',
        image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=800&auto=format&fit=crop',
        description: '강남 지역 배구 클럽의 단체 유니폼입니다. 선수 이름과 번호 커스터마이징을 포함한 30벌 주문이었습니다.',
        products: ['배구 유니폼 세트', '트레이닝 반바지'],
        year: 2024
    },
    {
        id: 4,
        teamName: 'KOGAS 페가수스',
        sport: 'soccer',
        sportLabel: '축구',
        image: 'https://images.unsplash.com/photo-1473042904451-00171c69419d?q=80&w=800&auto=format&fit=crop',
        description: '한국가스공사 축구동호회 공식 유니폼입니다. 기업 로고와 팀 엠블럼을 모두 반영한 프리미엄 디자인입니다.',
        products: ['축구 유니폼', '골키퍼 키트', '팀 점퍼'],
        year: 2024
    },
    {
        id: 5,
        teamName: 'CrossFit Alpha',
        sport: 'etc',
        sportLabel: '기타',
        image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=800&auto=format&fit=crop',
        description: 'CrossFit 대회 참가용 팀 티셔츠입니다. 스판 소재에 대담한 그래픽 디자인을 적용했습니다.',
        products: ['이벤트 티셔츠', '트레이닝 탱크탑'],
        year: 2023
    },
    {
        id: 6,
        teamName: '한양대 농구부',
        sport: 'basketball',
        sportLabel: '농구',
        image: 'https://images.unsplash.com/photo-1628779238951-be2c9f255902?q=80&w=800&auto=format&fit=crop',
        description: '한양대학교 농구부의 리그전 유니폼입니다. 대학 컬러인 블루와 화이트를 기반으로 현대적인 디자인을 적용했습니다.',
        products: ['농구 저지', '워밍업 키트', '팀 백팩'],
        year: 2024
    },
    {
        id: 7,
        teamName: 'FC Galaxy',
        sport: 'soccer',
        sportLabel: '축구',
        image: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f?q=80&w=800&auto=format&fit=crop',
        description: 'FC Galaxy 축구팀의 어웨이 유니폼입니다. 우주 테마의 독특한 패턴으로 상대 팀의 시선을 사로잡습니다.',
        products: ['축구 어웨이 저지', '트레이닝 키트'],
        year: 2023
    },
    {
        id: 8,
        teamName: '부산 이글스',
        sport: 'baseball',
        sportLabel: '야구',
        image: 'https://images.unsplash.com/photo-1544698310-74ea9d188d17?q=80&w=800&auto=format&fit=crop',
        description: '부산 이글스 야구 동호회의 유니폼입니다. 클래식 야구 스타일에 현대적 핏을 더한 디자인입니다.',
        products: ['야구 저지', '야구 캡', '윈드브레이커'],
        year: 2024
    },
    {
        id: 9,
        teamName: 'Urban Runners',
        sport: 'etc',
        sportLabel: '기타',
        image: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?q=80&w=800&auto=format&fit=crop',
        description: '서울 마라톤 동호회의 러닝 유니폼입니다. 초경량 소재와 반사 프린트로 안전성까지 고려했습니다.',
        products: ['러닝 싱글렛', '러닝 반바지', '팀 모자'],
        year: 2023
    },
    {
        id: 10,
        teamName: '인천 유나이티드 U-18',
        sport: 'soccer',
        sportLabel: '축구',
        image: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?q=80&w=800&auto=format&fit=crop',
        description: '인천 유나이티드 유소년 팀의 공식 유니폼입니다. 성인 팀과 동일한 디자인 퀄리티로 유소년 사이즈 전용 제작했습니다.',
        products: ['축구 홈 저지', '축구 어웨이 저지', '트레이닝 세트'],
        year: 2024
    },
    {
        id: 11,
        teamName: '서울 썬더스',
        sport: 'volleyball',
        sportLabel: '배구',
        image: 'https://images.unsplash.com/photo-1612872087720-bb876e2e67d1?q=80&w=800&auto=format&fit=crop',
        description: '서울 썬더스 실업 배구단의 신규 시즌 유니폼입니다. 번개 모티브의 다이내믹한 사이드 패턴이 특징입니다.',
        products: ['배구 홈 저지', '배구 어웨이 저지'],
        year: 2024
    },
    {
        id: 12,
        teamName: '대전 스파크스',
        sport: 'basketball',
        sportLabel: '농구',
        image: 'https://images.unsplash.com/photo-1519861531473-9200262188bf?q=80&w=800&auto=format&fit=crop',
        description: '대전 스파크스 사회인 농구팀의 유니폼입니다. 네온 컬러 포인트로 코트 위에서 돋보이는 디자인입니다.',
        products: ['농구 저지', '농구 반바지', '슈팅 셔츠'],
        year: 2023
    },
    {
        id: 13,
        teamName: '광주 FC 아카데미',
        sport: 'soccer',
        sportLabel: '축구',
        image: 'https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?q=80&w=800&auto=format&fit=crop',
        description: '광주 FC 유소년 아카데미의 트레이닝 키트입니다. 내구성 높은 소재로 격한 훈련에도 끄떡없습니다.',
        products: ['트레이닝 상의', '트레이닝 하의', '팀 조끼'],
        year: 2024
    },
    {
        id: 14,
        teamName: '제주 드래곤즈',
        sport: 'baseball',
        sportLabel: '야구',
        image: 'https://images.unsplash.com/photo-1529768167801-9173d94c2a42?q=80&w=800&auto=format&fit=crop',
        description: '제주도 야구 동호회의 원정 유니폼입니다. 제주 감귤을 모티브로 한 재미있는 디자인이 인기입니다.',
        products: ['야구 원정 저지', '야구 모자'],
        year: 2023
    }
];
