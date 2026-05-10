const ExcelJS = require('exceljs');

async function main() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('./public/template.xlsx');
    let ws = workbook.getWorksheet('0508');
    if (!ws) ws = workbook.worksheets[workbook.worksheets.length - 2];

    for (let i = 7; i <= ws.rowCount; i++) {
        const row = ws.getRow(i);
        
        const c1Val = row.getCell(1).text?.trim();
        const c2Val = row.getCell(2).text?.trim();
        const c3Val = row.getCell(3).text?.trim();
        const targetVal = row.getCell(4).text?.trim();
        
        if (targetVal && targetVal.replace(/\s+/g, '').includes('합계')) {
            const sumFormula = row.getCell(8).formula;
            console.log(`Row ${i} Target=${targetVal} H_Formula: ${sumFormula} H_Value: ${row.getCell(8).value}`);
        }
        if (c1Val && c1Val.replace(/\s+/g, '').includes('합계')) {
            const sumFormula = row.getCell(8).formula;
            console.log(`Row ${i} C1=${c1Val} H_Formula: ${sumFormula} H_Value: ${row.getCell(8).value}`);
        }
    }
}

main().catch(console.error);
