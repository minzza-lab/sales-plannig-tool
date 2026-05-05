const XLSX = require('xlsx');
const fs = require('fs');

async function run() {
  const files = fs.readdirSync('.').filter(f => f.startsWith('2025년') && f.endsWith('매출데이터.xls'));
  
  let sql = 'ALTER TABLE daily_reports DISABLE ROW LEVEL SECURITY;\n\nINSERT INTO daily_reports (report_date, report_type, summary, chart_data, table_data) VALUES\n';
  let values = [];

  for (const file of files) {
    const workbook = XLSX.readFile(file);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    const validRows = json.slice(3).filter(r => r[0] && typeof r[0] === 'string' && r[0].includes('.'));
    
    validRows.forEach(row => {
      const report_date = row[0].replace(/\./g, '-');
      const totalAmount = Number(row[2]) || 0;
      const totalQty = Number(row[5]) || 0;
      
      const admissionSales = Number(row[9]) || 0;
      const fbSales = Number(row[16]) || 0;
      const rentalSales = Number(row[20]) || 0;
      const generalSales = Number(row[23]) || 0;
      const productSales = fbSales + rentalSales + generalSales;
      
      // 1. RATE_ZONE (입장매출)
      const summaryRate = JSON.stringify({ label: '입장매출 총액 (과거)', qtyLabel: '총 발권수', totalAmount: admissionSales, totalQty });
      const chartRate = JSON.stringify([{ name: '입장권', amount: admissionSales, quantity: totalQty }]);
      const tableRate = JSON.stringify([{ category: '과거데이터', name: '입장매출', quantity: totalQty, amount: admissionSales }]);
      values.push(`('${report_date}', 'RATE_ZONE', '${summaryRate}', '${chartRate}', '${tableRate}')`);
      
      // 2. HOURLY_SALES (상품/식음매출)
      const summaryHourly = JSON.stringify({ label: '상품판매 총액 (과거)', qtyLabel: '분류 수', totalAmount: productSales, totalQty: 3 });
      const chartHourly = JSON.stringify([
        { name: '식음매출', amount: fbSales, quantity: 1 },
        { name: '대여매출', amount: rentalSales, quantity: 1 },
        { name: '일반임대', amount: generalSales, quantity: 1 }
      ].filter(d => d.amount > 0));
      const tableHourly = JSON.stringify([
        { category: '과거데이터', name: '식음매출', quantity: 1, amount: fbSales },
        { category: '과거데이터', name: '대여매출', quantity: 1, amount: rentalSales },
        { category: '과거데이터', name: '일반임대', quantity: 1, amount: generalSales }
      ].filter(d => d.amount > 0));
      values.push(`('${report_date}', 'HOURLY_SALES', '${summaryHourly}', '${chartHourly}', '${tableHourly}')`);
    });
  }
  
  sql += values.join(',\n') + '\nON CONFLICT (report_date, report_type) DO UPDATE SET summary = EXCLUDED.summary, chart_data = EXCLUDED.chart_data, table_data = EXCLUDED.table_data;';
  
  fs.writeFileSync('insert_2025.sql', sql);
  console.log(`Generated insert_2025.sql with ${values.length} records.`);
}

run();
