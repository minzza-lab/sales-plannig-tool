const ExcelJS = require('exceljs');

async function checkTemplate() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./public/template.xlsx');
  
  const sheetNames = workbook.worksheets.map(ws => ws.name);
  console.log("Sheet names in template.xlsx:", sheetNames);
}

checkTemplate();
