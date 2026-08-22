import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, ArrowLeft, List, Calendar as CalendarIcon } from 'lucide-react';
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

type KeywordSummary = {
  keyword: string;
  productNames: Set<string>;
  orders: number;
  revenue: number;
  firstSaleDate: string;
  lastSaleDate: string;
};

type SeasonSummary = {
  id: string;
  label: string;
  usageStartDate: string;
  usageEndDate: string;
  firstSaleDate: string;
  lastSaleDate: string;
  orders: number;
  revenue: number;
  keywords: Record<string, number>;
};

type ProductVariant = { name: string; count: number; revenue: number };
type ProductGroup = { name: string; count: number; revenue: number; variants: Record<string, ProductVariant> };
type ProductCategory = { major: string; middle: string; sub: string; minor: string };
type ClassificationDetail = { label: string; orders: PackageOrder[] };

const CATEGORY_CONFIG_DATE = '2000-01-01';
const CATEGORY_MAJOR_OPTIONS = ['객실포함', '객실미포함'];
const CATEGORY_SEASON_OPTIONS = ['봄', '여름', '가을', '겨울'];
const CATEGORY_MIDDLE_SUGGESTIONS = ['룸온리', '객실PKG', '리프트 티켓', '렌탈·장비보관소', '스키강습', '워터파크 티켓', 'B2B', '프로모션', '부대시설·레저', '기타'];

const KEYWORD_RULES: Array<{ label: string; terms: string[] }> = [
  { label: 'B2B', terms: ['비씨', 'bc카드', 'ak플라자', '홈쇼핑', '지니tv', '36사단', '제휴'] },
  { label: '룸온리', terms: ['룸온리'] },
  { label: '객실PKG', terms: ['객실', '콘도', '숙박', '2박', '1박'] },
  { label: '렌탈·장비보관소', terms: ['장비보관', '장비렌탈', '의류렌탈', '락카', '보관소'] },
  { label: '스키강습', terms: ['강습', '레슨'] },
  { label: '리프트 티켓', terms: ['리프트'] },
  { label: '프로모션', terms: ['pkg', '특가', '공홈', '얼리버드', '원타임'] },
  { label: '워터파크 티켓', terms: ['워터', 'water', '아쿠아', '풀', '파도', '골드시즌', '하이시즌', '미들시즌', '입장권', '대인', '소인'] },
  { label: '부대시설·레저', terms: ['곤돌라', '루지', '고카트', '플라잉', '눈썰매', '레포츠', '조식', '힐링', '냠냠'] },
];

function classifyPackageKeyword(order: PackageOrder) {
  const text = `${order.normalizedPackageName} ${order.rawPackageName} ${order.components}`.toLowerCase();
  return KEYWORD_RULES.find(({ terms }) => terms.some((term) => text.includes(term.toLowerCase())))?.label || '기타 패키지';
}

function classificationSeasonForOrder(order: PackageOrder) {
  const source = order.reservationDate || order.orderDate;
  const matched = source.match(/\d{4}[-./]?(\d{1,2})/);
  const month = Number(matched?.[1]);
  if (month === 12 || month <= 2) return '겨울';
  if (month <= 5) return '봄';
  if (month <= 8) return '여름';
  return '가을';
}

function suggestedCategory(order: PackageOrder): ProductCategory {
  const middle = classifyPackageKeyword(order);
  const text = `${order.normalizedPackageName} ${order.rawPackageName}`.toLowerCase();
  const includesRoom = ['룸온리', '객실', '콘도', '숙박', '2박', '1박', 'room'].some((term) => text.includes(term));
  return {
    major: includesRoom ? '객실포함' : '객실미포함',
    middle: classificationSeasonForOrder(order),
    sub: middle === '기타 패키지' ? '기타' : middle,
    minor: productFamilyName(order.normalizedPackageName),
  };
}

// 저장 구조가 3단계였던 이전 분류도 새 4단계 체계로 읽어낸다.
function normalizeProductCategory(saved: ProductCategory | undefined, fallback: ProductCategory): ProductCategory {
  if (!saved || !CATEGORY_MAJOR_OPTIONS.includes(saved.major)) return fallback;
  const savedSub = (saved as ProductCategory & { sub?: string }).sub;
  return savedSub
    ? saved
    : { major: saved.major, middle: CATEGORY_SEASON_OPTIONS.includes(saved.middle) ? saved.middle : fallback.middle, sub: saved.middle || fallback.sub, minor: saved.minor || fallback.minor };
}

function seasonForDate(date: string) {
  const matched = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  if (month === 12) return { id: `${year + 1}-winter`, label: `${year + 1} 겨울`, order: 0 };
  if (month <= 2) return { id: `${year}-winter`, label: `${year} 겨울`, order: 0 };
  if (month <= 5) return { id: `${year}-spring`, label: `${year} 봄`, order: 1 };
  if (month <= 8) return { id: `${year}-summer`, label: `${year} 여름`, order: 2 };
  return { id: `${year}-autumn`, label: `${year} 가을`, order: 3 };
}

function earlierDate(current: string, candidate: string) {
  return !current || candidate < current ? candidate : current;
}

function laterDate(current: string, candidate: string) {
  return !current || candidate > current ? candidate : current;
}


const normalizePackageName = (name: string) => {
  if (!name) return '알 수 없음';
  let normalized = name.replace(/\(\d{1,2}\/\d{1,2}\)/g, ''); // Fix AK플라자 얼리버드
  // 상품명 끝의 운영일·요일 표기는 같은 상품으로 합친다. 예: "9/6~ 주중", "6/6~7/3 (금,토)"
  normalized = normalized.replace(/\s*\(?\d{1,2}\/\d{1,2}(?:\s*~(?:\s*(?:(?:\d{1,2}\/)?\d{1,2}))?)?\)?(?:\s*\([^)]*\))?(?:\s*(?:주중|주말|평일|공휴일|종일|오후|야간))?\s*$/, '');
  // Remove starting dates like 5/22 ~ 6/5
  normalized = normalized.replace(/^\d{1,2}\/\d{1,2}(\s*~\s*\d{1,2}\/\d{1,2})?\s*/, '');
  normalized = normalized.replace(/^~\s*\d{1,2}\/\d{1,2}\s*/, ''); // Handle remaining '~ 5/20'
  normalized = normalized.replace(/^休,\s*/, '');
  normalized = normalized.replace(/\d{1,2}月웰리(WEEK|DAY)\s*/, '');
  
  return normalized.trim();
};

// 동일 패키지의 인원 구성만 다른 상품은 대표 상품으로 묶고, 인원별 구성은 상세에서 확인한다.
const productFamilyName = (name: string) => name
  .replace(/\s*\(?\d+\s*인\)?(?:\s*(?:기준|구성))?\s*$/, '')
  .trim() || name;

const extractPeopleLabel = (name: string) => name.match(/(?:^|\s)(\d+)\s*인(?:\s|$|\))/)?.[1]
  ? `${name.match(/(?:^|\s)(\d+)\s*인(?:\s|$|\))/)?.[1]}인`
  : '인원 미표기';

const extractScheduleLabel = (name: string) => name.match(/\(?\d{1,2}\/\d{1,2}(?:\s*~\s*(?:(?:\d{1,2}\/)?\d{1,2}))?\)?(?:\s*\([^)]*\))?/)?.[0] || '기간 미표기';

const recommendedBundleKey = (name: string) => {
  const cleaned = name
    .replace(/^\([^)]*\)\s*/, '')
    .replace(/^(?:회원\/시즌권|회원|일반)\s*/, '')
    .replace(/\b(?:PKG|패키지|룸온리|대인권|소인권|대인|소인)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.split(' ').slice(0, 2).join(' ').trim();
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
  const [selectedProductDetail, setSelectedProductDetail] = useState<{ name: string; variants: ProductVariant[]; revenue: number } | null>(null);
  const [productCategories, setProductCategories] = useState<Record<string, ProductCategory>>({});
  const [savedCategoryFamilies, setSavedCategoryFamilies] = useState<Record<string, true>>({});
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  const [savingBundleKey, setSavingBundleKey] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showRemainingProductList, setShowRemainingProductList] = useState(false);
  const [bundleCategories, setBundleCategories] = useState<Record<string, ProductCategory>>({});
  const [selectedClassificationDetail, setSelectedClassificationDetail] = useState<ClassificationDetail | null>(null);

  const categoryForFamily = (family: string) => {
    const seed = data.find((order) => productFamilyName(order.normalizedPackageName) === family);
    const savedCategory = productCategories[family];
    const suggested = seed ? suggestedCategory(seed) : { major: '객실미포함', middle: '겨울', sub: '기타', minor: family };
    return normalizeProductCategory(savedCategory, suggested);
  };


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
          // 기존 저장 이력도 최신 상품명 통합 규칙으로 다시 묶어 표시한다.
          normalizedPackageName: normalizePackageName(d.raw_package_name || d.normalized_package_name || ''),
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

  useEffect(() => {
    const loadCategories = async () => {
      const { data: config } = await supabase
        .from('daily_reports')
        .select('data')
        .eq('report_date', CATEGORY_CONFIG_DATE)
        .eq('report_type', 'PACKAGE_PRODUCT_CATEGORIES')
        .maybeSingle();
      if (config?.data && typeof config.data === 'object') {
        const categories = config.data as Record<string, ProductCategory>;
        setProductCategories(categories);
        setSavedCategoryFamilies(Object.fromEntries(Object.keys(categories).map((family) => [family, true])));
      }
    };
    void loadCategories();
  }, []);

  const saveProductCategories = async () => {
    setIsSavingCategories(true);
    try {
      // 저장을 누르는 순간 현재 수집된 상품 전체를 확정한다. 다음 화면에서는 신규 상품만 남긴다.
      const completedCategories = Object.fromEntries(uniqueProductFamilies.map((family) => [family, categoryForFamily(family)]));
      const { error } = await supabase.from('daily_reports').upsert({
        report_date: CATEGORY_CONFIG_DATE,
        report_type: 'PACKAGE_PRODUCT_CATEGORIES',
        data: completedCategories,
      }, { onConflict: 'report_date,report_type' });
      if (error) throw error;
      setProductCategories(completedCategories);
      setSavedCategoryFamilies(Object.fromEntries(Object.keys(completedCategories).map((family) => [family, true])));
      setShowAllCategories(false);
      setSyncMessage('상품 분류 기준을 저장했습니다. 이후 모든 매출 분석에 바로 반영됩니다.');
      setIsCategoryManagerOpen(false);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : '상품 분류 기준을 저장하지 못했습니다.');
    } finally {
      setIsSavingCategories(false);
    }
  };

  const saveBundleCategories = async (key: string, families: string[]) => {
    setSavingBundleKey(key);
    try {
      const categoriesToSave: Record<string, ProductCategory> = {
        ...productCategories,
        ...Object.fromEntries(families.map((family) => [family, categoryForFamily(family)])),
      };
      const { error } = await supabase.from('daily_reports').upsert({
        report_date: CATEGORY_CONFIG_DATE,
        report_type: 'PACKAGE_PRODUCT_CATEGORIES',
        data: categoriesToSave,
      }, { onConflict: 'report_date,report_type' });
      if (error) throw error;
      setProductCategories(categoriesToSave);
      setSavedCategoryFamilies((previous) => ({ ...previous, ...Object.fromEntries(families.map((family) => [family, true])) }));
      setSyncMessage(`“${key}” 묶음 ${families.length}개 상품의 분류 기준을 저장했습니다.`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : '묶음 분류 기준을 저장하지 못했습니다.');
    } finally {
      setSavingBundleKey(null);
    }
  };

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
      // 매출은 실제 결제 주문일을 기준으로 집계한다.
      const cleanDate = extractCleanDate('', r.orderDate);

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
          const cleanDate = extractCleanDate('', d.orderDate);
          
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
  const uniqueProductFamilies = Array.from(new Set(data.map(d => productFamilyName(d.normalizedPackageName)))).sort();
  const commonComponents = ['객실', '워터파크', '관광곤돌라', '사계절썰매', '플라잉라인', '루지', '고카트', '조식'];
  const availableComponents = commonComponents.filter(c => data.some(d => d.components.includes(c)));
  const categoryForOrder = (order: PackageOrder) => {
    // 집계 중에는 전체 주문을 다시 탐색하지 않는다. (기존 O(n²) 병목 제거)
    return normalizeProductCategory(productCategories[productFamilyName(order.normalizedPackageName)], suggestedCategory(order));
  };
  const categoryLabel = (category: ProductCategory) => [category.major, category.middle, category.sub, category.minor].filter(Boolean).join(' · ');
  const categoryOrderGroups = data.reduce((acc, order) => {
    const label = categoryLabel(categoryForOrder(order));
    if (!acc[label]) acc[label] = [];
    acc[label].push(order);
    return acc;
  }, {} as Record<string, PackageOrder[]>);

  const keywordSummaries = Object.values(data.reduce((acc, order) => {
    const keyword = categoryLabel(categoryForOrder(order));
    const saleDate = extractCleanDate('', order.orderDate);
    if (!acc[keyword]) acc[keyword] = { keyword, productNames: new Set<string>(), orders: 0, revenue: 0, firstSaleDate: '', lastSaleDate: '' };
    const summary = acc[keyword];
    summary.productNames.add(order.normalizedPackageName);
    summary.orders += 1;
    summary.revenue += order.paymentAmount;
    if (saleDate) {
      summary.firstSaleDate = earlierDate(summary.firstSaleDate, saleDate);
      summary.lastSaleDate = laterDate(summary.lastSaleDate, saleDate);
    }
    return acc;
  }, {} as Record<string, KeywordSummary>)).sort((a, b) => b.revenue - a.revenue);

  const seasonSummaries = Object.values(data.reduce((acc, order) => {
    const usageDate = extractCleanDate('', order.orderDate);
    const saleDate = extractCleanDate('', order.orderDate);
    const season = seasonForDate(usageDate);
    if (!season) return acc;
    if (!acc[season.id]) {
      acc[season.id] = { id: season.id, label: season.label, usageStartDate: '', usageEndDate: '', firstSaleDate: '', lastSaleDate: '', orders: 0, revenue: 0, keywords: {} };
    }
    const summary = acc[season.id];
    summary.usageStartDate = earlierDate(summary.usageStartDate, usageDate);
    summary.usageEndDate = laterDate(summary.usageEndDate, usageDate);
    if (saleDate) {
      summary.firstSaleDate = earlierDate(summary.firstSaleDate, saleDate);
      summary.lastSaleDate = laterDate(summary.lastSaleDate, saleDate);
    }
    summary.orders += 1;
    summary.revenue += order.paymentAmount;
    const keyword = categoryLabel(categoryForOrder(order));
    summary.keywords[keyword] = (summary.keywords[keyword] || 0) + order.paymentAmount;
    return acc;
  }, {} as Record<string, SeasonSummary>)).sort((a, b) => b.id.localeCompare(a.id));

  const topKeyword = (summary: SeasonSummary) => Object.entries(summary.keywords).sort(([, a], [, b]) => b - a)[0]?.[0] || '-';

  const openProductDetail = (group: ProductGroup) => {
    setSelectedProductDetail({
      name: group.name,
      revenue: group.revenue,
      variants: Object.values(group.variants).sort((a, b) => b.revenue - a.revenue),
    });
  };

  const renderProductVariantDetail = () => {
    if (!selectedProductDetail) return null;
    return (
      <div className="pkg-table-container" style={{ background: 'rgba(192, 132, 252, 0.08)', borderRadius: '12px', border: '1px solid rgba(192, 132, 252, 0.28)', overflow: 'hidden', marginBottom: '24px' }}>
        <h3 style={{ padding: '16px 20px', margin: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🔎 {selectedProductDetail.name} · 인원 구성 상세</span>
          <button onClick={() => setSelectedProductDetail(null)} style={{ background: 'transparent', border: 'none', color: '#c4b5fd', cursor: 'pointer', fontWeight: 700 }}>닫기</button>
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="pkg-data-table" style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
            <thead><tr style={{ background: 'rgba(15, 23, 42, 0.72)', textAlign: 'left' }}><th style={{ padding: '12px 16px' }}>인원 구성</th><th style={{ padding: '12px 16px', textAlign: 'right' }}>주문건수</th><th style={{ padding: '12px 16px', textAlign: 'right' }}>결제매출</th><th style={{ padding: '12px 16px', textAlign: 'right' }}>상품 내 비중</th></tr></thead>
            <tbody>{selectedProductDetail.variants.map((variant) => (
              <tr key={variant.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '12px 16px', color: '#f8fafc', fontWeight: 700 }}>{variant.name}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>{variant.count.toLocaleString()}건</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: '#d8b4fe', fontWeight: 800 }}>{variant.revenue.toLocaleString()}원</td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>{selectedProductDetail.revenue ? (variant.revenue / selectedProductDetail.revenue * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderCategoryManager = () => {
    if (!isCategoryManagerOpen) return null;
    const unclassifiedProductFamilies = uniqueProductFamilies.filter((family) => !savedCategoryFamilies[family]);
    const displayedProductFamilies = showAllCategories ? uniqueProductFamilies : unclassifiedProductFamilies;
    const recommendedBundles = Object.entries(displayedProductFamilies.reduce((acc, family) => {
      const key = recommendedBundleKey(family);
      if (key.length < 2) return acc;
      if (!acc[key]) acc[key] = [];
      acc[key].push(family);
      return acc;
    }, {} as Record<string, string[]>))
      .filter(([, families]) => families.length >= 2)
      .sort(([, a], [, b]) => b.length - a.length || a[0].localeCompare(b[0]))
      .slice(0, 30);
    const bundledFamilies = new Set(recommendedBundles.flatMap(([, families]) => families));
    const remainingProductFamilies = displayedProductFamilies.filter((family) => !bundledFamilies.has(family));
    return (
      <section className="pkg-category-manager">
        <div className="pkg-category-manager-header">
          <div>
            <h2>상품 분류 관리</h2>
            <p>대분류는 객실 포함 여부, 중분류는 계절, 소분류는 상품 유형, 마지막 상품명은 대표 노출명으로 확정하세요.</p>
          </div>
          <div className="pkg-category-manager-actions">
            <button onClick={() => setShowAllCategories((show) => !show)} className="pkg-category-cancel-btn">{showAllCategories ? '신규 미분류만 보기' : `전체 분류 기준 보기 (${uniqueProductFamilies.length})`}</button>
            <button onClick={() => setIsCategoryManagerOpen(false)} className="pkg-category-cancel-btn">닫기</button>
            <button onClick={() => void saveProductCategories()} className="pkg-category-save-btn" disabled={isSavingCategories}>{isSavingCategories ? '저장 중…' : '분류 저장'}</button>
          </div>
        </div>
        <div className="pkg-category-status">{showAllCategories ? `전체 ${uniqueProductFamilies.length}개 대표 상품의 분류 기준을 편집 중입니다.` : `새로 들어온 미분류 상품 ${unclassifiedProductFamilies.length}개만 표시합니다. 저장된 상품은 분석에 그대로 반영되며, 필요할 때 전체 분류 기준에서 수정할 수 있습니다.`}</div>
        {recommendedBundles.length > 0 && (
          <div className="pkg-recommended-bundles">
            <div className="pkg-recommended-bundles-title"><strong>추천 묶음별 분류</strong><span>묶음을 펼쳐 대분류·계절·상품 유형은 일괄 적용하고, 상품명은 상품별로 조정하세요.</span></div>
            <div className="pkg-recommended-bundle-grid">{recommendedBundles.map(([key, families]) => {
              const representative = categoryForFamily(families[0]);
              const bundleCategory = bundleCategories[key] || { major: representative.major, middle: representative.middle, sub: representative.sub, minor: '' };
              const updateBundle = (patch: Partial<ProductCategory>) => setBundleCategories((previous) => ({ ...previous, [key]: { ...bundleCategory, ...patch } }));
              const applyBundleCategory = () => {
                setProductCategories((previous) => ({
                  ...previous,
                  ...Object.fromEntries(families.map((family) => {
                    const current = previous[family] || categoryForFamily(family);
                    return [family, { ...current, major: bundleCategory.major, middle: bundleCategory.middle, sub: bundleCategory.sub, minor: bundleCategory.minor.trim() || current.minor }];
                  })),
                }));
                setSyncMessage(`“${key}” 추천 묶음 ${families.length}개에 대분류·계절·상품 유형을 적용했습니다. 상품명은 각 상품 행에서 개별 수정할 수 있습니다.`);
              };
              return (
                <details key={key} className="pkg-recommended-bundle-card">
                  <summary><span><strong>{key}</strong><small>{families.length}개 대표 상품</small></span><span className="pkg-accordion-hint">펼쳐서 설정</span></summary>
                  <div className="pkg-bundle-controls">
                    <label>대분류<select value={bundleCategory.major} onChange={(event) => updateBundle({ major: event.target.value })}>{CATEGORY_MAJOR_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                    <label>중분류(계절)<select value={bundleCategory.middle} onChange={(event) => updateBundle({ middle: event.target.value })}>{CATEGORY_SEASON_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                    <label>소분류(상품 유형)<select value={bundleCategory.sub} onChange={(event) => updateBundle({ sub: event.target.value })}>{CATEGORY_MIDDLE_SUGGESTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                    <label>상품명 일괄 변경 <em>(선택)</em><input value={bundleCategory.minor} placeholder="비우면 상품별 이름 유지" onChange={(event) => updateBundle({ minor: event.target.value })} /></label>
                    <button onClick={applyBundleCategory} className="pkg-batch-apply-btn">{families.length}개 일괄 적용</button>
                    <button onClick={() => void saveBundleCategories(key, families)} className="pkg-bundle-save-btn" disabled={savingBundleKey === key}>{savingBundleKey === key ? '저장 중…' : '이 묶음 저장 완료'}</button>
                  </div>
                  <div className="pkg-bundle-product-list">{families.map((family) => {
                    const category = categoryForFamily(family);
                    const update = (patch: Partial<ProductCategory>) => setProductCategories((previous) => ({ ...previous, [family]: { ...category, ...patch } }));
                    return <div key={family} className="pkg-bundle-product-row">
                      <strong>{family}</strong>
                      <select value={category.major} aria-label={`${family} 대분류`} onChange={(event) => update({ major: event.target.value })}>{CATEGORY_MAJOR_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                      <select value={category.middle} aria-label={`${family} 중분류(계절)`} onChange={(event) => update({ middle: event.target.value })}>{CATEGORY_SEASON_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                      <select value={category.sub} aria-label={`${family} 소분류(상품 유형)`} onChange={(event) => update({ sub: event.target.value })}>{!CATEGORY_MIDDLE_SUGGESTIONS.includes(category.sub) && <option value={category.sub}>{category.sub}</option>}{CATEGORY_MIDDLE_SUGGESTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                      <input value={category.minor} aria-label={`${family} 상품명`} onChange={(event) => update({ minor: event.target.value })} />
                    </div>;
                  })}</div>
                </details>
              );
            })}</div>
          </div>
        )}
        {!showAllCategories && remainingProductFamilies.length > 0 && <button onClick={() => setShowRemainingProductList((show) => !show)} className="pkg-show-remaining-btn">{showRemainingProductList ? '나머지 개별 상품 목록 닫기' : `추천 묶음에 없는 상품 ${remainingProductFamilies.length}개 직접 분류하기`}</button>}
        {(showAllCategories || showRemainingProductList) && <div className="pkg-category-table-wrap">
          <table className="pkg-category-table">
            <thead><tr><th>대표 상품명</th><th>대분류(객실 포함)</th><th>중분류(계절)</th><th>소분류(상품 유형)</th><th>상품명(노출명)</th></tr></thead>
            <tbody>{(showAllCategories ? uniqueProductFamilies : remainingProductFamilies).map((family) => {
              const category = categoryForFamily(family);
              const update = (patch: Partial<ProductCategory>) => setProductCategories((previous) => ({ ...previous, [family]: { ...category, ...patch } }));
              return (
                <tr key={family}>
                  <td><strong>{family}</strong></td>
                  <td><select value={category.major} onChange={(event) => update({ major: event.target.value })}>{CATEGORY_MAJOR_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></td>
                  <td><select aria-label={`${family} 중분류(계절)`} value={category.middle} onChange={(event) => update({ middle: event.target.value })}>{CATEGORY_SEASON_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></td>
                  <td><select aria-label={`${family} 소분류(상품 유형)`} value={category.sub} onChange={(event) => update({ sub: event.target.value })}>{!CATEGORY_MIDDLE_SUGGESTIONS.includes(category.sub) && <option value={category.sub}>{category.sub}</option>}{CATEGORY_MIDDLE_SUGGESTIONS.map((item) => <option key={item} value={item}>{item}</option>)}</select></td>
                  <td><input value={category.minor} placeholder="대표 상품명" onChange={(event) => update({ minor: event.target.value })} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>}
      </section>
    );
  };

  const renderClassificationDetail = () => {
    if (!selectedClassificationDetail) return null;
    const summarize = (labelFor: (order: PackageOrder) => string) => Object.values(selectedClassificationDetail.orders.reduce((acc, order) => {
      const label = labelFor(order);
      if (!acc[label]) acc[label] = { label, count: 0, revenue: 0 };
      acc[label].count += 1;
      acc[label].revenue += order.paymentAmount;
      return acc;
    }, {} as Record<string, { label: string; count: number; revenue: number }>)).sort((a, b) => b.revenue - a.revenue);
    const minorRows = summarize((order) => categoryForOrder(order).minor || productFamilyName(order.normalizedPackageName));
    const subRows = summarize((order) => categoryForOrder(order).sub || '기타');
    const peopleRows = summarize((order) => extractPeopleLabel(order.rawPackageName || order.normalizedPackageName));
    const scheduleRows = summarize((order) => extractScheduleLabel(order.rawPackageName || order.normalizedPackageName));
    const totalRevenue = selectedClassificationDetail.orders.reduce((sum, order) => sum + order.paymentAmount, 0);
    const renderBreakdown = (title: string, rows: Array<{ label: string; count: number; revenue: number }>) => (
      <div className="pkg-analysis-panel">
        <h3>{title}</h3>
        <div className="pkg-analysis-table-wrap"><table className="pkg-analysis-table"><thead><tr><th>구분</th><th>주문</th><th>매출</th><th>비중</th></tr></thead><tbody>{rows.map((row) => (
          <tr key={row.label}><td><strong>{row.label}</strong></td><td>{row.count.toLocaleString()}건</td><td>{formatCurrency(row.revenue)}</td><td>{totalRevenue ? (row.revenue / totalRevenue * 100).toFixed(1) : '0.0'}%</td></tr>
        ))}</tbody></table></div>
      </div>
    );
    return (
      <section className="pkg-classification-detail">
        <div className="pkg-analysis-heading"><div><h2>분류 상세 분석 · {selectedClassificationDetail.label}</h2><p>통합 과정에서 숨긴 인원·상품명 기간 표기를 원본 주문 데이터에서 다시 분석합니다.</p></div><button onClick={() => setSelectedClassificationDetail(null)} className="pkg-category-cancel-btn">닫기</button></div>
        <div className="pkg-classification-detail-summary">총 {selectedClassificationDetail.orders.length.toLocaleString()}건 · {formatCurrency(totalRevenue)}</div>
        <div className="pkg-analysis-grid pkg-analysis-grid-three">
          {renderBreakdown('소분류(상품 유형)', subRows)}
          {renderBreakdown('상품명(대표 노출명)', minorRows)}
          {renderBreakdown('인원 구성', peopleRows)}
          {renderBreakdown('상품명에 포함된 기간', scheduleRows)}
        </div>
      </section>
    );
  };

  const renderSalesHistoryAnalysis = () => (
    <section className="pkg-history-analysis">
      <div className="pkg-analysis-heading">
        <div>
          <h2>상품 분류·시즌 판매 분석</h2>
          <p>저장한 대분류·계절·상품 유형·상품명과 실제 결제가 발생한 주문일을 기준으로 집계합니다.</p>
        </div>
        <span className="pkg-analysis-badge">저장된 이력 기준</span>
      </div>
      <div className="pkg-analysis-grid">
        <div className="pkg-analysis-panel">
          <h3>상품 분류별 판매 현황</h3>
          <div className="pkg-analysis-table-wrap">
            <table className="pkg-analysis-table">
              <thead><tr><th>분류</th><th>상품 수</th><th>판매건</th><th>매출</th><th>첫 판매일</th><th>최근 판매일</th><th>분석</th></tr></thead>
              <tbody>{keywordSummaries.map((summary) => (
                <tr key={summary.keyword}>
                  <td><strong>{summary.keyword}</strong></td>
                  <td>{summary.productNames.size}종</td>
                  <td>{summary.orders.toLocaleString()}건</td>
                  <td>{formatCurrency(summary.revenue)}</td>
                  <td>{summary.firstSaleDate || '-'}</td>
                  <td>{summary.lastSaleDate || '-'}</td>
                  <td><button onClick={() => setSelectedClassificationDetail({ label: summary.keyword, orders: categoryOrderGroups[summary.keyword] || [] })} className="pkg-product-detail-btn">상세</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="pkg-analysis-panel">
          <h3>시즌별 판매 이력</h3>
          <div className="pkg-analysis-table-wrap">
            <table className="pkg-analysis-table">
              <thead><tr><th>시즌</th><th>판매기간</th><th>판매 시작일</th><th>매출 / 판매건</th><th>주력 분류</th></tr></thead>
              <tbody>{seasonSummaries.map((summary) => (
                <tr key={summary.id}>
                  <td><strong>{summary.label}</strong></td>
                  <td>{summary.usageStartDate || '-'} ~ {summary.usageEndDate || '-'}</td>
                  <td>{summary.firstSaleDate || '-'}</td>
                  <td><strong>{formatCurrency(summary.revenue)}</strong><br /><span>{summary.orders.toLocaleString()}건</span></td>
                  <td>{topKeyword(summary)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );

  const renderDetailView = () => {
    if (!selectedDate) return null;
    
    // Filter data for the specific day
    const dayData = filteredData.filter(d => {
      return extractCleanDate('', d.orderDate) === selectedDate;
    });

    const dayRevenue = dayData.reduce((sum, d) => sum + d.paymentAmount, 0);
    const dayOrders = dayData.length;

    // Group by package
    const packageSales = dayData.reduce((acc, d) => {
      const key = productFamilyName(d.normalizedPackageName);
      if (!acc[key]) acc[key] = { name: key, count: 0, revenue: 0, variants: {} };
      acc[key].count += 1;
      acc[key].revenue += d.paymentAmount;
      const variantName = d.normalizedPackageName;
      if (!acc[key].variants[variantName]) acc[key].variants[variantName] = { name: variantName, count: 0, revenue: 0 };
      acc[key].variants[variantName].count += 1;
      acc[key].variants[variantName].revenue += d.paymentAmount;
      return acc;
    }, {} as Record<string, ProductGroup>);
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
        
        <div className="pkg-table-container" style={{ background: 'rgba(96, 165, 250, 0.06)', borderRadius: '12px', border: '1px solid rgba(96, 165, 250, 0.2)', overflow: 'hidden', marginBottom: '32px' }}>
          <h3 style={{ padding: '20px', margin: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc' }}>📦 상품명 기준 주문 현황 ({dayPackageChartData.length}종)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="pkg-data-table" style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.72)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px' }}>상품명</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>주문건수</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>결제매출</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>건당 평균</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>구성</th>
                </tr>
              </thead>
              <tbody>
                {dayPackageChartData.map((item) => (
                  <tr key={item.name} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '13px 16px', color: '#f8fafc', fontWeight: 700 }}>{item.name}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>{item.count.toLocaleString()}건</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', color: '#6ee7b7', fontWeight: 800 }}>{item.revenue.toLocaleString()}원</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>{Math.round(item.revenue / item.count).toLocaleString()}원</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}><button onClick={() => openProductDetail(item)} className="pkg-product-detail-btn">상세</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {renderProductVariantDetail()}

        <div className="pkg-table-container" style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
          <h3 style={{ padding: '20px', margin: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc' }}>📋 개별 주문 목록</h3>
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
                    <td style={{ padding: '12px 16px', color: '#f8fafc' }} title={order.rawPackageName}>{order.normalizedPackageName}</td>
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
      return extractCleanDate('', d.orderDate).startsWith(targetPrefix);
    });
    
    // sorting by orderDate descending
    monthData.sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
    const monthlyRevenue = monthData.reduce((total, order) => total + order.paymentAmount, 0);
    const monthlyProductSales = Object.values(monthData.reduce((acc, order) => {
      const key = productFamilyName(order.normalizedPackageName);
      if (!acc[key]) acc[key] = { name: key, count: 0, revenue: 0, variants: {} };
      acc[key].count += 1;
      acc[key].revenue += order.paymentAmount;
      const variantName = order.normalizedPackageName;
      if (!acc[key].variants[variantName]) acc[key].variants[variantName] = { name: variantName, count: 0, revenue: 0 };
      acc[key].variants[variantName].count += 1;
      acc[key].variants[variantName].revenue += order.paymentAmount;
      return acc;
    }, {} as Record<string, ProductGroup>)).sort((a, b) => b.revenue - a.revenue);

    return (
      <div className="pkg-detail-view animate-fade-in">
        <div className="pkg-detail-header" style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
          <button onClick={() => setShowMonthlyList(false)} className="pkg-back-btn" style={{ display: 'flex', alignItems: 'center', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', marginRight: '16px' }}>
            <CalendarIcon size={20} style={{ marginRight: '8px' }}/> 달력으로 돌아가기
          </button>
          <h2 style={{ margin: 0, color: '#f8fafc' }}>{format(currentMonth, 'yyyy년 MM월')} 월간 전체 주문내역</h2>
        </div>

        <div className="pkg-table-container" style={{ background: 'rgba(96, 165, 250, 0.06)', borderRadius: '12px', border: '1px solid rgba(96, 165, 250, 0.2)', overflow: 'hidden', marginBottom: '32px' }}>
          <h3 style={{ padding: '20px', margin: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📊 상품별 월간 매출 비중 ({monthlyProductSales.length}종)</span>
            <span style={{ color: '#6ee7b7', fontSize: '0.95rem' }}>총 {monthlyRevenue.toLocaleString()}원</span>
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="pkg-data-table" style={{ width: '100%', borderCollapse: 'collapse', color: '#cbd5e1' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.72)', textAlign: 'left' }}>
                  <th style={{ padding: '12px 16px' }}>상품명</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>주문건수</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>결제매출</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>매출 비중</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>구성</th>
                </tr>
              </thead>
              <tbody>
                {monthlyProductSales.map((item) => (
                  <tr key={item.name} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <td style={{ padding: '13px 16px', color: '#f8fafc', fontWeight: 700 }}>{item.name}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>{item.count.toLocaleString()}건</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', color: '#6ee7b7', fontWeight: 800 }}>{item.revenue.toLocaleString()}원</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>{monthlyRevenue ? (item.revenue / monthlyRevenue * 100).toFixed(1) : '0.0'}%</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}><button onClick={() => openProductDetail(item)} className="pkg-product-detail-btn">상세</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {renderProductVariantDetail()}

        <div className="pkg-table-container" style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.05)', overflow: 'hidden' }}>
          <h3 style={{ padding: '20px', margin: 0, borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📋 개별 주문 목록 ({monthData.length.toLocaleString()}건)</span>
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
                    <td style={{ padding: '12px 16px', color: '#f8fafc' }} title={order.rawPackageName}>{order.normalizedPackageName}</td>
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
         <button onClick={() => setIsCategoryManagerOpen((open) => !open)} className="pkg-category-open-btn">
           🗂️ 상품 분류 관리
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
              {renderCategoryManager()}
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

              {renderSalesHistoryAnalysis()}
              {renderClassificationDetail()}

              <div className="cumulative-dashboard" style={{ marginBottom: '40px' }}>
                <h3 style={{fontSize:'1.3rem', color:'#f8fafc', marginBottom:'16px'}}>🏆 연간 전체 누적 실적 비교 (결제 주문일 기준, {format(currentMonth, 'yyyy')}년)</h3>
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

                <h3 style={{fontSize:'1.3rem', color:'#f8fafc', marginBottom:'16px'}}>📊 월간 영업 누적 실적 비교 (결제 주문일 기준, {format(currentMonth, 'MM')}월)</h3>
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
