import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, ArrowLeft, List, Calendar as CalendarIcon } from 'lucide-react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Bar, Cell } from 'recharts';
import './PackageSalesDashboard.css';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', borderRadius: '8px', color: '#f8fafc' }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: 'bold' }}>{payload[0].payload.name}</p>
        <p style={{ margin: 0, color: '#93c5fd' }}>매출: {payload[0].value.toLocaleString()}원</p>
        <p style={{ margin: '4px 0 0 0', color: '#6ee7b7' }}>건수: {payload[0].payload.count}건</p>
      </div>
    );
  }
  return null;
};

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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [selectedPackage, setSelectedPackage] = useState<string>('all');
  const [selectedComponent, setSelectedComponent] = useState<string>('all');
  const [currentMonth, setCurrentMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showMonthlyList, setShowMonthlyList] = useState(false);



  const fetchData = async () => {
    setIsProcessing(true);
    try {
      let allData: any[] = [];
      let from = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: dbData, error } = await supabase
          .from('package_orders')
          .select('*')
          .order('order_date', { ascending: false })
          .range(from, from + step - 1);

        if (error) throw error;
        
        if (dbData && dbData.length > 0) {
          allData = [...allData, ...dbData];
          if (dbData.length < step) {
            hasMore = false;
          } else {
            from += step;
          }
        } else {
          hasMore = false;
        }
      }

      if (allData.length > 0) {
        const parsedData: PackageOrder[] = allData.map(d => ({
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
        const validOrders = parsedData.filter(d => d.status.includes('결제완료') || d.status.includes('예약완료'));
        setData(validOrders);
      }
    } catch (err) {
      console.error('Error fetching package data:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const runServerSync = async (query: string) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) throw new Error('로그인 정보가 없습니다. 다시 로그인해주세요.');
    const response = await fetch(`/api/package-sync?${query}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
    if (!response.ok) throw new Error(result.error || '패키지 동기화를 시작하지 못했습니다.');
    return result;
  };

  const syncRecentOrders = async () => {
    setSyncMessage('');
    setIsSyncing(true);
    try {
      const result = await runServerSync('days=7');
      setSyncMessage(result.message || '최근 패키지 주문 동기화가 완료되었습니다.');
      await fetchData();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : '패키지 동기화 중 오류가 발생했습니다.');
    } finally {
      setIsSyncing(false);
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

  const extractCleanDate = (reservationDate: string, orderDate: string) => {
    const targetD = reservationDate || (orderDate ? orderDate.split('T')[0].split(' ')[0] : '');
    const rDate = targetD.replace(/\s/g, '').replace(/\./g, '-').replace(/\//g, '-');
    const trimmedDate = rDate.replace(/-+$/, '');
    if (trimmedDate.length === 8 && !trimmedDate.includes('-')) {
      return `${trimmedDate.slice(0,4)}-${trimmedDate.slice(4,6)}-${trimmedDate.slice(6,8)}`;
    }
    return trimmedDate;
  };

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
      const cleanDate = extractCleanDate(r.reservationDate, r.orderDate);

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
          const cleanDate = extractCleanDate(d.reservationDate, d.orderDate);
          
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
          <div 
            className={`cal-cell ${!isSameMonth(day, monthStart) ? 'disabled' : ''}`} 
            key={day.toString()}
            onClick={() => {
              if (isSameMonth(day, monthStart) && (hasCurrentData || hasPrevData)) {
                setSelectedDate(dateStr);
                setShowMonthlyList(false);
              }
            }}
            style={{ cursor: (isSameMonth(day, monthStart) && (hasCurrentData || hasPrevData)) ? 'pointer' : 'default' }}
          >
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
        <div className="cal-header-controls" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '16px', gap: '16px', position: 'relative' }}>
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} style={{background:'transparent', border:'none', cursor:'pointer', color:'#f8fafc'}}><ChevronLeft size={32}/></button>
          <h2 style={{margin:0, fontSize:'1.8rem', color:'#f8fafc'}}>{format(currentMonth, 'yyyy년 MM월')}</h2>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} style={{background:'transparent', border:'none', cursor:'pointer', color:'#f8fafc'}}><ChevronRight size={32}/></button>
          
          <button 
            className="pkg-monthly-list-btn"
            onClick={() => {
              setShowMonthlyList(true);
              setSelectedDate(null);
            }}
            style={{ position: 'absolute', right: 0 }}
          >
            <List size={18} style={{marginRight: '8px'}}/>
            월별 전체 내역 관리
          </button>
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

  const renderDetailView = () => {
    if (!selectedDate) return null;
    
    // Filter data for the specific day
    const dayData = filteredData.filter(d => {
      return extractCleanDate(d.reservationDate, d.orderDate) === selectedDate;
    });

    const dayRevenue = dayData.reduce((sum, d) => sum + d.paymentAmount, 0);
    const dayOrders = dayData.length;

    // Group by package
    const packageSales = dayData.reduce((acc, d) => {
      const key = d.normalizedPackageName;
      if (!acc[key]) acc[key] = { name: key, count: 0, revenue: 0 };
      acc[key].count += 1;
      acc[key].revenue += d.paymentAmount;
      return acc;
    }, {} as Record<string, {name: string, count: number, revenue: number}>);
    const dayPackageChartData = Object.values(packageSales).sort((a, b) => b.revenue - a.revenue);

    return (
      <div className="pkg-detail-view animate-fade-in">
        <div className="pkg-detail-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <button onClick={() => setSelectedDate(null)} className="pkg-back-btn" style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', marginRight: '16px' }}>
            <ArrowLeft size={20} style={{ marginRight: '8px' }}/> 돌아가기
          </button>
          <h2 style={{ margin: 0, color: '#f8fafc' }}>{selectedDate} 패키지 판매 상세 내역</h2>
        </div>

        <div className="pkg-summary-cards" style={{ marginBottom: '32px' }}>
          <div className="pkg-card">
            <h3>해당 일자 주문 건수</h3>
            <div className="pkg-card-value">{dayOrders.toLocaleString()}건</div>
          </div>
          <div className="pkg-card">
            <h3>해당 일자 결제 금액 (매출)</h3>
            <div className="pkg-card-value text-primary">{dayRevenue.toLocaleString()}원</div>
          </div>
          <div className="pkg-card">
            <h3>판매된 상품 종류</h3>
            <div className="pkg-card-value">{dayPackageChartData.length}개</div>
          </div>
        </div>
        
        {dayPackageChartData.length > 0 && (
          <div className="pkg-chart-panel" style={{ marginBottom: '32px' }}>
            <h3>🏆 일일 상품별 매출 현황</h3>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={dayPackageChartData.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" stroke="#94a3b8" tickFormatter={(v) => (v / 10000).toFixed(0) + '만'} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" width={140} tick={{fontSize: 12, fill: '#f8fafc'}} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" fill="#8b5cf6" name="매출" radius={[0, 6, 6, 0]}>
                    {dayPackageChartData.slice(0, 10).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="pkg-table-container" style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
          <h3 style={{ padding: '20px', margin: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc' }}>📋 일일 주문 목록</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="pkg-data-table" style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
              <thead>
                <tr style={{ background: 'rgba(0, 0, 0, 0.2)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px' }}>주문번호</th>
                  <th style={{ padding: '12px 16px' }}>채널</th>
                  <th style={{ padding: '12px 16px' }}>상품명</th>
                  <th style={{ padding: '12px 16px' }}>예약일</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>결제금액</th>
                  <th style={{ padding: '12px 16px' }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {dayData.map((order, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{order.orderId}</td>
                    <td style={{ padding: '12px 16px' }}>{order.channel}</td>
                    <td style={{ padding: '12px 16px', color: '#f8fafc' }}>{order.rawPackageName}</td>
                    <td style={{ padding: '12px 16px' }}>{order.reservationDate}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold' }}>{order.paymentAmount.toLocaleString()}원</td>
                    <td style={{ padding: '12px 16px' }}><span className="pkg-status-badge">{order.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderMonthlyOrderList = () => {
    const targetPrefix = format(currentMonth, 'yyyy-MM');
    const monthData = filteredData.filter(d => {
      return extractCleanDate(d.reservationDate, d.orderDate).startsWith(targetPrefix);
    });
    
    // sorting by orderDate descending
    monthData.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());

    return (
      <div className="pkg-detail-view animate-fade-in">
        <div className="pkg-detail-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <button onClick={() => setShowMonthlyList(false)} className="pkg-back-btn" style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', marginRight: '16px' }}>
            <CalendarIcon size={20} style={{ marginRight: '8px' }}/> 달력으로 돌아가기
          </button>
          <h2 style={{ margin: 0, color: '#f8fafc' }}>{format(currentMonth, 'yyyy년 MM월')} 월간 전체 주문내역</h2>
        </div>

        <div className="pkg-table-container" style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
          <h3 style={{ padding: '20px', margin: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📋 전체 주문 목록 ({monthData.length.toLocaleString()}건)</span>
          </h3>
          <div style={{ overflowX: 'auto', maxHeight: '700px', overflowY: 'auto' }}>
            <table className="pkg-data-table" style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: 'rgba(15, 23, 42, 0.95)', textAlign: 'left', backdropFilter: 'blur(8px)' }}>
                  <th style={{ padding: '12px 16px' }}>주문일시</th>
                  <th style={{ padding: '12px 16px' }}>주문번호</th>
                  <th style={{ padding: '12px 16px' }}>채널</th>
                  <th style={{ padding: '12px 16px' }}>상품명</th>
                  <th style={{ padding: '12px 16px' }}>예약일</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>결제금액</th>
                  <th style={{ padding: '12px 16px' }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {monthData.map((order, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '12px 16px', fontSize: '0.85rem', color: '#94a3b8' }}>{order.orderDate}</td>
                    <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>{order.orderId}</td>
                    <td style={{ padding: '12px 16px' }}>{order.channel}</td>
                    <td style={{ padding: '12px 16px', color: '#f8fafc' }}>{order.rawPackageName}</td>
                    <td style={{ padding: '12px 16px' }}>{order.reservationDate}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold' }}>{order.paymentAmount.toLocaleString()}원</td>
                    <td style={{ padding: '12px 16px' }}><span className="pkg-status-badge">{order.status}</span></td>
                  </tr>
                ))}
                {monthData.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>해당 월에 주문 내역이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pkg-dashboard-container animate-fade-in">
      <div className="pkg-header">
        <h1>📦 패키지 판매 현황 대시보드</h1>
        <p>관리자 주문 데이터를 안전하게 동기화해 판매 추이를 분석합니다.</p>
      </div>

      <div className="pkg-actions-bar">
         <button onClick={fetchData} className="pkg-refresh-btn" disabled={isProcessing}>
           {isProcessing ? '🔄 데이터 불러오는 중...' : '🔄 최신 DB 데이터 새로고침'}
         </button>
         <button onClick={() => void syncRecentOrders()} className="pkg-server-sync-btn" disabled={isSyncing || isProcessing}>
           {isSyncing ? '☁️ 서버에서 최근 주문 동기화 중...' : '☁️ 최근 7일 서버 직접 동기화'}
         </button>
         <div style={{ marginLeft: 'auto' }}>
           <label className="pkg-upload-btn-small">
             <input type="file" accept=".xlsx, .xls" onChange={handleFileUpload} hidden />
             <span>📤 수동 엑셀 업로드 (백업용)</span>
           </label>
         </div>
      </div>
      {syncMessage && <p className="pkg-sync-message">{syncMessage}</p>}

      {data.length > 0 && (
        <div className="pkg-content">
          {selectedDate ? (
            renderDetailView()
          ) : showMonthlyList ? (
            renderMonthlyOrderList()
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
};
export default PackageSalesDashboard;
