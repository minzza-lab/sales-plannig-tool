const ExcelJS = require('exceljs');

async function main() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('./public/template.xlsx');
    let ws = workbook.getWorksheet('0508');
    if (!ws) ws = workbook.worksheets[workbook.worksheets.length - 2];

    for (let i = 37; i <= 43; i++) {
        const row = ws.getRow(i);
        const c1Val = row.getCell(1).text?.trim();
        const c3Val = row.getCell(3).text?.trim();
        const targetVal = row.getCell(4).text?.trim();
        const hVal = row.getCell(8).value;
        const hFormula = row.getCell(8).formula;
        console.log(`Row ${i} C1=${c1Val} C3=${c3Val} Target=${targetVal} H_Val=${hVal} H_Form=${hFormula}`);
    }
}

main().catch(console.error);
