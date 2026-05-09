-- 1. 2025년 기준점(Baseline) 테이블
CREATE TABLE IF NOT EXISTS season_pass_baseline (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  category1 VARCHAR(50), -- 특가, 일반(정상), 프로모션 등
  category2 VARCHAR(50), -- 일반, 회원/제휴, 지역주민 등
  category3 VARCHAR(50), -- 개인권, 패밀리권, 프리미엄 등
  target VARCHAR(50),    -- 대인, 소인, 3인권, 4인권 등
  price NUMERIC,         -- 판매단가 (단위: 천원)
  qty_2025 NUMERIC,      -- 2025년 총 수량
  revenue_2025 NUMERIC,  -- 2025년 총 매출 (단위: 천원)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 2026년 크롤링 실시간 결제 데이터 테이블
CREATE TABLE IF NOT EXISTS season_pass_orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id VARCHAR(100) UNIQUE NOT NULL, -- 주문번호 (고유키)
  order_date TIMESTAMP WITH TIME ZONE,    -- 주문일
  payment_date TIMESTAMP WITH TIME ZONE,  -- 결제완료일
  product_name VARCHAR(255),              -- 상품명 (예: [특가] 2026 워터플래닛 시즌패스 - 일반(대인))
  recommender VARCHAR(100),               -- 추천자
  member_type VARCHAR(100),               -- 회원유형
  customer_name VARCHAR(100),             -- 주문자 이름
  ssn VARCHAR(50),                        -- 주민번호 앞자리
  phone VARCHAR(50),                      -- 연락처
  status VARCHAR(50) DEFAULT 'completed', -- 상태
  price NUMERIC,                          -- 실제 결제 금액
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 관리자 대시보드 열람을 위한 정책(RLS) 해제 (빠른 테스트용)
ALTER TABLE season_pass_baseline DISABLE ROW LEVEL SECURITY;
ALTER TABLE season_pass_orders DISABLE ROW LEVEL SECURITY;
