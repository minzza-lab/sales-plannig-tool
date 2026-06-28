// Supabase 테이블별 용량 및 행 수 조회 스크립트
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function checkUsage() {
  console.log('=== Supabase 데이터 사용량 점검 ===\n');

  const tables = [
    'voc_inquiries',
    'knowledge_base',
    'knowledge_comments',
    'automation_requests',
    'automation_comments',
    'daily_reports',
    'season_pass_baseline',
    'season_pass_orders',
    'package_orders',
    'waterpark_sales',
    'approvals',
    'approval_comments',
  ];

  for (const table of tables) {
    try {
      // count rows
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        if (error.message.includes('does not exist') || error.code === '42P01') {
          // table doesn't exist, skip
          continue;
        }
        console.log(`❌ ${table}: 조회 오류 - ${error.message}`);
        continue;
      }
      console.log(`📊 ${table}: ${count?.toLocaleString() ?? 0} 행`);
    } catch (e) {
      // skip
    }
  }

  // Storage buckets
  console.log('\n=== Storage 버킷 ===');
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
  if (buckets && !bucketsError) {
    for (const bucket of buckets) {
      console.log(`📁 버킷: ${bucket.name} (public: ${bucket.public})`);
      
      const { data: files, error: filesError } = await supabase.storage
        .from(bucket.name)
        .list('', { limit: 1000 });
      
      if (files && !filesError) {
        let totalSize = 0;
        for (const file of files) {
          if (file.metadata?.size) {
            totalSize += file.metadata.size;
          }
        }
        console.log(`   → 파일 수: ${files.length}개, 총 크기: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      }
    }
  }
}

checkUsage().catch(console.error);
