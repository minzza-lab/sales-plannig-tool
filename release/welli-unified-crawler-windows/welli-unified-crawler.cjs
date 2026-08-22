const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const puppeteer = require('puppeteer');
const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const APP_NAME = 'WelliHilli Unified Sales Crawler';
const WATERPARK_API_URL = 'https://wapi.wellihillipark.com/sub2/portal/portal.asp';
const ADMIN_BASE_URL = 'https://wadm.wellihillipark.com';

const DEFAULT_RECENT_DAYS = 10;
const DEFAULT_INTERVAL_MINUTES = 15;
const SYNC_REQUEST_POLL_MILLISECONDS = 4000;
const SYNC_REQUEST_MARKER = '[CRAWLER_SYNC]';

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
};

const logDir = path.join(__dirname, 'logs');
const downloadPath = path.join(__dirname, 'downloads');
fs.mkdirSync(logDir, { recursive: true });
fs.mkdirSync(downloadPath, { recursive: true });

function nowKst() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function stamp() {
  return nowKst().toISOString().replace('T', ' ').slice(0, 19);
}

function todayLogPath() {
  return path.join(logDir, `${nowKst().toISOString().slice(0, 10)}.log`);
}

function writeLog(line) {
  fs.appendFileSync(todayLogPath(), `[${stamp()}] ${line}\n`, 'utf8');
}

function say(message, color = 'white') {
  const line = String(message);
  console.log(`${colors[color] || ''}${line}${colors.reset}`);
  writeLog(line.replace(/\x1b\[[0-9;]*m/g, ''));
}

function banner() {
  console.clear();
  console.log(colors.cyan + colors.bold);
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                                                              ║');
  console.log('║          WELLiHILLI UNIFIED AUTO CRAWLER                     ║');
  console.log('║          VOC / 시즌권 / 패키지 / 워터파크 매출 자동 수집       ║');
  console.log('║                                                              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
}

function requireEnv() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    say('환경설정(.env)에 Supabase URL 또는 Key가 없습니다.', 'red');
    say('이 폴더의 .env 파일을 확인해주세요.', 'yellow');
    process.exit(1);
  }

  const adminId = process.env.WELLI_ADMIN_ID || '20203029';
  const adminPw = process.env.WELLI_ADMIN_PASSWORD || '0000';

  return {
    supabase: createClient(url, key),
    adminId,
    adminPw,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const mode = args.find((arg) => !arg.startsWith('--')) || 'watch';
  const has = (name) => args.includes(name);
  const getValue = (name, fallback) => {
    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1]) return args[index + 1];
    const inline = args.find((arg) => arg.startsWith(`${name}=`));
    if (inline) return inline.split('=').slice(1).join('=');
    return fallback;
  };

  return {
    mode,
    days: Math.max(1, Number(getValue('--days', process.env.CRAWLER_RECENT_DAYS || DEFAULT_RECENT_DAYS))),
    interval: Math.max(1, Number(getValue('--interval', process.env.CRAWLER_INTERVAL_MINUTES || DEFAULT_INTERVAL_MINUTES))),
    from: getValue('--from', process.env.CRAWLER_BACKFILL_FROM || '2025-01-01'),
    skipAdmin: has('--skip-admin'),
    skipWaterpark: has('--skip-waterpark'),
  };
}

function toDateParts(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return {
    dbDate: `${yyyy}-${mm}-${dd}`,
    apiDate: `${yyyy}${mm}${dd}`,
  };
}

function getRecentKstDates(daysCount) {
  const dates = [];
  const current = nowKst();
  for (let i = 0; i < daysCount; i += 1) {
    dates.push(toDateParts(new Date(current.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return dates;
}

function getDatesFrom(startDateStr) {
  const start = new Date(`${startDateStr}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) throw new Error(`복구 시작일이 올바르지 않습니다: ${startDateStr}`);

  const dates = [];
  const current = nowKst();
  while (current >= start) {
    dates.push(toDateParts(current));
    current.setUTCDate(current.getUTCDate() - 1);
  }
  return dates;
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanDownloads() {
  fs.mkdirSync(downloadPath, { recursive: true });
  for (const file of fs.readdirSync(downloadPath)) {
    if (file.endsWith('.xlsx') || file.endsWith('.xls') || file.endsWith('.crdownload')) {
      try {
        fs.unlinkSync(path.join(downloadPath, file));
      } catch (error) {
        say(`다운로드 폴더 정리 실패: ${file} (${error.message})`, 'yellow');
      }
    }
  }
}

function normalizePackageName(name) {
  if (!name) return '알 수 없음';
  let normalized = String(name).replace(/\(\d{1,2}\/\d{1,2}\)/g, '');
  normalized = normalized.replace(/\s+\d{1,2}\/\d{1,2}(\s*~\s*\d{1,2}\/\d{1,2})?(\s*\(.*?\))?.*$/, '');
  normalized = normalized.replace(/^\d{1,2}\/\d{1,2}(\s*~\s*\d{1,2}\/\d{1,2})?\s*/, '');
  normalized = normalized.replace(/^~\s*\d{1,2}\/\d{1,2}\s*/, '');
  normalized = normalized.replace(/^休,\s*/, '');
  normalized = normalized.replace(/\d{1,2}月웰리(WEEK|DAY)\s*/, '');
  return normalized.trim();
}

function parseAmount(value) {
  return Number(String(value || '').replace(/[^0-9-]/g, '')) || 0;
}

function toTimestamp(value) {
  if (!value) return new Date().toISOString();
  const raw = String(value).trim();
  const normalized = !raw.includes('T') && raw.includes(' ') ? `${raw.replace(' ', 'T')}+09:00` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function postWaterparkPortal(params) {
  const body = new URLSearchParams(params).toString();
  const response = await fetch(WATERPARK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    },
    body,
  });

  if (!response.ok) throw new Error(`워터파크 API 응답 오류: HTTP ${response.status}`);
  const json = await response.json();
  return Array.isArray(json.datalist) ? json.datalist : [];
}

async function fetchWaterparkSales(apiDate) {
  return postWaterparkPortal({
    p_sale_sdate: apiDate,
    p_sale_edate: apiDate,
    p_upjang_code: '',
    p_sub_code: '',
  });
}

async function fetchWaterparkDetail(apiDate, zonecode) {
  return postWaterparkPortal({
    p_sale_sdate: apiDate,
    p_sale_edate: apiDate,
    p_upjang_code: zonecode,
    p_sub_code: '1',
  });
}

async function collectWaterparkOneDate(supabase, dateInfo) {
  const rawData = await fetchWaterparkSales(dateInfo.apiDate);
  if (rawData.length === 0) {
    say(`  - ${dateInfo.dbDate}: 워터파크 매출 데이터 없음`, 'dim');
    return { skipped: true, amount: 0, quantity: 0, detailCount: 0 };
  }

  let totalAmount = 0;
  let totalQty = 0;
  const chartData = [];
  const tableData = [];

  for (const zoneItem of rawData) {
    const zoneName = zoneItem.zone || '기타';
    const zonePrice = Number(zoneItem.price) || 0;
    const zoneCnt = Number(zoneItem.cnt) || 0;
    totalAmount += zonePrice;
    totalQty += zoneCnt;
    chartData.push({ name: zoneName, amount: zonePrice, quantity: zoneCnt });

    try {
      await delay(60);
      const detailRows = await fetchWaterparkDetail(dateInfo.apiDate, zoneItem.zonecode);
      if (detailRows.length === 0) {
        tableData.push({ category: zoneName, name: `${zoneName} 전체`, quantity: zoneCnt, amount: zonePrice });
        continue;
      }

      const merged = new Map();
      for (const detail of detailRows) {
        const name = detail.sub || '기타';
        const amount = Number(detail.price) || 0;
        const quantity = Number(detail.cnt) || 0;
        const prev = merged.get(name) || { category: zoneName, name, quantity: 0, amount: 0 };
        prev.amount += amount;
        prev.quantity += quantity;
        merged.set(name, prev);
      }
      tableData.push(...merged.values());
    } catch (error) {
      say(`    · ${zoneName} 상세 수집 실패, 구역 합계로 대체: ${error.message}`, 'yellow');
      tableData.push({ category: zoneName, name: `${zoneName} 전체`, quantity: zoneCnt, amount: zonePrice });
    }
  }

  chartData.sort((a, b) => b.amount - a.amount);

  const { error } = await supabase.from('daily_reports').upsert({
    report_date: dateInfo.dbDate,
    report_type: 'REALTIME_SALES',
    data: {
      summary: {
        totalAmount,
        totalQty,
        label: '실시간 총 매출(원)',
        qtyLabel: '실시간 총 발권수',
      },
      chart_data: chartData,
      table_data: tableData,
      updated_at: new Date().toISOString(),
      source: APP_NAME,
    },
  }, { onConflict: 'report_date, report_type' });

  if (error) throw error;
  return { skipped: false, amount: totalAmount, quantity: totalQty, detailCount: tableData.length };
}

async function collectWaterparkDates(supabase, dates, label) {
  say(`\n[워터파크 일일매출] ${label}: ${dates.length}일 확인`, 'cyan');
  const stats = { success: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < dates.length; i += 1) {
    const dateInfo = dates[i];
    say(`[${i + 1}/${dates.length}] ${dateInfo.dbDate} 확인 중...`, 'yellow');
    try {
      const result = await collectWaterparkOneDate(supabase, dateInfo);
      if (result.skipped) {
        stats.skipped += 1;
      } else {
        stats.success += 1;
        say(`  ✓ 저장 완료: ${result.amount.toLocaleString()}원 / ${result.quantity.toLocaleString()}건 / 상세 ${result.detailCount}개`, 'green');
      }
    } catch (error) {
      stats.failed += 1;
      say(`  × 실패: ${error.message}`, 'red');
    }
    await delay(200);
  }

  say(`워터파크 수집 완료: 성공 ${stats.success}일 / 데이터 없음 ${stats.skipped}일 / 실패 ${stats.failed}일`, stats.failed ? 'yellow' : 'green');
  return stats;
}

async function loginAdmin(page, adminId, adminPw) {
  say('\n[관리자 로그인] WADM 접속 중...', 'blue');
  await page.goto(`${ADMIN_BASE_URL}/login`, { waitUntil: 'networkidle2' });
  const inputs = await page.$$('input');
  if (inputs.length >= 2) {
    await inputs[0].click({ clickCount: 3 });
    await inputs[0].type(adminId, { delay: 30 });
    await inputs[1].click({ clickCount: 3 });
    await inputs[1].type(adminPw, { delay: 30 });
  } else {
    await page.type('input[type="text"]', adminId, { delay: 30 });
    await page.type('input[type="password"]', adminPw, { delay: 30 });
  }

  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button, div.v-btn, a'));
    const loginButton = buttons.find((button) => (button.innerText || '').includes('로그인') || (button.innerText || '').includes('Login'));
    if (loginButton) loginButton.click();
    else {
      const form = document.querySelector('form');
      if (form) form.submit();
    }
  });

  await delay(4000);
  say('관리자 로그인 완료', 'green');
}

async function scrapeVOC(page, supabase) {
  const stats = { success: 0, failed: 0 };
  say('\n[VOC] 최근 목록 수집 시작', 'magenta');

  try {
    await page.goto(`${ADMIN_BASE_URL}/customer/inquiry/list`, { waitUntil: 'networkidle2' });
    await delay(3000);

    const links = await page.evaluate(() => {
      const result = [];
      const rows = document.querySelectorAll('tbody tr');
      rows.forEach((row) => {
        const tds = row.querySelectorAll('td');
        if (tds.length >= 6) {
          const checkbox = tds[0].querySelector('input[type="checkbox"]');
          const status = tds[5] ? tds[5].innerText.trim() : 'N';
          if (checkbox && checkbox.value) {
            result.push({ url: `/customer/inquiry/edit?seq=${checkbox.value}`, status });
          }
        }
      });
      return result;
    });

    links.reverse();
    say(`VOC 상세 ${links.length}건 확인`, 'white');

    for (const item of links) {
      try {
        await page.goto(`${ADMIN_BASE_URL}${item.url}`, { waitUntil: 'networkidle2' });
        try {
          await page.waitForSelector('span.tit', { timeout: 8000 });
        } catch (error) {
          say(`  · 상세 화면 대기 초과: ${item.url}`, 'yellow');
        }

        const vocData = await page.evaluate(() => {
          const getValByTit = (labelText) => {
            const spans = Array.from(document.querySelectorAll('span.tit'));
            const targetSpan = spans.find((span) => span.innerText.trim().includes(labelText));
            if (!targetSpan) return '';
            const inputTypeDiv = targetSpan.nextElementSibling;
            if (!inputTypeDiv || !inputTypeDiv.classList.contains('inputType')) return '';
            const input = inputTypeDiv.querySelector('input[type="text"], textarea');
            if (input && input.value) return input.value.trim();
            return inputTypeDiv.innerText.trim();
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
          status: item.status === 'N' ? 'unanswered' : 'answered',
        }, { onConflict: 'seq_id' });

        if (error) throw error;
        stats.success += 1;
      } catch (error) {
        stats.failed += 1;
        say(`  × VOC 저장 실패: ${error.message}`, 'red');
      }
    }

    const now = new Date();
    const formattedTime = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    await supabase.from('knowledge_base').delete().eq('title', '[SYSTEM] LAST_SYNC');
    await supabase.from('knowledge_base').insert({
      title: '[SYSTEM] LAST_SYNC',
      content: JSON.stringify({ synced_at: formattedTime, synced_by_name: '자동 수집 봇', synced_by_id: 'auto-bot' }),
      author: 'SYSTEM',
      category: '시스템',
    });
  } catch (error) {
    stats.failed += 1;
    say(`VOC 수집 오류: ${error.message}`, 'red');
  }

  say(`VOC 완료: 성공 ${stats.success}건 / 실패 ${stats.failed}건`, stats.failed ? 'yellow' : 'green');
  return stats;
}

async function downloadLatestExcel(page, buttonFinder, label) {
  cleanDownloads();
  await buttonFinder();

  let excelFile = null;
  for (let i = 0; i < 60; i += 1) {
    await delay(2000);
    const files = fs.readdirSync(downloadPath);
    if (!files.some((file) => file.endsWith('.crdownload')) && files.some((file) => file.endsWith('.xlsx') || file.endsWith('.xls'))) {
      excelFile = files.find((file) => file.endsWith('.xlsx') || file.endsWith('.xls'));
      break;
    }
  }

  if (!excelFile) throw new Error(`${label} 엑셀 다운로드 타임아웃`);
  return path.join(downloadPath, excelFile);
}

async function scrapeSeasonPass(page, supabase) {
  const stats = { success: 0, failed: 0, skipped: 0 };
  say('\n[시즌권] 주문 데이터 수집 시작', 'magenta');

  try {
    await page.goto(`${ADMIN_BASE_URL}/order/season/list`, { waitUntil: 'networkidle2' });
    await delay(4000);
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, div.v-btn, span'));
      buttons.filter((button) => button.innerText && button.innerText.includes('90일')).forEach((button) => button.click());
    });
    await delay(1000);
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button, div.v-btn, a')).find((el) => el.innerText.includes('검색') && !el.innerText.includes('초기화'));
      if (button) button.click();
    });
    await delay(5000);

    const excelPath = await downloadLatestExcel(page, async () => {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div.v-btn, a'));
        const excelButton = buttons.find((button) => button.innerText.toLowerCase().includes('excel') || button.innerText.includes('다운로드'));
        if (excelButton) excelButton.click();
      });
    }, '시즌권');

    const workbook = xlsx.readFile(excelPath);
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });

    for (const row of rows) {
      try {
        const keys = Object.keys(row);
        const getVal = (keywords) => {
          const key = keys.find((candidate) => keywords.some((keyword) => candidate.includes(keyword)));
          return key ? row[key] : '';
        };
        const hasCol = (keywords) => keys.some((candidate) => keywords.some((keyword) => candidate.includes(keyword)));

        const orderIdRaw = getVal(['접수번호']) || getVal(['시즌권번호']) || getVal(['주문번호', '예약번호', '결제번호', 'ID']);
        if (!orderIdRaw) {
          stats.skipped += 1;
          continue;
        }

        const orderDateStr = getVal(['결제일시', '접수일', '주문일', '거래일']) || new Date().toISOString();
        const paymentDateStr = getVal(['결제일시', '결제일', '승인일']) || orderDateStr;
        const productName = getVal(['상품명', '권종', '품목']) || '시즌권';
        const orderStatus = getVal(['결제여부', '상태', '진행상태']) || '완료';
        const cancelDate = getVal(['취소일시']);
        const dateForFilter = String(orderDateStr).substring(0, 10);

        if (dateForFilter < '2026-04-15' || productName.includes('1차판매') || productName.includes('MTB')) {
          stats.skipped += 1;
          continue;
        }
        if (orderStatus.includes('취소') || orderStatus.includes('환불') || orderStatus.toLowerCase().includes('cancel')) {
          stats.skipped += 1;
          continue;
        }
        if (cancelDate && String(cancelDate).trim() !== '') {
          stats.skipped += 1;
          continue;
        }

        let priceRaw = '';
        if (hasCol(['결제금액'])) priceRaw = getVal(['결제금액']);
        else if (hasCol(['주문금액'])) priceRaw = getVal(['주문금액']);
        else priceRaw = getVal(['금액', '매출', '단가', '결제액']);

        const price = parseAmount(priceRaw);
        if (price <= 0) {
          stats.skipped += 1;
          continue;
        }

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
          price,
        }, { onConflict: 'order_id' });

        if (error) throw error;
        stats.success += 1;
      } catch (error) {
        stats.failed += 1;
        say(`  × 시즌권 행 저장 실패: ${error.message}`, 'red');
      }
    }
  } catch (error) {
    stats.failed += 1;
    say(`시즌권 수집 오류: ${error.message}`, 'red');
  }

  say(`시즌권 완료: 성공 ${stats.success}건 / 제외 ${stats.skipped}건 / 실패 ${stats.failed}건`, stats.failed ? 'yellow' : 'green');
  return stats;
}

async function scrapePackage(page, supabase, isManual) {
  const stats = { success: 0, failed: 0, skipped: 0 };
  say('\n[패키지] 주문 데이터 수집 시작', 'cyan');

  try {
    await page.goto(`${ADMIN_BASE_URL}/order/package/list`, { waitUntil: 'networkidle2' });
    await delay(4000);
    const targetDateButton = isManual ? '90일' : '일주일';
    await page.evaluate((buttonText) => {
      const buttons = Array.from(document.querySelectorAll('button, div.v-btn, span'));
      buttons.filter((button) => button.innerText && button.innerText.includes(buttonText)).forEach((button) => button.click());
    }, targetDateButton);
    await delay(1000);
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('button, div.v-btn, a')).find((el) => el.innerText.includes('검색') && !el.innerText.includes('초기화'));
      if (button) button.click();
    });
    await delay(5000);

    const excelPath = await downloadLatestExcel(page, async () => {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div.v-btn, a'));
        const excelButtons = buttons.filter((button) => button.innerText && button.innerText.includes('EXCEL 다운로드') && !button.innerText.includes('세부내역'));
        if (excelButtons.length > 0) excelButtons[0].click();
        else {
          const fallback = buttons.find((button) => button.innerText && button.innerText.toLowerCase().includes('excel'));
          if (fallback) fallback.click();
        }
      });
    }, '패키지');

    const workbook = xlsx.readFile(excelPath);
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(5, data.length); i += 1) {
      if (data[i] && data[i].some((cell) => typeof cell === 'string' && cell.includes('주문번호'))) {
        headerRowIndex = i;
        break;
      }
    }

    const headers = data[headerRowIndex].map((header) => (typeof header === 'string' ? header.replace(/\n/g, '') : header));
    const rows = data.slice(headerRowIndex + 1);
    const getColIdx = (keywords) => headers.findIndex((header) => header && keywords.some((keyword) => header.includes(keyword)));
    const idx = {
      order: getColIdx(['주문번호']),
      channel: getColIdx(['채널']),
      type: getColIdx(['패키지유형', '패키지 유형']),
      name: getColIdx(['패키지명']),
      resDate: getColIdx(['예약일']),
      comp: getColIdx(['구성예약번호', '구성', '예약번호']),
      member: getColIdx(['회원유형']),
      customer: getColIdx(['주문자명', '아이디']),
      payMethod: getColIdx(['결제구분']),
      orderAmt: getColIdx(['주문금액']),
      payAmt: getColIdx(['결제금액']),
      status: getColIdx(['주문상태']),
      orderDate: getColIdx(['주문일시', '결제일시']),
    };

    for (const row of rows) {
      try {
        if (!row || !row[idx.order]) {
          stats.skipped += 1;
          continue;
        }

        const status = row[idx.status] || '';
        if (!status.includes('결제완료') && !status.includes('예약완료')) {
          stats.skipped += 1;
          continue;
        }

        let orderDate = row[idx.orderDate] || '';
        if (String(orderDate).includes('\n')) orderDate = String(orderDate).split('\n')[0].trim();
        const rawName = row[idx.name] || '';

        const { error } = await supabase.from('package_orders').upsert({
          order_id: String(row[idx.order]).trim(),
          channel: row[idx.channel] || '',
          package_type: row[idx.type] || '',
          raw_package_name: rawName,
          normalized_package_name: normalizePackageName(rawName),
          reservation_date: String(row[idx.resDate] || ''),
          components: row[idx.comp] || '',
          member_type: row[idx.member] || '',
          customer_info: row[idx.customer] || '',
          payment_method: row[idx.payMethod] || '',
          order_amount: parseAmount(row[idx.orderAmt]),
          payment_amount: parseAmount(row[idx.payAmt]),
          status,
          order_date: orderDate,
        }, { onConflict: 'order_id' });

        if (error) throw error;
        stats.success += 1;
      } catch (error) {
        stats.failed += 1;
        say(`  × 패키지 행 저장 실패: ${error.message}`, 'red');
      }
    }
  } catch (error) {
    stats.failed += 1;
    say(`패키지 수집 오류: ${error.message}`, 'red');
  }

  say(`패키지 완료: 성공 ${stats.success}건 / 제외 ${stats.skipped}건 / 실패 ${stats.failed}건`, stats.failed ? 'yellow' : 'green');
  return stats;
}

async function runAdminCrawlers(supabase, adminId, adminPw, options) {
  say('\n[관리자 페이지 크롤러] VOC / 시즌권 수집 시작', 'blue');
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 1000 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath });
  page.on('dialog', async (dialog) => {
    try {
      await dialog.dismiss();
    } catch (error) {
      say(`알림창 처리 실패: ${error.message}`, 'yellow');
    }
  });

  try {
    await loginAdmin(page, adminId, adminPw);
    const voc = await scrapeVOC(page, supabase);
    const season = await scrapeSeasonPass(page, supabase);
    return { voc, season };
  } finally {
    await browser.close();
  }
}

async function runSeasonPassCrawler(supabase, adminId, adminPw) {
  say('\n[원격 요청] 시즌권 주문 수집 시작', 'blue');
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: { width: 1440, height: 1000 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath });
  page.on('dialog', async (dialog) => {
    try {
      await dialog.dismiss();
    } catch (error) {
      say(`알림창 처리 실패: ${error.message}`, 'yellow');
    }
  });

  try {
    await loginAdmin(page, adminId, adminPw);
    return await scrapeSeasonPass(page, supabase);
  } finally {
    await browser.close();
  }
}

async function tableStatus(supabase, table, columns, orderColumn) {
  const { count, error: countError } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (countError) return { table, count: null, latest: null, error: countError.message };

  let query = supabase.from(table).select(columns).limit(1);
  if (orderColumn) query = query.order(orderColumn, { ascending: false });
  const { data, error } = await query;
  return {
    table,
    count,
    latest: error ? null : data?.[0] || null,
    error: error?.message || null,
  };
}

async function printStatus(supabase) {
  say('\n현재 Supabase 수집 상태', 'cyan');
  const rows = await Promise.all([
    tableStatus(supabase, 'daily_reports', 'report_date, report_type, data', 'report_date'),
    tableStatus(supabase, 'voc_inquiries', 'seq_id, title, status', 'created_at'),
    tableStatus(supabase, 'season_pass_orders', 'order_id, product_name, payment_date, price', 'payment_date'),
    tableStatus(supabase, 'package_orders', 'order_id, raw_package_name, order_date, payment_amount', 'order_date'),
  ]);

  for (const row of rows) {
    if (row.error) {
      say(`- ${row.table}: 확인 실패 (${row.error})`, 'yellow');
      continue;
    }
    say(`- ${row.table}: ${Number(row.count || 0).toLocaleString()}건`, 'white');
    if (row.latest) say(`  최근 데이터: ${JSON.stringify(row.latest)}`, 'dim');
  }
}

let running = false;
let checkingSyncRequests = false;

function parseSyncRequest(row) {
  try {
    return { id: row.id, ...JSON.parse(row.synced_by_id) };
  } catch (error) {
    return null;
  }
}

async function updateSyncRequest(supabase, request, values) {
  const next = { ...request, ...values };
  delete next.id;
  const { error } = await supabase
    .from('sync_status')
    .update({ synced_by_id: JSON.stringify(next) })
    .eq('id', request.id);
  if (error) throw error;
  Object.assign(request, values);
}

async function processNextSyncRequest(context, options) {
  if (running || checkingSyncRequests) return;
  checkingSyncRequests = true;

  try {
    const { data: rows, error: findError } = await context.supabase
      .from('sync_status')
      .select('id,synced_by_id,synced_at')
      .eq('synced_by_name', SYNC_REQUEST_MARKER)
      .order('synced_at', { ascending: false })
      .limit(100);

    if (findError) {
      say(`원격 동기화 요청 확인 실패: ${findError.message}`, 'yellow');
      return;
    }
    const pending = (rows || [])
      .map(parseSyncRequest)
      .filter(Boolean)
      .reverse()
      .find((request) => request.status === 'queued' && (request.target !== 'waterpark' || !options.skipWaterpark));
    if (!pending || running) return;

    await updateSyncRequest(context.supabase, pending, {
      status: 'running',
      progress: 5,
      message: '전용 수집 PC가 요청을 확인했습니다.',
      startedAt: new Date().toISOString(),
      error: null,
    });

    running = true;
    say(`\n원격 동기화 요청 시작: ${pending.target} (${pending.id})`, 'cyan');

    try {
      if (pending.target === 'waterpark') {
        await updateSyncRequest(context.supabase, pending, {
          progress: 20,
          message: `최근 ${options.days}일 워터파크 매출을 수집하고 있습니다.`,
        });
        const stats = await collectWaterparkDates(
          context.supabase,
          getRecentKstDates(options.days),
          `원격 요청 · 최근 ${options.days}일`,
        );
        if (stats.failed > 0 && stats.success === 0) throw new Error('워터파크 매출 수집에 실패했습니다.');
      } else if (pending.target === 'season-pass') {
        await updateSyncRequest(context.supabase, pending, {
          progress: 20,
          message: '관리자 시스템에 접속해 최신 시즌권 주문을 수집하고 있습니다.',
        });
        const stats = await runSeasonPassCrawler(context.supabase, context.adminId, context.adminPw);
        if (stats.failed > 0 && stats.success === 0) throw new Error('시즌권 주문 수집에 실패했습니다.');
      } else {
        throw new Error(`지원하지 않는 동기화 대상: ${pending.target}`);
      }

      await updateSyncRequest(context.supabase, pending, {
        status: 'completed',
        progress: 100,
        message: '최신 데이터 동기화가 완료되었습니다.',
        finishedAt: new Date().toISOString(),
        error: null,
      });
      say(`원격 동기화 요청 완료: ${pending.target}`, 'green');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      say(`원격 동기화 요청 실패: ${message}`, 'red');
      try {
        await updateSyncRequest(context.supabase, pending, {
          status: 'failed',
          message: '동기화 중 오류가 발생했습니다.',
          error: message.slice(0, 500),
          finishedAt: new Date().toISOString(),
        });
      } catch (updateError) {
        say(`요청 실패 상태 저장 오류: ${updateError.message}`, 'red');
      }
    } finally {
      running = false;
    }
  } finally {
    checkingSyncRequests = false;
  }
}

async function runOnce(context, options) {
  if (running) {
    say('이전 수집이 아직 진행 중이라 이번 회차는 건너뜁니다.', 'yellow');
    return;
  }

  running = true;
  const started = Date.now();
  say(`\n수집 회차 시작: ${new Date().toLocaleString()}`, 'cyan');

  try {
    if (!options.skipWaterpark) {
      const dates = options.mode === 'backfill' ? getDatesFrom(options.from) : getRecentKstDates(options.days);
      const label = options.mode === 'backfill' ? `전체 복구 ${options.from}~오늘` : `최근 ${options.days}일`;
      await collectWaterparkDates(context.supabase, dates, label);
    }

    if (!options.skipAdmin && options.mode !== 'backfill') {
      await runAdminCrawlers(context.supabase, context.adminId, context.adminPw, options);
    } else if (options.mode === 'backfill') {
      say('backfill 모드는 워터파크 일일매출 과거 복구만 실행합니다. VOC/시즌권/패키지는 once 또는 watch에서 최신 범위로 수집됩니다.', 'yellow');
    }

    await printStatus(context.supabase);
  } catch (error) {
    say(`수집 회차 오류: ${error.stack || error.message}`, 'red');
  } finally {
    const seconds = Math.round((Date.now() - started) / 1000);
    say(`수집 회차 종료: ${seconds}초 소요`, 'cyan');
    running = false;
  }
}

async function main() {
  banner();
  const options = parseArgs();
  const context = requireEnv();

  say(`실행 모드: ${options.mode}`, 'cyan');
  say(`로그 폴더: ${logDir}`, 'dim');
  say(options.skipWaterpark
    ? '수집 대상: VOC / 시즌권 주문 / 패키지 주문 (워터파크 매출은 홈페이지 서버에서 처리)'
    : '수집 대상: VOC / 시즌권 주문 / 패키지 주문 / 워터파크 일일 실시간 매출', 'green');

  if (options.mode === 'status') {
    await printStatus(context.supabase);
    return;
  }

  if (options.mode === 'once' || options.mode === 'manual' || options.mode === 'backfill') {
    await runOnce(context, options);
    return;
  }

  say(`상시 실행: 시작 즉시 1회 수집 후 ${options.interval}분마다 최근 ${options.days}일과 관리자 데이터를 다시 확인합니다.`, 'green');
  say('웹 대시보드의 동기화 요청을 4초마다 확인합니다.', 'green');
  say('창을 닫으면 자동 수집이 멈춥니다. 전용 컴퓨터에서는 이 창을 계속 켜두세요.\n', 'yellow');

  setInterval(() => {
    processNextSyncRequest(context, options).catch((error) => say(`원격 요청 처리 오류: ${error.message}`, 'red'));
  }, SYNC_REQUEST_POLL_MILLISECONDS);

  await runOnce(context, options);
  await processNextSyncRequest(context, options);
  setInterval(() => {
    runOnce(context, options).catch((error) => say(`예약 수집 오류: ${error.message}`, 'red'));
  }, options.interval * 60 * 1000);
}

main().catch((error) => {
  say(`치명적 오류: ${error.stack || error.message}`, 'red');
  process.exitCode = 1;
});
