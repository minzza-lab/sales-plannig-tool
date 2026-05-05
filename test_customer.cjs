const XLSX = require('xlsx');
const workbook = XLSX.readFile('고객유형별 발권현황(20260504-20260504).xls');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
const rows = json.slice(3).filter(row => row[2]);
console.log("Customer Categories:");
console.log(rows.map(r => `${r[0]} | ${r[2]}`).slice(0, 20));
