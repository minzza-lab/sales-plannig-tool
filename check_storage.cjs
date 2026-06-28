/**
 * Supabase 스토리지 및 DB 용량 확인 스크립트
 */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fqjlsldmalvbikztzmis.supabase.co';
const supabaseAnonKey = 'sb_publishable_3RyVZ_wvP1AgT2dcopxHmA_DPQLMEeU';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkStorage() {
  console.log('=== Supabase Storage Bucket 확인 ===\n');
  
  // 1. Storage Buckets 목록
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      console.log('Storage 버킷 조회 에러:', error.message);
    } else if (buckets && buckets.length > 0) {
      console.log(`버킷 수: ${buckets.length}`);
      for (const bucket of buckets) {
        console.log(`\n📦 버킷: ${bucket.name} (public: ${bucket.public})`);
        
        // 버킷 내 파일 목록
        try {
          const { data: files, error: listError } = await supabase.storage
            .from(bucket.name)
            .list('', { limit: 1000 });
          
          if (listError) {
            console.log(`  파일 목록 에러: ${listError.message}`);
          } else if (files) {
            let totalSize = 0;
            let fileCount = 0;
            
            for (const file of files) {
              if (file.metadata && file.metadata.size) {
                totalSize += file.metadata.size;
                fileCount++;
              } else if (file.id) {
                // It's a file, not a folder
                fileCount++;
              }
            }
            
            console.log(`  파일/폴더 수: ${files.length}`);
            if (totalSize > 0) {
              console.log(`  총 크기: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
            }
            
            // Show first 20 files
            files.slice(0, 20).forEach(f => {
              const size = f.metadata?.size ? `${(f.metadata.size / 1024).toFixed(1)} KB` : 'folder';
              console.log(`  - ${f.name} (${size})`);
            });
            if (files.length > 20) {
              console.log(`  ... 그 외 ${files.length - 20}개`);
            }
          }
        } catch (e) {
          console.log(`  파일 목록 조회 실패: ${e.message}`);
        }
      }
    } else {
      console.log('Storage 버킷 없음');
    }
  } catch (e) {
    console.log('Storage 접근 에러:', e.message);
  }

  console.log('\n\n=== DB 테이블 데이터 행 수 확인 ===\n');
  
  // 2. 주요 테이블 행 수 확인
  const tables = [
    'daily_sales',
    'hourly_sales', 
    'waterpark_daily_sales',
    'waterpark_hourly_sales',
    'season_pass_sales',
    'voc_records',
    'approval_requests',
    'product_proposals',
    'manual_tips',
    'automation_requests',
    'url_shortener',
    'baseline_2025',
    'sync_status',
    'package_sales',
    'package_daily_sales',
  ];
  
  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        if (error.message.includes('restricted') || error.message.includes('violation')) {
          console.log(`❌ ${table}: 서비스 제한됨 (storage quota exceeded)`);
        } else if (error.code === '42P01' || error.message.includes('does not exist')) {
          // table doesn't exist, skip
        } else {
          console.log(`⚠️ ${table}: ${error.message}`);
        }
      } else {
        console.log(`✅ ${table}: ${count} 행`);
      }
    } catch (e) {
      console.log(`❌ ${table}: ${e.message}`);
    }
  }
}

checkStorage().then(() => {
  console.log('\n완료');
  process.exit(0);
}).catch(e => {
  console.error('스크립트 에러:', e);
  process.exit(1);
});
