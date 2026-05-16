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

const normalizePackageName = (name) => {
  if (!name) return '알 수 없음';
  let normalized = name.replace(/\(\d{1,2}\/\d{1,2}\)/g, ''); 
  normalized = normalized.replace(/\s+\d{1,2}\/\d{1,2}(\s*~\s*\d{1,2}\/\d{1,2})?(\s*\(.*?\))?.*$/, '');
  normalized = normalized.replace(/^\d{1,2}\/\d{1,2}(\s*~\s*\d{1,2}\/\d{1,2})?\s*/, '');
  normalized = normalized.replace(/^~\s*\d{1,2}\/\d{1,2}\s*/, '');
  normalized = normalized.replace(/^休,\s*/, '');
  normalized = normalized.replace(/\d{1,2}月웰리(WEEK|DAY)\s*/, '');
  return normalized.trim();
};

async function runPackageCrawler() {
  console.log('📦 패키지 주문 내역 크롤러 시작...');
  const downloadPath = path.resolve(__dirname, 'downloads');
  
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }

  // 폴더 내 기존 엑셀 파일 삭제 (충돌 방지)
  const existingFiles = fs.readdirSync(downloadPath);
  for (const file of existingFiles) {
    if (file.includes('패키지') || file.endsWith('.xlsx') || file.endsWith('.xls')) {
      try { fs.unlinkSync(path.join(downloadPath, file)); } catch(e){}
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
      await idInputs[0].type('20203029', { delay: 30 });
      await idInputs[1].type('0000', { delay: 30 });
    } else {
      await page.type('input[type="text"]', '20203029', { delay: 30 });
      await page.type('input[type="password"]', '0000', { delay: 30 });
    }
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn'));
      const loginBtn = btns.find(b => b.innerText.includes('로그인') || b.innerText.includes('Login'));
      if (loginBtn) loginBtn.click();
      else { const form = document.querySelector('form'); if(form) form.submit(); }
    });
    
    await new Promise(r => setTimeout(r, 4000));
    
    console.log('2. 패키지 주문관리 페이지로 직접 이동...');
    await page.goto('https://wadm.wellihillipark.com/order/package/list', { waitUntil: 'networkidle2' });
    
    await new Promise(r => setTimeout(r, 5000)); 

    console.log('3. [90일] 버튼 클릭하여 최근 3달 데이터 조회...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn, span'));
      const days90Btns = btns.filter(b => b.innerText && b.innerText.includes('90일'));
      days90Btns.forEach(b => b.click());
    });
    
    await new Promise(r => setTimeout(r, 1000)); 

    console.log('4. [검색] 버튼 클릭...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn, a'));
      const searchBtn = btns.find(b => b.innerText.includes('검색') && !b.innerText.includes('초기화'));
      if (searchBtn) searchBtn.click();
    });

    console.log('5. 검색 결과 데이터 로딩 대기...');
    try {
      await page.waitForFunction(() => {
        const activeOverlay = document.querySelector('.v-overlay--active, .v-dialog--active, .loading');
        return !activeOverlay;
      }, { timeout: 40000 });
    } catch (e) {
      console.log('오버레이 대기 타임아웃, 강제 진행합니다.');
    }
    
    await new Promise(r => setTimeout(r, 10000)); 

    console.log('6. [excel 다운로드] 버튼 클릭...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn, a'));
      const excelBtn = btns.find(b => b.innerText.toLowerCase().includes('excel') || b.innerText.includes('다운로드'));
      if (excelBtn) excelBtn.click();
    });

    console.log('7. 엑셀 파일 다운로드 대기 중...');
    let excelFile = null;
    let attempts = 0;
    while (attempts < 30) {
      await new Promise(r => setTimeout(r, 2000));
      const files = fs.readdirSync(downloadPath);
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
    const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(5, data.length); i++) {
      if (data[i] && data[i].some(cell => typeof cell === 'string' && cell.includes('주문번호'))) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = data[headerRowIndex].map(h => typeof h === 'string' ? h.replace(/\n/g, '') : h);
    const rows = data.slice(headerRowIndex + 1);

    const getColIdx = (keywords) => headers.findIndex(h => h && keywords.some(kw => h.includes(kw)));
    const idxOrder = getColIdx(['주문번호']);
    const idxChannel = getColIdx(['채널']);
    const idxType = getColIdx(['패키지유형', '패키지 유형']);
    const idxName = getColIdx(['패키지명']);
    const idxResDate = getColIdx(['예약일']);
    const idxComp = getColIdx(['구성예약번호', '구성', '예약번호']);
    const idxMember = getColIdx(['회원유형']);
    const idxCustomer = getColIdx(['주문자명', '아이디']);
    const idxPayMethod = getColIdx(['결제구분']);
    const idxOrderAmt = getColIdx(['주문금액']);
    const idxPayAmt = getColIdx(['결제금액']);
    const idxStatus = getColIdx(['주문상태']);
    const idxOrderDate = getColIdx(['주문일시', '결제일시']);

    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      if (!row || !row[idxOrder]) continue;
      
      const orderId = String(row[idxOrder]).trim();
      const rawName = row[idxName] || '';
      const status = row[idxStatus] || '';
      
      if (!status.includes('결제완료') && !status.includes('예약완료')) continue;

      const parseAmt = (val) => Number(String(val).replace(/[^0-9-]/g, '')) || 0;
      let oDateStr = row[idxOrderDate] || '';
      if (oDateStr.includes('\n')) oDateStr = oDateStr.split('\n')[0].trim();

      const payload = {
        order_id: orderId,
        channel: row[idxChannel] || '',
        package_type: row[idxType] || '',
        raw_package_name: rawName,
        normalized_package_name: normalizePackageName(rawName),
        reservation_date: String(row[idxResDate] || ''),
        components: row[idxComp] || '',
        member_type: row[idxMember] || '',
        customer_info: row[idxCustomer] || '',
        payment_method: row[idxPayMethod] || '',
        order_amount: parseAmt(row[idxOrderAmt]),
        payment_amount: parseAmt(row[idxPayAmt]),
        status: status,
        order_date: oDateStr
      };

      const { error } = await supabase
        .from('package_orders')
        .upsert(payload, { onConflict: 'order_id' });

      if (error) {
        console.error('Upsert Error for', orderId, error.message);
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

console.log('⏰ 패키지 주문 스케줄러 세팅 완료. 매 시간 30분마다 크롤러가 자동으로 실행됩니다.');
// 최초 1회 즉시 실행
runPackageCrawler();

// 매 시간 30분에 실행
cron.schedule('30 * * * *', () => {
  console.log(`\n[${new Date().toLocaleString()}] 🔄 정기 패키지 주문 크롤링 작업을 시작합니다...`);
  runPackageCrawler();
});
