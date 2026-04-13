-- =============================================
-- STIZ Shop SQLite 스키마
-- E-1 마이그레이션: JSON → SQLite
-- 생성일: 2026-04-02
-- =============================================

-- orders 테이블: 핵심 필터 컬럼 + 전체 JSON blob
-- 비유: 서류 봉투 앞면에 핵심 정보를 적고, 봉투 안에 서류 전체를 넣는 구조
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  orderNumber TEXT UNIQUE,
  status TEXT DEFAULT 'design_requested',
  manager TEXT DEFAULT '',
  customerId INTEGER,
  createdAt TEXT,
  orderReceiptDate TEXT,
  updatedAt TEXT,
  data TEXT NOT NULL  -- 전체 주문 객체를 JSON.stringify한 값
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_manager ON orders(manager);
CREATE INDEX IF NOT EXISTS idx_orders_customerId ON orders(customerId);
CREATE INDEX IF NOT EXISTS idx_orders_createdAt ON orders(createdAt);
CREATE INDEX IF NOT EXISTS idx_orders_orderReceiptDate ON orders(orderReceiptDate);
CREATE INDEX IF NOT EXISTS idx_orders_orderNumber ON orders(orderNumber);

-- customers 테이블: 자주 검색하는 필드 + 전체 JSON blob
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  teamName TEXT DEFAULT '',
  dealType TEXT DEFAULT '',
  orderCount INTEGER DEFAULT 0,
  totalSpent REAL DEFAULT 0,
  createdAt TEXT,
  updatedAt TEXT,
  data TEXT NOT NULL  -- 전체 고객 객체 JSON
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_teamName ON customers(teamName);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- order_history 테이블: 주문 상태 변경 이력
CREATE TABLE IF NOT EXISTS order_history (
  id INTEGER PRIMARY KEY,
  orderId INTEGER,
  orderNumber TEXT,
  fromStatus TEXT,
  toStatus TEXT,
  changedBy TEXT,
  memo TEXT DEFAULT '',
  createdAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_history_orderId ON order_history(orderId);

-- activity_log 테이블: 시스템 활동 로그
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY,
  action TEXT,
  details TEXT,  -- JSON 문자열
  userId INTEGER,
  userName TEXT,
  timestamp TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp);

-- sales_goals 테이블: 연도별 매출 목표
CREATE TABLE IF NOT EXISTS sales_goals (
  id TEXT PRIMARY KEY,  -- 연도 문자열 (예: "2026")
  year TEXT,
  annualGoal REAL DEFAULT 0,
  monthlyGoals TEXT DEFAULT '{}',  -- JSON 문자열
  updatedAt TEXT
);

-- order_templates 테이블: 자주 반복되는 주문 설정을 템플릿으로 저장
-- 비유: 워드의 "문서 템플릿" — 매번 빈 문서에서 시작하지 않고, 미리 만든 양식을 불러와 내용만 채우는 것
-- templateData만 JSON 문자열이고 나머지는 일반 컬럼 (sales_goals 패턴)
CREATE TABLE IF NOT EXISTS order_templates (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,            -- 템플릿 이름 (예: "축구 승화전사 기본")
  description TEXT DEFAULT '',   -- 설명 (선택)
  category TEXT DEFAULT '',      -- 분류 (예: "축구", "농구") — 필터용
  templateData TEXT NOT NULL,    -- 저장할 설정 JSON blob
  usageCount INTEGER DEFAULT 0,  -- 사용 횟수 (인기 순 정렬용)
  createdBy TEXT DEFAULT '',     -- 생성자
  createdAt TEXT,
  updatedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_templates_category ON order_templates(category);
CREATE INDEX IF NOT EXISTS idx_order_templates_name ON order_templates(name);

-- settings 테이블: 시스템 설정을 키-값(JSON) 형태로 저장
-- 비유: "시스템 환경설정 파일" — 상품 카탈로그, 배송비 규칙 등 각종 설정을 저장
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,       -- 설정 이름 (예: 'product_catalog')
  value TEXT NOT NULL,        -- 설정 값 (JSON 문자열)
  updatedAt TEXT,            -- 마지막 수정 시각
  updatedBy TEXT             -- 마지막 수정자
);

-- users 테이블: 사용자 인증
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  password TEXT,
  phone TEXT DEFAULT '',           -- 전화번호 (회원가입 시 선택 입력)
  role TEXT DEFAULT 'customer',
  scopes TEXT DEFAULT '',          -- 관리자 권한 범위 (쉼표 구분: 'all', 'design', 'cs', 'production', 'shipping')
  joinedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- =============================================
-- 상품 시스템 테이블 (Phase E-1: 자체 상품 등록/관리)
-- 비유: 쇼핑몰의 "상품 카탈로그 DB" — 카테고리 > 상품 > 옵션/이미지 계층 구조
-- =============================================

-- product_categories: 상품 분류 (대분류/중분류 계층)
-- parentId가 NULL이면 대분류, 값이 있으면 해당 대분류의 중분류
-- 비유: 서점의 "소설 > 추리소설" 같은 2단계 분류
CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,           -- 카테고리 이름 (예: '농구의류', 'SHIRTS')
  slug TEXT UNIQUE,             -- URL용 영문 식별자 (예: 'basketball-apparel')
  parentId INTEGER DEFAULT NULL, -- 대분류의 id (NULL이면 대분류)
  sortOrder INTEGER DEFAULT 0,  -- 정렬 순서
  active INTEGER DEFAULT 1,     -- 활성/비활성 (1=활성, 0=비활성)
  createdAt TEXT,
  updatedAt TEXT,
  FOREIGN KEY (parentId) REFERENCES product_categories(id)
);
CREATE INDEX IF NOT EXISTS idx_product_categories_parentId ON product_categories(parentId);
CREATE INDEX IF NOT EXISTS idx_product_categories_slug ON product_categories(slug);

-- products: 통합 상품 테이블 (기성품 ready + 커스텀 custom)
-- type 필드로 구분: 'ready' = 완제품(BRAND), 'custom' = 주문제작(CUSTOM)
-- 비유: 매장에서 "진열 상품(ready)"과 "주문 제작 상품(custom)"을 한 진열장에서 관리
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'ready',  -- 'ready'(기성품) 또는 'custom'(주문제작)
  categoryId INTEGER,                   -- product_categories.id 참조
  name TEXT NOT NULL,                   -- 상품명 (예: '페가수스 어센틱 홈')
  nameEn TEXT DEFAULT '',               -- 영문 상품명
  sku TEXT DEFAULT '',                  -- 제품코드 (예: 'PGS25T1BAL001')
  description TEXT DEFAULT '',          -- 상품 간략 설명
  price INTEGER DEFAULT 0,             -- 판매가 (원 단위, 정수)
  costPrice INTEGER DEFAULT 0,         -- 제조원가
  clubPrice INTEGER DEFAULT 0,         -- 학교스포츠클럽 가격
  wholesalePrice INTEGER DEFAULT 0,    -- 도매가
  sizes TEXT DEFAULT '',               -- 사이즈 범위 (예: 'S~3XL', '5XS~5XL')
  fabric TEXT DEFAULT '',              -- 원단 (예: '어센틱', '플랫백메쉬+')
  keywords TEXT DEFAULT '',            -- 검색 키워드
  customMeta TEXT DEFAULT '{}',        -- 커스텀 전용 메타 (JSON): 등급/패키지/마감 등
  status TEXT DEFAULT 'active',        -- 상품 상태: active/draft/archived
  sortOrder INTEGER DEFAULT 0,
  -- Part 11 확장 컬럼 (stiz.kr 완벽 재이전)
  detailHtml TEXT DEFAULT '',          -- 상세 설명 HTML (이미지 로컬 경로로 치환된 상태)
  origin TEXT DEFAULT '',              -- 원산지 (예: '대한민국', '중국 OEM')
  brand TEXT DEFAULT '',               -- 브랜드 (예: 'STIZ')
  modelName TEXT DEFAULT '',           -- 모델명 (stiz.kr 상품정보고시)
  manufacturer TEXT DEFAULT '',        -- 제조사 (stiz.kr 상품정보고시)
  isConsultPrice INTEGER DEFAULT 0,    -- 1이면 "상담 후 결제" 상품 (price=0 인 커스텀 주문과 구분)
  createdAt TEXT,
  updatedAt TEXT,
  FOREIGN KEY (categoryId) REFERENCES product_categories(id)
);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_categoryId ON products(categoryId);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

-- product_options: 상품별 옵션 (사이즈, 색상 등)
-- 비유: 옷 한 벌에 달려 있는 "사이즈 S/M/L" 선택지
CREATE TABLE IF NOT EXISTS product_options (
  id INTEGER PRIMARY KEY,
  productId INTEGER NOT NULL,
  optionType TEXT NOT NULL DEFAULT 'size',  -- 옵션 종류: 'size', 'color' 등
  optionValue TEXT NOT NULL,                -- 옵션 값 (예: 'M', 'L', 'XL')
  priceAdjust INTEGER DEFAULT 0,            -- 가격 조정 (추가금/할인)
  stock INTEGER DEFAULT -1,                 -- 재고 (-1 = 무한/주문제작)
  sortOrder INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_options_productId ON product_options(productId);

-- product_images: 상품 이미지
-- 비유: 상품 상세페이지의 "사진 갤러리"
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY,
  productId INTEGER NOT NULL,
  url TEXT NOT NULL,                      -- 이미지 URL 또는 파일 경로
  alt TEXT DEFAULT '',                    -- 대체 텍스트 (접근성)
  isPrimary INTEGER DEFAULT 0,           -- 대표 이미지 여부 (1=대표)
  sortOrder INTEGER DEFAULT 0,
  createdAt TEXT,
  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_images_productId ON product_images(productId);

-- =============================================
-- 리뷰 시스템 테이블 (Phase F: 오픈 전 필수)
-- 비유: 쇼핑몰 상품 페이지 하단의 "구매 후기" 게시판
-- 로그인한 회원만 작성 가능, 별점(1~5) + 텍스트 리뷰
-- =============================================
CREATE TABLE IF NOT EXISTS product_reviews (
  id INTEGER PRIMARY KEY,
  productId INTEGER NOT NULL,         -- 어떤 상품의 리뷰인지
  userId INTEGER NOT NULL,            -- 작성자 (users.id)
  userName TEXT DEFAULT '',           -- 작성자 이름 (스냅샷: 탈퇴해도 유지)
  rating INTEGER NOT NULL DEFAULT 5,  -- 별점 (1~5)
  content TEXT DEFAULT '',            -- 리뷰 내용
  createdAt TEXT,
  updatedAt TEXT,
  FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (userId) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_product_reviews_productId ON product_reviews(productId);
CREATE INDEX IF NOT EXISTS idx_product_reviews_userId ON product_reviews(userId);

-- =============================================
-- 장바구니 테이블 (서버 동기화용)
-- 비유: 마트에서 "내 장바구니"를 카운터에 맡겨두는 것
-- 로그인 사용자만 서버에 장바구니 저장 → 다른 기기에서도 볼 수 있음
-- 비로그인 사용자는 기존처럼 localStorage만 사용 (이 테이블 무관)
-- =============================================
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,              -- 어떤 사용자의 장바구니인지 (users.id)
  productId INTEGER NOT NULL,           -- 상품 ID (products.id)
  name TEXT,                            -- 상품명 스냅샷 (상품 삭제돼도 장바구니에서는 보임)
  price INTEGER DEFAULT 0,             -- 가격 스냅샷
  size TEXT,                            -- 선택한 사이즈
  qty INTEGER DEFAULT 1,               -- 수량
  image TEXT,                           -- 상품 이미지 URL 스냅샷
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now')),
  UNIQUE(userId, productId, size)       -- 같은 사용자+상품+사이즈 조합은 1건만 (수량으로 관리)
);
CREATE INDEX IF NOT EXISTS idx_cart_items_userId ON cart_items(userId);

-- =============================================
-- 게시판 테이블 (공지사항 + 1:1문의 통합)
-- boardType으로 구분: 'notice' = 공지사항(관리자만 작성), 'inquiry' = 1:1문의(회원 작성)
-- 비유: 학교 게시판 — 한쪽은 학교 공지, 한쪽은 학생 질문 코너
-- =============================================
CREATE TABLE IF NOT EXISTS board_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  boardType TEXT NOT NULL,          -- 'notice' 또는 'inquiry'
  title TEXT NOT NULL,              -- 제목
  content TEXT NOT NULL,            -- 본문 내용
  authorName TEXT,                  -- 작성자 이름 (표시용)
  authorEmail TEXT,                 -- 작성자 이메일
  userId INTEGER,                   -- 작성자 users.id (로그인 사용자)
  isSecret INTEGER DEFAULT 0,      -- 비밀글 여부 (1=비밀, 문의에서 사용)
  isAnswered INTEGER DEFAULT 0,    -- 답변 완료 여부 (1=답변됨)
  answer TEXT,                      -- 관리자 답변 내용
  answeredAt TEXT,                  -- 답변 일시
  status TEXT DEFAULT 'active',    -- 상태: active/deleted
  viewCount INTEGER DEFAULT 0,     -- 조회수
  createdAt TEXT DEFAULT (datetime('now')),
  updatedAt TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_board_posts_boardType ON board_posts(boardType);
CREATE INDEX IF NOT EXISTS idx_board_posts_userId ON board_posts(userId);

-- =============================================
-- 위시리스트(찜) 테이블
-- 비유: 쇼핑몰에서 하트 누르면 "관심상품"에 저장되는 것
-- UNIQUE 제약: 같은 사용자가 같은 상품을 중복 찜 불가
-- =============================================
CREATE TABLE IF NOT EXISTS wishlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,          -- 누가 찜했는지 (users.id)
  productId INTEGER NOT NULL,       -- 어떤 상품을 찜했는지 (products.id)
  createdAt TEXT DEFAULT (datetime('now')),
  UNIQUE(userId, productId)         -- 중복 찜 방지
);
CREATE INDEX IF NOT EXISTS idx_wishlists_userId ON wishlists(userId);
CREATE INDEX IF NOT EXISTS idx_wishlists_productId ON wishlists(productId);

-- =============================================
-- 쿠폰 테이블 (#15: 쿠폰/적립금 인프라)
-- 비유: 할인 쿠폰함 — 코드를 입력하면 할인이 적용되는 시스템
-- discountType: 'percent'(정률 할인) 또는 'fixed'(정액 할인)
-- =============================================
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,             -- 쿠폰 코드 (예: 'WELCOME10')
  name TEXT NOT NULL,                    -- 쿠폰 이름 (예: '신규 회원 10% 할인')
  discountType TEXT DEFAULT 'percent',   -- 할인 유형: percent(정률) / fixed(정액)
  discountValue INTEGER NOT NULL,        -- 할인 값 (percent면 10=10%, fixed면 5000=5000원)
  minOrderAmount INTEGER DEFAULT 0,      -- 최소 주문 금액 (이 금액 이상 주문 시만 사용 가능)
  maxDiscount INTEGER,                   -- 최대 할인 금액 (정률 할인 시 상한선)
  usageLimit INTEGER DEFAULT 1,          -- 총 사용 가능 횟수
  usedCount INTEGER DEFAULT 0,           -- 현재까지 사용된 횟수
  expiresAt TEXT,                        -- 만료일시 (NULL이면 무기한)
  isActive INTEGER DEFAULT 1,            -- 활성 상태 (1=사용 가능, 0=비활성)
  createdAt TEXT DEFAULT (datetime('now'))
);

-- =============================================
-- 사용자 적립금(마일리지) 테이블 (#15)
-- 비유: 포인트 통장 — 적립(양수)과 사용(음수)이 기록되는 원장
-- 잔액은 SUM(amount) WHERE userId=?로 계산
-- =============================================
CREATE TABLE IF NOT EXISTS user_mileage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL,               -- 어떤 사용자의 적립금인지
  amount INTEGER NOT NULL,               -- 양수=적립, 음수=사용
  reason TEXT,                           -- 사유 (예: '주문 적립', '쿠폰 사용')
  orderId INTEGER,                       -- 관련 주문 ID (있으면)
  createdAt TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_mileage_userId ON user_mileage(userId);

-- =============================================
-- 뉴스레터 구독자 테이블 (#18)
-- 비유: 매장 앞 "이메일 뉴스 신청" 명단
-- =============================================
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,            -- 구독자 이메일 (중복 방지)
  isActive INTEGER DEFAULT 1,            -- 구독 상태 (1=구독중, 0=구독취소)
  createdAt TEXT DEFAULT (datetime('now'))
);
