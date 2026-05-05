-- 기존 테이블에 answer 컬럼이 없다면 추가합니다.
ALTER TABLE voc_inquiries ADD COLUMN IF NOT EXISTS answer TEXT;
