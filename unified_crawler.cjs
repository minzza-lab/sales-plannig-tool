const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const cron = require('node-cron');
const chalk = require('chalk');
const ora = require('ora');
const boxen = require('boxen');
const Table = require('cli-table3');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// -------------------------------------------------------------
// 유틸리티 및 디자인 함수
// -------------------------------------------------------------
const delay = ms => new Promise(r => setTimeout(r, ms));

const printHeader = (text, borderColor = 'cyan') => {
  console.log('\n' + boxen(chalk.bold.white(text), {
    padding: 1,
    margin: 1,
    borderStyle: 'double',
    borderColor: borderColor,
    align: 'center'
  }));
};

const printStatTable = (stats) => {
  const table = new Table({
    head: [chalk.cyan('작업 항목'), chalk.cyan('성공'), chalk.cyan('실패')],
    colWidths: [20, 10, 10]
  });
  table.push(
    ['VOC 수집', chalk.green(stats.voc.success), chalk.red(stats.voc.error)],
    ['시즌권 수집', chalk.green(stats.seasonPass.success), chalk.red(stats.seasonPass.error)],
    ['패키지 수집', chalk.green(stats.package.success), chalk.red(stats.package.error)]
  );
  console.log(table.toString());
};

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

const cleanDownloads = (downloadPath) => {
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }
  const existingFiles = fs.readdirSync(downloadPath);
  for (const file of existingFiles) {
    if (file.endsWith('.xlsx') || file.endsWith('.xls')) {
      try { fs.unlinkSync(path.join(downloadPath, file)); } catch(e){}
    }
  }
};

// -------------------------------------------------------------
// 단계별 크롤링 모듈
// -------------------------------------------------------------

async function login(page) {
  const spinner = ora({ text: chalk.blue('서버 연결 및 로그인 진행 중...'), color: 'blue' }).start();
  try {
    await page.goto('https://wadm.wellihillipark.com/login', { waitUntil: 'networkidle2' });
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
    
    await delay(4000);
    spinner.succeed(chalk.green.bold('✨ 관리자 시스템 로그인 완료!'));
  } catch (error) {
    spinner.fail(chalk.red.bold(`로그인 실패: ${error.message}`));
    throw error;
  }
}

async function scrapeVOC(page, stats) {
  const spinner = ora({ text: chalk.yellow('VOC 게시판 데이터 수집 중...'), color: 'yellow' }).start();
  try {
    await page.goto('https://wadm.wellihillipark.com/customer/inquiry/list', { waitUntil: 'networkidle2' });
    await delay(3000);
    
    let allLinks = [];
    let currentPage = 1;
    const maxPages = 1; // 최근 1페이지만 크롤링

    while (currentPage <= maxPages) {
      spinner.text = chalk.yellow(`VOC 목록 파싱 중... (페이지 ${currentPage}/${maxPages})`);
      const pageLinks = await page.evaluate(() => {
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
      allLinks.push(...pageLinks);
      if (currentPage >= maxPages) break;
      const nextBtn = await page.$('button[aria-label="Next page"]');
      if (!nextBtn) break;
      const isDisabled = await page.evaluate(el => el.disabled || el.classList.contains('v-pagination__navigation--disabled'), nextBtn);
      if (isDisabled) break;
      await nextBtn.click();
      await delay(2000);
      currentPage++;
    }

    allLinks.reverse();
    spinner.text = chalk.yellow(`VOC 상세 내용 DB 업로드 중... (총 ${allLinks.length}건)`);
    
    for (const item of allLinks) {
      await page.goto(item.url, { waitUntil: 'networkidle2' });
      
      // Vue/Vuetify에 의해 상세 양식이 렌더링될 때까지 안전하게 대기
      try {
        await page.waitForSelector('span.tit', { timeout: 8000 });
      } catch (e) {
        console.log(chalk.red(`[VOC 경고] 상세 페이지 span.tit 요소 대기 타임아웃: ${item.url}`));
      }
      
      const vocData = await page.evaluate(() => {
        const getValByTit = (labelText) => {
          const spans = Array.from(document.querySelectorAll('span.tit'));
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
        const customerName = rawCustomerName.split('(')[0].trim();
        const category = `${getValByTit('서비스')} / ${getValByTit('문의유형')}`;
        const title = getValByTit('제목');
        const vocContent = getValByTit('내용');
        const answer = getValByTit('문의답변') || getValByTit('답변');
        const seq = new URLSearchParams(window.location.search).get('seq');
        return { seq, customerName, category, title, vocContent, answer };
      });
      
      const { error } = await supabase.from('voc_inquiries').upsert({
        seq_id: vocData.seq,
        customer_name: vocData.customerName,
        category: vocData.category,
        title: vocData.title,
        content: vocData.vocContent,
        answer: vocData.answer,
        status: item.status === 'N' ? 'unanswered' : 'answered'
      }, { onConflict: 'seq_id' });
      
      if (error) stats.voc.error++;
      else stats.voc.success++;
    }

    const now = new Date();
    const formattedTime = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    await supabase.from('knowledge_base').delete().eq('title', '[SYSTEM] LAST_SYNC');
    await supabase.from('knowledge_base').insert({
      title: '[SYSTEM] LAST_SYNC',
      content: JSON.stringify({ synced_at: formattedTime, synced_by_name: '자동 수집 봇', synced_by_id: 'auto-bot' }),
      author: 'SYSTEM',
      category: '시스템'
    });

    spinner.succeed(chalk.green(`VOC 크롤링 완료 (성공: ${stats.voc.success}, 실패: ${stats.voc.error})`));
  } catch (error) {
    spinner.fail(chalk.red(`VOC 크롤링 에러: ${error.message}`));
  }
}

async function scrapeSeasonPass(page, downloadPath, stats, isManual) {
  const spinner = ora({ text: chalk.magenta('시즌권 데이터 다운로드 중...'), color: 'magenta' }).start();
  try {
    cleanDownloads(downloadPath);
    await page.goto('https://wadm.wellihillipark.com/order/season/list', { waitUntil: 'networkidle2' });
    await delay(4000);
    
    // 90일 버튼 클릭 (파싱 시 2026-04-15 이전 데이터는 제외됨)
    spinner.text = chalk.magenta('기간 설정(90일) 및 검색 중...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn, span'));
      btns.filter(b => b.innerText && b.innerText.includes('90일')).forEach(b => b.click());
    });
    await delay(1000);
    await page.evaluate(() => {
      const searchBtn = Array.from(document.querySelectorAll('button, div.v-btn, a')).find(b => b.innerText.includes('검색') && !b.innerText.includes('초기화'));
      if (searchBtn) searchBtn.click();
    });

    try {
      await page.waitForFunction(() => !document.querySelector('.v-overlay--active, .v-dialog--active, .loading'), { timeout: 15000 });
    } catch(e){}
    await delay(5000);

    spinner.text = chalk.magenta('엑셀 생성 대기 중 (최대 120초)...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn, a'));
      const excelBtn = btns.find(b => b.innerText.toLowerCase().includes('excel') || b.innerText.includes('다운로드'));
      if (excelBtn) excelBtn.click();
    });

    let excelFile = null;
    for(let i=0; i<60; i++) {
      await delay(2000);
      const files = fs.readdirSync(downloadPath);
      if(!files.some(f => f.endsWith('.crdownload')) && files.some(f => f.endsWith('.xlsx') || f.endsWith('.xls'))) {
        excelFile = files.find(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
        break;
      }
    }
    if (!excelFile) throw new Error('시즌권 엑셀 다운로드 타임아웃!');

    spinner.text = chalk.magenta('엑셀 파싱 및 DB 저장 중...');
    const data = xlsx.utils.sheet_to_json(xlsx.readFile(path.join(downloadPath, excelFile)).Sheets[xlsx.readFile(path.join(downloadPath, excelFile)).SheetNames[0]], { defval: '' });
    
    for (const row of data) {
      const keys = Object.keys(row);
      const getVal = (keywords) => { const key = keys.find(k => keywords.some(kw => k.includes(kw))); return key ? row[key] : ''; };
      
      // 접수번호를 고유 ID로 사용 (주문번호는 패밀리 주문 시 중복됨)
      const orderIdRaw = getVal(['접수번호']) || getVal(['시즌권번호']) || getVal(['주문번호', '예약번호', '결제번호', 'ID']);
      if (!orderIdRaw) continue;
      
      const orderDateStr = getVal(['결제일시', '접수일', '주문일', '거래일']) || new Date().toISOString();
      const paymentDateStr = getVal(['결제일시', '결제일', '승인일']) || orderDateStr;
      const productName = getVal(['상품명', '권종', '품목']) || '시즌권';
      const orderStatus = getVal(['결제여부', '상태', '진행상태']) || '완료';
      const cancelDate = getVal(['취소일시']);
      
      // 날짜 형식 변환: 입력 형식에 관계없이 완벽한 ISO 8601 타임스탬프로 안전 변환
      const toTimestamp = (d) => {
        if (!d) return new Date().toISOString();
        const s = String(d).trim();
        // 날짜 파싱 안전화 (공백 혹은 대시 문자 처리)
        let normalized = s;
        if (!s.includes('T') && s.includes(' ')) {
          normalized = s.replace(' ', 'T') + '+09:00'; // 한국 타임존 보정
        }
        try {
          const dateObj = new Date(normalized);
          if (!isNaN(dateObj.getTime())) {
            return dateObj.toISOString();
          }
        } catch (e) {}
        return new Date().toISOString();
      };
      
      // 2026-04-15 이전 데이터, 1차판매, MTB 제외
      const dateForFilter = String(orderDateStr).substring(0, 10);
      if (dateForFilter < '2026-04-15' || productName.includes('1차판매') || productName.includes('MTB')) continue;
      // 취소/환불 제외 (결제여부 또는 취소일시로 판단)
      if (orderStatus.includes('취소') || orderStatus.includes('환불') || orderStatus.includes('cancel')) continue;
      if (cancelDate && String(cancelDate).trim() !== '') continue;
      
      // 금액: 결제금액 컬럼이 우선이며, 해당 컬럼이 존재할 때 값이 비어있다면 0원으로 간주 (동반인 등)
      const payAmtRaw = getVal(['결제금액']);
      const orderAmtRaw = getVal(['주문금액']);
      let priceRaw = '';
      
      const hasCol = (keywords) => keys.some(k => keywords.some(kw => k.includes(kw)));
      if (hasCol(['결제금액'])) {
        priceRaw = payAmtRaw;
      } else if (hasCol(['주문금액'])) {
        priceRaw = orderAmtRaw;
      } else {
        priceRaw = getVal(['금액', '매출', '단가', '결제액']);
      }
      
      const price = Number(String(priceRaw).replace(/[^0-9]/g, '')) || 0;
      
      // 매출 0원(패밀리 동반인 등)인 데이터 수집 제외
      if (price <= 0) continue;
      
      const { error } = await supabase.from('season_pass_orders').upsert({
        order_id: String(orderIdRaw).trim(),
        order_date: toTimestamp(orderDateStr),
        payment_date: toTimestamp(paymentDateStr),
        product_name: productName,
        recommender: getVal(['추천인', '채널']) || '',
        member_type: getVal(['대/소구분']) || getVal(['대상', '대인', '소인', '구분']) || '',
        customer_name: getVal(['주문자명', '고객명', '이름', '성명']) || '',
        ssn: String(getVal(['주민번호', '생년월일'])),
        phone: String(getVal(['휴대번호', '전화번호', '연락처', '휴대폰'])),
        address: getVal(['주소', '거주지', '기본주소', '상세주소', '배송지']) || '',
        status: orderStatus || '완료',
        price: price
      }, { onConflict: 'order_id' });

      if (error) stats.seasonPass.error++;
      else stats.seasonPass.success++;
    }
    spinner.succeed(chalk.green(`시즌권 크롤링 완료 (성공: ${stats.seasonPass.success}, 실패: ${stats.seasonPass.error})`));
  } catch (error) {
    spinner.fail(chalk.red(`시즌권 크롤링 에러: ${error.message}`));
  }
}

async function scrapePackage(page, downloadPath, stats, isManual) {
  const spinner = ora({ text: chalk.cyan('패키지 데이터 다운로드 중...'), color: 'cyan' }).start();
  try {
    cleanDownloads(downloadPath);
    await page.goto('https://wadm.wellihillipark.com/order/package/list', { waitUntil: 'networkidle2' });
    await delay(4000);
    
    const targetDateBtn = isManual ? '90일' : '일주일';
    spinner.text = chalk.cyan(`기간 설정(${targetDateBtn}) 및 검색 중...`);
    await page.evaluate((btnText) => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn, span'));
      btns.filter(b => b.innerText && b.innerText.includes(btnText)).forEach(b => b.click());
    }, targetDateBtn);
    await delay(1000);
    await page.evaluate(() => {
      const searchBtn = Array.from(document.querySelectorAll('button, div.v-btn, a')).find(b => b.innerText.includes('검색') && !b.innerText.includes('초기화'));
      if (searchBtn) searchBtn.click();
    });

    try {
      await page.waitForFunction(() => !document.querySelector('.v-overlay--active, .v-dialog--active, .loading'), { timeout: 15000 });
    } catch(e){}
    await delay(5000);

    spinner.text = chalk.cyan('엑셀 생성 대기 중 (최대 120초)...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn, a'));
      const excelBtns = btns.filter(b => b.innerText && b.innerText.includes('EXCEL 다운로드') && !b.innerText.includes('세부내역'));
      if (excelBtns.length > 0) excelBtns[0].click();
      else {
        const fallback = btns.find(b => b.innerText && b.innerText.toLowerCase().includes('excel'));
        if (fallback) fallback.click();
      }
    });

    let excelFile = null;
    for(let i=0; i<60; i++) {
      await delay(2000);
      const files = fs.readdirSync(downloadPath);
      if(!files.some(f => f.endsWith('.crdownload')) && files.some(f => f.endsWith('.xlsx') || f.endsWith('.xls'))) {
        excelFile = files.find(f => f.endsWith('.xlsx') || f.endsWith('.xls'));
        break;
      }
    }
    if (!excelFile) throw new Error('패키지 엑셀 다운로드 타임아웃!');

    spinner.text = chalk.cyan('엑셀 파싱 및 DB 저장 중...');
    const workbook = xlsx.readFile(path.join(downloadPath, excelFile));
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
    
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(5, data.length); i++) {
      if (data[i] && data[i].some(cell => typeof cell === 'string' && cell.includes('주문번호'))) { headerRowIndex = i; break; }
    }
    const headers = data[headerRowIndex].map(h => typeof h === 'string' ? h.replace(/\n/g, '') : h);
    const rows = data.slice(headerRowIndex + 1);

    const getColIdx = (keywords) => headers.findIndex(h => h && keywords.some(kw => h.includes(kw)));
    const idx = {
      order: getColIdx(['주문번호']), channel: getColIdx(['채널']), type: getColIdx(['패키지유형', '패키지 유형']),
      name: getColIdx(['패키지명']), resDate: getColIdx(['예약일']), comp: getColIdx(['구성예약번호', '구성', '예약번호']),
      member: getColIdx(['회원유형']), customer: getColIdx(['주문자명', '아이디']), payMethod: getColIdx(['결제구분']),
      orderAmt: getColIdx(['주문금액']), payAmt: getColIdx(['결제금액']), status: getColIdx(['주문상태']), orderDate: getColIdx(['주문일시', '결제일시'])
    };

    for (const row of rows) {
      if (!row || !row[idx.order]) continue;
      const status = row[idx.status] || '';
      if (!status.includes('결제완료') && !status.includes('예약완료')) continue;
      
      const parseAmt = (val) => Number(String(val).replace(/[^0-9-]/g, '')) || 0;
      let oDateStr = row[idx.orderDate] || '';
      if (oDateStr.includes('\n')) oDateStr = oDateStr.split('\n')[0].trim();
      const rawName = row[idx.name] || '';

      const { error } = await supabase.from('package_orders').upsert({
        order_id: String(row[idx.order]).trim(), channel: row[idx.channel] || '', package_type: row[idx.type] || '',
        raw_package_name: rawName, normalized_package_name: normalizePackageName(rawName), reservation_date: String(row[idx.resDate] || ''),
        components: row[idx.comp] || '', member_type: row[idx.member] || '', customer_info: row[idx.customer] || '',
        payment_method: row[idx.payMethod] || '', order_amount: parseAmt(row[idx.orderAmt]), payment_amount: parseAmt(row[idx.payAmt]),
        status: status, order_date: oDateStr
      }, { onConflict: 'order_id' });

      if (error) stats.package.error++;
      else stats.package.success++;
    }
    spinner.succeed(chalk.green(`패키지 크롤링 완료 (성공: ${stats.package.success}, 실패: ${stats.package.error})`));
  } catch (error) {
    spinner.fail(chalk.red(`패키지 크롤링 에러: ${error.message}`));
  }
}

// -------------------------------------------------------------
// 대기(Idle) 애니메이션 모듈
// -------------------------------------------------------------
let idleInterval = null;
const frames = ['.', '..', '...', '::', '::.', '::..'];

function startIdleAnimation() {
  if (idleInterval) return;
  let i = 0;
  console.log(''); // 빈 줄
  idleInterval = setInterval(() => {
    const now = new Date();
    const timeString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const frame = frames[i % frames.length];
    process.stdout.write(`\r  ${chalk.gray(`[${timeString}]`)} ${chalk.cyan(`다음 스케줄 대기 중 작동중 ${frame}`)}    `);
    i++;
  }, 1000); // 1초마다 업데이트
}

function stopIdleAnimation() {
  if (idleInterval) {
    clearInterval(idleInterval);
    idleInterval = null;
    process.stdout.write('\r' + ' '.repeat(80) + '\r'); // 라인 클리어
  }
}

// -------------------------------------------------------------
// 메인 파이프라인
// -------------------------------------------------------------
async function runPipeline(isManual) {
  stopIdleAnimation(); // 파이프라인 시작 시 대기 애니메이션 정지
  
  printHeader('WELLI HILLI UNIFIED CRAWLER v1.0', 'magenta');
  console.log(chalk.gray(`▶ 실행 일시: ${new Date().toLocaleString()}`));
  
  const stats = {
    voc: { success: 0, error: 0 },
    seasonPass: { success: 0, error: 0 },
    package: { success: 0, error: 0 }
  };

  const downloadPath = path.resolve(__dirname, 'downloads');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // 다운로드 및 Alert 처리 세팅
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadPath });
  page.on('dialog', async dialog => { await dialog.dismiss(); });

  try {
    // 1. 공통 로그인
    await login(page);
    console.log(); // 줄바꿈

    // 2. VOC 크롤링
    await scrapeVOC(page, stats);
    console.log();

    // 3. 시즌권 크롤링
    await scrapeSeasonPass(page, downloadPath, stats, isManual);
    console.log();

    // 4. 패키지 크롤링
    await scrapePackage(page, downloadPath, stats, isManual);
    console.log();

    // 5. 결과 요약 출력
    printHeader('크롤링 결과 요약', 'green');
    printStatTable(stats);

  } catch (error) {
    console.error(chalk.bgRed.white.bold('\n 파이프라인 치명적 오류 발생 '), error);
  } finally {
    await browser.close();
    console.log(chalk.gray(`\n▶ 종료 일시: ${new Date().toLocaleString()}`));
    
    // 자동 스케줄러 모드일 경우 종료 후 다시 대기 애니메이션 시작
    if (!isManual) {
      startIdleAnimation();
    }
  }
}

// -------------------------------------------------------------
// 실행 분기 (스케줄러 or 수동)
// -------------------------------------------------------------
const isManual = process.argv.includes('--manual');

if (isManual) {
  console.log(chalk.bgCyan.black.bold(' [ 수동 실행 모드: 최근 90일 데이터 딥 크롤링 ] '));
  runPipeline(true).then(() => {
    console.log(chalk.green('\n✅ 수동 크롤링 작업이 성공적으로 종료되었습니다.'));
    process.exit(0);
  });
} else {
  printHeader('통합 스케줄러 세팅 완료', 'cyan');
  console.log(chalk.cyan('⏰ 매 15분마다 (00, 15, 30, 45분) 전체 크롤링 파이프라인(최근 1주일치)이 자동 실행됩니다.\n'));
  
  runPipeline(false); // 최초 1회 즉시 실행
  
  cron.schedule('*/15 * * * *', () => {
    runPipeline(false);
  });
}
