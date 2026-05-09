const xlsx = require('xlsx');

const p = 'C:\\Users\\aasw\\.gemini\\antigravity\\scratch\\sales-plannig-tool\\★★2026워터시즌권판매실적.xlsx';
const workbook = xlsx.readFile(p);
const lastSheetName = workbook.SheetNames[workbook.SheetNames.length - 2]; // '숨기기확인必' is last, so take second to last e.g. '0508'
console.log(`Using sheet: ${lastSheetName}`);
const sheet = workbook.Sheets[lastSheetName];
const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

const baseline = [];

// Header rows are around 4-5
// Columns: 
// 0,1: 구분1, 구분2
// 2: 대상(대인/소인)
// 9: 2025년 수량, 10: 2025년 매출

let currentGroup1 = '';
let currentGroup2 = '';

for (let i = 6; i < data.length; i++) {
  const row = data[i];
  if (!row || row.length < 5) continue;
  
  const g1 = row[0] ? String(row[0]).trim() : '';
  const g2 = row[1] ? String(row[1]).trim() : '';
  const target = row[2] ? String(row[2]).trim() : '';
  
  if (g1) currentGroup1 = g1.replace(/\r\n/g, '').replace(/\n/g, '');
  if (g2) currentGroup2 = g2;
  
  if (target === '소 계' || target === '합 계') continue;
  if (!target) continue;
  
  // Find index for 2025 수량 and 매출.
  // In sheet 0415:
  // [0]구분1 [1]구분2 [2]권종 [3]대인/소인 [4]단가 [5]일수량 [6]일매출 [7]년수량 [8]년매출 [9]증감 [10]증감 [11]25년수량 [12]25년매출
  // Wait, let's look at the output from earlier:
  // [ '특가', '일반', '개인권', '대 인', 275, 0, 0, 0, 0, -1, -1, 8, 1900 ]
  // So:
  // 0: 대분류 (특가)
  // 1: 중분류 (일반)
  // 2: 소분류 (개인권)
  // 3: 대상 (대 인)
  // 4: 단가
  // 11: 2025 수량
  // 12: 2025 매출
  
  // Update logic:
  const c1 = row[0] ? String(row[0]).trim() : '';
  const c2 = row[1] ? String(row[1]).trim() : '';
  const c3 = row[2] ? String(row[2]).trim() : '';
  const c4 = row[3] ? String(row[3]).trim() : '';
  
  // Find the exact numeric values from the end
  const price = row[4] || 0;
  const qty2025 = row[11] || 0;
  const rev2025 = row[12] || 0;
  
  if (c4 && c4 !== '소 계' && c4 !== '합 계' && c3 !== '소 계') {
    baseline.push({
      category1: c1 || currentGroup1,
      category2: c2 || currentGroup2,
      category3: c3,
      target: c4,
      price: price,
      qty_2025: qty2025,
      revenue_2025: rev2025
    });
  }
}

console.log(JSON.stringify(baseline, null, 2));
const fs = require('fs');
fs.writeFileSync('baseline_2025.json', JSON.stringify(baseline, null, 2));
console.log('Saved baseline_2025.json');
