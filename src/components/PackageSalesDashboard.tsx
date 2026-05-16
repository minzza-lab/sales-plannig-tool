import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import './PackageSalesDashboard.css';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  Area, Cell, Line, ComposedChart
} from 'recharts';

interface PackageOrder {
  orderId: string;
  channel: string;
  packageType: string;
  rawPackageName: string;
  normalizedPackageName: string;
  reservationDate: string;
  components: string;
  memberType: string;
  paymentMethod: string;
  orderAmount: number;
  paymentAmount: number;
  status: string;
  orderDate: string;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#d0ed57', '#a4de6c'];

const normalizePackageName = (name: string) => {
  if (!name) return '알 수 없음';
  let normalized = name.replace(/\(\d{1,2}\/\d{1,2}\)/g, ''); // Fix AK플라자 얼리버드
  // Remove trailing date like 6/6~7/3 (금,토) or just 5/25 (월)
  normalized = normalized.replace(/\s+\d{1,2}\/\d{1,2}(\s*~\s*\d{1,2}\/\d{1,2})?(\s*\(.*?\))?.*$/, '');
  // Remove starting dates like 5/22 ~ 6/5
  normalized = normalized.replace(/^\d{1,2}\/\d{1,2}(\s*~\s*\d{1,2}\/\d{1,2})?\s*/, '');
  normalized = normalized.replace(/^~\s*\d{1,2}\/\d{1,2}\s*/, ''); // Handle remaining '~ 5/20'
  normalized = normalized.replace(/^休,\s*/, '');
  normalized = normalized.replace(/\d{1,2}月웰리(WEEK|DAY)\s*/, '');
  
  return normalized.trim();
};

const PackageSalesDashboard: React.FC = () => {
  const [data, setData] = useState<PackageOrder[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string>('all');
  const [selectedComponent, setSelectedComponent] = useState<string>('all');

  useEffect(() => {
    fetchFromSupabase();
  }, []);

  const fetchFromSupabase = async () => {
    setIsProcessing(true);
    try {
      const { data: dbData, error } = await supabase
        .from('package_orders')
        .select('*');
        
      if (error) throw error;
      
      if (dbData && dbData.length > 0) {
        const formatted: PackageOrder[] = dbData.map(d => ({
          orderId: d.order_id,
          channel: d.channel || '',
          packageType: d.package_type || '',
          rawPackageName: d.raw_package_name || '',
          normalizedPackageName: d.normalized_package_name || '',
          reservationDate: d.reservation_date || '',
          components: d.components || '',
          memberType: d.member_type || '',
          paymentMethod: d.payment_method || '',
          orderAmount: Number(d.order_amount) || 0,
          paymentAmount: Number(d.payment_amount) || 0,
          status: d.status || '',
          orderDate: d.order_date || ''
        }));
        
        setData(formatted);
      }
    } catch (e) {
      console.error('Failed to fetch from Supabase', e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(5, jsonData.length); i++) {
          if (jsonData[i].some(cell => typeof cell === 'string' && cell.includes('주문번호'))) {
            headerRowIndex = i;
            break;
          }
        }

        const headers = jsonData[headerRowIndex].map(h => typeof h === 'string' ? h.replace(/\n/g, '') : h);
        const rows = jsonData.slice(headerRowIndex + 1);

        const getColIdx = (keywords: string[]) => headers.findIndex(h => h && keywords.some(kw => h.includes(kw)));

        const idxOrder = getColIdx(['주문번호']);
        const idxChannel = getColIdx(['채널']);
        const idxType = getColIdx(['패키지유형', '패키지 유형']);
        const idxName = getColIdx(['패키지명']);
        const idxResDate = getColIdx(['예약일']);
        const idxComp = getColIdx(['구성예약번호', '구성', '예약번호']);
        const idxMember = getColIdx(['회원유형']);
        const idxPayMethod = getColIdx(['결제구분']);
        const idxOrderAmt = getColIdx(['주문금액']);
        const idxPayAmt = getColIdx(['결제금액']);
        const idxStatus = getColIdx(['주문상태']);
        const idxOrderDate = getColIdx(['주문일시', '결제일시']);

        const parsedData: PackageOrder[] = [];
        rows.forEach(row => {
          if (!row[idxOrder]) return;
          
          const rawName = row[idxName] || '';
          const parseAmt = (val: any) => {
            if (!val) return 0;
            return Number(String(val).replace(/[^0-9-]/g, '')) || 0;
          };

          let oDateStr = row[idxOrderDate] || '';
          if (oDateStr.includes('\n')) {
             oDateStr = oDateStr.split('\n')[0].trim();
          }

          parsedData.push({
            orderId: String(row[idxOrder]),
            channel: row[idxChannel] || '',
            packageType: row[idxType] || '',
            rawPackageName: rawName,
            normalizedPackageName: normalizePackageName(rawName),
            reservationDate: String(row[idxResDate] || ''),
            components: row[idxComp] || '',
            memberType: row[idxMember] || '',
            paymentMethod: row[idxPayMethod] || '',
            orderAmount: parseAmt(row[idxOrderAmt]),
            paymentAmount: parseAmt(row[idxPayAmt]),
            status: row[idxStatus] || '',
            orderDate: oDateStr
          });
        });

        const validOrders = parsedData.filter(d => d.status.includes('결제완료') || d.status.includes('예약완료'));
        setData(validOrders);
      } catch (err) {
        console.error(err);
        alert('파일을 분석하는 중 오류가 발생했습니다.');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const filteredData = data.filter(d => {
    let match = true;
    if (selectedPackage !== 'all' && d.normalizedPackageName !== selectedPackage) match = false;
    if (selectedComponent !== 'all' && !d.components.includes(selectedComponent)) match = false;
    return match;
  });

  const totalOrders = filteredData.length;
  const totalRevenue = filteredData.reduce((sum, d) => sum + d.paymentAmount, 0);

  const packageSales = filteredData.reduce((acc, d) => {
    const key = d.normalizedPackageName;
    if (!acc[key]) acc[key] = { name: key, count: 0, revenue: 0 };
    acc[key].count += 1;
    acc[key].revenue += d.paymentAmount;
    return acc;
  }, {} as Record<string, {name: string, count: number, revenue: number}>);
  const packageChartData = Object.values(packageSales).sort((a, b) => b.revenue - a.revenue);

  const dateSales = filteredData.reduce((acc, d) => {
    const key = d.reservationDate;
    if (!acc[key]) acc[key] = { date: key, count: 0, revenue: 0 };
    acc[key].count += 1;
    acc[key].revenue += d.paymentAmount;
    return acc;
  }, {} as Record<string, {date: string, count: number, revenue: number}>);
  const dateChartData = Object.values(dateSales).sort((a, b) => a.date.localeCompare(b.date));

  // 1. 리드타임 분석
  const leadTimeBuckets: Record<string, number> = { '당일~3일': 0, '4~7일': 0, '8~14일': 0, '15~30일': 0, '31일 이상': 0 };
  // 2. 구성품(옵션) 분석
  const componentSales: Record<string, number> = {};
  // 3. 요일별 패키지 선호도 (히트맵용)
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const heatMapData: Record<string, Record<string, number>> = {};
  // 4. 회원/비회원 객단가
  const memberStats: Record<string, { count: number, revenue: number }> = {};

  filteredData.forEach(d => {
    // 리드타임 및 히트맵 처리
    const oDateStr = d.orderDate.split(' ')[0].replace(/\./g, '-').replace(/\//g, '-');
    const rDateStr = d.reservationDate.replace(/\./g, '-').replace(/\//g, '-');
    
    // YYYY-MM-DD 형식이 아닐 수 있으므로 방어 로직 추가
    const oDate = new Date(oDateStr.length === 8 ? `${oDateStr.slice(0,4)}-${oDateStr.slice(4,6)}-${oDateStr.slice(6,8)}` : oDateStr);
    const rDate = new Date(rDateStr.length === 8 ? `${rDateStr.slice(0,4)}-${rDateStr.slice(4,6)}-${rDateStr.slice(6,8)}` : rDateStr);
    
    if (!isNaN(oDate.getTime()) && !isNaN(rDate.getTime())) {
      const diff = Math.ceil((rDate.getTime() - oDate.getTime()) / (1000 * 3600 * 24));
      if (diff >= 0 && diff <= 3) leadTimeBuckets['당일~3일']++;
      else if (diff <= 7) leadTimeBuckets['4~7일']++;
      else if (diff <= 14) leadTimeBuckets['8~14일']++;
      else if (diff <= 30) leadTimeBuckets['15~30일']++;
      else if (diff > 30) leadTimeBuckets['31일 이상']++;

      const dayIdx = rDate.getDay();
      const dayStr = dayNames[dayIdx];
      const pkg = d.normalizedPackageName;
      if (!heatMapData[pkg]) heatMapData[pkg] = { '일':0, '월':0, '화':0, '수':0, '목':0, '금':0, '토':0 };
      heatMapData[pkg][dayStr]++;
    }

    // 구성품
    const comps = d.components.split(/[,+&]/).map(c => c.trim()).filter(Boolean);
    comps.forEach(c => {
      // 괄호 등 지저분한 문자 제거 (간단화)
      const cleanComp = c.replace(/\[.*?\]|\(.*?\)/g, '').trim();
      if (!cleanComp) return;
      if (!componentSales[cleanComp]) componentSales[cleanComp] = 0;
      componentSales[cleanComp] += d.paymentAmount;
    });

    // 회원 객단가
    let mType = d.memberType || '비회원';
    if (mType.includes('비회원')) mType = '비회원';
    else if (mType.includes('회원') || mType.includes('주주')) mType = '회원/주주';
    
    if (!memberStats[mType]) memberStats[mType] = { count: 0, revenue: 0 };
    memberStats[mType].count++;
    memberStats[mType].revenue += d.paymentAmount;
  });

  const leadTimeChartData = Object.keys(leadTimeBuckets).map(k => ({ name: k, '예약건수': leadTimeBuckets[k] }));
  
  const componentChartData = Object.keys(componentSales)
    .map(k => ({ name: k, revenue: componentSales[k] }))
    .sort((a,b) => b.revenue - a.revenue)
    .slice(0, 10);
    
  const memberChartData = Object.keys(memberStats).map(k => ({
    name: k,
    arppu: memberStats[k].count > 0 ? Math.round(memberStats[k].revenue / memberStats[k].count) : 0,
    count: memberStats[k].count
  })).sort((a, b) => b.arppu - a.arppu);

  // 히트맵용 Top 5 패키지 추출
  const topPackagesForHeatmap = packageChartData.slice(0, 8).map(p => p.name);

  const uniquePackages = Array.from(new Set(data.map(d => d.normalizedPackageName))).sort();
  const commonComponents = ['객실', '워터파크', '관광곤돌라', '사계절썰매', '플라잉라인', '루지', '고카트', '조식'];
  const availableComponents = commonComponents.filter(c => data.some(d => d.components.includes(c)));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', borderRadius: '8px', color: '#fff' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: '#60a5fa' }}>{label}</p>
          {payload.map((entry: any, index: number) => {
            const isCount = entry.name === '건수' || entry.name === '예약건수';
            return (
              <p key={index} style={{ margin: 0, color: entry.color || '#fff' }}>
                {entry.name}: {entry.value.toLocaleString()} {isCount ? '건' : '원'}
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="pkg-dashboard-container animate-fade-in">
      <div className="pkg-header">
        <h1>📦 패키지 판매 현황 대시보드</h1>
        <p>크롤러 봇이 실시간으로 수집한 Supabase 데이터를 바탕으로 판매 추이를 분석합니다.</p>
      </div>

      <div className="pkg-actions-bar">
         <button onClick={fetchFromSupabase} className="pkg-refresh-btn" disabled={isProcessing}>
           {isProcessing ? '🔄 데이터 불러오는 중...' : '🔄 최신 DB 데이터 새로고침'}
         </button>
         <div style={{ marginLeft: 'auto' }}>
           <label className="pkg-upload-btn-small">
             <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} hidden />
             <span>📤 수동 엑셀 업로드 (백업용)</span>
           </label>
         </div>
      </div>

      {data.length > 0 && (
        <div className="pkg-content">
          <div className="pkg-filters">
            <div className="filter-group">
              <label>상품별 조회 (통합됨)</label>
              <select value={selectedPackage} onChange={(e) => setSelectedPackage(e.target.value)}>
                <option value="all">전체 상품</option>
                {uniquePackages.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <label>상품 구성별 조회</label>
              <select value={selectedComponent} onChange={(e) => setSelectedComponent(e.target.value)}>
                <option value="all">전체 구성</option>
                {availableComponents.map(c => <option key={c} value={c}>{c} 포함 상품</option>)}
              </select>
            </div>
          </div>

          <div className="pkg-summary-cards">
            <div className="pkg-card">
              <h3>총 주문 건수</h3>
              <div className="pkg-card-value">{totalOrders.toLocaleString()}건</div>
            </div>
            <div className="pkg-card">
              <h3>총 결제 금액 (매출)</h3>
              <div className="pkg-card-value text-primary">{totalRevenue.toLocaleString()}원</div>
            </div>
            <div className="pkg-card">
              <h3>통합된 상품 종류</h3>
              <div className="pkg-card-value">{uniquePackages.length}개</div>
            </div>
          </div>

          <div className="pkg-charts-grid">
            <div className="pkg-chart-panel" style={{ gridColumn: '1 / -1' }}>
              <h3>🗓️ 다가오는 방문일(예약일) 기준 혼잡도 및 매출 예측</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={350}>
                  <ComposedChart data={dateChartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="date" stroke="#94a3b8" />
                    <YAxis yAxisId="left" stroke="#94a3b8" tickFormatter={(v) => (v / 10000).toFixed(0) + '만'} />
                    <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ color: '#fff' }} />
                    <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRevenue)" name="매출" />
                    <Line yAxisId="right" type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} name="건수" activeDot={{ r: 8 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pkg-chart-panel">
              <h3>⏳ 예약 리드타임 분석 (마케팅 타점)</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={leadTimeChartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="예약건수" fill="#f59e0b" radius={[6, 6, 0, 0]}>
                      {leadTimeChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pkg-chart-panel">
              <h3>💰 회원/비회원 객단가 비교 (ARPPU)</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={memberChartData} layout="vertical" margin={{ top: 10, right: 30, left: 80, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                    <XAxis type="number" stroke="#94a3b8" tickFormatter={(v) => (v / 10000).toFixed(0) + '만'} />
                    <YAxis type="category" dataKey="name" stroke="#94a3b8" />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="arppu" name="평균객단가" radius={[0, 6, 6, 0]}>
                      {memberChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#ec4899' : '#8b5cf6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pkg-chart-panel">
              <h3>🏆 상품별 매출 현황 (Top 10)</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={packageChartData.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                    <XAxis type="number" stroke="#94a3b8" tickFormatter={(v) => (v / 10000).toFixed(0) + '만'} />
                    <YAxis type="category" dataKey="name" stroke="#94a3b8" width={140} tick={{fontSize: 12, fill: '#f8fafc'}} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" fill="#8b5cf6" name="매출" radius={[0, 6, 6, 0]}>
                      {packageChartData.slice(0, 10).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pkg-chart-panel">
              <h3>🧩 패키지 세부 구성품 선호도 (매출 기여도)</h3>
              <div className="chart-wrapper">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={componentChartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                    <XAxis type="number" stroke="#94a3b8" tickFormatter={(v) => (v / 10000).toFixed(0) + '만'} />
                    <YAxis type="category" dataKey="name" stroke="#94a3b8" width={120} tick={{fontSize: 12}} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" fill="#14b8a6" name="매출" radius={[0, 6, 6, 0]}>
                      {componentChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[(index + 4) % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pkg-chart-panel" style={{ gridColumn: '1 / -1' }}>
              <h3>🔥 방문 요일별 상품 선호도 히트맵 (Top 8)</h3>
              <div className="heatmap-container">
                <div className="heatmap-grid">
                  <div className="heatmap-header-cell">상품명 \ 요일</div>
                  {dayNames.map(day => <div key={day} className="heatmap-header-cell">{day}</div>)}
                  
                  {topPackagesForHeatmap.map(pkg => (
                    <React.Fragment key={pkg}>
                      <div className="heatmap-row-header">{pkg}</div>
                      {dayNames.map(day => {
                        const count = heatMapData[pkg]?.[day] || 0;
                        // Calculate color intensity (0 to 1) based on max count
                        // Assuming max count is roughly 50 for color scaling, cap at 1
                        const intensity = Math.min(count / 20, 1);
                        const bgOpacity = count > 0 ? 0.2 + (intensity * 0.8) : 0.05;
                        return (
                          <div 
                            key={`${pkg}-${day}`} 
                            className="heatmap-cell"
                            style={{ 
                              backgroundColor: `rgba(239, 68, 68, ${bgOpacity})`,
                              color: count > 0 ? '#fff' : '#64748b'
                            }}
                          >
                            {count}건
                          </div>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PackageSalesDashboard;
