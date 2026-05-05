const puppeteer = require('puppeteer');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabase 설정
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runCrawler() {
  console.log('🤖 웰리힐리 파크 관리자 크롤러 봇 시작...');
  
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  try {
    console.log('1. 로그인 페이지 접속 중...');
    await page.goto('https://wadm.wellihillipark.com/login', { waitUntil: 'networkidle2' });
    // 로그인 폼 입력 (Vue/React 상태 업데이트를 위해 지연 타이핑)
    const idInputs = await page.$$('input');
    if (idInputs.length >= 2) {
      await idInputs[0].type('20203029', { delay: 100 });
      await idInputs[1].type('0000', { delay: 100 });
    } else {
      await page.type('input[type="text"]', '20203029', { delay: 100 });
      await page.type('input[type="password"]', '0000', { delay: 100 });
    }
    
    // 로그인 버튼 찾아서 클릭
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn'));
      const loginBtn = btns.find(b => b.innerText.includes('로그인') || b.innerText.includes('Login'));
      if (loginBtn) {
        loginBtn.click();
      } else {
        const form = document.querySelector('form');
        if (form) form.submit();
      }
    });
    
    console.log('2. 로그인 처리 대기 중...');
    await new Promise(r => setTimeout(r, 4000));
    
    console.log('3. VOC 목록 페이지로 이동...');
    await page.goto('https://wadm.wellihillipark.com/customer/inquiry/list', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000)); // 테이블 렌더링 대기
    
    // 디버깅용 스크린샷 (루트 디렉토리에 저장)
    await page.screenshot({ path: 'debug_list_page.png' });
    const pageTitle = await page.title();
    console.log(`현재 페이지 제목: ${pageTitle}`);

    console.log('4. 테이블 데이터 파싱 중...');
    // 모든 글 링크 추출 (미답변 + 답변완료 모두)
    const allLinks = await page.evaluate(() => {
      const links = [];
      const rows = document.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const tds = row.querySelectorAll('td');
        if (tds.length >= 6) {
          const checkbox = tds[0].querySelector('input[type="checkbox"]');
          const status = tds[5] ? tds[5].innerText.trim() : 'N';
          if (checkbox && checkbox.value) {
            links.push({ url: `https://wadm.wellihillipark.com/customer/inquiry/edit?seq=${checkbox.value}`, status });
          }
        }
      });
      return links;
    });

    console.log(`총 ${allLinks.length}개의 VOC(답변완료 포함)를 발견했습니다.`);
    
    for (const item of allLinks) {
      console.log(`상세 페이지 파싱 중... (${item.url}) - 상태: ${item.status}`);
      await page.goto(item.url, { waitUntil: 'networkidle2' });
      
      const vocData = await page.evaluate(() => {
        const getValByTit = (labelText) => {
          const spans = Array.from(document.querySelectorAll('span.tit'));
          // <i> 태그 등 내부 텍스트 처리를 위해 includes 사용
          const targetSpan = spans.find(span => span.innerText.trim().includes(labelText));
          if (targetSpan) {
            const inputTypeDiv = targetSpan.nextElementSibling;
            if (inputTypeDiv && inputTypeDiv.classList.contains('inputType')) {
              const input = inputTypeDiv.querySelector('input[type="text"], textarea');
              if (input && input.value) return input.value.trim();
              return inputTypeDiv.innerText.trim();
            }
          }
          return '';
        };

        const rawCustomerName = getValByTit('문의자') || getValByTit('성명');
        // "한선경(qaz8624)" -> "한선경" 분리
        const customerName = rawCustomerName.split('(')[0].trim();
        
        const category = `${getValByTit('서비스')} / ${getValByTit('문의유형')}`;
        const title = getValByTit('제목');
        const vocContent = getValByTit('내용');
        const answer = getValByTit('문의답변') || getValByTit('답변');
        
        const urlParams = new URLSearchParams(window.location.search);
        const seq = urlParams.get('seq');

        return { seq, customerName, category, title, vocContent, answer };
      });
      
      const { data, error } = await supabase
        .from('voc_inquiries')
        .upsert({
          seq_id: vocData.seq,
          customer_name: vocData.customerName,
          category: vocData.category,
          title: vocData.title,
          content: vocData.vocContent,
          answer: vocData.answer,
          status: item.status === 'N' ? 'unanswered' : 'answered',
          created_at: new Date().toISOString()
        }, { onConflict: 'seq_id' });
        
      if (error) {
        console.error('DB 저장 에러:', error.message);
      } else {
        console.log(`[저장 완료] ${vocData.title}`);
      }
    }

    // 시스템 동기화 시간 업데이트 (대시보드 표시용)
    const now = new Date();
    const formattedTime = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    // title이 unique 컬럼이 아니므로 기존 레코드를 삭제 후 새로 삽입합니다.
    await supabase.from('knowledge_base').delete().eq('title', '[SYSTEM] LAST_SYNC');
    
    await supabase.from('knowledge_base').insert({
      title: '[SYSTEM] LAST_SYNC',
      content: JSON.stringify({
        synced_at: formattedTime,
        synced_by_name: '자동 수집 봇',
        synced_by_id: 'auto-bot'
      }),
      author: 'SYSTEM',
      category: '시스템'
    });
    
    console.log('✅ 모든 미답변 VOC 크롤링 및 DB 동기화 완료!');
    
  } catch (err) {
    console.error('크롤링 중 에러 발생:', err);
  } finally {
    await browser.close();
  }
}

runCrawler();
