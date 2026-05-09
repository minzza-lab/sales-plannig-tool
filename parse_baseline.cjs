const xlsx = require('xlsx');

const p = '★★2026워터시즌권판매실적.xlsx';
const workbook = xlsx.readFile(p);
const lastSheetName = workbook.SheetNames[workbook.SheetNames.length - 2];
console.log(`Using sheet: ${lastSheetName}`);
const sheet = workbook.Sheets[lastSheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const baseline = [];

let currentGroup1 = '';
let currentGroup2 = '';
let currentGroup3 = '';

for (let i = 6; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length < 4) continue;
  
  const g1 = row[0] ? String(row[0]).trim() : '';
  const g2 = row[1] ? String(row[1]).trim() : '';
  const g3 = row[2] ? String(row[2]).trim() : '';
  const target = row[3] ? String(row[3]).trim() : '';
  
  if (g1) currentGroup1 = g1.replace(/\r\n/g, '').replace(/\n/g, '');
  if (g2) currentGroup2 = g2;
  if (g3 && !g3.includes('소 계') && !g3.includes('합 계')) currentGroup3 = g3;
  
  if (!target || target.includes('소 계') || target.includes('합 계')) continue;
  if (target === '-' || target === '0') continue;
  
  const price = row[4] || 0;
  // 15: 25년 총계 수량, 16: 25년 총계 매출
  const qty2025 = Number(row[15]) || 0;
  const rev2025 = Number(row[16]) || 0;
  
  baseline.push({
    category1: currentGroup1,
    category2: currentGroup2,
    category3: currentGroup3,
    target: target,
    price: Number(price) || 0,
    qty_2025: qty2025,
    revenue_2025: rev2025
  });
}

console.log('Parsed items:', baseline.length);
const fs = require('fs');
fs.writeFileSync('baseline_2025.json', JSON.stringify(baseline, null, 2));
console.log('Saved baseline_2025.json');

