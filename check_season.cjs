const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  // 시즌권 주문 수
  const { count, error } = await supabase
    .from('season_pass_orders')
    .select('*', { count: 'exact', head: true });
  console.log('시즌권 총 건수:', count, error ? `에러: ${error.message}` : '');

  // 최근 10건
  const { data } = await supabase
    .from('season_pass_orders')
    .select('order_id, order_date, product_name, customer_name, status, price')
    .order('order_date', { ascending: false })
    .limit(10);
  
  console.log('\n최근 시즌권 주문 10건:');
  if (data) {
    data.forEach(r => {
      console.log(`  ${r.order_date?.substring(0,10)} | ${r.product_name} | ${r.customer_name} | ${r.status} | ${r.price?.toLocaleString()}원`);
    });
  }

  // 상태별 통계
  const { data: allData } = await supabase
    .from('season_pass_orders')
    .select('status');
  if (allData) {
    const statusCount = {};
    allData.forEach(r => {
      const s = r.status || '(없음)';
      statusCount[s] = (statusCount[s] || 0) + 1;
    });
    console.log('\n상태별 분포:', statusCount);
  }
}

check().then(() => process.exit(0));
