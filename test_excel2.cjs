const XLSX = require('xlsx');

function readFull(filename) {
  try {
    const workbook = XLSX.readFile(filename);
    const sheet_name_list = workbook.SheetNames;
    const worksheet = workbook.Sheets[sheet_name_list[0]];
    const json = XLSX.utils.sheet_to_json(worksheet, {header: 1});
    console.log(`\n=== ${filename} ===`);
    for (let i=0; i<json.length; i++) {
       console.log(`Row ${i}:`, json[i]);
    }
  } catch(e) {
    console.log(`Error:`, e.message);
  }
}
readFull("0504 요금대별 발권현황.xls");
