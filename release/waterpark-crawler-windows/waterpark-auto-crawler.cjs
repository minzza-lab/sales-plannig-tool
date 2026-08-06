const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const APP_NAME = 'Welli Waterpark Sales Crawler';
const API_URL = 'https://wapi.wellihillipark.com/sub2/portal/portal.asp';
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
fs.mkdirSync(logDir, { recursive: true });

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
  console.log('║        WELLiHILLI WATERPARK SALES AUTO CRAWLER               ║');
  console.log('║        워터파크 매출 자동 수집기                              ║');
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
  return createClient(url, key);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const mode = args.find((arg) => !arg.startsWith('--')) || 'watch';
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
  if (Number.isNaN(start.getTime())) {
    throw new Error(`복구 시작일이 올바르지 않습니다: ${startDateStr}`);
  }

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

async function postPortal(params) {
  const body = new URLSearchParams(params).toString();
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`워터파크 API 응답 오류: HTTP ${response.status}`);
  }

  const json = await response.json();
  return Array.isArray(json.datalist) ? json.datalist : [];
}

async function fetchSalesData(apiDate) {
  return postPortal({
    p_sale_sdate: apiDate,
    p_sale_edate: apiDate,
    p_upjang_code: '',
    p_sub_code: '',
  });
}

async function fetchDetailedSalesData(apiDate, zonecode) {
  return postPortal({
    p_sale_sdate: apiDate,
    p_sale_edate: apiDate,
    p_upjang_code: zonecode,
    p_sub_code: '1',
  });
}

async function collectOneDate(supabase, dateInfo) {
  const rawData = await fetchSalesData(dateInfo.apiDate);

  if (rawData.length === 0) {
    say(`  - ${dateInfo.dbDate}: 매출 데이터 없음`, 'dim');
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
      const detailRows = await fetchDetailedSalesData(dateInfo.apiDate, zoneItem.zonecode);
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

  const row = {
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
  };

  const { error } = await supabase
    .from('daily_reports')
    .upsert(row, { onConflict: 'report_date, report_type' });

  if (error) throw error;

  return { skipped: false, amount: totalAmount, quantity: totalQty, detailCount: tableData.length };
}

async function collectDates(supabase, dates, label) {
  const started = Date.now();
  say(`\n[${label}] 수집 시작: ${dates.length}일`, 'cyan');
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < dates.length; i += 1) {
    const dateInfo = dates[i];
    say(`[${i + 1}/${dates.length}] ${dateInfo.dbDate} 확인 중...`, 'yellow');
    try {
      const result = await collectOneDate(supabase, dateInfo);
      if (result.skipped) {
        skipped += 1;
      } else {
        success += 1;
        say(`  ✓ 저장 완료: ${result.amount.toLocaleString()}원 / ${result.quantity.toLocaleString()}건 / 상세 ${result.detailCount}개`, 'green');
      }
    } catch (error) {
      failed += 1;
      say(`  × 실패: ${error.message}`, 'red');
    }
    await delay(200);
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  say(`\n수집 완료: 성공 ${success}일 / 데이터 없음 ${skipped}일 / 실패 ${failed}일 / ${seconds}초`, failed ? 'yellow' : 'green');
  return { success, skipped, failed };
}

async function printStatus(supabase) {
  const { count, error: countError } = await supabase
    .from('daily_reports')
    .select('*', { count: 'exact', head: true });

  if (countError) throw countError;

  const { data, error } = await supabase
    .from('daily_reports')
    .select('report_date, report_type, data')
    .eq('report_type', 'REALTIME_SALES')
    .order('report_date', { ascending: false })
    .limit(7);

  if (error) throw error;

  say('\n현재 Supabase daily_reports 상태', 'cyan');
  say(`- 전체 행 개수: ${count.toLocaleString()}건`, 'white');
  for (const row of data || []) {
    const summary = row.data?.summary || {};
    say(`- ${row.report_date}: ${Number(summary.totalAmount || 0).toLocaleString()}원 / ${Number(summary.totalQty || 0).toLocaleString()}건`, 'white');
  }
}

let running = false;
let checkingSyncRequests = false;

function parseSyncRequest(row) {
  try {
    return { id: row.id, ...JSON.parse(row.synced_by_id) };
  } catch {
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

async function processNextSyncRequest(supabase, options) {
  if (running || checkingSyncRequests) return;
  checkingSyncRequests = true;

  try {
    const { data: rows, error: findError } = await supabase
      .from('sync_status')
      .select('id,synced_by_id,synced_at')
      .eq('synced_by_name', SYNC_REQUEST_MARKER)
      .order('synced_at', { ascending: false })
      .limit(100);

    if (findError) {
      say(`홈페이지 동기화 요청 확인 실패: ${findError.message}`, 'yellow');
      return;
    }

    const pending = (rows || [])
      .map(parseSyncRequest)
      .filter(Boolean)
      .reverse()
      .find((request) => request.target === 'waterpark' && request.status === 'queued');
    if (!pending || running) return;

    await updateSyncRequest(supabase, pending, {
      status: 'running',
      progress: 10,
      message: '전용 수집 PC가 요청을 확인했습니다.',
      startedAt: new Date().toISOString(),
      error: null,
    });

    running = true;
    say(`\n홈페이지 요청 수집 시작 (${pending.id})`, 'cyan');
    try {
      await updateSyncRequest(supabase, pending, {
        progress: 20,
        message: `최근 ${options.days}일 워터파크 매출을 수집하고 있습니다.`,
      });
      const stats = await collectDates(supabase, getRecentKstDates(options.days), `홈페이지 요청 · 최근 ${options.days}일`);
      if (stats.failed > 0 && stats.success === 0) {
        throw new Error('워터파크 매출 수집에 실패했습니다.');
      }
      await updateSyncRequest(supabase, pending, {
        status: 'completed',
        progress: 100,
        message: '최신 매출 동기화가 완료되었습니다.',
        finishedAt: new Date().toISOString(),
        error: null,
      });
      say('홈페이지 요청 수집 완료', 'green');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      say(`홈페이지 요청 수집 실패: ${message}`, 'red');
      await updateSyncRequest(supabase, pending, {
        status: 'failed',
        message: '동기화 중 오류가 발생했습니다.',
        error: message.slice(0, 500),
        finishedAt: new Date().toISOString(),
      });
    } finally {
      running = false;
    }
  } finally {
    checkingSyncRequests = false;
  }
}

async function runOnce(supabase, options) {
  if (running) {
    say('이전 수집이 아직 진행 중이라 이번 회차는 건너뜁니다.', 'yellow');
    return;
  }
  running = true;
  try {
    const dates = options.mode === 'backfill' ? getDatesFrom(options.from) : getRecentKstDates(options.days);
    await collectDates(supabase, dates, options.mode === 'backfill' ? `전체 복구 ${options.from}~오늘` : `최근 ${options.days}일`);
    try {
      await printStatus(supabase);
    } catch (error) {
      say(`상태 확인 실패: ${error.message}`, 'yellow');
    }
  } finally {
    running = false;
  }
}

async function main() {
  banner();
  const options = parseArgs();
  const supabase = requireEnv();

  say(`실행 모드: ${options.mode}`, 'cyan');
  say(`로그 폴더: ${logDir}`, 'dim');

  if (options.mode === 'status') {
    await printStatus(supabase);
    return;
  }

  if (options.mode === 'once' || options.mode === 'backfill') {
    await runOnce(supabase, options);
    return;
  }

  say(`상시 실행: 시작 즉시 1회 수집 후 ${options.interval}분마다 최근 ${options.days}일을 다시 확인합니다.`, 'green');
  say('홈페이지의 "최신 매출 동기화" 요청을 4초마다 확인합니다.', 'green');
  say('창을 닫으면 자동 수집이 멈춥니다. 전용 컴퓨터에서는 이 창을 계속 켜두세요.\n', 'yellow');

  setInterval(() => {
    processNextSyncRequest(supabase, options).catch((error) => say(`홈페이지 요청 처리 오류: ${error.message}`, 'red'));
  }, SYNC_REQUEST_POLL_MILLISECONDS);

  await runOnce(supabase, options);
  await processNextSyncRequest(supabase, options);
  setInterval(() => {
    runOnce(supabase, options).catch((error) => say(`예약 수집 오류: ${error.message}`, 'red'));
  }, options.interval * 60 * 1000);
}

main().catch((error) => {
  say(`치명적 오류: ${error.message}`, 'red');
  process.exitCode = 1;
});
