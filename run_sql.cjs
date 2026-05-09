const { Client } = require('pg');
const fs = require('fs');

async function runSql() {
  const connectionString = 'postgresql://postgres:4wn2Qdq1UBgp7Sic@db.fqjlsldmalvbikztzmis.supabase.co:5432/postgres';
  const client = new Client({ connectionString });

  try {
    console.log('🔄 DB에 연결 중...');
    await client.connect();
    
    console.log('🔄 SQL 스크립트 실행 중...');
    const sql = fs.readFileSync('supabase_season_pass_schema.sql', 'utf8');
    await client.query(sql);
    
    console.log('✅ 테이블 생성이 완벽하게 완료되었습니다!');
  } catch (err) {
    console.error('❌ SQL 실행 에러:', err);
  } finally {
    await client.end();
  }
}

runSql();
