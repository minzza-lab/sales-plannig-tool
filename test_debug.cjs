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

  groups['특가|일반|패밀리권|4인권'].qty_2026 = 51;
  const groupedData = Object.values(groups);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./public/template.xlsx');
  let ws = workbook.getWorksheet('0508');
  if (!ws) ws = workbook.worksheets[workbook.worksheets.length - 2];

  let currentC1='', currentC2='', currentC3='';
  for(let i=6; i<=15; i++){
    const row = ws.getRow(i);
    const c1 = row.getCell(1).text?.trim();
    const c2 = row.getCell(2).text?.trim();
    const c3 = row.getCell(3).text?.trim();
    const t = row.getCell(4).text?.trim();
    if(c1) currentC1=c1; if(c2) currentC2=c2; if(c3 && !c3.includes('소 계')) currentC3=c3;
    if(!t || t.includes('소 계') || t.includes('합 계') || c3 === '소 계') continue;

    const normC1 = currentC1.replace(/\r\n|\n/g, '');
    const normC2 = currentC2.replace(/\r\n|\n/g, '');
    const normC3 = currentC3.replace(/\r\n|\n/g, '');
    const normTarget = t.replace(/\r\n|\n/g, '');

    const matchingGroup = groupedData.find(g => {
      const gC1 = g.category1.replace(/\r\n|\n/g, '');
      const gC2 = g.category2.replace(/\r\n|\n/g, '');
      const gC3 = g.category3.replace(/\r\n|\n/g, '');
      const gTarget = g.target.replace(/\r\n|\n/g, '');
      return gC1 === normC1 && gC2 === normC2 && gC3 === normC3 && gTarget === normTarget;
    });

    if(matchingGroup) console.log(i, 'Matched! qty_2026:', matchingGroup.qty_2026);
    else console.log(i, 'Unmatched');
  }
}
test().catch(e => console.error(e));
