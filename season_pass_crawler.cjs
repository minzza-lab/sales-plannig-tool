const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const cron = require('node-cron');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runSeasonPassCrawler() {
  console.log('🤖 시즌권 주문 내역 크롤러 시작...');
  const downloadPath = path.resolve(__dirname, 'downloads');
  
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }

  // 폴더 내 기존 엑셀 파일 삭제 (충돌 방지)
  const existingFiles = fs.readdirSync(downloadPath);
  for (const file of existingFiles) {
    if (file.endsWith('.xlsx') || file.endsWith('.xls')) {
      fs.unlinkSync(path.join(downloadPath, file));
    }
  }

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // 다운로드 경로 설정
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath,
  });

  try {
    console.log('1. 로그인 페이지 접속 중...');
    await page.goto('https://wadm.wellihillipark.com/login', { waitUntil: 'networkidle2' });
    
    // 로그인 처리
    const idInputs = await page.$$('input');
    if (idInputs.length >= 2) {
      await idInputs[0].type('20203029', { delay: 50 });
      await idInputs[1].type('0000', { delay: 50 });
    } else {
      await page.type('input[type="text"]', '20203029', { delay: 50 });
      await page.type('input[type="password"]', '0000', { delay: 50 });
    }
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn'));
      const loginBtn = btns.find(b => b.innerText.includes('로그인') || b.innerText.includes('Login'));
      if (loginBtn) loginBtn.click();
      else { const form = document.querySelector('form'); if(form) form.submit(); }
    });
    
    await new Promise(r => setTimeout(r, 4000));
    
    console.log('2. 좌측 메뉴 클릭하여 시즌권 주문 페이지로 이동...');
    
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const orderMenu = elements.find(el => el.textContent && el.textContent.trim() === '주문관리' && el.children.length === 0);
      if (orderMenu) {
        orderMenu.click();
      } else {
        // Fallback
        const links = Array.from(document.querySelectorAll('a, div, span'));
        const link = links.find(el => el.innerText && el.innerText.trim() === '주문관리');
        if (link) link.click();
      }
    });
    
    await new Promise(r => setTimeout(r, 1500)); // 서브메뉴 펼쳐짐 애니메이션 대기
    
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const seasonMenu = elements.find(el => el.textContent && el.textContent.trim() === '시즌권 주문관리' && el.children.length === 0);
      if (seasonMenu) {
        seasonMenu.click();
      } else {
        const links = Array.from(document.querySelectorAll('a, div, span'));
        const link = links.find(el => el.innerText && el.innerText.trim() === '시즌권 주문관리');
        if (link) link.click();
      }
    });

    await new Promise(r => setTimeout(r, 5000)); // 페이지 이동 대기

    console.log(`3. [90일] 버튼 클릭하여 넉넉하게 최근 데이터 조회...`);
    
    // 날짜 설정 (90일 버튼 클릭)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn, span'));
      const days90Btns = btns.filter(b => b.innerText && b.innerText.includes('90일'));
      days90Btns.forEach(b => b.click());
    });
    
    await new Promise(r => setTimeout(r, 1000)); // 버튼 클릭 후 UI 업데이트 대기

    console.log('4. [검색] 버튼 클릭...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn, a'));
      const searchBtn = btns.find(b => b.innerText.includes('검색') && !b.innerText.includes('초기화'));
      if (searchBtn) searchBtn.click();
    });

    console.log('5. 검색 결과 데이터 로딩 대기 (넉넉하게 최대 60초 대기)...');
    
    // Vuetify 로딩 오버레이가 사라질 때까지 대기
    try {
      await page.waitForFunction(() => {
        const activeOverlay = document.querySelector('.v-overlay--active, .v-dialog--active, .loading');
        return !activeOverlay;
      }, { timeout: 40000 });
    } catch (e) {
      console.log('오버레이 대기 타임아웃, 강제 진행합니다.');
    }
    
    await new Promise(r => setTimeout(r, 20000)); // 추가적으로 20초 더 여유있게 무조건 대기

    // DEBUG: 화면 덤프
    await page.screenshot({ path: 'debug_season_pass.png', fullPage: true });
    const domHtml = await page.content();
    fs.writeFileSync('debug_season_pass_dom.html', domHtml);
    console.log('디버그용 스크린샷 및 DOM 저장 완료 (debug_season_pass.png / html)');

    console.log('6. [excel 다운로드] 버튼 클릭...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn, a'));
      const excelBtn = btns.find(b => b.innerText.toLowerCase().includes('excel') || b.innerText.includes('다운로드'));
      if (excelBtn) excelBtn.click();
    });

    console.log('7. 엑셀 파일 다운로드 대기 중...');
    // 다운로드 완료 폴링 대기
    let excelFile = null;
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(r => setTimeout(r, 2000));
      const files = fs.readdirSync(downloadPath);
      // 다운로드 중인 임시 파일(.crdownload 등)이 없을 때
      const downloading = files.some(f => f.endsWith('.crdownload'));
      const found = files.find(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
      
      if (found && !downloading) {
        excelFile = found;
        break;
      }
      attempts++;
    }

    if (!excelFile) {
      throw new Error('엑셀 파일 다운로드 타임아웃!');
    }

    const excelPath = path.join(downloadPath, excelFile);
    console.log(`✅ 엑셀 파일 확인 완료: ${excelFile}`);
    console.log('8. 엑셀 파싱 및 Supabase 업로드 시작...');

    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    // 두번째 행부터가 실제 데이터인 경우가 많으므로 일반적인 JSON 파싱 진행
    const data = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    
    console.log(`총 ${data.length}건의 데이터를 발견했습니다.`);

    let successCount = 0;
    let errorCount = 0;

    for (const row of data) {
      const keys = Object.keys(row);
      const getVal = (keywords) => {
        const key = keys.find(k => keywords.some(kw => k.includes(kw)));
        return key ? row[key] : '';
      };

      // 관리자 엑셀 양식의 열 이름에 맞게 유연하게 대처
      // 기존 '주문번호' 대신 고유한 '접수번호'나 '시즌권번호'를 우선으로 찾음
      const orderIdRaw = getVal(['접수번호', '시즌권번호', '주문번호', '예약번호', '결제번호', 'ID']);
      if (!orderIdRaw) continue; // 고유번호가 없으면 빈 행으로 간주
      
      const orderDateStr = getVal(['접수일', '주문일', '거래일', '결제일시']) || new Date().toISOString();
      const paymentDateStr = getVal(['결제일', '승인일']) || new Date().toISOString();
      const productName = getVal(['상품명', '권종', '품목']) || '시즌권';
      
      // 필터링: 4월 14일 이전 데이터 무시, 1차판매/MTB 무시
      if (orderDateStr < '2026-04-14') continue;
      if (productName.includes('1차판매') || productName.includes('MTB')) continue;
      
      const orderId = String(orderIdRaw).trim();
      const priceRaw = getVal(['금액', '매출', '단가', '결제액']);
      const price = Number(String(priceRaw).replace(/[^0-9]/g, '')) || 0;
      
      const payload = {
        order_id: orderId,
        order_date: orderDateStr,
        payment_date: paymentDateStr,
        product_name: productName,
        recommender: getVal(['추천인', '채널']) || '',
        member_type: getVal(['대/소구분', '대상', '대인', '소인', '구분']) || '',
        customer_name: getVal(['주문자명', '고객명', '이름', '성명']) || '',
        ssn: String(getVal(['주민번호', '생년월일'])),
        phone: String(getVal(['휴대번호', '전화번호', '연락처', '휴대폰'])),
        address: getVal(['주소', '거주지', '기본주소', '상세주소', '배송지']) || '',
        status: getVal(['결제여부', '상태', '진행상태']) || '완료',
        price: price
      };

      const { error } = await supabase
        .from('season_pass_orders')
        .upsert(payload, { onConflict: 'order_id' });

      if (error) {
        errorCount++;
      } else {
        successCount++;
      }
    }

    console.log(`🎉 모든 작업 완료! (성공: ${successCount}건, 실패: ${errorCount}건)`);

  } catch (error) {
    console.error('❌ 크롤러 런타임 오류:', error);
  } finally {
    await browser.close();
  }
}

console.log('⏰ 스케줄러 세팅 완료. 15분마다 크롤러가 자동으로 실행됩니다.');
// 스크립트 실행 시 최초 1회 즉시 실행
runSeasonPassCrawler();

// 이후 매 15분마다 반복 실행 (예: 0분, 15분, 30분, 45분)
cron.schedule('*/15 * * * *', () => {
  console.log(`\n[${new Date().toLocaleString()}] 🔄 정기 크롤링 작업을 시작합니다...`);
  runSeasonPassCrawler();
});
