const XLSX = require('xlsx');

function readHeaders(filename) {
  try {
    const workbook = XLSX.readFile(filename);
    const sheet_name_list = workbook.SheetNames;
    const worksheet = workbook.Sheets[sheet_name_list[0]];
    const json = XLSX.utils.sheet_to_json(worksheet, {header: 1});
    console.log(`\n=== ${filename} ===`);
    for (let i=0; i<Math.min(10, json.length); i++) {
       console.log(`Row ${i}:`, json[i]);
    }
  } catch(e) {
    console.log(`Error reading ${filename}:`, e.message);
  }
}

readHeaders("0504 요금대별 발권현황.xls");
readHeaders("2026년 05월04일_전체_실시간매출현황.xls");
readHeaders("고객유형별 발권현황(20260504-20260504).xls");
