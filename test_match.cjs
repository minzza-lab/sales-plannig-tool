const ExcelJS = require('exceljs');
const fs = require('fs');

async function test() {
  const baseline = JSON.parse(fs.readFileSync('baseline_2025.json', 'utf8'));
  const groupedData = baseline.map(b => ({ ...b }));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./public/template.xlsx');
  let ws = workbook.getWorksheet('0508');
  if (!ws) ws = workbook.worksheets[workbook.worksheets.length - 2];

  let currentC1 = '';
  let currentC2 = '';
  let currentC3 = '';
  let matchCount = 0;

  for (let i = 6; i <= ws.rowCount; i++) {
    const row = ws.getRow(i);
    const c1Val = row.getCell(1).text ? row.getCell(1).text.trim() : '';
    const c2Val = row.getCell(2).text ? row.getCell(2).text.trim() : '';
    const c3Val = row.getCell(3).text ? row.getCell(3).text.trim() : '';
    const targetVal = row.getCell(4).text ? row.getCell(4).text.trim() : '';

    if (c1Val) currentC1 = c1Val;
    if (c2Val) currentC2 = c2Val;
    // Let's NOT use currentC3 first, exactly as the code is now:
    
    if (!targetVal || targetVal.includes('소 계') || targetVal.includes('합 계') || c3Val === '소 계') {
      continue;
    }

    const normC1 = currentC1.replace(/\r\n|\n/g, '');
    const normC2 = currentC2.replace(/\r\n|\n/g, '');
    const normC3 = c3Val.replace(/\r\n|\n/g, '');
    const normTarget = targetVal.replace(/\r\n|\n/g, '');

    const matchingGroup = groupedData.find(g => {
      const gC1 = g.category1.replace(/\r\n|\n/g, '');
      const gC2 = g.category2.replace(/\r\n|\n/g, '');
      const gC3 = g.category3.replace(/\r\n|\n/g, '');
      const gTarget = g.target.replace(/\r\n|\n/g, '');
      
      return gC1 === normC1 && gC2 === normC2 && gC3 === normC3 && gTarget === normTarget;
    });

    if (matchingGroup) {
      matchCount++;
      // console.log('Matched:', normTarget);
    } else {
      console.log(`Failed to match: C1=${normC1}, C2=${normC2}, C3=${normC3}, Target=${normTarget}`);
    }
  }
  console.log('Total Matched:', matchCount);
}
test();
