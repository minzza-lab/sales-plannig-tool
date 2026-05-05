-- 1. RLS 명시적 비활성화 (다시 한 번)
ALTER TABLE voc_inquiries DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base DISABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE automation_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE automation_comments DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports DISABLE ROW LEVEL SECURITY;

-- 2. 만약을 대비해 '누구나 접근 가능'하도록 강력한 접근 허용 정책(Policy) 추가
-- (RLS가 어쩔 수 없이 켜져있어야 하는 최신 수파베이스 버전을 대비한 안전장치입니다.)
CREATE POLICY "Allow All" ON voc_inquiries FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON knowledge_base FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON knowledge_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON automation_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON automation_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All" ON daily_reports FOR ALL USING (true) WITH CHECK (true);
