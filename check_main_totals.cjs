const ExcelJS = require('exceljs');

async function main() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('./public/template.xlsx');
    let ws = workbook.getWorksheet('0508');
    if (!ws) ws = workbook.worksheets[workbook.worksheets.length - 2];

    [34, 43, 71, 82, 83].forEach(i => {
        const row = ws.getRow(i);
        console.log(`Row ${i} C1=${row.getCell(1).text?.trim().replace(/\r\n|\n/g, '')} Target=${row.getCell(4).text?.trim()} Formula=${row.getCell(8).formula}`);
    });
}

main().catch(console.error);
