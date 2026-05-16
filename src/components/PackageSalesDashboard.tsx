import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './PackageSalesDashboard.css';

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
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 4, 1)); // 2026년 5월

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
        
        const validOrders = formatted.filter(d => d.status.includes('결제완료') || d.status.includes('예약완료'));
        setData(validOrders);
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

  const formatCurrency = (val: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(val);
  const getCumulativeStats = () => {
    let currentAmt = 0; let currentPpl = 0;
    let prevAmt = 0; let prevPpl = 0;
    let currentYearAmt = 0; let currentYearPpl = 0;
    let prevYearAmt = 0; let prevYearPpl = 0;
    
    const targetPrefix = format(currentMonth, 'yyyy-MM');
    const prevPrefix = format(subMonths(currentMonth, 12), 'yyyy-MM');
    const targetYearPrefix = format(currentMonth, 'yyyy');
    const prevYearPrefix = format(subMonths(currentMonth, 12), 'yyyy');
    
    filteredData.forEach(r => {
      // Use reservationDate for grouping. Fallback to orderDate
      const targetD = r.reservationDate || r.orderDate.split(' ')[0];
      const rDate = targetD.replace(/\./g, '-').replace(/\//g, '-');
      let cleanDate = '';
      if (rDate.length === 8) cleanDate = `${rDate.slice(0,4)}-${rDate.slice(4,6)}-${rDate.slice(6,8)}`;
      else cleanDate = rDate;

      if (cleanDate.startsWith(targetPrefix)) {
        currentAmt += r.paymentAmount;
        currentPpl += 1;
      } else if (cleanDate.startsWith(prevPrefix)) {
        prevAmt += r.paymentAmount;
        prevPpl += 1;
      }
      
      if (cleanDate.startsWith(targetYearPrefix)) {
        currentYearAmt += r.paymentAmount;
        currentYearPpl += 1;
      } else if (cleanDate.startsWith(prevYearPrefix)) {
        prevYearAmt += r.paymentAmount;
        prevYearPpl += 1;
      }
    });
    return { currentAmt, currentPpl, prevAmt, prevPpl, currentYearAmt, currentYearPpl, prevYearAmt, prevYearPpl };
  };
  const { currentAmt, currentPpl, prevAmt, prevPpl, currentYearAmt, currentYearPpl, prevYearAmt, prevYearPpl } = getCumulativeStats();

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const prevYearStr = format(subMonths(day, 12), 'yyyy-MM-dd');
        
        let currentDispAmt = 0; let currentDispQty = 0;
        let prevDispAmt = 0; let prevDispQty = 0;

        filteredData.forEach(d => {
          const targetD = d.reservationDate || d.orderDate.split(' ')[0];
          const rDate = targetD.replace(/\./g, '-').replace(/\//g, '-');
          let cleanDate = rDate.length === 8 ? `${rDate.slice(0,4)}-${rDate.slice(4,6)}-${rDate.slice(6,8)}` : rDate;
          
          if (cleanDate === dateStr) {
            currentDispAmt += d.paymentAmount;
            currentDispQty += 1;
          } else if (cleanDate === prevYearStr) {
            prevDispAmt += d.paymentAmount;
            prevDispQty += 1;
          }
        });

        const hasCurrentData = currentDispQty > 0;
        const hasPrevData = prevDispQty > 0;

        const isSunday = day.getDay() === 0;
        const isSaturday = day.getDay() === 6;

        days.push(
          <div className={`cal-cell ${!isSameMonth(day, monthStart) ? 'disabled' : ''}`} key={day.toString()}>
            <div className="cal-cell-header">
              <span className={`cal-date ${isSunday ? 'red-day' : ''} ${isSaturday ? 'blue-day' : ''}`}>{format(day, "d")}</span>
            </div>

            {(hasCurrentData || hasPrevData) && (
              <div className="cal-data-box">
                {hasCurrentData ? (
                  <div className="cal-data-row current">
                    <span className="year-label">올해</span>
                    <span className="amt">{(currentDispAmt / 10000).toFixed(0)}만</span>
                    <span className="qty">{currentDispQty}건</span>
                  </div>
                ) : (
                  <div className="cal-data-row current" style={{ opacity: 0.5 }}>
                    <span className="year-label">올해</span><span className="amt">-</span><span className="qty">-</span>
                  </div>
                )}
                
                {hasPrevData ? (() => {
                  const growthAmt = currentDispAmt - prevDispAmt;
                  const pct = prevDispAmt > 0 ? (growthAmt / prevDispAmt * 100).toFixed(0) : 0;
                  return (
                    <>
                      <div className="cal-data-row prev">
                        <span className="year-label">작년</span>
                        <span className="amt">{(prevDispAmt / 10000).toFixed(0)}만</span>
                        <span className="qty">{prevDispQty}건</span>
                      </div>
                      {hasCurrentData && (
                        <div className={`cal-yoy-bar ${growthAmt >= 0 ? 'up' : 'down'}`}>
                          {growthAmt >= 0 ? '▲' : '▼'} {Math.abs(Number(pct))}%
                        </div>
                      )}
                    </>
                  )
                })() : (
                  <div className="cal-yoy-bar empty">전년 비교데이터 없음</div>
                )}
              </div>
            )}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="cal-row" key={day.toString()}>{days}</div>);
      days = [];
    }

    return (
      <div className="calendar-container animate-fade-in">
        <div className="cal-header-controls" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '16px', gap: '16px' }}>
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} style={{background:'transparent', border:'none', cursor:'pointer', color:'#f8fafc'}}><ChevronLeft size={32}/></button>
          <h2 style={{margin:0, fontSize:'1.8rem', color:'#f8fafc'}}>{format(currentMonth, 'yyyy년 MM월')}</h2>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} style={{background:'transparent', border:'none', cursor:'pointer', color:'#f8fafc'}}><ChevronRight size={32}/></button>
        </div>
        <div className="cal-grid">
          <div className="cal-days-header" style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', textAlign:'center', padding:'10px 0', fontWeight:700, color:'#94a3b8', background:'rgba(0,0,0,0.2)', borderRadius:'12px 12px 0 0' }}>
            {['일','월','화','수','목','금','토'].map(d => <div key={d} style={{ color: d==='일'?'#ef4444':d==='토'?'#3b82f6':'' }}>{d}</div>)}
          </div>
          {rows}
        </div>
      </div>
    );
  };

  const uniquePackages = Array.from(new Set(data.map(d => d.normalizedPackageName))).sort();
  const commonComponents = ['객실', '워터파크', '관광곤돌라', '사계절썰매', '플라잉라인', '루지', '고카트', '조식'];
  const availableComponents = commonComponents.filter(c => data.some(d => d.components.includes(c)));

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

          <div className="cumulative-dashboard" style={{ marginBottom: '40px' }}>
            <h3 style={{fontSize:'1.3rem', color:'#f8fafc', marginBottom:'16px'}}>🏆 연간 전체 누적 실적 비교 (결제/방문일 기준, {format(currentMonth, 'yyyy')}년)</h3>
            <div className="dash-compare-container" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginBottom:'32px' }}>
              <div className="dash-column prev" style={{ background:'rgba(255,255,255,0.02)', padding:'20px', borderRadius:'16px', border:'1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ color:'#94a3b8', marginBottom:'16px' }}>{format(subMonths(currentMonth, 12), 'yyyy년')} 전체 누적 (전년도)</h4>
                <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(0,0,0,0.2)', padding:'12px 16px', borderRadius:'8px' }}>
                    <span style={{ color:'#94a3b8' }}>매출액</span>
                    <span style={{ fontWeight:700, fontSize:'1.1rem' }}>{formatCurrency(prevYearAmt)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(0,0,0,0.2)', padding:'12px 16px', borderRadius:'8px' }}>
                    <span style={{ color:'#94a3b8' }}>주문건수</span>
                    <span style={{ fontWeight:700, fontSize:'1.1rem' }}>{prevYearPpl.toLocaleString()} 건</span>
                  </div>
                </div>
              </div>
              <div className="dash-column current" style={{ background:'rgba(16, 185, 129, 0.05)', padding:'20px', borderRadius:'16px', border:'1px solid rgba(16, 185, 129, 0.2)' }}>
                <h4 style={{ color:'#10b981', marginBottom:'16px' }}>{format(currentMonth, 'yyyy년')} 전체 누적 (올해)</h4>
                <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(16, 185, 129, 0.1)', padding:'12px 16px', borderRadius:'8px' }}>
                    <span style={{ color:'#6ee7b7' }}>매출액</span>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontWeight:800, fontSize:'1.2rem', color:'#fff' }}>{formatCurrency(currentYearAmt)}</span>
                      {prevYearAmt > 0 && <span style={{ display:'block', fontSize:'0.85rem', color: currentYearAmt >= prevYearAmt ? '#34d399' : '#ef4444' }}>{currentYearAmt >= prevYearAmt ? '▲' : '▼'} {Math.abs((currentYearAmt-prevYearAmt)/prevYearAmt*100).toFixed(1)}%</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(16, 185, 129, 0.1)', padding:'12px 16px', borderRadius:'8px' }}>
                    <span style={{ color:'#6ee7b7' }}>주문건수</span>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontWeight:800, fontSize:'1.2rem', color:'#fff' }}>{currentYearPpl.toLocaleString()} 건</span>
                      {prevYearPpl > 0 && <span style={{ display:'block', fontSize:'0.85rem', color: currentYearPpl >= prevYearPpl ? '#34d399' : '#ef4444' }}>{currentYearPpl >= prevYearPpl ? '▲' : '▼'} {Math.abs((currentYearPpl-prevYearPpl)/prevYearPpl*100).toFixed(1)}%</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <h3 style={{fontSize:'1.3rem', color:'#f8fafc', marginBottom:'16px'}}>📊 월간 영업 누적 실적 비교 (결제/방문일 기준, {format(currentMonth, 'MM')}월)</h3>
            <div className="dash-compare-container" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px', marginBottom:'32px' }}>
              <div className="dash-column prev" style={{ background:'rgba(255,255,255,0.02)', padding:'20px', borderRadius:'16px', border:'1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ color:'#94a3b8', marginBottom:'16px' }}>{format(subMonths(currentMonth, 12), 'yyyy년 MM월')} (전년 동월)</h4>
                <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(0,0,0,0.2)', padding:'12px 16px', borderRadius:'8px' }}>
                    <span style={{ color:'#94a3b8' }}>매출액</span>
                    <span style={{ fontWeight:700, fontSize:'1.1rem' }}>{formatCurrency(prevAmt)}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(0,0,0,0.2)', padding:'12px 16px', borderRadius:'8px' }}>
                    <span style={{ color:'#94a3b8' }}>주문건수</span>
                    <span style={{ fontWeight:700, fontSize:'1.1rem' }}>{prevPpl.toLocaleString()} 건</span>
                  </div>
                </div>
              </div>
              <div className="dash-column current" style={{ background:'rgba(59, 130, 246, 0.05)', padding:'20px', borderRadius:'16px', border:'1px solid rgba(59, 130, 246, 0.2)' }}>
                <h4 style={{ color:'#3b82f6', marginBottom:'16px' }}>{format(currentMonth, 'yyyy년 MM월')} (올해)</h4>
                <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(59, 130, 246, 0.1)', padding:'12px 16px', borderRadius:'8px' }}>
                    <span style={{ color:'#93c5fd' }}>매출액</span>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontWeight:800, fontSize:'1.2rem', color:'#fff' }}>{formatCurrency(currentAmt)}</span>
                      {prevAmt > 0 && <span style={{ display:'block', fontSize:'0.85rem', color: currentAmt >= prevAmt ? '#3b82f6' : '#ef4444' }}>{currentAmt >= prevAmt ? '▲' : '▼'} {Math.abs((currentAmt-prevAmt)/prevAmt*100).toFixed(1)}%</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(59, 130, 246, 0.1)', padding:'12px 16px', borderRadius:'8px' }}>
                    <span style={{ color:'#93c5fd' }}>주문건수</span>
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontWeight:800, fontSize:'1.2rem', color:'#fff' }}>{currentPpl.toLocaleString()} 건</span>
                      {prevPpl > 0 && <span style={{ display:'block', fontSize:'0.85rem', color: currentPpl >= prevPpl ? '#3b82f6' : '#ef4444' }}>{currentPpl >= prevPpl ? '▲' : '▼'} {Math.abs((currentPpl-prevPpl)/prevPpl*100).toFixed(1)}%</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {renderCalendar()}
        </div>
      )}
    </div>
  );
};
export default PackageSalesDashboard;
