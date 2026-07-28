const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const chalk = require('chalk');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// 한국 시간 기준 날짜 획득 함수 (최근 N일)
function getKstDates(daysCount = 3) {
  const kstOffset = 9 * 60 * 60 * 1000; // GMT+9
  const nowKst = new Date(Date.now() + kstOffset);
  
  const dates = [];
  for (let i = 0; i < daysCount; i++) {
    const targetDate = new Date(nowKst.getTime() - (i * 24 * 60 * 60 * 1000));
    const yyyy = targetDate.getUTCFullYear();
    const mm = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(targetDate.getUTCDate()).padStart(2, '0');
    
    dates.push({
      dbDate: `${yyyy}-${mm}-${dd}`,
      apiDate: `${yyyy}${mm}${dd}`
    });
  }
  return dates;
}

// 과거 시작일부터 오늘까지의 날짜 획득 함수 (역순)
function getAllDatesFrom(startDateStr) {
  const kstOffset = 9 * 60 * 60 * 1000;
  const nowKst = new Date(Date.now() + kstOffset);
  const start = new Date(startDateStr);
  
  const dates = [];
  let current = new Date(nowKst.getTime());
  
  while (current >= start) {
    const yyyy = current.getUTCFullYear();
    const mm = String(current.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(current.getUTCDate()).padStart(2, '0');
    
    dates.push({
      dbDate: `${yyyy}-${mm}-${dd}`,
      apiDate: `${yyyy}${mm}${dd}`
    });
    
    current.setTime(current.getTime() - 24 * 60 * 60 * 1000);
  }
  return dates;
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function getMissingDatesFrom(startDateStr) {
  const allDates = getAllDatesFrom(startDateStr);
  const existingDates = new Set();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('report_date')
      .eq('report_type', 'REALTIME_SALES')
      .range(from, from + pageSize - 1);

    if (error) throw error;
    (data || []).forEach(row => existingDates.add(row.report_date));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return allDates.filter(date => !existingDates.has(date.dbDate));
}

async function fetchSalesData(apiDate) {
  const payload = new URLSearchParams({
    p_sale_sdate: apiDate,
    p_sale_edate: apiDate,
    p_upjang_code: '',
    p_sub_code: ''
  }).toString();

  const response = await fetch('https://wapi.wellihillipark.com/sub2/portal/portal.asp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    body: payload
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();
  return json.datalist || [];
}

async function fetchDetailedSalesData(apiDate, zonecode) {
  const payload = new URLSearchParams({
    p_sale_sdate: apiDate,
    p_sale_edate: apiDate,
    p_upjang_code: zonecode,
    p_sub_code: '1'
  }).toString();

  const response = await fetch('https://wapi.wellihillipark.com/sub2/portal/portal.asp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    body: payload
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const json = await response.json();
  return json.datalist || [];
}

async function run() {
  const isAll = process.argv[2] === 'all';
  const isMissing = process.argv[2] === 'missing';
  console.log(chalk.bold.blue('\n🌊 워터파크 매출 자동 수집기 가동'));
  if (isAll) {
    console.log(chalk.bold.cyan('👉 모드: 전체 과거 데이터 수집 (2025-01-01 ~ 오늘)\n'));
  } else if (isMissing) {
    console.log(chalk.bold.cyan('👉 모드: 누락 날짜 복구 후 최근 3일 갱신 (2025-04-02 ~ 오늘)\n'));
  } else {
    console.log(chalk.bold.cyan('👉 모드: 최근 3일 치 실시간 수집\n'));
  }

  let datesToCrawl;
  if (isAll) {
    datesToCrawl = getAllDatesFrom('2025-01-01');
  } else if (isMissing) {
    const missingDates = await getMissingDatesFrom('2025-04-02');
    const dateMap = new Map(
      [...missingDates, ...getKstDates(3)].map(date => [date.dbDate, date])
    );
    datesToCrawl = [...dateMap.values()].sort((a, b) => b.dbDate.localeCompare(a.dbDate));
    console.log(chalk.cyan(`확인할 누락 날짜: ${missingDates.length}일 (최근 3일 포함 총 ${datesToCrawl.length}일)\n`));
  } else {
    datesToCrawl = getKstDates(3);
  }
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < datesToCrawl.length; i++) {
    const dateInfo = datesToCrawl[i];
    console.log(chalk.yellow(`[${i + 1}/${datesToCrawl.length}] [${dateInfo.dbDate}] API 호출 중...`));

    try {
      const rawData = await fetchSalesData(dateInfo.apiDate);
      
      // 데이터 가공
      let totalAmount = 0;
      let totalQty = 0;
      
      const chartData = [];
      const tableData = [];

      for (const zoneItem of rawData) {
        const zonePrice = Number(zoneItem.price) || 0;
        const zoneCnt = Number(zoneItem.cnt) || 0;
        
        totalAmount += zonePrice;
        totalQty += zoneCnt;

        chartData.push({
          name: zoneItem.zone,
          amount: zonePrice,
          quantity: zoneCnt
        });

        // 세부 항목 조회 수행
        try {
          // 호출 과부하 방지용 짧은 딜레이
          await delay(50);
          const subRawData = await fetchDetailedSalesData(dateInfo.apiDate, zoneItem.zonecode);
          
          if (subRawData.length > 0) {
            const subMap = new Map();
            subRawData.forEach(sub => {
              const subName = sub.sub || '기타';
              const subPrice = Number(sub.price) || 0;
              const subCnt = Number(sub.cnt) || 0;
              
              if (subMap.has(subName)) {
                const ext = subMap.get(subName);
                ext.amount += subPrice;
                ext.quantity += subCnt;
              } else {
                subMap.set(subName, {
                  category: zoneItem.zone,
                  name: subName,
                  quantity: subCnt,
                  amount: subPrice
                });
              }
            });
            
            subMap.forEach(val => {
              tableData.push(val);
            });
          } else {
            // 상세 데이터가 비어 있으면 구역 총합 데이터로 대체
            tableData.push({
              category: zoneItem.zone,
              name: `${zoneItem.zone} 전체`,
              quantity: zoneCnt,
              amount: zonePrice
            });
          }
        } catch (err) {
          console.log(chalk.red(`  └ [${zoneItem.zone}] 상세 수집 실패: ${err.message}`));
          tableData.push({
            category: zoneItem.zone,
            name: `${zoneItem.zone} 전체`,
            quantity: zoneCnt,
            amount: zonePrice
          });
        }
      }

      // 매출이 있는 경우 금액이 가장 큰 순서로 정렬
      chartData.sort((a, b) => b.amount - a.amount);

      const upsertData = {
        report_date: dateInfo.dbDate,
        report_type: 'REALTIME_SALES',
        data: {
          summary: {
            totalAmount,
            totalQty,
            label: '실시간 총 매출(원)',
            qtyLabel: '실시간 총 발권수'
          },
          chart_data: chartData,
          table_data: tableData,
          updated_at: new Date().toISOString()
        }
      };

      // Supabase 업서트
      const { error } = await supabase
        .from('daily_reports')
        .upsert(upsertData, { onConflict: 'report_date, report_type' });

      if (error) {
        throw error;
      }

      const emptyLabel = rawData.length === 0 ? ' / 매출 없음 확인' : '';
      console.log(chalk.green(`[${dateInfo.dbDate}] 수집 완료! (총매출: ${totalAmount.toLocaleString()}원, 발권: ${totalQty.toLocaleString()}건, 상세품목: ${tableData.length}개${emptyLabel})`));
      successCount++;
    } catch (error) {
      console.log(chalk.red(`[${dateInfo.dbDate}] 수집 실패: ${error.message}`));
      failCount++;
    }

    // 호출 과부하 방지 딜레이
    if (isAll || isMissing) {
      await delay(200);
    }
  }

  console.log(chalk.bold.blue(`\n🎉 수집 프로세스 종료 (성공: ${successCount}, 실패: ${failCount})\n`));
}

run();
