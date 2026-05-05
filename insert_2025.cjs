require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const files = fs.readdirSync('.').filter(f => f.startsWith('2025년') && f.endsWith('매출데이터.xls'));
  
  let totalInserted = 0;

  for (const file of files) {
    console.log(`Processing ${file}...`);
    const workbook = XLSX.readFile(file);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Data starts at row index 3
    const validRows = json.slice(3).filter(r => r[0] && typeof r[0] === 'string' && r[0].includes('.'));
    
    const upsertData = validRows.map(row => {
      // Date format: '2025.05.31' -> '2025-05-31'
      const report_date = row[0].replace(/\./g, '-');
      const totalAmount = Number(row[2]) || 0;
      const totalQty = Number(row[5]) || 0;
      
      return {
        report_date,
        report_type: 'RATE_ZONE', // Use RATE_ZONE as the main type to trigger cumulative dash
        data: {
          summary: {
            label: '총 매출액 (과거입력)',
            qtyLabel: '총 방문객',
            totalAmount,
            totalQty
          },
          chart_data: [{ name: '입장객', amount: totalAmount, quantity: totalQty }],
          table_data: [{ category: '과거데이터', name: '총계', quantity: totalQty, amount: totalAmount }]
        }
      };
    });

    if (upsertData.length > 0) {
      const { data, error } = await supabase.from('daily_reports').upsert(upsertData, { onConflict: 'report_date, report_type' });
      if (error) {
        console.error(`Error inserting ${file}:`, error);
      } else {
        totalInserted += upsertData.length;
        console.log(`Successfully inserted ${upsertData.length} records for ${file}.`);
      }
    }
  }
  
  console.log(`\nFinished! Total records inserted: ${totalInserted}`);
}

run();
