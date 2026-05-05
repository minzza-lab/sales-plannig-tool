-- Supabase SQL Editor에서 실행해주세요.

CREATE TABLE voc_inquiries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  seq_id TEXT UNIQUE NOT NULL, -- 관리자 페이지의 seq 파라미터 (중복 방지용)
  customer_name TEXT,
  category TEXT,
  title TEXT,
  content TEXT,
  status TEXT DEFAULT 'unanswered',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 누구나 읽고 쓸 수 있도록 RLS 정책 해제 (필요시 보안 설정)
ALTER TABLE voc_inquiries DISABLE ROW LEVEL SECURITY;
