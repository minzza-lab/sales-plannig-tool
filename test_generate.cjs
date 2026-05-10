const ExcelJS = require('exceljs');
const fs = require('fs');

async function test() {
  const baseline = JSON.parse(fs.readFileSync('baseline_2025.json', 'utf8'));

  const groups = {};
  baseline.forEach(b => {
      const bC1 = b.category1.replace(/\r\n|\n/g, '');
      const bC2 = b.category2.replace(/\r\n|\n/g, '');
      const bC3 = b.category3.replace(/\r\n|\n/g, '');
      const bTarget = b.target.replace(/\r\n|\n/g, '');
      const key = `${bC1}|${bC2}|${bC3}|${bTarget}`;
      groups[key] = { ...b, qty_today: 0, revenue_today: 0, qty_2026: 0, revenue_2026: 0 };
  });

  // hardcode the 14 groups that have data
  groups['특가|일반|개인권|대 인'].qty_2026 = 3;
  groups['특가|일반|개인권|대 인'].revenue_2026 = 3 * 190;
  groups['특가|일반|패밀리권|4인권'].qty_2026 = 51;
  groups['특가|일반|패밀리권|4인권'].revenue_2026 = 51 * 500;
  groups['특별권종|일반|프리미엄 시즌패스|4인권'].qty_2026 = 18;
  groups['특별권종|일반|프리미엄 시즌패스|4인권'].revenue_2026 = 18 * 800;

  const groupedData = Object.values(groups);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./public/template.xlsx');
  let ws = workbook.getWorksheet('0508');
  if (!ws) ws = workbook.worksheets[workbook.worksheets.length - 2];

  let currentC1 = '';
  let currentC2 = '';
  let currentC3 = '';

  const rowCount = ws.rowCount;
  for (let i = 6; i <= rowCount; i++) {
    const row = ws.getRow(i);
    const c1Val = row.getCell(1).text ? row.getCell(1).text.trim() : '';
    const c2Val = row.getCell(2).text ? row.getCell(2).text.trim() : '';
    const c3Val = row.getCell(3).text ? row.getCell(3).text.trim() : '';
    const targetVal = row.getCell(4).text ? row.getCell(4).text.trim() : '';

    if (c1Val) currentC1 = c1Val;
    if (c2Val) currentC2 = c2Val;
    if (c3Val && !c3Val.includes('소 계') && !c3Val.includes('합 계')) currentC3 = c3Val;

    if (!targetVal || targetVal.includes('소 계') || targetVal.includes('합 계') || c3Val === '소 계') {
      continue;
    }

    const normC1 = currentC1.replace(/\r\n|\n/g, '');
    const normC2 = currentC2.replace(/\r\n|\n/g, '');
    const normC3 = currentC3.replace(/\r\n|\n/g, '');
    const normTarget = targetVal.replace(/\r\n|\n/g, '');

    const matchingGroup = groupedData.find(g => {
      const gC1 = g.category1.replace(/\r\n|\n/g, '');
      const gC2 = g.category2.replace(/\r\n|\n/g, '');
      const gC3 = g.category3.replace(/\r\n|\n/g, '');
      const gTarget = g.target.replace(/\r\n|\n/g, '');
      return gC1 === normC1 && gC2 === normC2 && gC3 === normC3 && gTarget === normTarget;
    });

    if (matchingGroup) {
      row.getCell(6).value = matchingGroup.qty_today;
      row.getCell(7).value = matchingGroup.revenue_today;
      row.getCell(8).value = matchingGroup.qty_2026;
      row.getCell(9).value = matchingGroup.revenue_2026; 
    } else {
      row.getCell(6).value = 0;
      row.getCell(7).value = 0;
      row.getCell(8).value = 0;
      row.getCell(9).value = 0;
    }
  }
  
  await workbook.xlsx.writeFile('./test_output.xlsx');
  console.log('Generated test_output.xlsx');
}
test().catch(e => console.error(e));
