const XLSX = require('xlsx');
const workbook = XLSX.readFile('2026년 05월04일_전체_실시간매출현황.xls');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
const rows = json.slice(3).filter(row => row[2]);
console.log("Categories (row[0]) and Names (row[2]):");
console.log(rows.map(r => `${r[0]} | ${r[1]} | ${r[2]}`).slice(0, 15));
