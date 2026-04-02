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

-- users 테이블: 사용자 인증
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  password TEXT,
  role TEXT DEFAULT 'customer',
  joinedAt TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
