import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, Label, LabelList
} from 'recharts';
import { 
  FileSpreadsheet, Activity, DollarSign, Users, 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, ArrowLeft,
  Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudFog, Thermometer
} from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import './WaterParkSales.css';

type ReportType = 'CUSTOMER_TYPE' | 'HOURLY_SALES' | 'RATE_ZONE' | 'REALTIME_SALES' | 'UNKNOWN';

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

interface AutoFitTextProps extends React.HTMLAttributes<HTMLElement> {
  min?: number;
  max?: number;
  as?: 'span' | 'div';
  children: React.ReactNode;
}

const AutoFitText: React.FC<AutoFitTextProps> = ({
  min = 10,
  max = 24,
  as = 'span',
  className = '',
  children,
  ...props
}) => {
  const wrapRef = React.useRef<HTMLElement>(null);
  const textRef = React.useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = React.useState(max);

  const fitText = React.useCallback(() => {
    const wrap = wrapRef.current;
    const text = textRef.current;
    if (!wrap || !text) return;

    const availableWidth = wrap.clientWidth;
    if (availableWidth <= 0) return;

    let low = min;
    let high = max;
    let best = min;

    for (let i = 0; i < 10; i += 1) {
      const mid = (low + high) / 2;
      text.style.fontSize = `${mid}px`;

      if (text.scrollWidth <= availableWidth + 0.5) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    setFontSize(Math.floor(best * 10) / 10);
  }, [max, min]);

  React.useLayoutEffect(() => {
    fitText();
  }, [children, fitText]);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(fitText);
    });
    observer.observe(wrap);

    document.fonts?.ready.then(fitText).catch(() => {});

    return () => observer.disconnect();
  }, [fitText]);

  const Component = as;

  return (
    <Component
      ref={wrapRef as React.Ref<any>}
      className={`auto-fit-text ${className}`.trim()}
      title={typeof children === 'string' || typeof children === 'number' ? String(children) : props.title}
      {...props}
    >
      <span ref={textRef} className="auto-fit-text__inner" style={{ fontSize }}>
        {children}
      </span>
    </Component>
  );
};

const WaterParkSales: React.FC = () => {
  const [reports, setReports] = useState<ParsedReport[]>([]);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [summaryViewMode, setSummaryViewMode] = useState<'ADMISSION' | 'TOTAL'>('ADMISSION');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<ReportType | null>(null);
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherData>>({});
  const [detailSearchTerm, setDetailSearchTerm] = useState('');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [manualWeathers, setManualWeathers] = useState<Record<string, number>>({});
  const [calendarViewMode, setCalendarViewMode] = useState<'ADMISSION' | 'PRODUCT' | 'TOTAL'>('ADMISSION');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showCustomResults, setShowCustomResults] = useState(false);

  const handleCustomSearch = () => {
    if (!customStartDate || !customEndDate) return;
    setIsSearching(true);
    setShowCustomResults(false);
    setTimeout(() => {
      setIsSearching(false);
      setShowCustomResults(true);
    }, 1200); // 1.2초 로딩 애니메이션
  };

  const handleWeatherOverride = async (dateStr: string, code: number) => {
    if (code === -1) {
      setManualWeathers(prev => {
        const next = { ...prev };
        delete next[dateStr];
        return next;
      });
      await supabase.from('daily_reports').delete().match({ report_date: dateStr, report_type: 'WEATHER_OVERRIDE' });
    } else {
      setManualWeathers(prev => ({ ...prev, [dateStr]: code }));
      await supabase.from('daily_reports').upsert({
        report_date: dateStr,
        report_type: 'WEATHER_OVERRIDE',
        data: { code }
      }, { onConflict: 'report_date, report_type' });
    }
  };

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const { data, error } = await supabase
          .from('daily_reports')
          .select('*')
          .order('report_date', { ascending: true })
          .order('report_type', { ascending: true });
        if (error) throw error;
        if (data) {
          const overrides: Record<string, number> = {};
          const validData = data.filter(d => {
            if (d.report_type === 'WEATHER_OVERRIDE') {
              overrides[d.report_date] = d.data.code;
              return false;
            }
            return true;
          });
          setManualWeathers(overrides);

          const formatted = validData.map(d => ({
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
      let amt = 0;
      let ppl = 0;

      if (summaryViewMode === 'ADMISSION') {
        if (r.type === 'CUSTOMER_TYPE') {
          amt = r.summary.totalAmount;
          ppl = r.summary.totalQty;
        } else if (r.type === 'REALTIME_SALES') {
          const ticketItems = r.tableData.filter((t: any) => t.category === '매표소' || t.category === '입장권' || t.name === '매표소' || t.name === '입장권');
          amt = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
          ppl = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
        } else {
          return;
        }
      } else {
        // 전체 매출 기준 (TOTAL)
        if (r.type === 'CUSTOMER_TYPE') {
          amt = r.summary.totalAmount;
          ppl = r.summary.totalQty;
        } else if (r.type === 'HOURLY_SALES') {
          amt = r.summary.totalAmount;
          ppl = 0; // 상품 개수는 인원수 집계에서 배제
        } else if (r.type === 'REALTIME_SALES') {
          amt = r.summary.totalAmount;
          const ticketItems = r.tableData.filter((t: any) => t.category === '매표소' || t.category === '입장권' || t.name === '매표소' || t.name === '입장권');
          ppl = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
        } else {
          return;
        }
      }

      if (r.report_date.startsWith(targetPrefix)) {
        currentAmt += amt;
        currentPpl += ppl;
      } else if (r.report_date.startsWith(prevPrefix)) {
        prevAmt += amt;
        prevPpl += ppl;
      }
      
      if (r.report_date.startsWith(targetYearPrefix)) {
        currentYearAmt += amt;
        currentYearPpl += ppl;
      } else if (r.report_date.startsWith(prevYearPrefix)) {
        prevYearAmt += amt;
        prevYearPpl += ppl;
      }
    });
    return { currentAmt, currentPpl, prevAmt, prevPpl, currentYearAmt, currentYearPpl, prevYearAmt, prevYearPpl };
  };
  const { currentAmt, currentPpl, prevAmt, prevPpl, currentYearAmt, currentYearPpl, prevYearAmt, prevYearPpl } = getCumulativeStats();

  const getCustomRangeStats = () => {
    if (!customStartDate || !customEndDate) return null;
    const start = new Date(customStartDate);
    const end = new Date(customEndDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    if (start > end) return null;

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    let currentAmt = 0; let currentPpl = 0;
    let prevAmt = 0; let prevPpl = 0;

    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');
    const prevStartStr = format(subMonths(start, 12), 'yyyy-MM-dd');
    const prevEndStr = format(subMonths(end, 12), 'yyyy-MM-dd');

    reports.forEach(r => {
      let amt = 0;
      let ppl = 0;

      if (summaryViewMode === 'ADMISSION') {
        if (r.type === 'CUSTOMER_TYPE') {
          amt = r.summary.totalAmount;
          ppl = r.summary.totalQty;
        } else if (r.type === 'REALTIME_SALES') {
          const ticketItems = r.tableData.filter((t: any) => t.category === '매표소' || t.category === '입장권' || t.name === '매표소' || t.name === '입장권');
          amt = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
          ppl = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
        } else {
          return;
        }
      } else {
        // 전체 매출 기준 (TOTAL)
        if (r.type === 'CUSTOMER_TYPE') {
          amt = r.summary.totalAmount;
          ppl = r.summary.totalQty;
        } else if (r.type === 'HOURLY_SALES') {
          amt = r.summary.totalAmount;
          ppl = 0;
        } else if (r.type === 'REALTIME_SALES') {
          amt = r.summary.totalAmount;
          const ticketItems = r.tableData.filter((t: any) => t.category === '매표소' || t.category === '입장권' || t.name === '매표소' || t.name === '입장권');
          ppl = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
        } else {
          return;
        }
      }

      if (r.report_date >= startStr && r.report_date <= endStr) {
        currentAmt += amt;
        currentPpl += ppl;
      } else if (r.report_date >= prevStartStr && r.report_date <= prevEndStr) {
        prevAmt += amt;
        prevPpl += ppl;
      }
    });

    return { currentAmt, currentPpl, prevAmt, prevPpl, diffDays, prevStartStr, prevEndStr };
  };

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
        const admissionReport = dayReports.find(r => r.type === 'CUSTOMER_TYPE');
        const productReport = dayReports.find(r => r.type === 'HOURLY_SALES');
        const realtimeReport = dayReports.find(r => r.type === 'REALTIME_SALES');
        const wInfo = weatherMap[dateStr];

        const prevYearStr = format(subMonths(day, 12), 'yyyy-MM-dd');
        const prevDayReports = reports.filter(r => r.report_date === prevYearStr);
        const prevAdmissionReport = prevDayReports.find(r => r.type === 'CUSTOMER_TYPE');
        const prevProductReport = prevDayReports.find(r => r.type === 'HOURLY_SALES');
        const prevRealtimeReport = prevDayReports.find(r => r.type === 'REALTIME_SALES');
        const prevWInfo = weatherMap[prevYearStr];

        let currentDispAmt = 0;
        let prevDispAmt = 0;
        let currentDispQty = 0;
        let prevDispQty = 0;

        // 당해 데이터 연산
        if (realtimeReport) {
          const ticketItems = realtimeReport.tableData.filter((t: any) => t.category === '매표소' || t.category === '입장권' || t.name === '매표소' || t.name === '입장권');
          const ticketAmt = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
          const ticketQty = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
          const productAmt = realtimeReport.summary.totalAmount - ticketAmt;

          if (calendarViewMode === 'ADMISSION') {
            currentDispAmt = ticketAmt;
            currentDispQty = ticketQty;
          } else if (calendarViewMode === 'PRODUCT') {
            currentDispAmt = productAmt;
            currentDispQty = 0;
          } else {
            currentDispAmt = realtimeReport.summary.totalAmount;
            currentDispQty = ticketQty;
          }
        } else {
          if (calendarViewMode === 'ADMISSION' || calendarViewMode === 'TOTAL') {
            currentDispAmt += admissionReport?.summary?.totalAmount || 0;
            currentDispQty += admissionReport?.summary?.totalQty || 0;
          }
          if (calendarViewMode === 'PRODUCT' || calendarViewMode === 'TOTAL') {
            currentDispAmt += productReport?.summary?.totalAmount || 0;
          }
        }

        // 전년 데이터 연산
        if (prevRealtimeReport) {
          const ticketItems = prevRealtimeReport.tableData.filter((t: any) => t.category === '매표소' || t.category === '입장권' || t.name === '매표소' || t.name === '입장권');
          const ticketAmt = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
          const ticketQty = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
          const productAmt = prevRealtimeReport.summary.totalAmount - ticketAmt;

          if (calendarViewMode === 'ADMISSION') {
            prevDispAmt = ticketAmt;
            prevDispQty = ticketQty;
          } else if (calendarViewMode === 'PRODUCT') {
            prevDispAmt = productAmt;
            prevDispQty = 0;
          } else {
            prevDispAmt = prevRealtimeReport.summary.totalAmount;
            prevDispQty = ticketQty;
          }
        } else {
          if (calendarViewMode === 'ADMISSION' || calendarViewMode === 'TOTAL') {
            prevDispAmt += prevAdmissionReport?.summary?.totalAmount || 0;
            prevDispQty += prevAdmissionReport?.summary?.totalQty || 0;
          }
          if (calendarViewMode === 'PRODUCT' || calendarViewMode === 'TOTAL') {
            prevDispAmt += prevProductReport?.summary?.totalAmount || 0;
          }
        }

        const hasCurrentData = !!admissionReport || !!productReport || !!realtimeReport;
        const hasPrevData = !!prevAdmissionReport || !!prevProductReport || !!prevRealtimeReport;
        
        let tooltipContent = '';
        if (realtimeReport) {
          const ticketItems = realtimeReport.tableData.filter((t: any) => t.category === '매표소' || t.category === '입장권' || t.name === '매표소' || t.name === '입장권');
          const ticketAmt = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
          const productAmt = realtimeReport.summary.totalAmount - ticketAmt;
          tooltipContent += `[올해]\n입장: ${ticketAmt.toLocaleString()}원\n상품: ${productAmt.toLocaleString()}원`;
        } else {
          tooltipContent += `[올해]\n입장: ${(admissionReport?.summary?.totalAmount || 0).toLocaleString()}원\n상품: ${(productReport?.summary?.totalAmount || 0).toLocaleString()}원`;
        }

        if (prevRealtimeReport) {
          const ticketItems = prevRealtimeReport.tableData.filter((t: any) => t.category === '매표소' || t.category === '입장권' || t.name === '매표소' || t.name === '입장권');
          const ticketAmt = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
          const productAmt = prevRealtimeReport.summary.totalAmount - ticketAmt;
          tooltipContent += `\n\n[작년]\n입장: ${ticketAmt.toLocaleString()}원\n상품: ${productAmt.toLocaleString()}원`;
        } else {
          tooltipContent += `\n\n[작년]\n입장: ${(prevAdmissionReport?.summary?.totalAmount || 0).toLocaleString()}원\n상품: ${(prevProductReport?.summary?.totalAmount || 0).toLocaleString()}원`;
        }

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
              <div className="cal-weathers" style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
                {wInfo && (() => {
                  const currentCode = manualWeathers[dateStr] ?? wInfo.code;
                  return (
                    <div className="cal-weather" style={{ position: 'relative' }} title={`[올해] 최고기온 ${wInfo.temp}°C, 강수량 ${wInfo.rain}mm`}>
                      <select 
                        value={manualWeathers[dateStr] ?? -1} 
                        onChange={(e) => {
                          e.stopPropagation();
                          handleWeatherOverride(dateStr, Number(e.target.value));
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', left: 0, top: 0 }}
                        title="날씨 수정하기"
                      >
                        <option value={-1}>자동(API)</option>
                        <option value={0}>☀️ 맑음</option>
                        <option value={3}>☁️ 흐림</option>
                        <option value={61}>🌧️ 비</option>
                        <option value={71}>❄️ 눈</option>
                      </select>
                      <span style={{ fontSize: '9px', marginRight: '2px', color: '#3b82f6' }}>올해</span>
                      {getWeatherIcon(currentCode)}
                      <span>{wInfo.temp}°</span>
                    </div>
                  );
                })()}
                {prevWInfo && (() => {
                  const prevCurrentCode = manualWeathers[prevYearStr] ?? prevWInfo.code;
                  return (
                    <div className="cal-weather" style={{ opacity: 0.75, position: 'relative' }} title={`[작년] 최고기온 ${prevWInfo.temp}°C, 강수량 ${prevWInfo.rain}mm`}>
                      <select 
                        value={manualWeathers[prevYearStr] ?? -1} 
                        onChange={(e) => {
                          e.stopPropagation();
                          handleWeatherOverride(prevYearStr, Number(e.target.value));
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', left: 0, top: 0 }}
                        title="작년 날씨 수정하기"
                      >
                        <option value={-1}>자동(API)</option>
                        <option value={0}>☀️ 맑음</option>
                        <option value={3}>☁️ 흐림</option>
                        <option value={61}>🌧️ 비</option>
                        <option value={71}>❄️ 눈</option>
                      </select>
                      <span style={{ fontSize: '9px', marginRight: '2px' }}>작년</span>
                      {getWeatherIcon(prevCurrentCode)}
                      <span>{prevWInfo.temp}°</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {(hasCurrentData || hasPrevData) && (
              <div className="cal-data-box" title={tooltipContent}>
                {hasCurrentData ? (
                  <div className="cal-data-row current">
                    <span className="year-label">올해</span>
                    <AutoFitText className="amt" min={9} max={13}>{(currentDispAmt / 10000).toFixed(0)}만</AutoFitText>
                    <AutoFitText className="qty" min={8} max={11}>{calendarViewMode === 'PRODUCT' ? '-' : `${currentDispQty}명`}</AutoFitText>
                  </div>
                ) : (
                  <div className="cal-data-row current" style={{ opacity: 0.5 }}>
                    <span className="year-label">올해</span>
                    <AutoFitText className="amt" min={9} max={13}>-</AutoFitText>
                    <AutoFitText className="qty" min={8} max={11}>-</AutoFitText>
                  </div>
                )}
                
                {hasPrevData ? (() => {
                  const growthAmt = currentDispAmt - prevDispAmt;
                  const pct = prevDispAmt > 0 ? (growthAmt / prevDispAmt * 100).toFixed(0) : 0;
                  return (
                    <>
                      <div className="cal-data-row prev">
                        <span className="year-label">작년</span>
                        <AutoFitText className="amt" min={9} max={13}>{(prevDispAmt / 10000).toFixed(0)}만</AutoFitText>
                        <AutoFitText className="qty" min={8} max={11}>{calendarViewMode === 'PRODUCT' ? '-' : `${prevDispQty}명`}</AutoFitText>
                      </div>
                      {hasCurrentData && (
                        <AutoFitText as="div" className={`cal-yoy-bar ${growthAmt >= 0 ? 'up' : 'down'}`} min={9} max={11}>
                          {growthAmt >= 0 ? '▲' : '▼'} {Math.abs(Number(pct))}%
                        </AutoFitText>
                      )}
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
          {/* 집계 기준 선택 토글 탭 */}
          <div className="summary-view-toggle" style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '30px', width: 'fit-content' }}>
            <button 
              className={`tab-button ${summaryViewMode === 'ADMISSION' ? 'active' : ''}`} 
              onClick={() => setSummaryViewMode('ADMISSION')} 
              style={{ padding: '8px 20px', fontSize: '13px', borderRadius: '20px', transition: 'all 0.2s', border: 'none', cursor: 'pointer', background: summaryViewMode === 'ADMISSION' ? '#3b82f6' : 'transparent', color: 'white', fontWeight: 700 }}
            >
              🎟️ 입장권 기준 집계
            </button>
            <button 
              className={`tab-button ${summaryViewMode === 'TOTAL' ? 'active' : ''}`} 
              onClick={() => setSummaryViewMode('TOTAL')} 
              style={{ padding: '8px 20px', fontSize: '13px', borderRadius: '20px', transition: 'all 0.2s', border: 'none', cursor: 'pointer', background: summaryViewMode === 'TOTAL' ? '#f59e0b' : 'transparent', color: 'white', fontWeight: 700 }}
            >
              💰 전체 매출(상품 포함) 집계
            </button>
          </div>

          {/* 연간 누적 */}
          <h3>🏆 연간 전체 누적 실적 비교 ({summaryViewMode === 'ADMISSION' ? '입장권 발권 기준' : '전체 매출 기준'}, {format(currentMonth, 'yyyy')}년)</h3>
          <div className="dash-compare-container" style={{ marginBottom: '24px' }}>
            {/* 전년도 연간 */}
            <div className="dash-column prev">
              <h4>{format(subMonths(currentMonth, 12), 'yyyy년')} 전체 누적 (전년도)</h4>
              <div className="cum-cards">
                <div className="cum-card">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '입장 발권 매출액' : '종합 총 매출액'}</span>
                  <AutoFitText className="cum-value" min={13} max={24}>{formatCurrency(prevYearAmt)}</AutoFitText>
                </div>
                <div className="cum-card">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '총 입장 발권수' : '총 입장객 수'}</span>
                  <AutoFitText className="cum-value" min={13} max={24}>{prevYearPpl.toLocaleString()} 명</AutoFitText>
                </div>
                <div className="cum-card">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '발권 평균 객단가' : '종합 1인당 객단가'}</span>
                  <AutoFitText className="cum-value" min={13} max={24}>{prevYearPpl > 0 ? formatCurrency(Math.round(prevYearAmt/prevYearPpl)) : '0원'}</AutoFitText>
                </div>
              </div>
            </div>

            {/* 당해 연도 연간 */}
            <div className="dash-column current">
              <h4>{format(currentMonth, 'yyyy년')} 전체 누적 (올해)</h4>
              <div className="cum-cards">
                <div className="cum-card highlight">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '입장 발권 매출액' : '종합 총 매출액'}</span>
                  <div className="cum-val-row">
                    <AutoFitText className="cum-value" min={13} max={24}>{formatCurrency(currentYearAmt)}</AutoFitText>
                    {prevYearAmt > 0 && <AutoFitText className={`dash-badge ${currentYearAmt >= prevYearAmt ? 'up' : 'down'}`} min={9} max={12}>{currentYearAmt >= prevYearAmt ? '▲' : '▼'} {Math.abs((currentYearAmt-prevYearAmt)/prevYearAmt*100).toFixed(1)}%</AutoFitText>}
                  </div>
                </div>
                <div className="cum-card highlight">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '총 입장 발권수' : '총 입장객 수'}</span>
                  <div className="cum-val-row">
                    <AutoFitText className="cum-value" min={13} max={24}>{currentYearPpl.toLocaleString()} 명</AutoFitText>
                    {prevYearPpl > 0 && <AutoFitText className={`dash-badge ${currentYearPpl >= prevYearPpl ? 'up' : 'down'}`} min={9} max={12}>{currentYearPpl >= prevYearPpl ? '▲' : '▼'} {Math.abs((currentYearPpl-prevYearPpl)/prevYearPpl*100).toFixed(1)}%</AutoFitText>}
                  </div>
                </div>
                <div className="cum-card highlight">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '발권 평균 객단가' : '종합 1인당 객단가'}</span>
                  <AutoFitText className="cum-value" min={13} max={24}>{currentYearPpl > 0 ? formatCurrency(Math.round(currentYearAmt/currentYearPpl)) : '0원'}</AutoFitText>
                </div>
              </div>
            </div>
          </div>

          <h3>📊 월간 영업 누적 실적 비교 ({summaryViewMode === 'ADMISSION' ? '입장권 발권 기준' : '전체 매출 기준'}, {format(currentMonth, 'MM')}월)</h3>
          <div className="dash-compare-container">
            {/* 전년 동월 */}
            <div className="dash-column prev">
              <h4>{format(subMonths(currentMonth, 12), 'yyyy년 MM월')} (전년 동월)</h4>
              <div className="cum-cards">
                <div className="cum-card">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '입장 발권 매출액' : '종합 총 매출액'}</span>
                  <AutoFitText className="cum-value" min={13} max={24}>{formatCurrency(prevAmt)}</AutoFitText>
                </div>
                <div className="cum-card">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '총 입장 발권수' : '총 입장객 수'}</span>
                  <AutoFitText className="cum-value" min={13} max={24}>{prevPpl.toLocaleString()} 명</AutoFitText>
                </div>
                <div className="cum-card">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '발권 평균 객단가' : '종합 1인당 객단가'}</span>
                  <AutoFitText className="cum-value" min={13} max={24}>{prevPpl > 0 ? formatCurrency(Math.round(prevAmt/prevPpl)) : '0원'}</AutoFitText>
                </div>
              </div>
            </div>

            {/* 당해 연도 */}
            <div className="dash-column current">
              <h4>{format(currentMonth, 'yyyy년 MM월')} (올해)</h4>
              <div className="cum-cards">
                <div className="cum-card highlight">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '입장 발권 매출액' : '종합 총 매출액'}</span>
                  <div className="cum-val-row">
                    <AutoFitText className="cum-value" min={13} max={24}>{formatCurrency(currentAmt)}</AutoFitText>
                    {prevAmt > 0 && <AutoFitText className={`dash-badge ${currentAmt >= prevAmt ? 'up' : 'down'}`} min={9} max={12}>{currentAmt >= prevAmt ? '▲' : '▼'} {Math.abs((currentAmt-prevAmt)/prevAmt*100).toFixed(1)}%</AutoFitText>}
                  </div>
                </div>
                <div className="cum-card highlight">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '총 입장 발권수' : '총 입장객 수'}</span>
                  <div className="cum-val-row">
                    <AutoFitText className="cum-value" min={13} max={24}>{currentPpl.toLocaleString()} 명</AutoFitText>
                    {prevPpl > 0 && <AutoFitText className={`dash-badge ${currentPpl >= prevPpl ? 'up' : 'down'}`} min={9} max={12}>{currentPpl >= prevPpl ? '▲' : '▼'} {Math.abs((currentPpl-prevPpl)/prevPpl*100).toFixed(1)}%</AutoFitText>}
                  </div>
                </div>
                <div className="cum-card highlight">
                  <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '발권 평균 객단가' : '종합 1인당 객단가'}</span>
                  <AutoFitText className="cum-value" min={13} max={24}>{currentPpl > 0 ? formatCurrency(Math.round(currentAmt/currentPpl)) : '0원'}</AutoFitText>
                </div>
              </div>
            </div>
          </div>

          <div className="custom-range-selector" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', marginTop: '12px' }}>
            <h3 style={{ margin: 0 }}>🔍 특정 기간 누적 실적 검색</h3>
            <input type="date" value={customStartDate} onChange={(e) => { setCustomStartDate(e.target.value); setShowCustomResults(false); }} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontFamily: 'inherit', color: '#1e293b' }} />
            <span style={{ fontWeight: 600 }}>~</span>
            <input type="date" value={customEndDate} onChange={(e) => { setCustomEndDate(e.target.value); setShowCustomResults(false); }} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontFamily: 'inherit', color: '#1e293b' }} />
            <button 
              onClick={handleCustomSearch}
              disabled={isSearching || !customStartDate || !customEndDate}
              style={{ padding: '8px 20px', borderRadius: '6px', background: '#f59e0b', color: 'white', border: 'none', fontWeight: 800, cursor: (isSearching || !customStartDate || !customEndDate) ? 'not-allowed' : 'pointer', opacity: (isSearching || !customStartDate || !customEndDate) ? 0.7 : 1, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {isSearching ? <div style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div> : null}
              {isSearching ? '검색 중...' : '검색하기'}
            </button>
          </div>
          
          <style>{`
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          `}</style>

          {isSearching && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'white', animation: 'fadeUp 0.3s ease-out' }}>
              <div style={{ width: '32px', height: '32px', border: '3px solid rgba(255,255,255,0.2)', borderTop: '3px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px auto' }}></div>
              <p style={{ fontWeight: 600, margin: 0, opacity: 0.9 }}>데이터를 집계하고 있습니다...</p>
            </div>
          )}

          {showCustomResults && customStartDate && customEndDate && (() => {
            const stats = getCustomRangeStats();
            if (!stats) return <p style={{ color: '#ef4444', marginBottom: '24px', fontWeight: 'bold' }}>⚠️ 시작일이 종료일보다 클 수 없습니다.</p>;
            
            return (
              <div className="dash-compare-container animate-fade-in" style={{ marginBottom: '24px' }}>
                {/* 지정 기간 전년도 */}
                <div className="dash-column prev">
                  <h4>{stats.prevStartStr} ~ {stats.prevEndStr} (전년 동기간, {stats.diffDays}일간)</h4>
                  <div className="cum-cards">
                    <div className="cum-card">
                      <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '입장 발권 매출액' : '종합 총 매출액'}</span>
                      <AutoFitText className="cum-value" min={13} max={24}>{formatCurrency(stats.prevAmt)}</AutoFitText>
                    </div>
                    <div className="cum-card">
                      <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '총 입장 발권수' : '총 입장객 수'}</span>
                      <AutoFitText className="cum-value" min={13} max={24}>{stats.prevPpl.toLocaleString()} 명</AutoFitText>
                    </div>
                    <div className="cum-card">
                      <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '발권 평균 객단가' : '종합 1인당 객단가'}</span>
                      <AutoFitText className="cum-value" min={13} max={24}>{stats.prevPpl > 0 ? formatCurrency(Math.round(stats.prevAmt/stats.prevPpl)) : '0원'}</AutoFitText>
                    </div>
                  </div>
                </div>

                {/* 지정 기간 올해 */}
                <div className="dash-column current">
                  <h4>{customStartDate} ~ {customEndDate} (지정 기간, {stats.diffDays}일간)</h4>
                  <div className="cum-cards">
                    <div className="cum-card highlight">
                      <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '입장 발권 매출액' : '종합 총 매출액'}</span>
                      <div className="cum-val-row">
                        <AutoFitText className="cum-value" min={13} max={24}>{formatCurrency(stats.currentAmt)}</AutoFitText>
                        {stats.prevAmt > 0 && <AutoFitText className={`dash-badge ${stats.currentAmt >= stats.prevAmt ? 'up' : 'down'}`} min={9} max={12}>{stats.currentAmt >= stats.prevAmt ? '▲' : '▼'} {Math.abs((stats.currentAmt-stats.prevAmt)/stats.prevAmt*100).toFixed(1)}%</AutoFitText>}
                      </div>
                    </div>
                    <div className="cum-card highlight">
                      <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '총 입장 발권수' : '총 입장객 수'}</span>
                      <div className="cum-val-row">
                        <AutoFitText className="cum-value" min={13} max={24}>{stats.currentPpl.toLocaleString()} 명</AutoFitText>
                        {stats.prevPpl > 0 && <AutoFitText className={`dash-badge ${stats.currentPpl >= stats.prevPpl ? 'up' : 'down'}`} min={9} max={12}>{stats.currentPpl >= stats.prevPpl ? '▲' : '▼'} {Math.abs((stats.currentPpl-stats.prevPpl)/stats.prevPpl*100).toFixed(1)}%</AutoFitText>}
                      </div>
                    </div>
                    <div className="cum-card highlight">
                      <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '발권 평균 객단가' : '종합 1인당 객단가'}</span>
                      <AutoFitText className="cum-value" min={13} max={24}>{stats.currentPpl > 0 ? formatCurrency(Math.round(stats.currentAmt/stats.currentPpl)) : '0원'}</AutoFitText>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="cal-header-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
          <div className="cal-header" style={{ marginBottom: 0 }}>
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft /></button>
            <h2>{format(currentMonth, 'yyyy년 MM월')}</h2>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight /></button>
          </div>
          <div className="cal-view-toggle" style={{ display: 'flex', gap: '8px' }}>
            <button className={`tab-button ${calendarViewMode === 'ADMISSION' ? 'active' : ''}`} onClick={() => setCalendarViewMode('ADMISSION')} style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px' }}>🎟️ 입장 매출</button>
            <button className={`tab-button ${calendarViewMode === 'PRODUCT' ? 'active' : ''}`} onClick={() => setCalendarViewMode('PRODUCT')} style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px' }}>🍔 상품 매출</button>
            <button className={`tab-button ${calendarViewMode === 'TOTAL' ? 'active' : ''}`} onClick={() => setCalendarViewMode('TOTAL')} style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '20px' }}>💰 전체 합산</button>
          </div>
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
    
    const combinedReports = dayReports;
    const activeReport = combinedReports.find(r => r.type === activeTab) || combinedReports[0];
    const wInfo = weatherMap[dateStr];
    
    const prevYearStr = format(subMonths(selectedDate, 12), 'yyyy-MM-dd');
    const prevWInfo = weatherMap[prevYearStr];

    const isHoliday = !!KOREAN_HOLIDAYS[dateStr];
    const holidayName = KOREAN_HOLIDAYS[dateStr];

    return (
      <div className="detail-container animate-fade-in">
        <div className="detail-header">
          <button className="back-btn" onClick={() => { setSelectedDate(null); }}><ArrowLeft /> 달력으로 돌아가기</button>
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

        {combinedReports.length === 0 && (
           <div className="empty-state" style={{ padding: '64px 0', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', color: '#64748b', border: '1px dashed #cbd5e1' }}>
             <CalendarIcon size={48} style={{ marginBottom: '16px', color: '#cbd5e1' }} />
             <h3>등록된 영업 실적 데이터가 없습니다.</h3>
             <p>해당 일자에 수집된 실시간 영업 실적이 아직 집계되지 않았습니다.</p>
           </div>
        )}

        {combinedReports.length > 0 && (
          <>
            {/* --- 통합 요약 대시보드 시작 --- */}
            {(() => {
              const ct = combinedReports.find(r => r.type === 'CUSTOMER_TYPE');
              const hs = combinedReports.find(r => r.type === 'HOURLY_SALES');
              const rs = combinedReports.find(r => r.type === 'REALTIME_SALES');

              const pct = reports.find(r => r.report_date === prevYearStr && r.type === 'CUSTOMER_TYPE');
              const phs = reports.find(r => r.report_date === prevYearStr && r.type === 'HOURLY_SALES');
              const prs = reports.find(r => r.report_date === prevYearStr && r.type === 'REALTIME_SALES');

              // 당해 매출 계산
              let totalAdmissions = 0;
              let ticketRev = 0;
              let fbRev = 0;

              if (rs) {
                const ticketItems = rs.tableData.filter((t: any) => t.category === '매표소' || t.category === '입장권' || t.name === '매표소' || t.name === '입장권');
                ticketRev = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
                totalAdmissions = ticketItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
                fbRev = rs.summary.totalAmount - ticketRev;
              } else {
                totalAdmissions = ct ? ct.summary.totalQty : 0;
                ticketRev = ct ? ct.summary.totalAmount : 0;
                fbRev = hs ? hs.summary.totalAmount : 0;
              }

              const totalRev = ticketRev + fbRev;
              const perCapita = totalAdmissions > 0 ? totalRev / totalAdmissions : 0;

              // 작년 매출 계산
              let prevAdmissions = 0;
              let prevTicketRev = 0;
              let prevFbRev = 0;

              if (prs) {
                const prevTicketItems = prs.tableData.filter((t: any) => t.category === '매표소' || t.category === '입장권' || t.name === '매표소' || t.name === '입장권');
                prevTicketRev = prevTicketItems.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);
                prevAdmissions = prevTicketItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 0), 0);
                prevFbRev = prs.summary.totalAmount - prevTicketRev;
              } else {
                prevAdmissions = pct ? pct.summary.totalQty : 0;
                prevTicketRev = pct ? pct.summary.totalAmount : 0;
                prevFbRev = phs ? phs.summary.totalAmount : 0;
              }

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
                  className={`tab-button ${activeReport?.id === report.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(report.type)}
                >
                  <FileSpreadsheet size={16} /> {report.title}
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
                          <AutoFitText className="cum-value" min={13} max={24}>{formatCurrency(prevYearReport.summary.totalAmount)}</AutoFitText>
                        </div>
                        <div className="cum-card">
                          <span className="cum-label">{activeReport.summary.qtyLabel}</span>
                          <AutoFitText className="cum-value" min={13} max={24}>{prevYearReport.summary.totalQty.toLocaleString()} 건</AutoFitText>
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
                            <AutoFitText className="cum-value" min={13} max={24}>{formatCurrency(activeReport.summary.totalAmount)}</AutoFitText>
                            <AutoFitText className={`dash-badge ${growthAmt >= 0 ? 'up' : 'down'}`} min={9} max={12}>{growthAmt >= 0 ? '▲' : '▼'} {Math.abs(Number(growthAmtPct))}%</AutoFitText>
                          </div>
                        </div>
                        <div className="cum-card highlight">
                          <span className="cum-label">{activeReport.summary.qtyLabel}</span>
                          <div className="cum-val-row">
                            <AutoFitText className="cum-value" min={13} max={24}>{activeReport.summary.totalQty.toLocaleString()} 건</AutoFitText>
                            <AutoFitText className={`dash-badge ${growthQty >= 0 ? 'up' : 'down'}`} min={9} max={12}>{growthQty >= 0 ? '▲' : '▼'} {Math.abs(Number(growthQtyPct))}%</AutoFitText>
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
