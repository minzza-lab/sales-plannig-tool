-- ==========================================
-- 🚀 웰리힐리파크 매출기획 대시보드 통합 초기화 SQL
-- ==========================================

-- 1. VOC 크롤러 데이터 저장소
CREATE TABLE IF NOT EXISTS voc_inquiries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  seq_id TEXT UNIQUE NOT NULL, 
  customer_name TEXT,
  category TEXT,
  title TEXT,
  content TEXT,
  answer TEXT,
  status TEXT DEFAULT 'unanswered',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE voc_inquiries DISABLE ROW LEVEL SECURITY;

-- 2. 매뉴얼 팁 (지식 베이스)
CREATE TABLE IF NOT EXISTS knowledge_base (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT,
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE knowledge_base DISABLE ROW LEVEL SECURITY;

-- 3. 매뉴얼 팁 댓글
CREATE TABLE IF NOT EXISTS knowledge_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tip_id uuid REFERENCES knowledge_base(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE knowledge_comments DISABLE ROW LEVEL SECURITY;

-- 4. 업무 자동화 요청 게시판
CREATE TABLE IF NOT EXISTS automation_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT,
  status TEXT DEFAULT 'pending',
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE automation_requests DISABLE ROW LEVEL SECURITY;

-- 5. 업무 자동화 요청 댓글
CREATE TABLE IF NOT EXISTS automation_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid REFERENCES automation_requests(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE automation_comments DISABLE ROW LEVEL SECURITY;

-- 6. 워터파크 매출 일일 보고서
CREATE TABLE IF NOT EXISTS daily_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL,
  report_type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(report_date, report_type)
);
ALTER TABLE daily_reports DISABLE ROW LEVEL SECURITY;

-- 캐시 새로고침
NOTIFY pgrst, 'reload schema';
