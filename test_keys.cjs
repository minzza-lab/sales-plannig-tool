const fs = require('fs');
const b = JSON.parse(fs.readFileSync('baseline_2025.json', 'utf8'));
const baselineKeys = new Set(b.map(x => `${x.category1}|${x.category2}|${x.category3}|${x.target}`));

const SeasonPassTracker = fs.readFileSync('src/components/SeasonPassTracker.tsx', 'utf8');
// I will just use the orders from DB to see what getMappedCategory produces
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { data } = await supabase.from('season_pass_orders').select('*').eq('status', '결제');
  
  const getMappedCategory = (order) => {
    let cat1 = '일반(정상)';
    let cat2 = '일반';
    let cat3 = '개인권';
    let target = '대 인';

    const name = order.product_name || '';
    const memberType = order.member_type || '';
    const price = Number(order.price) || 0;

    if (name.includes('특가')) cat1 = '특가';
    else if (name.includes('프리미엄')) cat1 = '특별\r\n권종';
    else if (name.includes('프로모션')) cat1 = '프로\r\n모션';

    if (name.endsWith('H') || name.endsWith('D')) cat2 = '일반';
    else if (name.includes('지역주민')) cat2 = '지역\r\n주민';
    else if (name.includes('회원') || name.includes('제휴')) cat2 = '회원\r\n/\r\n제휴';
    else if (name.includes('임직원')) cat2 = '임직원';
    else if (name.includes('AK')) cat2 = 'AK\r\n오프\r\n라인';
    else cat2 = '일반';

    if (name.includes('패밀리')) cat3 = '패밀리권';
    else if (name.includes('커플')) cat3 = '커플권';
    else if (name.includes('프리미엄')) cat3 = '프리미엄 \r\n시즌패스';
    else if (name.includes('임직원')) cat3 = '임직원\r\n시즌패스';
    else cat3 = '개인권';

    if (name.includes('5인')) target = '5인권';
    else if (name.includes('4인')) target = '4인권';
    else if (name.includes('3인')) target = '3인권';
    else if (name.includes('커플') || name.includes('2인')) target = '커플(2인)';
    else if (name.includes('1인')) target = '1인권';
    else {
      if (price === 190000 || price === 190) target = '대 인';
      else if (price === 120000 || price === 120) target = '소 인';
      else if (memberType.includes('소')) target = '소 인';
      else target = '대 인';
    }

    if (cat3.includes('프리미엄') && target === '3인권') target = '4인권';

    return { category1: cat1, category2: cat2, category3: cat3, target };
  };

  let unmapped = 0;
  data.forEach(o => {
    const mapped = getMappedCategory(o);
    const key = `${mapped.category1}|${mapped.category2}|${mapped.category3}|${mapped.target}`;
    if (!baselineKeys.has(key)) {
      unmapped++;
      console.log('Unmapped Key:', key, 'from product:', o.product_name);
    }
  });
  console.log('Total Unmapped:', unmapped, 'out of', data.length);
}
test();
