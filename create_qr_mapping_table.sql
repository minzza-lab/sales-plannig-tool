-- ========================================================
-- 🚀 QR 코드 스캔 매칭 데이터 테이블 생성 SQL (카테고리 및 권종 구분 지원)
-- ========================================================

-- 기존 테이블 삭제
DROP TABLE IF EXISTS qr_mapping_data;

-- 1. QR 매칭 데이터 테이블 생성
CREATE TABLE IF NOT EXISTS qr_mapping_data (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prefix VARCHAR(10) NOT NULL,        -- 접두어 (5자리)
  unique_value TEXT NOT NULL,         -- 상품명 (D열 전체)
  description TEXT DEFAULT '공통',     -- 업장 코드 (E열)
  category VARCHAR(50) DEFAULT '공통', -- 대분류 (시트명: 식음, 발권, RC, 워터)
  ticket_type VARCHAR(100) DEFAULT '일반', -- 권종 구분 (J열)
  discount_info TEXT NULL,            -- 요금 할인 데이터 (식음 시트 K열 전용)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 복합 유니크 제약 (동일한 조건의 레코드 중복 방지)
  CONSTRAINT unique_prefix_desc_cat_type UNIQUE (prefix, description, category, ticket_type)
);

-- 2. 인덱스 생성 (조회 속도 최적화)
CREATE INDEX IF NOT EXISTS idx_qr_mapping_prefix ON qr_mapping_data(prefix);

-- 3. Row Level Security 비활성화
ALTER TABLE qr_mapping_data DISABLE ROW LEVEL SECURITY;

-- 4. 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
