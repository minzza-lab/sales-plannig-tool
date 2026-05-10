const ExcelJS = require('exceljs');

async function main() {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('./public/template.xlsx');
    let ws = workbook.getWorksheet('0508');
    if (!ws) ws = workbook.worksheets[workbook.worksheets.length - 2];

    let currentC1 = '';
    let currentC2 = '';
    
    for (let i = 7; i <= ws.rowCount; i++) {
        const row = ws.getRow(i);
        
        const c1Val = row.getCell(1).text?.trim();
        const c2Val = row.getCell(2).text?.trim();
        const c3Val = row.getCell(3).text?.trim();
        const targetVal = row.getCell(4).text?.trim();
        
        if (c1Val) currentC1 = c1Val;
        if (c2Val) currentC2 = c2Val;
        
        if (currentC1.replace(/\r\n|\n/g, '') === '프로모션') {
            console.log(`Row ${i}: C1=${currentC1.replace(/\r\n|\n/g, '')}, C2=${currentC2.replace(/\r\n|\n/g, '')}, C3=${c3Val?.replace(/\r\n|\n/g, '')}, Target=${targetVal?.replace(/\r\n|\n/g, '')}`);
        }
    }
}

main().catch(console.error);
