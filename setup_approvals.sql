-- 1. 결재 품의서 메타데이터 테이블 생성
CREATE TABLE IF NOT EXISTS approvals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  doc_date DATE NOT NULL,
  department TEXT,
  author TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE approvals DISABLE ROW LEVEL SECURITY;

-- 2. 결재 품의서 댓글(의견) 테이블 생성
CREATE TABLE IF NOT EXISTS approval_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  approval_id uuid REFERENCES approvals(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE approval_comments DISABLE ROW LEVEL SECURITY;

-- 3. PDF 파일 저장을 위한 Storage Bucket 생성 (이미 있으면 무시됨)
INSERT INTO storage.buckets (id, name, public)
VALUES ('approvals', 'approvals', true)
ON CONFLICT (id) DO NOTHING;

-- Storage 버킷 정책 설정 (누구나 읽고 쓰기 가능하도록 임시 허용)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'approvals' );

CREATE POLICY "Public Insert"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'approvals' );

CREATE POLICY "Public Update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'approvals' );

CREATE POLICY "Public Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'approvals' );
