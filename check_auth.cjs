/**
 * 새 Supabase 프로젝트 연결 테스트 + 회원가입 + 로그인 테스트
 */
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://viboxqkurxzmqykoajhj.supabase.co';
const supabaseAnonKey = 'sb_publishable_CtT1KpWuvMMWwUsJogC4aw_FLvNujg0';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  // 1. DB 연결 테스트
  console.log('=== 1. DB 연결 테스트 ===');
  const { count, error: dbErr } = await supabase
    .from('daily_reports')
    .select('*', { count: 'exact', head: true });
  
  if (dbErr) {
    console.log('❌ DB 연결 실패:', dbErr.message);
    return;
  }
  console.log('✅ DB 연결 성공! (daily_reports 행 수:', count, ')');

  // 2. 테스트 회원가입
  console.log('\n=== 2. 테스트 회원가입 ===');
  const testEmail = 'emp_admin@wellyhilly.com';
  const testPassword = 'admin1234';

  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: {
      data: {
        full_name: '관리자',
        department: '영업기획팀'
      }
    }
  });

  if (signUpErr) {
    console.log('⚠️ 회원가입:', signUpErr.message);
  } else {
    console.log('✅ 회원가입 성공! User ID:', signUpData.user?.id);
  }

  // 3. 로그인 테스트
  console.log('\n=== 3. 로그인 테스트 ===');
  const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (loginErr) {
    console.log('❌ 로그인 실패:', loginErr.message);
  } else {
    console.log('✅ 로그인 성공!');
    console.log('  User ID:', loginData.user?.id);
    console.log('  Email:', loginData.user?.email);
    console.log('  이름:', loginData.user?.user_metadata?.full_name);
    console.log('  부서:', loginData.user?.user_metadata?.department);
  }

  // 4. Storage 버킷 확인
  console.log('\n=== 4. Storage 버킷 확인 ===');
  const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
  if (bucketErr) {
    console.log('⚠️ Storage:', bucketErr.message);
  } else {
    console.log('✅ Storage 버킷:', buckets.map(b => b.name).join(', '));
  }
}

test().then(() => {
  console.log('\n🎉 모든 테스트 완료!');
  process.exit(0);
}).catch(e => {
  console.error('에러:', e);
  process.exit(1);
});
