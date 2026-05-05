const XLSX = require('xlsx');
const fs = require('fs');
const workbook = XLSX.readFile('2025년 05월 매출데이터.xls');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
console.log(json.slice(0, 10)); // print first 10 rows
