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
import {
  format, subMonths, isSameDay, addDays, startOfWeek,
  startOfMonth, endOfMonth, endOfWeek, isSameMonth, addMonths,
} from 'date-fns';
import { ko } from 'date-fns/locale';
import './WaterParkSales.css';
import CrawlerSyncButton from './CrawlerSyncButton';

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
const FOOD_CATEGORIES = new Set(['푸드게이트', '나로', '아폴로', '트레일러1', '트레일러2', '트레일러3']);

type SalesMetric = { quantity: number; amount: number };
type DaySalesSnapshot = {
  hasData: boolean;
  hasBreakdown: boolean;
  totalAmount: number;
  admission: SalesMetric;
  food: SalesMetric;
  rental: SalesMetric;
};

const normalizeSalesCategory = (value: unknown) => String(value || '').replace(/\s/g, '');
const isAdmissionTicketItem = (item: any) => (
  ['매표소', '입장권'].includes(normalizeSalesCategory(item.category))
  || ['매표소', '입장권'].includes(normalizeSalesCategory(item.name))
);

const summarizeRows = (rows: any[], predicate: (row: any) => boolean): SalesMetric => rows
  .filter(predicate)
  .reduce((total, row) => ({
    quantity: total.quantity + (Number(row.quantity) || 0),
    amount: total.amount + (Number(row.amount) || 0),
  }), { quantity: 0, amount: 0 });

const getDaySalesSnapshot = (dayReports: ParsedReport[]): DaySalesSnapshot => {
  const realtime = dayReports.find((report) => report.type === 'REALTIME_SALES');
  if (realtime) {
    return {
      hasData: true,
      hasBreakdown: true,
      totalAmount: Number(realtime.summary.totalAmount) || 0,
      admission: summarizeRows(realtime.tableData, isAdmissionTicketItem),
      food: summarizeRows(realtime.tableData, (row) => FOOD_CATEGORIES.has(normalizeSalesCategory(row.category))),
      rental: summarizeRows(realtime.tableData, (row) => normalizeSalesCategory(row.category) === '물품대여'),
    };
  }

  const admission = dayReports.find((report) => report.type === 'CUSTOMER_TYPE');
  const product = dayReports.find((report) => report.type === 'HOURLY_SALES');
  return {
    hasData: Boolean(admission || product),
    hasBreakdown: false,
    totalAmount: (Number(admission?.summary.totalAmount) || 0) + (Number(product?.summary.totalAmount) || 0),
    admission: {
      quantity: Number(admission?.summary.totalQty) || 0,
      amount: Number(admission?.summary.totalAmount) || 0,
    },
    food: { quantity: 0, amount: 0 },
    rental: { quantity: 0, amount: 0 },
  };
};

const compactWon = (amount: number) => {
  if (Math.abs(amount) >= 100_000_000) return `${(amount / 100_000_000).toFixed(2)}억`;
  if (Math.abs(amount) >= 10_000) return `${Math.round(amount / 10_000).toLocaleString()}만`;
  return amount.toLocaleString();
};

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
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  });
  const [summaryViewMode, setSummaryViewMode] = useState<'ADMISSION' | 'TOTAL'>('ADMISSION');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<ReportType | null>(null);
  const [weatherMap, setWeatherMap] = useState<Record<string, WeatherData>>({});
  const [detailSearchTerm, setDetailSearchTerm] = useState('');
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});
  const [manualWeathers, setManualWeathers] = useState<Record<string, number>>({});
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

  async function fetchReports() {
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
  }

  useEffect(() => {
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
        const previousMonth = subMonths(currentMonth, 12);
        const startStr = format(startOfMonth(previousMonth), 'yyyy-MM-dd');
        const endStr = format(endOfMonth(previousMonth), 'yyyy-MM-dd');
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

  const getWeatherLabel = (code: number) => {
    if (code === 0) return '맑음';
    if (code >= 1 && code <= 2) return '구름';
    if (code === 3) return '흐림';
    if (code >= 45 && code <= 48) return '안개';
    if (code >= 51 && code <= 67) return '비';
    if (code >= 71 && code <= 77) return '눈';
    if (code >= 80 && code <= 82) return '소나기';
    if (code >= 85 && code <= 86) return '눈';
    if (code >= 95) return '뇌우';
    return '맑음';
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
          const ticketItems = r.tableData.filter(isAdmissionTicketItem);
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
          const ticketItems = r.tableData.filter(isAdmissionTicketItem);
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
          const ticketItems = r.tableData.filter(isAdmissionTicketItem);
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
          const ticketItems = r.tableData.filter(isAdmissionTicketItem);
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
    const startDate = startOfWeek(currentMonth, { weekStartsOn: 1 });
    const endDate = addDays(startDate, 6);
    const visibleDates = Array.from({ length: 7 }, (_, index) => addDays(startDate, index));
    const currentWeekSnapshots = visibleDates.map((date) => getDaySalesSnapshot(
      reports.filter((report) => report.report_date === format(date, 'yyyy-MM-dd')),
    ));
    const previousWeekSnapshots = visibleDates.map((date) => getDaySalesSnapshot(
      reports.filter((report) => report.report_date === format(subMonths(date, 12), 'yyyy-MM-dd')),
    ));
    const aggregateSnapshots = (snapshots: DaySalesSnapshot[]) => snapshots.reduce((total, snapshot) => ({
      totalAmount: total.totalAmount + snapshot.totalAmount,
      admission: {
        quantity: total.admission.quantity + snapshot.admission.quantity,
        amount: total.admission.amount + snapshot.admission.amount,
      },
      food: {
        quantity: total.food.quantity + snapshot.food.quantity,
        amount: total.food.amount + snapshot.food.amount,
      },
      rental: {
        quantity: total.rental.quantity + snapshot.rental.quantity,
        amount: total.rental.amount + snapshot.rental.amount,
      },
    }), {
      totalAmount: 0,
      admission: { quantity: 0, amount: 0 },
      food: { quantity: 0, amount: 0 },
      rental: { quantity: 0, amount: 0 },
    });
    const weekTotals = aggregateSnapshots(currentWeekSnapshots);
    const previousWeekTotals = aggregateSnapshots(previousWeekSnapshots);
    const totalGrowth = previousWeekTotals.totalAmount > 0
      ? ((weekTotals.totalAmount - previousWeekTotals.totalAmount) / previousWeekTotals.totalAmount) * 100
      : null;
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const monthGridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const monthGridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const monthGridDates = Array.from(
      { length: Math.round((monthGridEnd.getTime() - monthGridStart.getTime()) / 86_400_000) + 1 },
      (_, index) => addDays(monthGridStart, index),
    );
    const monthSnapshots = monthGridDates
      .filter((date) => isSameMonth(date, currentMonth))
      .map((date) => getDaySalesSnapshot(
        reports.filter((report) => report.report_date === format(date, 'yyyy-MM-dd')),
      ));
    const monthTotals = aggregateSnapshots(monthSnapshots);

    const renderPeriodComparison = ({
      kicker,
      title,
      currentLabel,
      previousLabel,
      currentAmount,
      previousAmount,
      currentPeople,
      previousPeople,
    }: {
      kicker: string;
      title: string;
      currentLabel: string;
      previousLabel: string;
      currentAmount: number;
      previousAmount: number;
      currentPeople: number;
      previousPeople: number;
    }) => {
      const currentUnitPrice = currentPeople > 0 ? Math.round(currentAmount / currentPeople) : 0;
      const previousUnitPrice = previousPeople > 0 ? Math.round(previousAmount / previousPeople) : 0;
      const metrics = [
        {
          label: summaryViewMode === 'ADMISSION' ? '입장 매출' : '전체 매출',
          current: formatCurrency(currentAmount),
          previous: formatCurrency(previousAmount),
          currentValue: currentAmount,
          previousValue: previousAmount,
        },
        {
          label: '입장객 (명)',
          current: `${currentPeople.toLocaleString()}명`,
          previous: `${previousPeople.toLocaleString()}명`,
          currentValue: currentPeople,
          previousValue: previousPeople,
        },
        {
          label: '1인당 객단가',
          current: formatCurrency(currentUnitPrice),
          previous: formatCurrency(previousUnitPrice),
          currentValue: currentUnitPrice,
          previousValue: previousUnitPrice,
        },
      ];

      return (
        <section className="period-comparison-section">
          <div className="period-comparison-heading">
            <div>
              <span>{kicker}</span>
              <h3>{title}</h3>
            </div>
            <em>{summaryViewMode === 'ADMISSION' ? '입장객 발권 기준' : '전체 매출 기준'}</em>
          </div>
          <div className="period-comparison-grid">
            {metrics.map((metric) => {
              const growth = metric.previousValue > 0
                ? ((metric.currentValue - metric.previousValue) / metric.previousValue) * 100
                : null;
              return (
                <article className="period-metric-card" key={metric.label}>
                  <div className="period-metric-head">
                    <span>{metric.label}</span>
                    <em className={growth !== null && growth >= 0 ? 'up' : 'down'}>
                      {growth === null ? '비교 없음' : `${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth).toFixed(1)}%`}
                    </em>
                  </div>
                  <div className="period-current-value">
                    <small>{currentLabel} · 올해</small>
                    <AutoFitText as="div" min={16} max={28}>{metric.current}</AutoFitText>
                  </div>
                  <div className="period-previous-value">
                    <span>{previousLabel} · 전년</span>
                    <b>{metric.previous}</b>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      );
    };

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayReports = reports.filter(r => r.report_date === dateStr);
        const wInfo = weatherMap[dateStr];

        const prevYearStr = format(subMonths(day, 12), 'yyyy-MM-dd');
        const prevDayReports = reports.filter(r => r.report_date === prevYearStr);
        const prevWInfo = weatherMap[prevYearStr];
        const currentSnapshot = getDaySalesSnapshot(dayReports);
        const previousSnapshot = getDaySalesSnapshot(prevDayReports);

        const isHoliday = !!KOREAN_HOLIDAYS[dateStr];
        const holidayName = KOREAN_HOLIDAYS[dateStr];
        const isSunday = day.getDay() === 0;
        const isSaturday = day.getDay() === 6;
        const isRedDay = isHoliday || isSunday;

        days.push(
          <div 
            className={`cal-cell weekly-sales-card ${selectedDate && isSameDay(day, selectedDate) ? 'selected' : ''} ${isSameDay(day, new Date()) ? 'today' : ''}`}
            key={day.toString()}
            onClick={() => setSelectedDate(cloneDay)}
          >
            <div className="cal-cell-header">
              <span className={`cal-date ${isRedDay ? 'red-day' : ''} ${isSaturday && !isHoliday ? 'blue-day' : ''}`}>
                <small>{format(day, 'EEE', { locale: ko })}</small>
                {format(day, "M/d")}
                {isHoliday && <span className="holiday-badge">{holidayName}</span>}
              </span>
              <div className="weekly-weather-stack">
                {wInfo && (() => {
                  const currentCode = manualWeathers[dateStr] ?? wInfo.code;
                  return (
                    <div className="weekly-weather-row current" title={`[올해] 최고기온 ${wInfo.temp}°C, 강수량 ${wInfo.rain}mm`}>
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
                      <span>올해</span>
                      {getWeatherIcon(currentCode)}
                      <b>{Math.round(wInfo.temp)}°</b>
                      <em>{getWeatherLabel(currentCode)}</em>
                    </div>
                  );
                })()}
                {prevWInfo && (() => {
                  const prevCurrentCode = manualWeathers[prevYearStr] ?? prevWInfo.code;
                  return (
                    <div className="weekly-weather-row previous" title={`[전년] 최고기온 ${prevWInfo.temp}°C, 강수량 ${prevWInfo.rain}mm`}>
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
                      <span>전년</span>
                      {getWeatherIcon(prevCurrentCode)}
                      <b>{Math.round(prevWInfo.temp)}°</b>
                      <em>{getWeatherLabel(prevCurrentCode)}</em>
                    </div>
                  );
                })()}
              </div>
            </div>

            {currentSnapshot.hasData ? (
              <div className="weekly-card-content">
                <div className="weekly-card-total">
                  <span>일 매출 합계</span>
                  <strong title={formatCurrency(currentSnapshot.totalAmount)}>{compactWon(currentSnapshot.totalAmount)}원</strong>
                </div>
                {currentSnapshot.hasBreakdown ? (
                  <div className="weekly-category-list">
                    {([
                      { key: 'admission', code: 'GUEST', label: '입장객', metric: currentSnapshot.admission },
                      { key: 'food', code: 'F&B', label: '식음', metric: currentSnapshot.food },
                      { key: 'rental', code: 'RENTAL', label: '물품대여', metric: currentSnapshot.rental },
                    ] as const).map((category) => (
                      <div className={`weekly-category-row ${category.key}`} key={category.key}>
                        <div><span>{category.code}</span><strong>{category.label}</strong></div>
                        <b>{category.metric.quantity.toLocaleString()}{category.key === 'admission' ? '명' : '건'}</b>
                        <em title={formatCurrency(category.metric.amount)}>{compactWon(category.metric.amount)}원</em>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="weekly-legacy-data">
                    <span>과거 통합 데이터</span>
                    <strong>입장객 {currentSnapshot.admission.quantity.toLocaleString()}명</strong>
                  </div>
                )}
                {previousSnapshot.hasData ? (() => {
                  const salesGrowth = previousSnapshot.totalAmount > 0
                    ? ((currentSnapshot.totalAmount - previousSnapshot.totalAmount) / previousSnapshot.totalAmount) * 100
                    : null;
                  const admissionGrowth = previousSnapshot.admission.quantity > 0
                    ? ((currentSnapshot.admission.quantity - previousSnapshot.admission.quantity) / previousSnapshot.admission.quantity) * 100
                    : null;
                  return (
                    <div className="weekly-yoy-panel">
                      <span>전년 대비</span>
                      <b className={salesGrowth !== null && salesGrowth >= 0 ? 'up' : 'down'}>
                        매출 {salesGrowth === null ? '-' : `${salesGrowth >= 0 ? '▲' : '▼'} ${Math.abs(salesGrowth).toFixed(1)}%`}
                      </b>
                      <b className={admissionGrowth !== null && admissionGrowth >= 0 ? 'up' : 'down'}>
                        입장객 {admissionGrowth === null ? '-' : `${admissionGrowth >= 0 ? '▲' : '▼'} ${Math.abs(admissionGrowth).toFixed(1)}%`}
                      </b>
                    </div>
                  );
                })() : (
                  <div className="weekly-yoy-panel empty">전년 비교 데이터 없음</div>
                )}
              </div>
            ) : (
              <div className="weekly-empty-card">
                <span>NO DATA</span>
                <p>수집된 매출이 없습니다.</p>
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
              👥 입장객 기준 집계
            </button>
            <button 
              className={`tab-button ${summaryViewMode === 'TOTAL' ? 'active' : ''}`} 
              onClick={() => setSummaryViewMode('TOTAL')} 
              style={{ padding: '8px 20px', fontSize: '13px', borderRadius: '20px', transition: 'all 0.2s', border: 'none', cursor: 'pointer', background: summaryViewMode === 'TOTAL' ? '#f59e0b' : 'transparent', color: 'white', fontWeight: 700 }}
            >
              💰 전체 매출(상품 포함) 집계
            </button>
          </div>

          {renderPeriodComparison({
            kicker: 'YEAR TO DATE',
            title: '연간 전체 누적 실적 비교',
            currentLabel: `${format(currentMonth, 'yyyy년')} 누적`,
            previousLabel: `${format(subMonths(currentMonth, 12), 'yyyy년')} 누적`,
            currentAmount: currentYearAmt,
            previousAmount: prevYearAmt,
            currentPeople: currentYearPpl,
            previousPeople: prevYearPpl,
          })}

          {renderPeriodComparison({
            kicker: 'MONTH TO DATE',
            title: '월간 영업 누적 실적 비교',
            currentLabel: format(currentMonth, 'yyyy년 M월'),
            previousLabel: format(subMonths(currentMonth, 12), 'yyyy년 M월'),
            currentAmount: currentAmt,
            previousAmount: prevAmt,
            currentPeople: currentPpl,
            previousPeople: prevPpl,
          })}

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
                      <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '입장객 매출액' : '종합 총 매출액'}</span>
                      <AutoFitText className="cum-value" min={13} max={24}>{formatCurrency(stats.prevAmt)}</AutoFitText>
                    </div>
                    <div className="cum-card">
                      <span className="cum-label">총 입장객 (명)</span>
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
                      <span className="cum-label">{summaryViewMode === 'ADMISSION' ? '입장객 매출액' : '종합 총 매출액'}</span>
                      <div className="cum-val-row">
                        <AutoFitText className="cum-value" min={13} max={24}>{formatCurrency(stats.currentAmt)}</AutoFitText>
                        {stats.prevAmt > 0 && <AutoFitText className={`dash-badge ${stats.currentAmt >= stats.prevAmt ? 'up' : 'down'}`} min={9} max={12}>{stats.currentAmt >= stats.prevAmt ? '▲' : '▼'} {Math.abs((stats.currentAmt-stats.prevAmt)/stats.prevAmt*100).toFixed(1)}%</AutoFitText>}
                      </div>
                    </div>
                    <div className="cum-card highlight">
                      <span className="cum-label">총 입장객 (명)</span>
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

        <div className="weekly-board-header">
          <div className="weekly-board-title">
            <span>MONDAY — SUNDAY</span>
            <h2>{format(startDate, 'yyyy년 M월 d일')} — {format(endDate, 'M월 d일')}</h2>
            <p>월요일부터 일요일까지 입장객·식음·물품대여 실적과 전년 동기를 비교합니다.</p>
          </div>
          <div className="weekly-board-actions">
            <button onClick={() => setCurrentMonth(addDays(currentMonth, -7))} aria-label="이전 7일"><ChevronLeft size={18} /> 이전 7일</button>
            <button className="today-button" onClick={() => setCurrentMonth(new Date())}><CalendarIcon size={16} /> 오늘 기준</button>
            <button onClick={() => setCurrentMonth(addDays(currentMonth, 7))} aria-label="다음 7일">다음 7일 <ChevronRight size={18} /></button>
          </div>
        </div>

        <div className="weekly-kpi-strip">
          <div className="weekly-kpi-card total">
            <span>7일 총매출</span>
            <strong>{formatCurrency(weekTotals.totalAmount)}</strong>
            <em className={totalGrowth !== null && totalGrowth >= 0 ? 'up' : 'down'}>
              전년 대비 {totalGrowth === null ? '-' : `${totalGrowth >= 0 ? '▲' : '▼'} ${Math.abs(totalGrowth).toFixed(1)}%`}
            </em>
          </div>
          <div className="weekly-kpi-card admission">
            <span>입장객 (발권 기준)</span>
            <strong>{weekTotals.admission.quantity.toLocaleString()}명</strong>
            <em>{formatCurrency(weekTotals.admission.amount)}</em>
          </div>
          <div className="weekly-kpi-card food">
            <span>식음</span>
            <strong>{weekTotals.food.quantity.toLocaleString()}건</strong>
            <em>{formatCurrency(weekTotals.food.amount)}</em>
          </div>
          <div className="weekly-kpi-card rental">
            <span>물품대여</span>
            <strong>{weekTotals.rental.quantity.toLocaleString()}건</strong>
            <em>{formatCurrency(weekTotals.rental.amount)}</em>
          </div>
        </div>

        <div className="weekly-board-scroll">
          <div className="cal-grid weekly-board-grid">
            <div className="cal-days-header">
              {visibleDates.map((date) => (
                <div key={date.toISOString()} className={date.getDay() === 0 ? 'red-day' : date.getDay() === 6 ? 'blue-day' : ''}>
                  {format(date, 'EEE', { locale: ko })}
                </div>
              ))}
            </div>
            {rows}
          </div>
        </div>

        <details className="monthly-calendar-accordion">
          <summary>
            <div className="monthly-accordion-title">
              <span>MONTHLY VIEW</span>
              <strong>{format(currentMonth, 'yyyy년 M월')} 전체 달력 보기</strong>
              <small>월요일 시작 · {format(monthStart, 'M월 d일')}부터 {format(monthEnd, 'M월 d일')}까지</small>
            </div>
            <div className="monthly-accordion-kpis">
              <span><b>{monthTotals.admission.quantity.toLocaleString()}명</b> 입장객</span>
              <span><b>{compactWon(monthTotals.totalAmount)}원</b> 총매출</span>
            </div>
            <span className="monthly-accordion-chevron"><ChevronRight size={20} /></span>
          </summary>

          <div className="monthly-calendar-panel">
            <div className="monthly-calendar-toolbar">
              <div>
                <span>30-DAY BUSINESS FLOW</span>
                <h3>{format(currentMonth, 'yyyy년 M월')} 일별 영업 흐름</h3>
              </div>
              <div className="monthly-calendar-actions">
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, -1))} aria-label="이전 달"><ChevronLeft size={16} /> 이전 달</button>
                <button onClick={() => setCurrentMonth(new Date())}>이번 달</button>
                <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} aria-label="다음 달">다음 달 <ChevronRight size={16} /></button>
              </div>
            </div>

            <div className="monthly-calendar-weekdays">
              {['월', '화', '수', '목', '금', '토', '일'].map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="monthly-calendar-grid">
              {monthGridDates.map((date) => {
                const dateStr = format(date, 'yyyy-MM-dd');
                const previousDate = subMonths(date, 12);
                const previousDateStr = format(previousDate, 'yyyy-MM-dd');
                const inMonth = isSameMonth(date, currentMonth);
                const snapshot = getDaySalesSnapshot(reports.filter((report) => report.report_date === dateStr));
                const previousSnapshot = getDaySalesSnapshot(reports.filter((report) => report.report_date === previousDateStr));
                const weather = weatherMap[dateStr];
                const previousWeather = weatherMap[previousDateStr];
                const weatherCode = weather ? (manualWeathers[dateStr] ?? weather.code) : null;
                const previousWeatherCode = previousWeather ? (manualWeathers[previousDateStr] ?? previousWeather.code) : null;
                const growth = previousSnapshot.totalAmount > 0
                  ? ((snapshot.totalAmount - previousSnapshot.totalAmount) / previousSnapshot.totalAmount) * 100
                  : null;
                const isHoliday = Boolean(KOREAN_HOLIDAYS[dateStr]);
                const isSunday = date.getDay() === 0;
                const isSaturday = date.getDay() === 6;

                return (
                  <button
                    type="button"
                    key={dateStr}
                    disabled={!inMonth}
                    className={`monthly-day-card ${!inMonth ? 'outside' : ''} ${isSameDay(date, new Date()) ? 'today' : ''}`}
                    onClick={() => inMonth && setSelectedDate(date)}
                  >
                    {inMonth && (
                      <>
                        <div className="monthly-day-head">
                          <span className={`${isHoliday || isSunday ? 'red-day' : ''} ${isSaturday && !isHoliday ? 'blue-day' : ''}`}>
                            {format(date, 'd')}
                          </span>
                          {isHoliday && <em title={KOREAN_HOLIDAYS[dateStr]}>공휴일</em>}
                          {growth !== null && (
                            <b className={growth >= 0 ? 'up' : 'down'}>{growth >= 0 ? '▲' : '▼'} {Math.abs(growth).toFixed(0)}%</b>
                          )}
                        </div>

                        <div className="monthly-weather-lines">
                          <span className="current">
                            <small>올해</small>
                            {weatherCode !== null ? getWeatherIcon(weatherCode, 12) : <i>—</i>}
                            <b>{weather ? `${Math.round(weather.temp)}°` : '-'}</b>
                            <em>{weatherCode !== null ? getWeatherLabel(weatherCode) : '날씨 없음'}</em>
                          </span>
                          <span className="previous">
                            <small>전년</small>
                            {previousWeatherCode !== null ? getWeatherIcon(previousWeatherCode, 12) : <i>—</i>}
                            <b>{previousWeather ? `${Math.round(previousWeather.temp)}°` : '-'}</b>
                            <em>{previousWeatherCode !== null ? getWeatherLabel(previousWeatherCode) : '날씨 없음'}</em>
                          </span>
                        </div>

                        {snapshot.hasData ? (
                          <div className="monthly-sales-compare">
                            <div className="current">
                              <small>올해</small>
                              <span><em>입장</em><b>{snapshot.admission.quantity.toLocaleString()}명</b></span>
                              <span><em>매출</em><b title={formatCurrency(snapshot.totalAmount)}>{compactWon(snapshot.totalAmount)}원</b></span>
                            </div>
                            <div className="previous">
                              <small>전년</small>
                              {previousSnapshot.hasData ? (
                                <>
                                  <span><em>입장</em><b>{previousSnapshot.admission.quantity.toLocaleString()}명</b></span>
                                  <span><em>매출</em><b title={formatCurrency(previousSnapshot.totalAmount)}>{compactWon(previousSnapshot.totalAmount)}원</b></span>
                                </>
                              ) : <span className="no-compare">비교 데이터 없음</span>}
                            </div>
                          </div>
                        ) : (
                          <div className="monthly-day-empty">수집 전</div>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="monthly-calendar-note">날짜를 누르면 해당 일자의 상세 영업 보고서가 열립니다. 입장객은 발권 수량 기준입니다.</p>
          </div>
        </details>
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
    const currentSnapshot = getDaySalesSnapshot(dayReports);
    const previousReports = reports.filter(r => r.report_date === prevYearStr);
    const previousSnapshot = getDaySalesSnapshot(previousReports);
    const currentUnitPrice = currentSnapshot.admission.quantity > 0
      ? Math.round(currentSnapshot.totalAmount / currentSnapshot.admission.quantity)
      : 0;
    const previousUnitPrice = previousSnapshot.admission.quantity > 0
      ? Math.round(previousSnapshot.totalAmount / previousSnapshot.admission.quantity)
      : 0;
    const detailGrowth = (currentValue: number, previousValue: number) => previousValue > 0
      ? ((currentValue - previousValue) / previousValue) * 100
      : null;
    const detailMetrics = [
      {
        key: 'guests', label: '입장객 (발권 기준)', code: 'GUEST',
        current: `${currentSnapshot.admission.quantity.toLocaleString()}명`,
        previous: `${previousSnapshot.admission.quantity.toLocaleString()}명`,
        currentValue: currentSnapshot.admission.quantity,
        previousValue: previousSnapshot.admission.quantity,
        sub: formatCurrency(currentSnapshot.admission.amount),
      },
      {
        key: 'admission', label: '입장 매출', code: 'TICKET SALES',
        current: formatCurrency(currentSnapshot.admission.amount),
        previous: formatCurrency(previousSnapshot.admission.amount),
        currentValue: currentSnapshot.admission.amount,
        previousValue: previousSnapshot.admission.amount,
        sub: `${currentSnapshot.admission.quantity.toLocaleString()}명`,
      },
      {
        key: 'food', label: '식음', code: 'F&B',
        current: formatCurrency(currentSnapshot.food.amount),
        previous: formatCurrency(previousSnapshot.food.amount),
        currentValue: currentSnapshot.food.amount,
        previousValue: previousSnapshot.food.amount,
        sub: `${currentSnapshot.food.quantity.toLocaleString()}건`,
      },
      {
        key: 'rental', label: '물품대여', code: 'RENTAL',
        current: formatCurrency(currentSnapshot.rental.amount),
        previous: formatCurrency(previousSnapshot.rental.amount),
        currentValue: currentSnapshot.rental.amount,
        previousValue: previousSnapshot.rental.amount,
        sub: `${currentSnapshot.rental.quantity.toLocaleString()}건`,
      },
      {
        key: 'unit', label: '입장객 1인당 매출', code: 'PER CAPITA',
        current: formatCurrency(currentUnitPrice),
        previous: formatCurrency(previousUnitPrice),
        currentValue: currentUnitPrice,
        previousValue: previousUnitPrice,
        sub: '총매출 ÷ 입장객',
      },
    ];

    return (
      <div className="detail-container animate-fade-in">
        <div className="api-detail-header">
          <button className="back-btn" onClick={() => { setSelectedDate(null); }}><ArrowLeft /> 매출 달력으로 돌아가기</button>
          <div className="api-detail-title-row">
            <div>
              <span>API DAILY SALES REPORT</span>
              <h2>{format(selectedDate, 'yyyy년 M월 d일 (EEEE)', { locale: ko })}</h2>
              <p>서버에서 수집된 매출 데이터를 입장객·식음·물품대여로 분류한 결과입니다.</p>
            </div>
            <div className="api-source-badges">
              <span className={currentSnapshot.hasBreakdown ? 'live' : 'legacy'}>{currentSnapshot.hasBreakdown ? 'API 분류 완료' : '통합 데이터'}</span>
              {isHoliday && <span className="holiday">{holidayName}</span>}
            </div>
          </div>
        </div>

        {currentSnapshot.hasData && (
          <section className="api-detail-board">
            <div className="api-detail-overview">
              <div className="api-total-card">
                <span>당일 총매출</span>
                <strong>{formatCurrency(currentSnapshot.totalAmount)}</strong>
                {(() => {
                  const growth = detailGrowth(currentSnapshot.totalAmount, previousSnapshot.totalAmount);
                  return <em className={growth !== null && growth >= 0 ? 'up' : 'down'}>전년 대비 {growth === null ? '비교 없음' : `${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth).toFixed(1)}%`}</em>;
                })()}
              </div>
              <div className="api-weather-compare">
                <span>날씨 비교</span>
                <div className="current">
                  <small>올해</small>
                  {wInfo ? getWeatherIcon(manualWeathers[dateStr] ?? wInfo.code, 18) : <i>—</i>}
                  <b>{wInfo ? `${Math.round(wInfo.temp)}°` : '-'}</b>
                  <em>{wInfo ? getWeatherLabel(manualWeathers[dateStr] ?? wInfo.code) : '정보 없음'}</em>
                </div>
                <div className="previous">
                  <small>전년</small>
                  {prevWInfo ? getWeatherIcon(manualWeathers[prevYearStr] ?? prevWInfo.code, 18) : <i>—</i>}
                  <b>{prevWInfo ? `${Math.round(prevWInfo.temp)}°` : '-'}</b>
                  <em>{prevWInfo ? getWeatherLabel(manualWeathers[prevYearStr] ?? prevWInfo.code) : '정보 없음'}</em>
                </div>
              </div>
            </div>

            <div className="api-detail-metrics">
              {detailMetrics.map((metric) => {
                const growth = detailGrowth(metric.currentValue, metric.previousValue);
                return (
                  <article className={`api-metric-card ${metric.key}`} key={metric.key}>
                    <div className="api-metric-heading">
                      <div><small>{metric.code}</small><span>{metric.label}</span></div>
                      <em className={growth !== null && growth >= 0 ? 'up' : 'down'}>
                        {growth === null ? '비교 없음' : `${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth).toFixed(1)}%`}
                      </em>
                    </div>
                    <div className="api-metric-current">
                      <small>올해</small>
                      <AutoFitText as="div" min={15} max={23}>{metric.current}</AutoFitText>
                      <span>{metric.sub}</span>
                    </div>
                    <div className="api-metric-previous">
                      <span>전년 동일일</span>
                      <b>{previousSnapshot.hasData ? metric.previous : '데이터 없음'}</b>
                    </div>
                  </article>
                );
              })}
            </div>
            {!currentSnapshot.hasBreakdown && (
              <p className="api-breakdown-note">이 날짜는 과거 통합 형식으로 저장되어 식음·물품대여 분류가 제공되지 않습니다.</p>
            )}
          </section>
        )}

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
                const ticketItems = rs.tableData.filter(isAdmissionTicketItem);
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
                const prevTicketItems = prs.tableData.filter(isAdmissionTicketItem);
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
                        <span style={{ color: '#93c5fd' }}>입장객 매출 {totalRev > 0 ? (ticketRev/totalRev*100).toFixed(0) : 0}%</span>
                        <span style={{ color: '#fde68a' }}>상품 {totalRev > 0 ? (fbRev/totalRev*100).toFixed(0) : 0}%</span>
                      </div>
                    </div>

                    {/* Row 2: Breakdown */}
                    <div className="integrated-card outline">
                      <div style={{ fontSize: '13px', opacity: 0.8, marginBottom: '8px', color: '#93c5fd' }}>👥 입장객 매출 (발권 기준)</div>
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

            <div className="api-raw-section-heading">
              <div><span>API SOURCE DETAIL</span><h3>수집 원본 품목 분석</h3></div>
              <p>리포트 유형을 선택하면 품목별 매출과 수량을 확인할 수 있습니다.</p>
            </div>
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
              const prevGroupedItems = hasPrevData ? prevYearReport.tableData.reduce((acc: any, row: any) => {
                const groupName = getCategoryGroup(row.name, prevYearReport.type, row.category);
                if (!acc[groupName]) acc[groupName] = [];
                acc[groupName].push(row);
                return acc;
              }, {}) : {};
              Object.keys(prevGroupedItems).forEach(cat => {
                prevGroupedItems[cat].sort((a: any, b: any) => Number(b.amount) - Number(a.amount));
              });
              const comparisonCategoryData = Array.from(new Set([
                ...categoryData.map((category: any) => category.name),
                ...prevCategoryData.map((category: any) => category.name),
              ])).map((name) => {
                const currentCategory = categoryData.find((category: any) => category.name === name);
                const previousCategory = prevCategoryData.find((category: any) => category.name === name);
                return {
                  name,
                  amount: currentCategory?.amount || 0,
                  quantity: currentCategory?.quantity || 0,
                  prevAmount: previousCategory?.amount || 0,
                  prevQuantity: previousCategory?.quantity || 0,
                };
              }).sort((a, b) => Math.max(b.amount, b.prevAmount) - Math.max(a.amount, a.prevAmount));

              return (
              <div className="report-panel">
                <section className="source-report-compact">
                  <div className="source-report-compact-head">
                    <div>
                      <span>SELECTED REPORT</span>
                      <h3>{activeReport.title}</h3>
                    </div>
                    <div className="source-report-dates">
                      <span><small>올해</small>{format(selectedDate, 'yyyy.MM.dd')}</span>
                      <i>VS</i>
                      <span><small>전년</small>{format(subMonths(selectedDate, 12), 'yyyy.MM.dd')}</span>
                    </div>
                  </div>
                  <div className="source-report-compact-grid">
                    <article>
                      <div className="source-report-metric-label">
                        <DollarSign size={17} />
                        <span>{activeReport.summary.label || '총 매출'}</span>
                      </div>
                      <div className="source-report-current">
                        <small>올해</small>
                        <AutoFitText as="div" min={18} max={27}>{formatCurrency(activeReport.summary.totalAmount)}</AutoFitText>
                      </div>
                      <div className="source-report-previous">
                        <small>전년</small>
                        <b>{hasPrevData ? formatCurrency(prevYearReport.summary.totalAmount) : '데이터 없음'}</b>
                      </div>
                      <em className={growthAmt >= 0 ? 'up' : 'down'}>
                        {hasPrevData ? `${growthAmt >= 0 ? '▲' : '▼'} ${Math.abs(Number(growthAmtPct))}%` : '비교 없음'}
                      </em>
                    </article>
                    <article>
                      <div className="source-report-metric-label">
                        <Users size={17} />
                        <span>{activeReport.summary.qtyLabel || '총 수량'}</span>
                      </div>
                      <div className="source-report-current">
                        <small>올해</small>
                        <AutoFitText as="div" min={18} max={27}>{activeReport.summary.totalQty.toLocaleString()}건</AutoFitText>
                      </div>
                      <div className="source-report-previous">
                        <small>전년</small>
                        <b>{hasPrevData ? `${prevYearReport.summary.totalQty.toLocaleString()}건` : '데이터 없음'}</b>
                      </div>
                      <em className={growthQty >= 0 ? 'up' : 'down'}>
                        {hasPrevData ? `${growthQty >= 0 ? '▲' : '▼'} ${Math.abs(Number(growthQtyPct))}%` : '비교 없음'}
                      </em>
                    </article>
                  </div>
                </section>
                
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
                  <div className="source-compare-title">
                    <div><span>ITEM-BY-ITEM YOY</span><h3>올해 · 전년 원본 품목 상세 비교</h3></div>
                    <div><b>{format(selectedDate, 'yyyy년 M월 d일')}</b><span>vs</span><b>{format(subMonths(selectedDate, 12), 'yyyy년 M월 d일')}</b></div>
                  </div>
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
                      {comparisonCategoryData.map((cat: any, index: number) => {
                        const currentItems = groupedItems[cat.name] || [];
                        const previousItems = prevGroupedItems[cat.name] || [];
                        const itemNames = Array.from(new Set([
                          ...currentItems.map((row: any) => String(row.name || '').trim()),
                          ...previousItems.map((row: any) => String(row.name || '').trim()),
                        ]));
                        const items = itemNames.map((name) => ({
                          name,
                          current: currentItems.find((row: any) => String(row.name || '').trim() === name),
                          previous: previousItems.find((row: any) => String(row.name || '').trim() === name),
                        })).filter((item) =>
                          item.name.toLowerCase().includes(detailSearchTerm.toLowerCase()) ||
                          cat.name.toLowerCase().includes(detailSearchTerm.toLowerCase())
                        ).sort((a, b) => Math.max(Number(b.current?.amount) || 0, Number(b.previous?.amount) || 0) - Math.max(Number(a.current?.amount) || 0, Number(a.previous?.amount) || 0));
                        
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
                              <span className="cat-group-sum source-category-totals">
                                <b>올해 {cat.quantity.toLocaleString()}건 · {formatCurrency(cat.amount)}</b>
                                <em>전년 {cat.prevQuantity.toLocaleString()}건 · {formatCurrency(cat.prevAmount)}</em>
                              </span>
                            </div>
                            <span style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px' }}>
                              {isExpanded ? '▲ 접기' : '▼ 펼치기'}
                            </span>
                          </h4>
                          
                          {isExpanded && (
                          <div className="cat-group-items animate-fade-in">
                            {items.map((item: any) => {
                              const currentQty = Number(item.current?.quantity) || 0;
                              const currentAmount = Number(item.current?.amount) || 0;
                              const previousQty = Number(item.previous?.quantity) || 0;
                              const previousAmount = Number(item.previous?.amount) || 0;
                              const currentUnitPrice = currentQty > 0 ? currentAmount / currentQty : 0;
                              const previousUnitPrice = previousQty > 0 ? previousAmount / previousQty : 0;
                              const amountGrowth = previousAmount > 0 ? ((currentAmount - previousAmount) / previousAmount) * 100 : null;
                              return (
                                <div key={item.name} className="source-item-compare-row">
                                  <div className="source-item-name">
                                    <span>{item.name}</span>
                                    <em className={amountGrowth !== null && amountGrowth >= 0 ? 'up' : 'down'}>
                                      {amountGrowth === null ? (item.current ? '신규/비교 없음' : '올해 미판매') : `${amountGrowth >= 0 ? '▲' : '▼'} ${Math.abs(amountGrowth).toFixed(1)}%`}
                                    </em>
                                  </div>
                                  <div className="source-year-columns">
                                    <div className="current">
                                      <strong>올해</strong>
                                      <span><small>수량</small><b>{currentQty.toLocaleString()}건</b></span>
                                      <span><small>매출</small><b>{formatCurrency(currentAmount)}</b></span>
                                      <span><small>객단가</small><b>{formatCurrency(Math.round(currentUnitPrice))}</b></span>
                                    </div>
                                    <div className="previous">
                                      <strong>전년</strong>
                                      <span><small>수량</small><b>{previousQty.toLocaleString()}건</b></span>
                                      <span><small>매출</small><b>{formatCurrency(previousAmount)}</b></span>
                                      <span><small>객단가</small><b>{formatCurrency(Math.round(previousUnitPrice))}</b></span>
                                    </div>
                                  </div>
                                  <div className="source-item-delta">
                                    <span>매출 차이</span>
                                    <b className={currentAmount - previousAmount >= 0 ? 'up' : 'down'}>
                                      {currentAmount - previousAmount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(currentAmount - previousAmount))}
                                    </b>
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
        <div><h1>📅 일일 영업 실적 & 날씨 대시보드</h1>
        <p>기상 데이터 연동을 통해 날씨와 매출의 상관관계를 한눈에 파악하세요.</p>
        <span className="sales-sync-guide">전용 PC 없이 홈페이지 서버에서 최신 5일 매출을 안전하게 수집합니다.</span></div>
        <CrawlerSyncButton target="waterpark" label="최신 매출 동기화" onComplete={fetchReports} />
      </div>
      {selectedDate ? renderDetail() : renderCalendar()}
    </div>
  );
};

export default WaterParkSales;
