require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const parseCustomerType = (json) => {
  const validRows = json.slice(3).filter(row => row[3] && !row[1]?.includes('계') && !row[0]?.includes('계'));
  const chartData = validRows.map(row => ({
    name: String(row[3]).substring(0, 15) + (String(row[3]).length > 15 ? '...' : ''),
    fullName: row[3], quantity: Number(row[4]) || 0, amount: Number(row[5]) || 0,
  })).sort((a, b) => b.amount - a.amount).slice(0, 10);

  return {
    type: 'CUSTOMER_TYPE',
    data: {
      summary: { totalAmount: validRows.reduce((sum, row) => sum + (Number(row[5]) || 0), 0), totalQty: validRows.reduce((sum, row) => sum + (Number(row[4]) || 0), 0), label: '총 매출(원)', qtyLabel: '총 발권수' },
      chart_data: chartData, 
      table_data: validRows.map(row => ({ category: row[1], name: row[3], quantity: row[4], amount: row[5] }))
    }
  };
};

const parseHourlySales = (json) => {
  let currentCategory = '';
  const enrichedRows = json.slice(3).map(row => {
    if (row[0]) currentCategory = row[0];
    return {
      category: currentCategory, code: String(row[1] || ''), name: String(row[2] || ''), quantity: Number(row[3]) || 0, amount: Number(row[4]) || 0
    };
  }).filter(r => r.name && !r.code.includes('합계') && !r.name.includes('합계'));

  const validRows = enrichedRows.filter(r => r.category !== '매표소');
  let totalAmount = 0, totalQty = 0;
  const chartData = validRows.map(r => {
    totalAmount += r.amount; totalQty += r.quantity;
    return { name: r.name, amount: r.amount, quantity: r.quantity };
  }).filter(d => d.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 8);

  return {
    type: 'HOURLY_SALES',
    data: {
      summary: { totalAmount, totalQty, label: '상품/식음 매출총액', qtyLabel: '총 판매수량' },
      chart_data: chartData, table_data: validRows
    }
  };
};

const parseRateZone = (json) => {
  const validRows = json.slice(3).filter(row => row[1] && row[1] !== '일 계' && !row[0]?.includes('합 계'));
  let totalAmount = 0, totalQty = 0; const uniqueMap = new Map();
  validRows.forEach(row => {
    const name = String(row[1]).split('-')[1] || row[1];
    if (!uniqueMap.has(name)) {
      const r = [...row].reverse();
      uniqueMap.set(name, { originalRow: row, name, amount: Number(r[0]) || 0, quantity: Number(r[1]) || 0 });
    }
  });

  const chartData = Array.from(uniqueMap.values()).map(item => {
    totalAmount += item.amount; totalQty += item.quantity;
    return { name: item.name, amount: item.amount, quantity: item.quantity };
  }).filter(d => d.amount > 0);

  return {
    type: 'RATE_ZONE',
    data: {
      summary: { totalAmount, totalQty, label: '총 결제금액', qtyLabel: '총 발권수' },
      chart_data: chartData, table_data: Array.from(uniqueMap.values()).map(item => ({ category: '입장권', name: item.originalRow[1], quantity: item.quantity, amount: item.amount }))
    }
  };
};

async function processFile(filename, parseFunc, reportDate) {
  try {
    const workbook = XLSX.readFile(filename);
    const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
    const parsed = parseFunc(json);
    const upsertData = {
      report_date: reportDate,
      report_type: parsed.type,
      data: parsed.data
    };
    const { error } = await supabase.from('daily_reports').upsert([upsertData], { onConflict: 'report_date, report_type' });
    if (error) console.error(`Error for ${filename}:`, error);
    else console.log(`Successfully inserted ${filename}`);
  } catch (e) {
    console.error(`Error reading ${filename}:`, e.message);
  }
}

async function run() {
  const date = '2026-05-04';
  await processFile("고객유형별 발권현황(20260504-20260504).xls", parseCustomerType, date);
  await processFile("2026년 05월04일_전체_실시간매출현황.xls", parseHourlySales, date);
  await processFile("0504 요금대별 발권현황.xls", parseRateZone, date);
}

run();
