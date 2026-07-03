import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Download, TrendingUp, Users, CreditCard } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LabelList,
  PieChart, Pie, Cell
} from 'recharts';
import './SeasonPassTracker.css';

interface BaselineData {
  id: string;
  category1: string;
  category2: string;
  category3: string;
  target: string;
  price: number;
  qty_2025: number;
  revenue_2025: number;
}

interface OrderData {
  id: string;
  order_id: string;
  order_date: string;
  payment_date: string;
  product_name: string;
  recommender: string;
  member_type: string;
  customer_name: string;
  status: string;
  price: number;
  address?: string; // 주소 컬럼 추가
}

const SeasonPassTracker: React.FC = () => {
  const [baselines, setBaselines] = useState<BaselineData[]>([]);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 날짜 검색 필터 상태
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [activeStartDate, setActiveStartDate] = useState('');
  const [activeEndDate, setActiveEndDate] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#14b8a6', '#f43f5e'];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: baselineData, error: baselineError } = await supabase
        .from('season_pass_baseline')
        .select('*');
      
      let allOrders: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: orderDataChunk, error: orderError } = await supabase
          .from('season_pass_orders')
          .select('*')
          .order('order_date', { ascending: false })
          .range(from, from + step - 1);

        if (orderError) throw orderError;

        if (orderDataChunk && orderDataChunk.length > 0) {
          allOrders = [...allOrders, ...orderDataChunk];
          if (orderDataChunk.length < step) {
            hasMore = false;
          } else {
            from += step;
          }
        } else {
          hasMore = false;
        }
      }

      if (baselineError) throw baselineError;

      setBaselines(baselineData || []);
      setOrders(allOrders);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const totalRevenue2025 = baselines.reduce((acc, curr) => acc + Number(curr.revenue_2025), 0) * 1000;
  const totalQty2025 = baselines.reduce((acc, curr) => acc + Number(curr.qty_2025), 0);
  
  let validOrders = orders.filter(o => o.status === '결제');
  
  if (activeStartDate && activeEndDate) {
    const start = new Date(activeStartDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(activeEndDate);
    end.setHours(23, 59, 59, 999);
    validOrders = validOrders.filter(o => {
      const d = new Date(o.order_date);
      return d >= start && d <= end;
    });
  }

  const totalRevenue2026 = validOrders.reduce((acc, curr) => acc + Number(curr.price), 0);
  const totalQty2026 = validOrders.length;

  const achievementRate = totalRevenue2025 > 0 ? ((totalRevenue2026 / totalRevenue2025) * 100).toFixed(1) : '0';
  const qtyGrowthRate = totalQty2025 > 0 ? (((totalQty2026 - totalQty2025) / totalQty2025) * 100).toFixed(1) : '0';
  
  const handleSearch = () => {
    setIsSearching(true);
    setTimeout(() => {
      setIsSearching(false);
      setActiveStartDate(customStartDate);
      setActiveEndDate(customEndDate);
    }, 1000);
  };

  const handleReset = () => {
    setCustomStartDate('');
    setCustomEndDate('');
    setActiveStartDate('');
    setActiveEndDate('');
  };
  
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const currentTimeString = `${month}/${day} ${hours}:${minutes}`;

  const getMappedCategory = (order: OrderData) => {
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

  const getGroupedData = (startDate?: Date, endDate?: Date) => {
    const groups: Record<string, BaselineData & { qty_today: number; revenue_today: number; qty_2026: number; revenue_2026: number }> = {};
    
    baselines.forEach(b => {
      const bC1 = b.category1.replace(/\s+/g, '');
      const bC2 = b.category2.replace(/\s+/g, '');
      const bC3 = b.category3.replace(/\s+/g, '');
      const bTarget = b.target.replace(/\s+/g, '');
      const key = `${bC1}|${bC2}|${bC3}|${bTarget}`;
      groups[key] = { ...b, qty_today: 0, revenue_today: 0, qty_2026: 0, revenue_2026: 0 };
    });

    const now = new Date();
    const effStart = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const effEnd = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    effStart.setHours(0, 0, 0, 0);
    effEnd.setHours(23, 59, 59, 999);

    validOrders.forEach(o => {
      const mapped = getMappedCategory(o);
      const mC1 = mapped.category1.replace(/\s+/g, '');
      const mC2 = mapped.category2.replace(/\s+/g, '');
      const mC3 = mapped.category3.replace(/\s+/g, '');
      const mTarget = mapped.target.replace(/\s+/g, '');
      const key = `${mC1}|${mC2}|${mC3}|${mTarget}`;
      
      if (!groups[key]) {
        groups[key] = {
          id: key,
          category1: mapped.category1,
          category2: mapped.category2,
          category3: mapped.category3,
          target: mapped.target,
          price: Number(o.price) || 0,
          qty_2025: 0,
          revenue_2025: 0,
          qty_today: 0,
          revenue_today: 0,
          qty_2026: 0,
          revenue_2026: 0
        };
      }
      
      const orderDate = new Date(o.order_date);
      const isTargetPeriod = orderDate >= effStart && orderDate <= effEnd;
      
      const priceInThousands = (Number(o.price) || 0) / 1000; // 단위: 천원
      
      if (isTargetPeriod) {
        groups[key].qty_today += 1;
        groups[key].revenue_today += priceInThousands;
      }
      
      groups[key].qty_2026 += 1;
      groups[key].revenue_2026 += priceInThousands;
    });

    return Object.values(groups);
  };

  const downloadExcel = async () => {
    try {
      const [ExcelJS, { saveAs }] = await Promise.all([
        import('exceljs'),
        import('file-saver')
      ]);
      const response = await fetch('/template.xlsx');
      const arrayBuffer = await response.arrayBuffer();
      
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      
      // '0508' 시트 찾기 (없으면 뒤에서 두번째)
      let ws = workbook.getWorksheet('0508');
      if (!ws) {
        ws = workbook.worksheets[workbook.worksheets.length - 2];
      }

      let wsIndex = -1;
      workbook.worksheets.forEach((sheet, idx) => {
        if (sheet.id === ws.id) wsIndex = idx;
      });
      
      const prevWs = wsIndex > 0 ? workbook.worksheets[wsIndex - 1] : null;

      const now = new Date();
      const currentYear = now.getFullYear();
      let gapStart = new Date(currentYear, now.getMonth(), now.getDate());

      if (prevWs) {
        const pMatch = prevWs.name.match(/^(\d{2})(\d{2})/);
        if (pMatch) {
          const pMonth = parseInt(pMatch[1], 10) - 1;
          const pDay = parseInt(pMatch[2], 10);
          gapStart = new Date(currentYear, pMonth, pDay + 1);
        }
      }

      const groupedData = getGroupedData(gapStart, now);

      // 시트 이름 및 타이틀 날짜 업데이트
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      
      const newSheetName = `${month}${day}`;
      ws.name = newSheetName;
      
      const titleCell = ws.getCell('A1');
      titleCell.value = `■ 시즌패스 판매 현황 (${month}/${day} ${hours}:${minutes} 기준)`;

      // 열 숨김 해제 (F, G열)
      ws.getColumn(6).hidden = false;
      ws.getColumn(7).hidden = false;

      // 5행 헤더 날짜 업데이트
      const f5 = ws.getCell('F5');
      
      const sMonth = String(gapStart.getMonth() + 1).padStart(2, '0');
      const sDay = String(gapStart.getDate()).padStart(2, '0');
      
      if (sMonth === month && sDay === day) {
        f5.value = `日 판매\n(${month}/${day})`;
      } else {
        f5.value = `누적 판매\n(${sMonth}/${sDay}~${month}/${day})`;
      }

      const startD = Date.UTC(currentYear, 3, 14); // 4월 14일
      const endD = Date.UTC(currentYear, now.getMonth(), now.getDate());
      const diffDays = Math.floor((endD - startD) / (1000 * 60 * 60 * 24)) + 1;
      
      const h5 = ws.getCell('H5');
      h5.value = `2026년\n(4/14~${month}/${day} ${diffDays}日)`;
      
      let currentC1 = '';
      let currentC2 = '';
      let currentC3 = '';
      
      // 7행부터 시작 (1-indexed) - 6행은 헤더(수량/매출)
      const rowCount = ws.rowCount;
      for (let i = 7; i <= rowCount; i++) {
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
          continue;
        }

        // 매칭 키 생성
        const normC1 = currentC1.replace(/\r\n|\n/g, '');
        const normC2 = currentC2.replace(/\r\n|\n/g, '');
        const normC3 = currentC3.replace(/\r\n|\n/g, '');
        const normTarget = targetVal.replace(/\r\n|\n/g, '');

        const matchingGroup = groupedData.find(g => {
          const gC1 = g.category1.replace(/\s+/g, '');
          const gC2 = g.category2.replace(/\s+/g, '');
          const gC3 = g.category3.replace(/\s+/g, '');
          const gTarget = g.target.replace(/\s+/g, '');
          
          const mC1NoSpace = normC1.replace(/\s+/g, '');
          const mC2NoSpace = normC2.replace(/\s+/g, '');
          const mC3NoSpace = normC3.replace(/\s+/g, '');
          const mTargetNoSpace = normTarget.replace(/\s+/g, '');
          
          return gC1 === mC1NoSpace && gC2 === mC2NoSpace && gC3 === mC3NoSpace && gTarget === mTargetNoSpace;
        });

        if (matchingGroup) {
          // F열 (6) = 오늘 수량, G열 (7) = 오늘 매출
          row.getCell(6).value = matchingGroup.qty_today;
          row.getCell(7).value = matchingGroup.revenue_today;
          // H열 (8) = 26년 수량 누계, I열 (9) = 26년 매출 누계
          row.getCell(8).value = matchingGroup.qty_2026;
          row.getCell(9).value = matchingGroup.revenue_2026; 
        } else {
          // 일치하는 항목이 없을 경우 템플릿의 기존 찌꺼기 데이터 초기화
          // 단, 수식(Formula)이 있는 셀은 덮어쓰지 않도록 보호
          [6, 7, 8, 9].forEach(col => {
            const cell = row.getCell(col);
            if (!cell.formula && cell.type !== ExcelJS.ValueType.Formula) {
              cell.value = 0;
            }
          });
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `2026워터시즌권판매실적_${newSheetName}.xlsx`);
    } catch (error) {
      console.error('엑셀 다운로드 중 오류 발생:', error);
      alert('엑셀 템플릿을 처리하는 중 오류가 발생했습니다.');
    }
  };

  if (isLoading) {
    return <div className="tracker-loading">데이터를 불러오는 중입니다...</div>;
  }

  const chartData = getGroupedData().reduce((acc: any[], curr) => {
    const name = curr.category1.replace(/\r\n|\n/g, '');
    const existing = acc.find(item => item.name === name);
    if (existing) {
      existing.매출_2025 += Number(curr.revenue_2025 || 0);
      existing.매출_2026 += Number(curr.revenue_2026 || 0);
      existing.수량_2025 += Number(curr.qty_2025 || 0);
      existing.수량_2026 += Number(curr.qty_2026 || 0);
    } else {
      acc.push({
        name: name,
        매출_2025: Number(curr.revenue_2025 || 0),
        매출_2026: Number(curr.revenue_2026 || 0),
        수량_2025: Number(curr.qty_2025 || 0),
        수량_2026: Number(curr.qty_2026 || 0)
      });
    }
    return acc;
  }, []);

  const category3Map = new Map();
  const targetMap = new Map();
  const regionMap = new Map(); // 기존 구매자 유형(일반/지역주민/임직원)
  const realRegionMap = new Map(); // 실제 주소지 기반 시/군/구 지역

  validOrders.forEach(o => {
    const mapped = getMappedCategory(o);
    
    // 1. 소분류 (권종)
    const cat3 = mapped.category3.replace(/\r\n|\n/g, '');
    const currentCat3 = category3Map.get(cat3) || { name: cat3, value: 0 };
    currentCat3.value += 1;
    category3Map.set(cat3, currentCat3);

    // 2. 타겟별 (인원권)
    const tgt = mapped.target.replace(/\r\n|\n/g, '');
    const currentTgt = targetMap.get(tgt) || { name: tgt, value: 0 };
    currentTgt.value += 1;
    targetMap.set(tgt, currentTgt);

    // 3. 구매자 유형 (category2 기반)
    let regionName = mapped.category2.replace(/\r\n|\n/g, '');
    if (regionName === '일반') regionName = '일반(타지역)';
    else if (regionName === '지역주민') regionName = '지역주민(강원)';
    
    const currentRegion = regionMap.get(regionName) || { name: regionName, value: 0 };
    currentRegion.value += 1;
    regionMap.set(regionName, currentRegion);

    // 4. 실제 거주지 지역 (address 컬럼 기반 시/군/구 파싱)
    let realRegionKey = '주소 미상';
    if (o.address && o.address.trim() !== '') {
      const parts = o.address.split(' ').filter(Boolean);
      // 시, 군, 구로 끝나는 단어 찾기 (예: 원주시, 송파구, 홍천군)
      const cityToken = parts.find(p => p.endsWith('시') || p.endsWith('군') || p.endsWith('구'));
      if (cityToken) {
        realRegionKey = cityToken;
      } else if (parts.length >= 1) {
        realRegionKey = parts[0]; // 시군구가 없으면 첫 단어(도/광역시) 사용
      }
    }
    const currentRealRegion = realRegionMap.get(realRegionKey) || { name: realRegionKey, value: 0 };
    currentRealRegion.value += 1;
    realRegionMap.set(realRegionKey, currentRealRegion);
  });

  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent, name, value } = props;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.05) return null; // 5% 미만은 라벨 생략 (혼잡 방지)

    return (
      <text x={x} y={y} fill="#ffffff" textAnchor="middle" dominantBaseline="central" style={{ pointerEvents: 'none', filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.3))' }}>
        <tspan x={x} dy="-0.4em" fontSize="13" fontWeight="700">{name}</tspan>
        <tspan x={x} dy="1.4em" fontSize="11" fontWeight="600">{value}매 ({(percent * 100).toFixed(0)}%)</tspan>
      </text>
    );
  };

  const pieCategory3Data = Array.from(category3Map.values()).sort((a,b) => b.value - a.value);
  const pieTargetData = Array.from(targetMap.values()).sort((a,b) => b.value - a.value);
  const pieRegionData = Array.from(regionMap.values()).sort((a,b) => b.value - a.value);
  const pieRealRegionData = Array.from(realRegionMap.values()).sort((a,b) => b.value - a.value);

  return (
    <div className="tracker-container">
      <header className="tracker-header">
        <div>
          <h1 className="tracker-title">시즌권 주문 추적 대시보드</h1>
          <p className="tracker-subtitle">
            <span style={{ fontWeight: 600, color: '#3b82f6', marginRight: '8px' }}>({currentTimeString} 기준 누계 현황)</span>
            2025년 대비 2026년 시즌권 실시간 판매 실적을 대분류(일반/특가/특별권종/프로모션) 기준으로 분석합니다.
          </p>
        </div>
        <button className="btn-download" onClick={downloadExcel}>
          <Download size={18} />
          <span>실적 엑셀 다운로드 (자동양식)</span>
        </button>
      </header>

      <div className="tracker-filter-bar">
        <div className="filter-group">
          <span className="filter-label">기간 검색</span>
          <input type="date" className="filter-input" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
          <span className="filter-separator">~</span>
          <input type="date" className="filter-input" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
          <button 
            className="filter-btn primary"
            onClick={handleSearch}
            disabled={isSearching || !customStartDate || !customEndDate}
          >
            {isSearching ? <div className="spinner-small" /> : '조회'}
          </button>
          {(activeStartDate || activeEndDate) && (
            <button className="filter-btn secondary" onClick={handleReset}>초기화</button>
          )}
        </div>
      </div>

      {isSearching ? (
        <div style={{ textAlign: 'center', padding: '100px 0', animation: 'fadeIn 0.3s ease-out' }}>
          <div style={{ width: '40px', height: '40px', border: '4px solid #e2e8f0', borderTop: '4px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }}></div>
          <p style={{ fontWeight: 700, fontSize: '18px', color: '#475569', margin: 0 }}>조건에 맞는 데이터를 집계하고 있습니다...</p>
          <p style={{ fontSize: '14px', color: '#94a3b8', marginTop: '8px' }}>잠시만 기다려 주세요.</p>
        </div>
      ) : (
        <div style={{ animation: 'fadeIn 0.4s ease-out' }}>
          <div className="tracker-kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon-wrapper blue">
                <CreditCard size={24} />
          </div>
          <div className="kpi-content">
            <p className="kpi-label">총 누적 매출액 (26년)</p>
            <h3 className="kpi-value">{totalRevenue2026.toLocaleString()} 원</h3>
            <p className="kpi-comparison">
              <span className="text-gray">25년 베이스: {totalRevenue2025.toLocaleString()} 원</span>
            </p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrapper purple">
            <Users size={24} />
          </div>
          <div className="kpi-content">
            <p className="kpi-label">총 누적 판매 수량 (26년)</p>
            <h3 className="kpi-value">{totalQty2026.toLocaleString()} 매</h3>
            <p className="kpi-comparison" style={{ color: Number(qtyGrowthRate) >= 0 ? '#10b981' : '#ef4444' }}>
              <span>25년 대비 성장률: {Number(qtyGrowthRate) > 0 ? '+' : ''}{qtyGrowthRate}%</span>
            </p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon-wrapper green">
            <TrendingUp size={24} />
          </div>
          <div className="kpi-content">
            <p className="kpi-label">25년 목표 대비 매출 달성률</p>
            <h3 className="kpi-value">{achievementRate}%</h3>
            <p className="kpi-comparison">
              <span className="text-gray">{activeStartDate ? '해당 기간 내 달성 비중' : '전체 기준'}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="tracker-charts-grid">
        <div className="chart-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px' }}>
          <div>
            <h3 className="chart-title">대분류별 매출 현황 (25 vs 26 누계)</h3>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={chartData} margin={{ top: 20, right: 60, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} tickFormatter={(val) => `${(val / 10).toLocaleString()}만`} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }} width={70} />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    formatter={(value: any) => [`${(Number(value) * 1000).toLocaleString()} 원`, '매출']}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                  <Bar dataKey="매출_2025" name="25년 매출" fill="#94a3b8" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    <LabelList dataKey="매출_2025" position="right" formatter={(val: any) => val > 0 ? `${(val/10).toFixed(0)}만` : ''} fill="#94a3b8" fontSize={12} />
                  </Bar>
                  <Bar dataKey="매출_2026" name="26년 매출" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    <LabelList dataKey="매출_2026" position="right" formatter={(val: any) => val > 0 ? `${(val/10).toFixed(0)}만` : ''} fill="#3b82f6" fontSize={12} fontWeight="bold" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 className="chart-title">대분류별 수량 현황 (25 vs 26 누계)</h3>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={chartData} margin={{ top: 20, right: 50, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }} width={70} />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    formatter={(value: any) => [`${Number(value).toLocaleString()} 매`, '수량']}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                  <Bar dataKey="수량_2025" name="25년 수량" fill="#cbd5e1" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    <LabelList dataKey="수량_2025" position="right" formatter={(val: any) => val > 0 ? `${val}매` : ''} fill="#64748b" fontSize={12} />
                  </Bar>
                  <Bar dataKey="수량_2026" name="26년 수량" fill="#60a5fa" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    <LabelList dataKey="수량_2026" position="right" formatter={(val: any) => val > 0 ? `${val}매` : ''} fill="#2563eb" fontSize={12} fontWeight="bold" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        
        {/* 권종별/타겟별/지역별 파이 차트 추가 */}
        <div className="chart-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '40px', marginTop: '24px' }}>
          <div>
            <h3 className="chart-title">권종별(소분류) 판매 비중</h3>
            <div className="chart-wrapper" style={{ minHeight: '400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieCategory3Data}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={140}
                    paddingAngle={2}
                    dataKey="value"
                    labelLine={false}
                    label={renderCustomizedLabel}
                  >
                    {pieCategory3Data.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value) => [`${value}매`, '수량']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 className="chart-title">타겟별(인원권) 판매 비중</h3>
            <div className="chart-wrapper" style={{ minHeight: '400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieTargetData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={140}
                    paddingAngle={2}
                    dataKey="value"
                    labelLine={false}
                    label={renderCustomizedLabel}
                  >
                    {pieTargetData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value) => [`${value}매`, '수량']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 className="chart-title">구매자 지역/유형 비중 (상품 기반)</h3>
            <div className="chart-wrapper" style={{ minHeight: '400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieRegionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={140}
                    paddingAngle={2}
                    dataKey="value"
                    labelLine={false}
                    label={renderCustomizedLabel}
                  >
                    {pieRegionData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[(index + 5) % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value) => [`${value}매`, '수량']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <h3 className="chart-title">실거주지(시·군·구) 기준 전체 판매 수량</h3>
            <div className="chart-wrapper" style={{ height: '400px', overflowY: 'auto', paddingRight: '10px' }}>
              <ResponsiveContainer width="100%" height={Math.max(400, pieRealRegionData.length * 40)}>
                <BarChart layout="vertical" data={pieRealRegionData} margin={{ top: 10, right: 40, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 13, fontWeight: 600 }} width={100} />
                  <RechartsTooltip 
                    cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                    formatter={(value: any) => [`${value} 매`, '수량']}
                  />
                  <Bar dataKey="value" name="수량" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    <LabelList dataKey="value" position="right" formatter={(val: any) => val > 0 ? `${val}매` : ''} fill="#059669" fontSize={12} fontWeight="bold" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        
        <div className="chart-card" style={{ overflowX: 'auto' }}>
          <h3 className="chart-title">대분류별 실적 요약 (25년 vs 26년)</h3>
          <div className="recent-orders-list">
            <table className="orders-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{textAlign: 'left'}}>구분</th>
                  <th style={{textAlign: 'right'}}>25년 수량</th>
                  <th style={{textAlign: 'right'}}>26년 수량</th>
                  <th style={{textAlign: 'right'}}>수량 증감율</th>
                  <th style={{textAlign: 'right'}}>25년 매출</th>
                  <th style={{textAlign: 'right'}}>26년 매출</th>
                  <th style={{textAlign: 'right'}}>매출 증감율</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((item, idx) => {
                  const revenueGrowth = item.매출_2025 > 0 ? (((item.매출_2026 - item.매출_2025) / item.매출_2025) * 100).toFixed(1) : '0.0';
                  const isRevPositive = Number(revenueGrowth) > 0;
                  
                  const qtyGrowth = item.수량_2025 > 0 ? (((item.수량_2026 - item.수량_2025) / item.수량_2025) * 100).toFixed(1) : '0.0';
                  const isQtyPositive = Number(qtyGrowth) > 0;
                  
                  return (
                    <tr key={idx}>
                      <td style={{fontWeight: 'bold', color: '#1e293b'}}>{item.name}</td>
                      <td style={{textAlign: 'right', color: '#64748b'}}>{item.수량_2025.toLocaleString()} 매</td>
                      <td style={{textAlign: 'right', fontWeight: 'bold'}}>{item.수량_2026.toLocaleString()} 매</td>
                      <td style={{textAlign: 'right', color: isQtyPositive ? '#10b981' : (Number(qtyGrowth) < 0 ? '#ef4444' : '#64748b'), fontWeight: 'bold'}}>
                        {isQtyPositive ? '+' : ''}{qtyGrowth}%
                      </td>
                      <td style={{textAlign: 'right', color: '#64748b'}}>{(item.매출_2025 * 1000).toLocaleString()} 원</td>
                      <td style={{textAlign: 'right', fontWeight: 'bold'}}>{(item.매출_2026 * 1000).toLocaleString()} 원</td>
                      <td style={{textAlign: 'right', color: isRevPositive ? '#10b981' : (Number(revenueGrowth) < 0 ? '#ef4444' : '#64748b'), fontWeight: 'bold'}}>
                        {isRevPositive ? '+' : ''}{revenueGrowth}%
                      </td>
                    </tr>
                  )
                })}
                {(() => {
                  const sumQty25 = chartData.reduce((acc, cur) => acc + cur.수량_2025, 0);
                  const sumQty26 = chartData.reduce((acc, cur) => acc + cur.수량_2026, 0);
                  const sumRev25 = chartData.reduce((acc, cur) => acc + cur.매출_2025, 0);
                  const sumRev26 = chartData.reduce((acc, cur) => acc + cur.매출_2026, 0);
                  
                  const qtyGrowth = sumQty25 > 0 ? (((sumQty26 - sumQty25) / sumQty25) * 100).toFixed(1) : '0.0';
                  const isQtyPositive = Number(qtyGrowth) > 0;
                  
                  const revGrowth = sumRev25 > 0 ? (((sumRev26 - sumRev25) / sumRev25) * 100).toFixed(1) : '0.0';
                  const isRevPositive = Number(revGrowth) > 0;
                  
                  return (
                    <tr style={{ backgroundColor: '#f1f5f9', borderTop: '2px solid #94a3b8' }}>
                      <td style={{fontWeight: '800', color: '#0f172a'}}>전체 합계</td>
                      <td style={{textAlign: 'right', fontWeight: '700', color: '#475569'}}>{sumQty25.toLocaleString()} 매</td>
                      <td style={{textAlign: 'right', fontWeight: '800', color: '#0f172a'}}>{sumQty26.toLocaleString()} 매</td>
                      <td style={{textAlign: 'right', color: isQtyPositive ? '#059669' : (Number(qtyGrowth) < 0 ? '#dc2626' : '#475569'), fontWeight: '800'}}>
                        {isQtyPositive ? '+' : ''}{qtyGrowth}%
                      </td>
                      <td style={{textAlign: 'right', fontWeight: '700', color: '#475569'}}>{(sumRev25 * 1000).toLocaleString()} 원</td>
                      <td style={{textAlign: 'right', fontWeight: '800', color: '#0f172a'}}>{(sumRev26 * 1000).toLocaleString()} 원</td>
                      <td style={{textAlign: 'right', color: isRevPositive ? '#059669' : (Number(revGrowth) < 0 ? '#dc2626' : '#475569'), fontWeight: '800'}}>
                        {isRevPositive ? '+' : ''}{revGrowth}%
                      </td>
                    </tr>
                  );
                })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SeasonPassTracker;
