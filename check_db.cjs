require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkDatabase() {
  console.log('🔍 Supabase 데이터베이스 점검 중...\n');

  // 1. VOC 데이터 점검
  const { count: vocCount, error: vocErr } = await supabase
    .from('voc_inquiries')
    .select('*', { count: 'exact', head: true });
    
  const { data: latestVoc } = await supabase
    .from('voc_inquiries')
    .select('seq_id, title, created_at')
    .order('created_at', { ascending: false })
    .limit(1);

  console.log(`[VOC 문의 (voc_inquiries)]`);
  console.log(`- 총 데이터 개수: ${vocErr ? '에러' : vocCount}건`);
  if (latestVoc && latestVoc.length > 0) {
    console.log(`- 가장 최근 데이터: [${latestVoc[0].seq_id}] ${latestVoc[0].title} (입력일시: ${latestVoc[0].created_at})`);
  }
  console.log('');

  // 2. 시즌권 데이터 점검
  const { count: seasonCount, error: seasonErr } = await supabase
    .from('season_pass_orders')
    .select('*', { count: 'exact', head: true });

  const { data: latestSeason } = await supabase
    .from('season_pass_orders')
    .select('order_id, product_name, order_date')
    .order('order_date', { ascending: false })
    .limit(1);

  console.log(`[시즌권 주문 (season_pass_orders)]`);
  console.log(`- 총 데이터 개수: ${seasonErr ? '에러' : seasonCount}건`);
  if (latestSeason && latestSeason.length > 0) {
    console.log(`- 가장 최근 데이터: [${latestSeason[0].order_id}] ${latestSeason[0].product_name} (주문일시: ${latestSeason[0].order_date})`);
  }
  console.log('');

  // 3. 패키지 데이터 점검
  const { count: packageCount, error: packageErr } = await supabase
    .from('package_orders')
    .select('*', { count: 'exact', head: true });

  const { data: latestPackage } = await supabase
    .from('package_orders')
    .select('order_id, raw_package_name, order_date')
    .order('order_date', { ascending: false })
    .limit(1);

  console.log(`[패키지 주문 (package_orders)]`);
  console.log(`- 총 데이터 개수: ${packageErr ? '에러' : packageCount}건`);
  if (packageErr) {
    console.log(`- 오류 상세: ${packageErr.message}`);
  }
  if (latestPackage && latestPackage.length > 0) {
    console.log(`- 가장 최근 데이터: [${latestPackage[0].order_id}] ${latestPackage[0].raw_package_name} (주문일시: ${latestPackage[0].order_date})`);
  }
  console.log('');
}

checkDatabase();
