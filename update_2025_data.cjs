const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const XLSX = require('xlsx');
const fs = require('fs');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const files = fs.readdirSync('.').filter(f => f.startsWith('2025년') && f.endsWith('매출데이터.xls'));
  
  let upsertData = [];

  for (const file of files) {
    const workbook = XLSX.readFile(file);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    const validRows = json.slice(3).filter(r => r[0] && typeof r[0] === 'string' && r[0].includes('.'));
    
    for (const row of validRows) {
      const report_date = row[0].replace(/\./g, '-');
      const totalQty = Number(row[5]) || 0;
      
      // 입장권 데이터만 가져옴 (row[6] 매표소)
      const admissionSales = Number(row[6]) || 0;
      
      const lockerSales = (Number(row[7]) || 0) + (Number(row[8]) || 0);
      const fbSales = Number(row[16]) || 0;
      const baseRentalSales = Number(row[20]) || 0;
      const rentalSales = baseRentalSales + lockerSales;
      const generalSales = Number(row[23]) || 0;
      const productSales = fbSales + rentalSales + generalSales;
      
      // 1. CUSTOMER_TYPE (입장매출 - 매표소만)
      const summaryRate = { label: '입장매출 총액 (과거)', qtyLabel: '총 발권수', totalAmount: admissionSales, totalQty };
      const chartRate = [{ name: '입장권', amount: admissionSales, quantity: totalQty }];
      const tableRate = [{ category: '과거데이터', name: '입장매출', quantity: totalQty, amount: admissionSales }];
      
      upsertData.push({
        report_date,
        report_type: 'CUSTOMER_TYPE',
        data: {
          summary: summaryRate,
          chart_data: chartRate,
          table_data: tableRate
        }
      });
      
      // 2. HOURLY_SALES (상품/식음매출 - 락커 포함)
      const summaryHourly = { label: '상품판매 총액 (과거)', qtyLabel: '분류 수', totalAmount: productSales, totalQty: 3 };
      const chartHourly = [
        { name: '식음매출', amount: fbSales, quantity: 1 },
        { name: '대여매출(락커포함)', amount: rentalSales, quantity: 1 },
        { name: '일반임대', amount: generalSales, quantity: 1 }
      ].filter(d => d.amount > 0);
      const tableHourly = [
        { category: '과거데이터', name: '식음매출', quantity: 1, amount: fbSales },
        { category: '과거데이터', name: '대여매출(락커포함)', quantity: 1, amount: rentalSales },
        { category: '과거데이터', name: '일반임대', quantity: 1, amount: generalSales }
      ].filter(d => d.amount > 0);
      
      upsertData.push({
        report_date,
        report_type: 'HOURLY_SALES',
        data: {
          summary: summaryHourly,
          chart_data: chartHourly,
          table_data: tableHourly
        }
      });
    }
  }
  
  console.log(`Upserting ${upsertData.length} records...`);
  
  const chunkSize = 50;
  for (let i = 0; i < upsertData.length; i += chunkSize) {
    const chunk = upsertData.slice(i, i + chunkSize);
    const { error } = await supabase.from('daily_reports').upsert(chunk, { onConflict: 'report_date, report_type' });
    if (error) {
      console.error('Error upserting chunk:', error);
    }
  }
  
  console.log('Done.');
}

run();
