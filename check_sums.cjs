const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

const supabaseUrl = 'https://fqjlsldmalvbikztzmis.supabase.co';
const supabaseKey = 'sb_publishable_3RyVZ_wvP1AgT2dcopxHmA_DPQLMEeU';
const supabase = createClient(supabaseUrl, supabaseKey);

const getMappedCategory = (order) => {
    let cat1 = '일반(정상)';
    let cat2 = '일반';
    let cat3 = '개인권';
    let target = '대 인';

    const name = order.product_name || '';
    const memberType = order.member_type || '';
    const price = Number(order.price) || 0;

    if (name.includes('오프라인') || name.includes('AK')) {
      cat1 = '프로\r\n모션';
      cat2 = 'AK\r\n오프\r\n라인';
    } else {
      if (name.includes('특가')) cat1 = '특가';
      else if (name.includes('프리미엄')) cat1 = '특별\r\n권종';
      else if (name.includes('프로모션')) cat1 = '프로\r\n모션';

      if (name.endsWith('H') || name.endsWith('D')) cat2 = '일반';
      else if (name.includes('지역주민')) cat2 = '지역\r\n주민';
      else if (name.includes('회원') || name.includes('제휴') || name.includes('블럭법인')) cat2 = '회원\r\n/\r\n제휴';
      else if (name.includes('임직원')) cat2 = '임직원';
      else cat2 = '일반';
    }

    if (name.includes('패밀리')) cat3 = '패밀리권';
    else if (name.includes('커플')) cat3 = '개인권';
    else if (name.includes('프리미엄')) cat3 = '프리미엄 \r\n시즌패스';
    else if (name.includes('임직원')) cat3 = '임직원\r\n시즌패스';
    else cat3 = '개인권';

    if (name.includes('5인')) target = '5인권';
    else if (name.includes('4인')) target = '4인권';
    else if (name.includes('3인')) target = '3인권';
    else if (name.includes('커플') || name.includes('2인')) target = '커플(2인)';
    else if (name.includes('1인')) target = '1인권';
    else {
      if (price === 190000 || price === 190 || price === 275000 || price === 275) target = '대 인';
      else if (price === 120000 || price === 120 || price === 180000 || price === 180) target = '소 인';
      else if (memberType.includes('소')) target = '소 인';
      else target = '대 인';
    }

    if (cat3.includes('프리미엄') && target === '3인권') target = '4인권';

    return { category1: cat1, category2: cat2, category3: cat3, target };
  };

async function main() {
    const { data: orderData } = await supabase.from('season_pass_orders').select('*');
    const validOrders = orderData.filter(o => o.status === '결제');

    const groups = {};
    validOrders.forEach(o => {
        const mapped = getMappedCategory(o);
        const key = `${mapped.category1.replace(/\s+/g, '')}|${mapped.category2.replace(/\s+/g, '')}|${mapped.category3.replace(/\s+/g, '')}|${mapped.target.replace(/\s+/g, '')}`;
        if (!groups[key]) groups[key] = 0;
        groups[key]++;
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('./public/template.xlsx');
    let ws = workbook.getWorksheet('0508');
    if (!ws) ws = workbook.worksheets[workbook.worksheets.length - 2];

    let currentC1 = '';
    let currentC2 = '';
    let currentC3 = '';
    
    let sumDataCells = 0;
    const rowValues = {};

    for (let i = 7; i <= ws.rowCount; i++) {
        const row = ws.getRow(i);
        
        const c1Val = row.getCell(1).text?.trim();
        const c2Val = row.getCell(2).text?.trim();
        const c3Val = row.getCell(3).text?.trim();
        const targetVal = row.getCell(4).text?.trim();
        
        const c3NoSpace = c3Val?.replace(/\s+/g, '') || '';
        
        if (c1Val) currentC1 = c1Val;
        if (c2Val) currentC2 = c2Val;
        if (c3Val && !c3NoSpace.includes('소계') && !c3NoSpace.includes('합계')) currentC3 = c3Val;
        
        const targetNoSpace = targetVal?.replace(/\s+/g, '') || '';
        const c1NoSpace = c1Val?.replace(/\s+/g, '') || '';
        
        const isSubtotalRow = 
          targetNoSpace.includes('소계') || 
          targetNoSpace.includes('합계') || 
          targetNoSpace.includes('총계') || 
          targetVal?.includes('計') ||
          c3NoSpace.includes('소계') ||
          c3NoSpace.includes('합계') ||
          c3Val?.includes('計') ||
          c1NoSpace.includes('합계') || 
          c1NoSpace.includes('총계') || 
          c1Val?.includes('計');

        if (!targetVal || isSubtotalRow) {
            rowValues[i] = 0; // subtotal
            continue;
        }

        const normC1 = currentC1.replace(/\s+/g, '');
        const normC2 = currentC2.replace(/\s+/g, '');
        const normC3 = currentC3.replace(/\s+/g, '');
        const normTarget = targetVal.replace(/\s+/g, '');
        const key = `${normC1}|${normC2}|${normC3}|${normTarget}`;
        
        const qty = groups[key] || 0;
        rowValues[i] = qty;
        sumDataCells += qty;
        if (qty > 0) {
            console.log(`Row ${i} gets ${qty} tickets. Key: ${key}`);
        }
    }

    console.log(`Total tickets inserted into Excel rows: ${sumDataCells}`);

    // Let's manually evaluate the subtotal formulas!
    // H10 = SUM(H7:H9)
    let H10 = rowValues[7] + rowValues[8] + rowValues[9];
    // H14 = SUM(H11:H13)
    let H14 = rowValues[11] + rowValues[12] + rowValues[13];
    // H15 = H14 + H10
    let H15 = H14 + H10;

    // H19 = SUM(H16:H18)
    let H19 = rowValues[16] + rowValues[17] + rowValues[18];
    // H23 = SUM(H20:H22)
    let H23 = rowValues[20] + rowValues[21] + rowValues[22];
    // H24 = H23 + H19
    let H24 = H23 + H19;

    // H28 = SUM(H25:H27)
    let H28 = rowValues[25] + rowValues[26] + rowValues[27];
    // H32 = SUM(H29:H31)
    let H32 = rowValues[29] + rowValues[30] + rowValues[31];
    // H33 = H32 + H28
    let H33 = H32 + H28;

    let H34 = H15 + H24 + H33; // 특가 計
    console.log(`H34 (특가 計) = ${H34}`);

    // H36 = H35 (Wait, Row 36 Formula is H35, but H35 is data row?)
    let H36 = rowValues[35] || 0; 
    let H42 = 0; // Formula undefined!
    let H43 = H42 + H36; // 특별권종 計
    console.log(`H43 (특별권종 計) = ${H43}`);

    // 일반(정상)
    let H47 = rowValues[44] + rowValues[45] + rowValues[46];
    let H51 = rowValues[48] + rowValues[49] + rowValues[50];
    let H52 = H51 + H47;

    let H56 = rowValues[53] + rowValues[54] + rowValues[55];
    let H60 = rowValues[57] + rowValues[58] + rowValues[59];
    let H61 = H60 + H56;

    let H65 = rowValues[62] + rowValues[63] + rowValues[64];
    let H69 = rowValues[66] + rowValues[67] + rowValues[68];
    let H70 = H69 + H65;

    let H71 = H70 + H61 + H52; // 일 반 計
    console.log(`H71 (일 반 計) = ${H71}`);

    // 프로모션
    let H75 = rowValues[72] + rowValues[73] + rowValues[74];
    let H79 = rowValues[76] + rowValues[77] + rowValues[78];
    let H81 = rowValues[80];
    let H82 = H81 + H79 + H75; // 프로모션 計
    console.log(`H82 (프로모션 計) = ${H82}`);

    let H83 = H82 + H71 + H43 + H34; // 전체 합계
    console.log(`H83 (전체 합계) = ${H83}`);
}

main().catch(console.error);
