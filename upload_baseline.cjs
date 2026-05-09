const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const fs = require('fs');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function uploadBaseline() {
  console.log('📤 2025년 기준 데이터를 Supabase에 업로드합니다...');
  const baselineData = JSON.parse(fs.readFileSync('baseline_2025.json', 'utf8'));

  // 기존 데이터가 있다면 삭제 (초기화)
  await supabase.from('season_pass_baseline').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const { data, error } = await supabase
    .from('season_pass_baseline')
    .insert(baselineData);

  if (error) {
    console.error('❌ 업로드 실패:', error.message);
  } else {
    console.log(`✅ 성공적으로 ${baselineData.length}개의 기준점 데이터를 업로드했습니다!`);
  }
}

uploadBaseline();
