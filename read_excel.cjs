const xlsx = require('xlsx');

const p = 'C:\\Users\\aasw\\.gemini\\antigravity\\scratch\\sales-plannig-tool\\★★2026워터시즌권판매실적.xlsx';
try {
  const workbook = xlsx.readFile(p);
  console.log('Sheet Names:', workbook.SheetNames);
  
  // Read first sheet
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log(`\n--- First 20 Rows of Sheet: ${sheetName} ---`);
  console.dir(data.slice(0, 20), { depth: null });
  
  // Try to find header row (first row with more than 3 columns)
  let headerRowIndex = 0;
  for(let i=0; i<Math.min(data.length, 20); i++) {
    if (data[i] && data[i].length > 3) {
      headerRowIndex = i;
      break;
    }
  }
  console.log(`\n--- Guessed Header Row (${headerRowIndex}) ---`);
  console.log(data[headerRowIndex]);
  
} catch (err) {
  console.log('Error:', err);
}
