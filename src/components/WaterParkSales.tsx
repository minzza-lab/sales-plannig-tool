import React, { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, Label, LabelList
} from 'recharts';
import { 
  UploadCloud, FileSpreadsheet, Activity, DollarSign, Users, AlertCircle, 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, ArrowLeft,
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Thermometer, Save
} from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import './WaterParkSales.css';

type ReportType = 'CUSTOMER_TYPE' | 'HOURLY_SALES' | 'RATE_ZONE' | 'UNKNOWN';

interface WeatherData {
  temp: number;
  rain: number;
  code: number;
}

interface ParsedReport {
  id: string;
  report_date: string;
  type: ReportType;
  title: string;
  summary: { 
    totalAmount: number; 
    totalQty: number; 
    label: string; 
    qtyLabel: string;
    weather?: WeatherData;
  };
  chartData: any[];
  tableData: any[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658'];
const LAT = 37.486;
const LNG = 128.223;

const KOREAN_HOLIDAYS: Record<string, string> = {
  // 2025년
  '2025-01-01': '신정', '2025-01-28': '설날 연휴', '2025-01-29': '설날', '2025-01-30': '설날 연휴',
  '2025-03-01': '삼일절', '2025-03-03': '대체공휴일(삼일절)',
  '2025-05-05': '어린이날/부처님오신날', '2025-05-06': '대체공휴일(부처님오신날)',
  '2025-06-06': '현충일', '2025-08-15': '광복절',
  '2025-10-03': '개천절', '2025-10-05': '추석 연휴', '2025-10-06': '추석', '2025-10-07': '추석 연휴', '2025-10-08': '대체공휴일(추석)',
  '2025-10-09': '한글날', '2025-12-25': '크리스마스',
  // 2026년
  '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절', '2026-03-02': '대체공휴일(삼일절)',
  '2026-05-05': '어린이날', '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일(부처님오신날)',
  '2026-06-03': '지방선거', '2026-06-06': '현충일', '2026-08-15': '광복절', '2026-08-17': '대체공휴일(광복절)',
  '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절', '2026-10-05': '대체공휴일(개천절)', '2026-10-09': '한글날', '2026-12-25': '크리스마스'
};

const WaterParkSales: React.FC = () => {
  const [reports, setReports] = useState<ParsedReport[]>([]);
  const [stagedReports, setStagedReports] = useState<ParsedReport[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 4, 1)); // 2026년 5월
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportType | null>(null);
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherData>>({});
  const [detailSearchTerm, setDetailSearchTerm] = useState('');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const { data, error } = await supabase.from('daily_reports').select('*');
        if (error) throw error;
        if (data) {
          const formatted = data.map(d => ({
            id: d.id,
            report_date: d.report_date,
            type: d.report_type as ReportType,
            title: getTitleByType(d.report_type),
            summary: d.data?.summary || d.summary,
            chartData: d.data?.chart_data || d.chart_data,
            tableData: d.data?.table_data || d.table_data
          }));
          setReports(formatted);
        }
      } catch (err) {
        console.log('DB fetch error:', err);
      }
    };
    fetchReports();
  }, []);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const newMap: Record<string, WeatherData> = {};
        const resNow = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LNG}&past_days=92&forecast_days=16&daily=weather_code,temperature_2m_max,precipitation_sum&timezone=Asia%2FSeoul`);
        const dataNow = await resNow.json();
        if (dataNow.daily) {
          dataNow.daily.time.forEach((dateStr: string, index: number) => {
            newMap[dateStr] = { temp: dataNow.daily.temperature_2m_max[index], rain: dataNow.daily.precipitation_sum[index], code: dataNow.daily.weather_code[index] };
          });
        }
        const prevYearDate = subMonths(currentMonth, 12);
        const startStr = format(startOfMonth(prevYearDate), 'yyyy-MM-dd');
        const endStr = format(endOfMonth(prevYearDate), 'yyyy-MM-dd');
        const resPrev = await fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LNG}&start_date=${startStr}&end_date=${endStr}&daily=weather_code,temperature_2m_max,precipitation_sum&timezone=Asia%2FSeoul`);
        const dataPrev = await resPrev.json();
        if (dataPrev.daily) {
          dataPrev.daily.time.forEach((dateStr: string, index: number) => {
            newMap[dateStr] = { temp: dataPrev.daily.temperature_2m_max[index], rain: dataPrev.daily.precipitation_sum[index], code: dataPrev.daily.weather_code[index] };
          });
        }
        setWeatherMap(prev => ({ ...prev, ...newMap }));
      } catch (err) {
        console.log('Weather fetch error:', err);
      }
    };
    fetchWeather();
  }, [currentMonth]);

  const getWeatherIcon = (code: number, size=16) => {
    if (code === 0) return <Sun size={size} color="#f59e0b" />;
    if (code >= 1 && code <= 3) return <Cloud size={size} color="#9ca3af" />;
    if (code >= 45 && code <= 48) return <CloudFog size={size} color="#9ca3af" />;
    if (code >= 51 && code <= 67) return <CloudRain size={size} color="#3b82f6" />;
    if (code >= 71 && code <= 77) return <CloudSnow size={size} color="#60a5fa" />;
    if (code >= 80 && code <= 82) return <CloudRain size={size} color="#3b82f6" />;
    if (code >= 85 && code <= 86) return <CloudSnow size={size} color="#60a5fa" />;
    if (code >= 95) return <CloudLightning size={size} color="#8b5cf6" />;
    return <Sun size={size} color="#f59e0b" />;
  };

  const getTitleByType = (type: string) => {
    if (type === 'CUSTOMER_TYPE') return '고객 유형별 발권 현황';
    if (type === 'HOURLY_SALES') return '전체 상품별 매출 현황';
    if (type === 'RATE_ZONE') return '요금대별 발권 현황';
    return '분석 보고서';
  };

  const detectReportType = (json: any[][]): ReportType => {
    if (!json || json.length === 0) return 'UNKNOWN';
    const headerRow = json[0] || [];
    if (headerRow.includes('고객유형(대)')) return 'CUSTOMER_TYPE';
    if (headerRow.includes('영업장명')) return 'HOURLY_SALES';
    if (headerRow.includes('영업일자') || headerRow.includes('상품명')) return 'RATE_ZONE';
    return 'UNKNOWN';
  };

  const parseCustomerType = (json: any[][]): Partial<ParsedReport> => {
    const validRows = json.slice(3).filter(row => row[3] && !row[1]?.includes('계') && !row[0]?.includes('계'));
    const chartData = validRows.map(row => ({
      name: String(row[3]).substring(0, 15) + (String(row[3]).length > 15 ? '...' : ''),
      fullName: row[3], quantity: Number(row[4]) || 0, amount: Number(row[5]) || 0,
    })).sort((a, b) => b.amount - a.amount).slice(0, 10);

    return {
      type: 'CUSTOMER_TYPE', title: getTitleByType('CUSTOMER_TYPE'),
      summary: { totalAmount: validRows.reduce((sum, row) => sum + (Number(row[5]) || 0), 0), totalQty: validRows.reduce((sum, row) => sum + (Number(row[4]) || 0), 0), label: '총 매출(원)', qtyLabel: '총 발권수' },
      chartData, tableData: validRows.map(row => ({ category: row[1], name: row[3], quantity: row[4], amount: row[5] }))
    };
  };

  const parseHourlySales = (json: any[][]): Partial<ParsedReport> => {
    let currentCategory = '';
    const enrichedRows = json.slice(3).map(row => {
      if (row[0]) currentCategory = row[0];
      return {
        category: currentCategory,
        code: String(row[1] || ''),
        name: String(row[2] || ''),
        quantity: Number(row[3]) || 0,
        amount: Number(row[4]) || 0
      };
    }).filter(r => r.name && !r.code.includes('합계') && !r.name.includes('합계'));

    // 매표소(입장권) 매출은 다른 탭(요금대별)에서 보므로 상품매출에서는 제외
    const validRows = enrichedRows.filter(r => r.category !== '매표소');

    let totalAmount = 0, totalQty = 0;
    const chartData = validRows.map(r => {
      totalAmount += r.amount; totalQty += r.quantity;
      return { name: r.name, amount: r.amount, quantity: r.quantity };
    }).filter(d => d.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 8);

    return {
      type: 'HOURLY_SALES', title: getTitleByType('HOURLY_SALES'),
      summary: { totalAmount, totalQty, label: '상품/식음 매출총액', qtyLabel: '총 판매수량' },
      chartData, tableData: validRows
    };
  };

  const parseRateZone = (json: any[][]): Partial<ParsedReport> => {
    const validRows = json.slice(3).filter(row => row[1] && row[1] !== '일 계' && !row[0]?.includes('합 계'));
    let totalAmount = 0, totalQty = 0; const uniqueMap = new Map();
    validRows.forEach(row => {
      const name = String(row[1]).split('-')[1] || row[1];
      if (!uniqueMap.has(name)) {
        const r = [...row].reverse();
        uniqueMap.set(name, { originalRow: row, name, amount: Number(r[0]) || 0, quantity: Number(r[1]) || 0 });
      }
    });

    const chartData = Array.from(uniqueMap.values()).map(item => {
      totalAmount += item.amount; totalQty += item.quantity;
      return { name: item.name, amount: item.amount, quantity: item.quantity };
    }).filter(d => d.amount > 0);

    return {
      type: 'RATE_ZONE', title: getTitleByType('RATE_ZONE'),
      summary: { totalAmount, totalQty, label: '총 결제금액', qtyLabel: '총 발권수' },
      chartData, tableData: Array.from(uniqueMap.values()).map(item => ({ category: '입장권', name: item.originalRow[1], quantity: item.quantity, amount: item.amount }))
    };
  };

  const processFile = (file: File) => {
    if (!selectedDate) return;
    const targetDateStr = format(selectedDate, 'yyyy-MM-dd');
    const dayWeather = weatherMap[targetDateStr];

    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
      const type = detectReportType(json);
      
      let parsedInfo: Partial<ParsedReport> = { type: 'UNKNOWN' };
      if (type === 'CUSTOMER_TYPE') parsedInfo = parseCustomerType(json);
      else if (type === 'HOURLY_SALES') parsedInfo = parseHourlySales(json);
      else if (type === 'RATE_ZONE') parsedInfo = parseRateZone(json);

      if (type !== 'UNKNOWN') {
        if (dayWeather && parsedInfo.summary) {
          parsedInfo.summary.weather = dayWeather;
        }

        const newReport: ParsedReport = {
          id: Math.random().toString(36).substring(7),
          report_date: targetDateStr,
          ...parsedInfo
        } as ParsedReport;

        // DB에 즉시 저장하지 않고 Staging Area(임시대기)에 올림
        setStagedReports(prev => {
          const filtered = prev.filter(r => r.type !== newReport.type);
          return [...filtered, newReport];
        });
        setActiveTab(newReport.type);
      } else {
        alert(`지원하지 않는 엑셀 양식입니다: ${file.name}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSave = async () => {
    if (stagedReports.length === 0) return;
    setIsSaving(true);
    try {
      const upsertData = stagedReports.map(r => ({
        report_date: r.report_date,
        report_type: r.type,
        data: {
          summary: r.summary,
          chart_data: r.chartData,
          table_data: r.tableData
        }
      }));
      const { error } = await supabase.from('daily_reports').upsert(upsertData, { onConflict: 'report_date, report_type' });
      if (error) throw error;

      setReports(prev => {
        let next = [...prev];
        stagedReports.forEach(sr => {
          next = next.filter(r => !(r.report_date === sr.report_date && r.type === sr.type));
          next.push(sr);
        });
        return next;
      });
      setStagedReports([]);
    } catch (err) {
      console.log('Save error', err);
      alert('저장 중 오류가 발생했습니다. DB 권한 설정을 확인하세요.');
    }
    setIsSaving(false);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      Array.from(e.dataTransfer.files).forEach(file => {
        if (file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) processFile(file);
      });
    }
  }, [selectedDate, weatherMap]);

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
    
    reports.forEach(r => {
      if (r.type === 'CUSTOMER_TYPE') {
        if (r.report_date.startsWith(targetPrefix)) {
          currentAmt += r.summary.totalAmount;
          currentPpl += r.summary.totalQty;
        } else if (r.report_date.startsWith(prevPrefix)) {
          prevAmt += r.summary.totalAmount;
          prevPpl += r.summary.totalQty;
        }
        
        if (r.report_date.startsWith(targetYearPrefix)) {
          currentYearAmt += r.summary.totalAmount;
          currentYearPpl += r.summary.totalQty;
        } else if (r.report_date.startsWith(prevYearPrefix)) {
          prevYearAmt += r.summary.totalAmount;
          prevYearPpl += r.summary.totalQty;
        }
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
        const cloneDay = day;
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayReports = reports.filter(r => r.report_date === dateStr);
        const mainReport = dayReports.find(r => r.type === 'CUSTOMER_TYPE') || dayReports[0];
        const wInfo = weatherMap[dateStr];

        const prevYearStr = format(subMonths(day, 12), 'yyyy-MM-dd');
        const prevDayReports = reports.filter(r => r.report_date === prevYearStr);
        const prevMainReport = prevDayReports.find(r => r.type === 'CUSTOMER_TYPE') || prevDayReports[0];

        const isHoliday = !!KOREAN_HOLIDAYS[dateStr];
        const holidayName = KOREAN_HOLIDAYS[dateStr];
        const isSunday = day.getDay() === 0;
        const isSaturday = day.getDay() === 6;
        const isRedDay = isHoliday || isSunday;

        days.push(
          <div 
            className={`cal-cell ${!isSameMonth(day, monthStart) ? 'disabled' : ''} ${selectedDate && isSameDay(day, selectedDate) ? 'selected' : ''}`} 
            key={day.toString()}
            onClick={() => setSelectedDate(cloneDay)}
          >
            <div className="cal-cell-header">
              <span className={`cal-date ${isRedDay ? 'red-day' : ''} ${isSaturday && !isHoliday ? 'blue-day' : ''}`}>
                {format(day, "d")}
                {isHoliday && <span className="holiday-badge">{holidayName}</span>}
              </span>
              {wInfo && (
                <div className="cal-weather" title={`최고기온 ${wInfo.temp}°C, 강수량 ${wInfo.rain}mm`}>
                  {getWeatherIcon(wInfo.code)}
                  <span>{wInfo.temp}°</span>
                </div>
              )}
            </div>

            {mainReport && (
              <div className="cal-data-box">
                <div className="cal-data-row current">
                  <span className="year-label">올해</span>
                  <span className="amt">{(mainReport.summary.totalAmount / 10000).toFixed(0)}만</span>
                  <span className="qty">{mainReport.summary.totalQty}명</span>
                </div>
                
                {prevMainReport ? (() => {
                  const growthAmt = mainReport.summary.totalAmount - prevMainReport.summary.totalAmount;
                  const pct = prevMainReport.summary.totalAmount > 0 ? (growthAmt / prevMainReport.summary.totalAmount * 100).toFixed(0) : 0;
                  return (
                    <>
                      <div className="cal-data-row prev">
                        <span className="year-label">작년</span>
                        <span className="amt">{(prevMainReport.summary.totalAmount / 10000).toFixed(0)}만</span>
                        <span className="qty">{prevMainReport.summary.totalQty}명</span>
                      </div>
                      <div className={`cal-yoy-bar ${growthAmt >= 0 ? 'up' : 'down'}`}>
                        {growthAmt >= 0 ? '▲' : '▼'} {Math.abs(Number(pct))}%
                      </div>
                    </>
                  )
                })() : (
                  <div className="cal-yoy-bar empty">전년 비교데이터 없음</div>
                )}
              </div>
            )}
            <div className="cal-dots">
              {dayReports.map(r => <span key={r.id} className="dot" title={r.title}></span>)}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(<div className="cal-row" key={day.toString()}>{days}</div>);
      days = [];
    }

    return (
      <div className="calendar-container animate-fade-in">
        <div className="cumulative-dashboard">
          {/* 연간 누적 */}
          <h3>🏆 연간 전체 누적 실적 비교 (입장권 발권 기준, {format(currentMonth, 'yyyy')}년)</h3>
          <div className="dash-compare-container" style={{ marginBottom: '24px' }}>
            {/* 전년도 연간 */}
            <div className="dash-column prev">
              <h4>{format(subMonths(currentMonth, 12), 'yyyy년')} 전체 누적 (전년도)</h4>
              <div className="cum-cards">
                <div className="cum-card">
                  <span className="cum-label">입장 발권 매출액</span>
                  <span className="cum-value">{formatCurrency(prevYearAmt)}</span>
                </div>
                <div className="cum-card">
                  <span className="cum-label">총 입장 발권수</span>
                  <span className="cum-value">{prevYearPpl.toLocaleString()} 명</span>
                </div>
                <div className="cum-card">
                  <span className="cum-label">발권 평균 객단가</span>
                  <span className="cum-value">{prevYearPpl > 0 ? formatCurrency(Math.round(prevYearAmt/prevYearPpl)) : '0원'}</span>
                </div>
              </div>
            </div>

            {/* 당해 연도 연간 */}
            <div className="dash-column current">
              <h4>{format(currentMonth, 'yyyy년')} 전체 누적 (올해)</h4>
              <div className="cum-cards">
                <div className="cum-card highlight">
                  <span className="cum-label">입장 발권 매출액</span>
                  <div className="cum-val-row">
                    <span className="cum-value">{formatCurrency(currentYearAmt)}</span>
                    {prevYearAmt > 0 && <span className={`dash-badge ${currentYearAmt >= prevYearAmt ? 'up' : 'down'}`}>{currentYearAmt >= prevYearAmt ? '▲' : '▼'} {Math.abs((currentYearAmt-prevYearAmt)/prevYearAmt*100).toFixed(1)}%</span>}
                  </div>
                </div>
                <div className="cum-card highlight">
                  <span className="cum-label">총 입장 발권수</span>
                  <div className="cum-val-row">
                    <span className="cum-value">{currentYearPpl.toLocaleString()} 명</span>
                    {prevYearPpl > 0 && <span className={`dash-badge ${currentYearPpl >= prevYearPpl ? 'up' : 'down'}`}>{currentYearPpl >= prevYearPpl ? '▲' : '▼'} {Math.abs((currentYearPpl-prevYearPpl)/prevYearPpl*100).toFixed(1)}%</span>}
                  </div>
                </div>
                <div className="cum-card highlight">
                  <span className="cum-label">발권 평균 객단가</span>
                  <span className="cum-value">{currentYearPpl > 0 ? formatCurrency(Math.round(currentYearAmt/currentYearPpl)) : '0원'}</span>
                </div>
              </div>
            </div>
          </div>

          <h3>📊 월간 영업 누적 실적 비교 (입장권 발권 기준, {format(currentMonth, 'MM')}월)</h3>
          <div className="dash-compare-container">
            {/* 전년 동월 */}
            <div className="dash-column prev">
              <h4>{format(subMonths(currentMonth, 12), 'yyyy년 MM월')} (전년 동월)</h4>
              <div className="cum-cards">
                <div className="cum-card">
                  <span className="cum-label">입장 발권 매출액</span>
                  <span className="cum-value">{formatCurrency(prevAmt)}</span>
                </div>
                <div className="cum-card">
                  <span className="cum-label">총 입장 발권수</span>
                  <span className="cum-value">{prevPpl.toLocaleString()} 명</span>
                </div>
                <div className="cum-card">
                  <span className="cum-label">발권 평균 객단가</span>
                  <span className="cum-value">{prevPpl > 0 ? formatCurrency(Math.round(prevAmt/prevPpl)) : '0원'}</span>
                </div>
              </div>
            </div>

            {/* 당해 연도 */}
            <div className="dash-column current">
              <h4>{format(currentMonth, 'yyyy년 MM월')} (올해)</h4>
              <div className="cum-cards">
                <div className="cum-card highlight">
                  <span className="cum-label">입장 발권 매출액</span>
                  <div className="cum-val-row">
                    <span className="cum-value">{formatCurrency(currentAmt)}</span>
                    {prevAmt > 0 && <span className={`dash-badge ${currentAmt >= prevAmt ? 'up' : 'down'}`}>{currentAmt >= prevAmt ? '▲' : '▼'} {Math.abs((currentAmt-prevAmt)/prevAmt*100).toFixed(1)}%</span>}
                  </div>
                </div>
                <div className="cum-card highlight">
                  <span className="cum-label">총 입장 발권수</span>
                  <div className="cum-val-row">
                    <span className="cum-value">{currentPpl.toLocaleString()} 명</span>
                    {prevPpl > 0 && <span className={`dash-badge ${currentPpl >= prevPpl ? 'up' : 'down'}`}>{currentPpl >= prevPpl ? '▲' : '▼'} {Math.abs((currentPpl-prevPpl)/prevPpl*100).toFixed(1)}%</span>}
                  </div>
                </div>
                <div className="cum-card highlight">
                  <span className="cum-label">발권 평균 객단가</span>
                  <span className="cum-value">{currentPpl > 0 ? formatCurrency(Math.round(currentAmt/currentPpl)) : '0원'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="cal-header">
          <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft /></button>
          <h2>{format(currentMonth, 'yyyy년 MM월')}</h2>
          <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight /></button>
        </div>
        <div className="cal-grid">
          <div className="cal-days-header">
            {['일','월','화','수','목','금','토'].map(d => <div key={d}>{d}</div>)}
          </div>
          {rows}
        </div>
      </div>
    );
  };

  const renderDetail = () => {
    if (!selectedDate) return null;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const dayReports = reports.filter(r => r.report_date === dateStr);
    
    // 로컬 스테이징(임시저장) 데이터와 DB 데이터를 합침
    const combinedReports = [...dayReports.filter(r => !stagedReports.find(sr => sr.type === r.type)), ...stagedReports];
    const activeReport = combinedReports.find(r => r.type === activeTab) || combinedReports[0];
    const wInfo = weatherMap[dateStr];
    
    const prevYearStr = format(subMonths(selectedDate, 12), 'yyyy-MM-dd');
    const prevWInfo = weatherMap[prevYearStr];

    const isHoliday = !!KOREAN_HOLIDAYS[dateStr];
    const holidayName = KOREAN_HOLIDAYS[dateStr];

    return (
      <div className="detail-container animate-fade-in">
        <div className="detail-header">
          <button className="back-btn" onClick={() => { setSelectedDate(null); setStagedReports([]); }}><ArrowLeft /> 달력으로 돌아가기</button>
          <h2>
            {format(selectedDate, 'yyyy년 MM월 dd일 (EEEE)', { locale: ko })} 영업 보고서
            {isHoliday && <span className="detail-holiday">🎈 {holidayName}</span>}
          </h2>
          
          <div className="weather-compare-box">
            {wInfo && (
              <div className="detail-weather current-year">
                <span className="w-label">당해:</span>
                {getWeatherIcon(wInfo.code, 20)}
                <span>{wInfo.temp}°C</span>
                {wInfo.rain > 0 && <span className="rain-info">({wInfo.rain}mm)</span>}
              </div>
            )}
            {prevWInfo && (
              <div className="detail-weather prev-year">
                <span className="w-label">전년동기({format(subMonths(selectedDate, 12), 'yyyy')}):</span>
                {getWeatherIcon(prevWInfo.code, 20)}
                <span>{prevWInfo.temp}°C</span>
                {prevWInfo.rain > 0 && <span className="rain-info">({prevWInfo.rain}mm)</span>}
              </div>
            )}
          </div>
        </div>

        {/* [수정사항 2] 업로드 된 데이터가 있으면 명시적으로 '저장' 버튼을 보여주어 직관성 강화 */}
        {stagedReports.length > 0 && (
          <div className="action-bar animate-fade-in">
            <div className="action-info">
              <AlertCircle size={20} color="#f59e0b" />
              <span><strong>{stagedReports.length}개</strong>의 파일이 업로드 대기 중입니다. 반드시 저장 버튼을 눌러 확정해주세요.</span>
            </div>
            <button className="save-btn" onClick={handleSave} disabled={isSaving}>
              <Save size={18} /> {isSaving ? 'DB 저장 중...' : '클라우드에 영구 저장하기'}
            </button>
          </div>
        )}

        {combinedReports.length === 0 && (
           <div className="empty-state">
             <CalendarIcon size={48} className="empty-icon" />
             <h3>등록된 데이터가 없습니다.</h3>
             <p>해당 일자의 엑셀 로우데이터를 아래에 드래그하여 업로드해주세요.</p>
           </div>
        )}

        <div 
          className={`upload-dropzone compact ${isDragging ? 'dragging' : ''}`}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
        >
          <UploadCloud className="upload-icon" size={32} />
          <div style={{ width: '100%', maxWidth: '600px', margin: '0 auto' }}>
            <h4 style={{ marginBottom: '8px' }}>이곳에 엑셀 파일 끌어다 놓기</h4>
            <p style={{ marginBottom: '20px' }}>고객유형별, 요금대별, 전체매출현황 (.xls)</p>
            
            <div style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', textAlign: 'left', fontSize: '13px', color: '#475569', lineHeight: '1.6', border: '1px dashed #cbd5e1' }}>
              <div style={{ fontWeight: 'bold', color: '#1e293b', marginBottom: '8px' }}>📌 ERP 로우데이터 엑셀 저장 후 업로드 해주세요 (매출관리 → 경영관리)</div>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                <li>
                  <span style={{ fontWeight: 600, color: '#3b82f6' }}>고객유형별 발권현황:</span><br/>
                  5.통계자료 → 10.워터파크 → 2.고객유형별 발권현황
                </li>
                <li>
                  <span style={{ fontWeight: 600, color: '#10b981' }}>전체 매출현황:</span><br/>
                  5.통계자료 → 10.워터파크 → 5.분석자료 → 5-5. 월일별 매출현황 분석
                </li>
                <li>
                  <span style={{ fontWeight: 600, color: '#8b5cf6' }}>요금대별 매출현황:</span><br/>
                  5.통계자료 → 10.워터파크 → 1.실시간 매출현황<br/>
                  <span style={{ fontSize: '12px', color: '#ef4444' }}>(*엑셀 저장 시 파일명 예시: 0505 요금대별매출현황)</span>
                </li>
              </ul>
              <div style={{ background: 'rgba(59,130,246,0.1)', padding: '12px', borderRadius: '6px', border: '1px solid rgba(59,130,246,0.2)', color: '#1e3a8a' }}>
                <strong>👉 다운로드 및 저장 안내:</strong> 각 메뉴 진입 후 <strong>기준일자 설정 &gt; 상단 [엑셀저장(x)]</strong> 버튼을 클릭하여 다운로드하세요. 파일 3개를 이곳에 드래그하여 업로드한 뒤, 반드시 상단의 <strong>[클라우드에 영구 저장하기]</strong> 버튼을 눌러주세요!
              </div>
            </div>
          </div>
          <label className="upload-button outline">
            파일 찾기
            <input type="file" multiple accept=".xls,.xlsx" onChange={(e) => {
              if (e.target.files) Array.from(e.target.files).forEach(processFile);
            }} style={{ display: 'none' }} />
          </label>
        </div>

        {combinedReports.length > 0 && (
          <>
            {/* --- 통합 요약 대시보드 시작 --- */}
            {(() => {
              const ct = combinedReports.find(r => r.type === 'CUSTOMER_TYPE');
              const hs = combinedReports.find(r => r.type === 'HOURLY_SALES');
              const pct = reports.find(r => r.report_date === prevYearStr && r.type === 'CUSTOMER_TYPE');
              const phs = reports.find(r => r.report_date === prevYearStr && r.type === 'HOURLY_SALES');

              const totalAdmissions = ct ? ct.summary.totalQty : 0;
              const ticketRev = ct ? ct.summary.totalAmount : 0;
              const fbRev = hs ? hs.summary.totalAmount : 0;
              const totalRev = ticketRev + fbRev;
              const perCapita = totalAdmissions > 0 ? totalRev / totalAdmissions : 0;

              const prevAdmissions = pct ? pct.summary.totalQty : 0;
              const prevTicketRev = pct ? pct.summary.totalAmount : 0;
              const prevFbRev = phs ? phs.summary.totalAmount : 0;
              const prevTotalRev = prevTicketRev + prevFbRev;
              const prevPerCapita = prevAdmissions > 0 ? prevTotalRev / prevAdmissions : 0;

              return (
                <div className="integrated-summary-board animate-fade-in" style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', padding: '24px', borderRadius: '12px', color: 'white', marginBottom: '32px', boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.5)' }}>
                  <div className="integrated-summary-header">
                    <h3>
                      <Activity size={24} /> 일일 통합 영업 요약 대시보드
                    </h3>
                    <div className="integrated-date-info">
                      <div>
                        <span className="date-label current">당일:</span> {format(selectedDate, 'yyyy년 MM월 dd일 (EEEE)', { locale: ko })}
                        {KOREAN_HOLIDAYS[dateStr] && <span className="date-holiday">🎈 {KOREAN_HOLIDAYS[dateStr]}</span>}
                      </div>
                      <div>
                        <span className="date-label prev">전년 비교일:</span> {format(subMonths(selectedDate, 12), 'yyyy년 MM월 dd일 (EEEE)', { locale: ko })}
                        {KOREAN_HOLIDAYS[prevYearStr] && <span className="date-holiday">🎈 {KOREAN_HOLIDAYS[prevYearStr]}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="integrated-summary-grid">
                    {/* Row 1: Overall */}
                    <div className="integrated-card">
                      <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '8px' }}>총 종합 매출 (입장+부대)</div>
                      <div style={{ fontSize: '24px', fontWeight: 800 }}>{formatCurrency(totalRev)}</div>
                      {prevTotalRev > 0 && <div style={{ fontSize: '12px', marginTop: '8px', color: totalRev >= prevTotalRev ? '#86efac' : '#fca5a5' }}>
                        전년 동월 동일 대비 {totalRev >= prevTotalRev ? '▲' : '▼'} {Math.abs((totalRev-prevTotalRev)/prevTotalRev*100).toFixed(1)}%
                      </div>}
                    </div>
                    <div className="integrated-card">
                      <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '8px' }}>총 입장객 수</div>
                      <div style={{ fontSize: '24px', fontWeight: 800 }}>{totalAdmissions.toLocaleString()} 명</div>
                      {prevAdmissions > 0 && <div style={{ fontSize: '12px', marginTop: '8px', color: totalAdmissions >= prevAdmissions ? '#86efac' : '#fca5a5' }}>
                        전년 동월 동일 대비 {totalAdmissions >= prevAdmissions ? '▲' : '▼'} {Math.abs((totalAdmissions-prevAdmissions)/prevAdmissions*100).toFixed(1)}%
                      </div>}
                    </div>
                    <div className="integrated-card">
                      <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '8px' }}>종합 1인당 객단가</div>
                      <div style={{ fontSize: '24px', fontWeight: 800 }}>{formatCurrency(Math.round(perCapita))}</div>
                      {prevPerCapita > 0 && <div style={{ fontSize: '12px', marginTop: '8px', color: perCapita >= prevPerCapita ? '#86efac' : '#fca5a5' }}>
                        전년 동월 동일 대비 {perCapita >= prevPerCapita ? '▲' : '▼'} {Math.abs((perCapita-prevPerCapita)/prevPerCapita*100).toFixed(1)}%
                      </div>}
                    </div>
                    <div className="integrated-card">
                      <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '8px' }}>매출 비중 (입장 vs 상품)</div>
                      <div style={{ display: 'flex', height: '12px', borderRadius: '6px', overflow: 'hidden', marginTop: '12px', marginBottom: '8px' }}>
                        <div style={{ width: `${totalRev > 0 ? (ticketRev/totalRev*100) : 0}%`, background: '#60a5fa' }} title={`입장매출: ${formatCurrency(ticketRev)}`}></div>
                        <div style={{ width: `${totalRev > 0 ? (fbRev/totalRev*100) : 0}%`, background: '#fcd34d' }} title={`상품매출: ${formatCurrency(fbRev)}`}></div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600 }}>
                        <span style={{ color: '#93c5fd' }}>입장권 {totalRev > 0 ? (ticketRev/totalRev*100).toFixed(0) : 0}%</span>
                        <span style={{ color: '#fde68a' }}>상품 {totalRev > 0 ? (fbRev/totalRev*100).toFixed(0) : 0}%</span>
                      </div>
                    </div>

                    {/* Row 2: Breakdown */}
                    <div className="integrated-card outline">
                      <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '8px', color: '#93c5fd' }}>🎟️ 입장권(발권) 매출</div>
                      <div style={{ fontSize: '20px', fontWeight: 700 }}>{formatCurrency(ticketRev)}</div>
                      {prevTicketRev > 0 && <div style={{ fontSize: '11px', marginTop: '6px', opacity: 0.8 }}>
                        전년 동월 동일 대비 {ticketRev >= prevTicketRev ? '▲' : '▼'} {Math.abs((ticketRev-prevTicketRev)/prevTicketRev*100).toFixed(1)}%
                      </div>}
                    </div>
                    <div className="integrated-card outline">
                      <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '8px', color: '#fde68a' }}>🍔 상품(부대) 매출</div>
                      <div style={{ fontSize: '20px', fontWeight: 700 }}>{formatCurrency(fbRev)}</div>
                      {prevFbRev > 0 && <div style={{ fontSize: '11px', marginTop: '6px', opacity: 0.8 }}>
                        전년 동월 동일 대비 {fbRev >= prevFbRev ? '▲' : '▼'} {Math.abs((fbRev-prevFbRev)/prevFbRev*100).toFixed(1)}%
                      </div>}
                    </div>
                    <div className="integrated-card outline">
                      <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '8px', color: '#93c5fd' }}>🎟️ 발권 객단가</div>
                      <div style={{ fontSize: '20px', fontWeight: 700 }}>{formatCurrency(Math.round(totalAdmissions > 0 ? ticketRev / totalAdmissions : 0))}</div>
                      {prevAdmissions > 0 && prevTicketRev > 0 && (() => {
                        const prevTicketPC = prevTicketRev / prevAdmissions;
                        const ticketPC = totalAdmissions > 0 ? ticketRev / totalAdmissions : 0;
                        return (
                          <div style={{ fontSize: '11px', marginTop: '6px', opacity: 0.8 }}>
                            전년 동월 동일 대비 {ticketPC >= prevTicketPC ? '▲' : '▼'} {Math.abs((ticketPC-prevTicketPC)/prevTicketPC*100).toFixed(1)}%
                          </div>
                        );
                      })()}
                    </div>
                    <div className="integrated-card outline">
                      <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '8px', color: '#fde68a' }}>🍔 상품 객단가</div>
                      <div style={{ fontSize: '20px', fontWeight: 700 }}>{formatCurrency(Math.round(totalAdmissions > 0 ? fbRev / totalAdmissions : 0))}</div>
                      {prevAdmissions > 0 && prevFbRev > 0 && (() => {
                        const prevFbPC = prevFbRev / prevAdmissions;
                        const fbPC = totalAdmissions > 0 ? fbRev / totalAdmissions : 0;
                        return (
                          <div style={{ fontSize: '11px', marginTop: '6px', opacity: 0.8 }}>
                            전년 동월 동일 대비 {fbPC >= prevFbPC ? '▲' : '▼'} {Math.abs((fbPC-prevFbPC)/prevFbPC*100).toFixed(1)}%
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* --- 통합 요약 대시보드 끝 --- */}

            <h3 style={{ marginBottom: '16px', color: '#1e293b', fontSize: '18px', fontWeight: 800 }}>🔍 개별 리포트 상세보기</h3>
            <div className="tabs">
              {combinedReports.map(report => (
                <button 
                  key={report.id} 
                  className={`tab-button ${activeReport?.id === report.id ? 'active' : ''} ${stagedReports.find(r => r.id === report.id) ? 'staged' : ''}`}
                  onClick={() => setActiveTab(report.type)}
                >
                  <FileSpreadsheet size={16} /> {report.title} {stagedReports.find(r => r.id === report.id) && <span className="new-badge">N</span>}
                </button>
              ))}
            </div>

            {activeReport && (() => {
              const prevYearReport = reports.find(r => r.report_date === prevYearStr && r.type === activeReport.type);
              const hasPrevData = !!prevYearReport;
              const growthAmt = hasPrevData ? activeReport.summary.totalAmount - prevYearReport.summary.totalAmount : 0;
              const growthAmtPct = hasPrevData && prevYearReport.summary.totalAmount > 0 ? (growthAmt / prevYearReport.summary.totalAmount * 100).toFixed(1) : 0;
              const growthQty = hasPrevData ? activeReport.summary.totalQty - prevYearReport.summary.totalQty : 0;
              const growthQtyPct = hasPrevData && prevYearReport.summary.totalQty > 0 ? (growthQty / prevYearReport.summary.totalQty * 100).toFixed(1) : 0;

              const getCategoryGroup = (name: string, type: string, defaultCat: string) => {
                if (type === 'CUSTOMER_TYPE') {
                  const n = name || '';
                  if (n.includes('패키지')) return '패키지';
                  if (n.includes('임직원')) return '임직원/관계사';
                  if (n.includes('쿠폰')) return '쿠폰/할인';
                  if (n.includes('네이버') || n.includes('쿠팡') || n.includes('야놀자') || n.includes('여기어때') || n.includes('온라인') || n.includes('소셜')) return '온라인/소셜';
                  if (n.includes('회원') || n.match(/^[A-Z]{2}-/) || n.match(/^91/)) return '회원(법인/개인)';
                  if (n.includes('투숙객') || n.includes('객실')) return '투숙객';
                  if (n.includes('단체')) return '단체';
                  if (n.includes('할인')) return '기타 제휴/할인';
                  if (n.includes('일반')) return '일반';
                  return '패키지';
                }
                
                if (type === 'RATE_ZONE') {
                  if (name.includes('대인') && name.includes('남')) return '대인(남)';
                  if (name.includes('대인') && name.includes('여')) return '대인(여)';
                  if (name.includes('소인') && name.includes('남')) return '소인(남)';
                  if (name.includes('소인') && name.includes('여')) return '소인(여)';
                  if (name.includes('대인')) return '대인';
                  if (name.includes('소인')) return '소인';
                  return defaultCat;
                }
                
                return defaultCat || '기타';
              };

              // 동적으로 현재 연도 데이터를 그룹화 (파편화 방지)
              const categoryData = activeReport.tableData.reduce((acc: any[], row: any) => {
                const groupName = getCategoryGroup(row.name, activeReport.type, row.category);
                const existing = acc.find(x => x.name === groupName);
                if (existing) {
                  existing.amount += Number(row.amount);
                  existing.quantity += Number(row.quantity);
                } else {
                  acc.push({ name: groupName, amount: Number(row.amount), quantity: Number(row.quantity) });
                }
                return acc;
              }, []).sort((a: any, b: any) => b.amount - a.amount);

              // 동적으로 전년도 데이터를 동일한 기준으로 그룹화 (완벽한 YoY 매칭)
              const prevCategoryData = hasPrevData ? prevYearReport.tableData.reduce((acc: any[], row: any) => {
                const groupName = getCategoryGroup(row.name, prevYearReport.type, row.category);
                const existing = acc.find(x => x.name === groupName);
                if (existing) {
                  existing.amount += Number(row.amount);
                  existing.quantity += Number(row.quantity);
                } else {
                  acc.push({ name: groupName, amount: Number(row.amount), quantity: Number(row.quantity) });
                }
                return acc;
              }, []) : [];

              // 바 차트를 위한 최종 병합 데이터 (Top 8 추출)
              const mergedChartData = categoryData.slice(0, 8).map(d => {
                const prevItem = prevCategoryData.find(p => p.name === d.name);
                return { ...d, prevAmount: prevItem ? prevItem.amount : 0 };
              });

              const CustomCenterLabel = (props: any) => {
                const { viewBox, amount, qty } = props;
                if (!viewBox || !viewBox.cx) return null;
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="central">
                    <tspan x={viewBox.cx} dy="-0.4em" fontSize="15" fontWeight="800" fill="#1e3a8a">{formatCurrency(amount)}</tspan>
                    <tspan x={viewBox.cx} dy="1.4em" fontSize="12" fontWeight="600" fill="#64748b">{qty.toLocaleString()} 건</tspan>
                  </text>
                );
              };

              const RADIAN = Math.PI / 180;
              const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, payload }: any) => {
                const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                const x = cx + radius * Math.cos(-midAngle * RADIAN);
                const y = cy + radius * Math.sin(-midAngle * RADIAN);
                if (percent < 0.05) return null; // 5% 미만은 텍스트 생략
                
                // Get quantity from the pie payload
                const qty = payload.quantity ? payload.quantity.toLocaleString() : '0';
                
                return (
                  <text x={x} y={y} fill="white" stroke="rgba(0,0,0,0.6)" strokeWidth="3" style={{ paintOrder: 'stroke' }} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="800">
                    {`${(percent * 100).toFixed(0)}% (${qty}건)`}
                  </text>
                );
              };

              const renderBarLabel = (props: any) => {
                const { x, y, width, height, value, index } = props;
                const item = mergedChartData[index];
                if (!item) return null;
                const pct = activeReport.summary.totalAmount > 0 ? (value / activeReport.summary.totalAmount * 100) : 0;
                if (pct <= 4) return null; // 막대가 너무 짧으면 텍스트 생략
                
                return (
                  <text x={x + width - 6} y={y + height / 2} fill="white" stroke="rgba(0,0,0,0.6)" strokeWidth="3" style={{ paintOrder: 'stroke' }} textAnchor="end" dominantBaseline="central" fontSize={11} fontWeight="800">
                    {`${pct.toFixed(0)}% (${item.quantity.toLocaleString()}건)`}
                  </text>
                );
              };

              // 그룹별 아이템 매핑 및 정렬
              const groupedItems = activeReport.tableData.reduce((acc: any, row: any) => {
                const groupName = getCategoryGroup(row.name, activeReport.type, row.category);
                if (!acc[groupName]) acc[groupName] = [];
                acc[groupName].push(row);
                return acc;
              }, {});
              Object.keys(groupedItems).forEach(cat => {
                groupedItems[cat].sort((a: any, b: any) => Number(b.amount) - Number(a.amount));
              });

              return (
              <div className="report-panel">
                
                {hasPrevData ? (
                  <div className="dash-compare-container detail-theme">
                    <div className="dash-column prev">
                      <h4>
                        전년 동기 ({format(subMonths(selectedDate, 12), 'yyyy-MM-dd (EEEE)', { locale: ko })})
                        {KOREAN_HOLIDAYS[format(subMonths(selectedDate, 12), 'yyyy-MM-dd')] && 
                          <span className="detail-holiday" style={{ fontSize: '13px', marginLeft: '8px', verticalAlign: 'middle' }}>🎈 {KOREAN_HOLIDAYS[format(subMonths(selectedDate, 12), 'yyyy-MM-dd')]}</span>}
                      </h4>
                      <div className="cum-cards">
                        <div className="cum-card">
                          <span className="cum-label">{activeReport.summary.label}</span>
                          <span className="cum-value">{formatCurrency(prevYearReport.summary.totalAmount)}</span>
                        </div>
                        <div className="cum-card">
                          <span className="cum-label">{activeReport.summary.qtyLabel}</span>
                          <span className="cum-value">{prevYearReport.summary.totalQty.toLocaleString()} 건</span>
                        </div>
                      </div>
                    </div>

                    <div className="dash-column current">
                      <h4>
                        올해 당일 ({format(selectedDate, 'yyyy-MM-dd (EEEE)', { locale: ko })})
                        {KOREAN_HOLIDAYS[format(selectedDate, 'yyyy-MM-dd')] && 
                          <span className="detail-holiday" style={{ fontSize: '13px', marginLeft: '8px', verticalAlign: 'middle' }}>🎈 {KOREAN_HOLIDAYS[format(selectedDate, 'yyyy-MM-dd')]}</span>}
                      </h4>
                      <div className="cum-cards">
                        <div className="cum-card highlight">
                          <span className="cum-label">{activeReport.summary.label}</span>
                          <div className="cum-val-row">
                            <span className="cum-value">{formatCurrency(activeReport.summary.totalAmount)}</span>
                            <span className={`dash-badge ${growthAmt >= 0 ? 'up' : 'down'}`}>{growthAmt >= 0 ? '▲' : '▼'} {Math.abs(Number(growthAmtPct))}%</span>
                          </div>
                        </div>
                        <div className="cum-card highlight">
                          <span className="cum-label">{activeReport.summary.qtyLabel}</span>
                          <div className="cum-val-row">
                            <span className="cum-value">{activeReport.summary.totalQty.toLocaleString()} 건</span>
                            <span className={`dash-badge ${growthQty >= 0 ? 'up' : 'down'}`}>{growthQty >= 0 ? '▲' : '▼'} {Math.abs(Number(growthQtyPct))}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="summary-cards">
                    <div className="summary-card primary">
                      <div className="card-icon"><DollarSign size={24} /></div>
                      <div className="card-info">
                        <h4>{activeReport.summary.label}</h4>
                        <h2>{formatCurrency(activeReport.summary.totalAmount)}</h2>
                      </div>
                    </div>
                    <div className="summary-card secondary">
                      <div className="card-icon"><Users size={24} /></div>
                      <div className="card-info">
                        <h4>{activeReport.summary.qtyLabel}</h4>
                        <h2>{activeReport.summary.totalQty.toLocaleString()} 건</h2>
                      </div>
                    </div>
                    {activeReport.summary.weather && (
                      <div className="summary-card info">
                        <div className="card-icon"><Thermometer size={24} /></div>
                        <div className="card-info">
                          <h4>당일 날씨 기록</h4>
                          <h2>{activeReport.summary.weather.temp}°C</h2>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="chart-box">
                  <h3>시각화 요약 {hasPrevData && '(전년대비 비교 차트)'}</h3>
                  <div className="chart-wrapper">
                    {activeReport.type === 'HOURLY_SALES' ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryData.slice(0, 8)} cx="50%" cy="50%" innerRadius={75} outerRadius={120} paddingAngle={2} dataKey="amount" nameKey="name" labelLine={false} label={renderCustomizedLabel}>
                            {categoryData.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            <Label content={<CustomCenterLabel amount={activeReport.summary.totalAmount} qty={activeReport.summary.totalQty} />} position="center" />
                          </Pie>
                          <RechartsTooltip formatter={(val: any) => formatCurrency(Number(val))} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mergedChartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" tickFormatter={(v) => `₩${v/10000}만`} />
                          <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                          <RechartsTooltip formatter={(val: any) => formatCurrency(Number(val))} />
                          <Legend />
                          {hasPrevData && <Bar dataKey="prevAmount" fill="#d1d5db" name="전년 동기" radius={[0, 4, 4, 0]} />}
                          <Bar dataKey="amount" fill="#3b82f6" name="올해" radius={[0, 4, 4, 0]}>
                            <LabelList content={renderBarLabel} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div className="table-box">
                  <h3>상세 데이터 내역 (대분류 구조 포함)</h3>
                  <div className="table-split-layout">
                    {/* 대분류 도넛 그래프 영역 */}
                    <div className="category-donut-wrapper">
                      <h4>대분류별 비중</h4>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="amount" nameKey="name" labelLine={false} label={renderCustomizedLabel}>
                            {categoryData.map((_, i) => <Cell key={i} fill={COLORS[(i+2) % COLORS.length]} />)}
                            <Label content={<CustomCenterLabel amount={activeReport.summary.totalAmount} qty={activeReport.summary.totalQty} />} position="center" />
                          </Pie>
                          <RechartsTooltip formatter={(val: any) => formatCurrency(Number(val))} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* 상세 데이터 리스트 영역 */}
                    <div className="list-wrapper">
                      <div className="detail-search-box" style={{ marginBottom: '16px' }}>
                        <input 
                          type="text" 
                          placeholder="🔍 상세 항목 검색 (예: 락커, 구명조끼...)" 
                          value={detailSearchTerm}
                          onChange={(e) => setDetailSearchTerm(e.target.value)}
                          style={{ width: '100%', padding: '12px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }}
                        />
                      </div>
                      {categoryData.map((cat: any, index: number) => {
                        // 검색어 필터링 적용
                        const items = (groupedItems[cat.name] || []).filter((r: any) => 
                          r.name.toLowerCase().includes(detailSearchTerm.toLowerCase()) || 
                          cat.name.toLowerCase().includes(detailSearchTerm.toLowerCase())
                        );
                        
                        // 검색결과가 없으면 이 그룹은 렌더링 안 함
                        if (items.length === 0) return null;
                        
                        // 첫 번째 그룹은 기본으로 열려있게, 검색어가 있으면 모두 열리게 처리
                        const isExpanded = detailSearchTerm.length > 0 || (expandedCats[cat.name] !== undefined ? expandedCats[cat.name] : index === 0);

                        return (
                        <div key={cat.name} className="cat-group">
                          <h4 
                            className="cat-group-header" 
                            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}
                            onClick={() => setExpandedCats(prev => ({ ...prev, [cat.name]: !isExpanded }))}
                          >
                            <div>
                              {cat.name}
                              <span className="cat-group-sum">총 {cat.quantity.toLocaleString()}건 ({formatCurrency(cat.amount)})</span>
                            </div>
                            <span style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
                              {isExpanded ? '▲ 접기' : '▼ 펼치기'}
                            </span>
                          </h4>
                          
                          {isExpanded && (
                          <div className="cat-group-items animate-fade-in">
                            {items.map((row: any, i: number) => {
                              const qty = Number(row.quantity);
                              const amount = Number(row.amount);
                              const pct = activeReport.summary.totalQty > 0 ? (qty / activeReport.summary.totalQty * 100) : 0;
                              const unitPrice = qty > 0 ? amount / qty : 0;
                              return (
                                <div key={i} className="detailed-table-row">
                                  <div className="d-table-name">{row.name}</div>
                                  <div className="d-table-stats-grid">
                                    <div className="stat-col">
                                      <span className="stat-label">점유율</span>
                                      <span className="stat-val" style={{ color: '#3b82f6' }}>{pct.toFixed(1)}%</span>
                                    </div>
                                    <div className="stat-col">
                                      <span className="stat-label">건수</span>
                                      <span className="stat-val">{qty.toLocaleString()}건</span>
                                    </div>
                                    <div className="stat-col">
                                      <span className="stat-label">객단가</span>
                                      <span className="stat-val">{formatCurrency(unitPrice)}</span>
                                    </div>
                                  </div>
                                  <div className="d-bar-track">
                                    <div className="d-bar-fill" style={{ width: `${Math.max(pct, 0.5)}%` }}></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          )}
                        </div>
                      )})}
                    </div>
                  </div>
                </div>
              </div>
              );
            })()}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="waterpark-sales-container">
      <div className="sales-header">
        <h1>📅 일일 영업 실적 & 날씨 대시보드</h1>
        <p>기상 데이터 연동을 통해 날씨와 매출의 상관관계를 한눈에 파악하세요.</p>
      </div>
      {selectedDate ? renderDetail() : renderCalendar()}
    </div>
  );
};

export default WaterParkSales;
