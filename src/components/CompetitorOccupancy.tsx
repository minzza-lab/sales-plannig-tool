import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, FileUp, RotateCcw, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { parseCompetitorOccupancyPdf, type ParsedOccupancyRow } from '../lib/competitorOccupancyPdf';
import { parseCompetitorPerformancePdf, parseCompetitorWorkbook, type CompetitorSourceMetrics } from '../lib/competitorOccupancySources';
import { supabase } from '../lib/supabase';
import './CompetitorOccupancy.css';

type OccupancyRow = ParsedOccupancyRow;

const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월'];
const sourceDate = '2026년 8월 PDF 기준';
const rows: OccupancyRow[] = [
  { region: '강원도 서부 지역', company: '소노캄 비발디파크', rooms: 1762, rates: [77.0, 79.2, 20.8, 25.4, 39.9, 37.5, 59.8, 70.9] }, { region: '강원도 서부 지역', company: '소노펠리체 비발디', rooms: 500, rates: [52.9, 58.9, 12.0, 19.6, 30.2, 27.8, 42.8, 49.4] }, { region: '강원도 서부 지역', company: '소노펠리체 빌리지 비발디', rooms: 219, rates: [42.0, 43.3, 15.3, 24.0, 36.5, 34.3, 46.6, 57.4] }, { region: '강원도 서부 지역', company: '용평', rooms: 1298, rates: [85.3, 81.8, 26.8, 20.6, 33.6, 24.6, 48.1, 58.5] }, { region: '강원도 서부 지역', company: '휘닉스파크', rooms: 962, rates: [75.1, 65.3, 10.5, 27.2, 33.2, 48.4, 61.4, 73.7] }, { region: '강원도 서부 지역', company: '오크밸리', rooms: 1105, rates: [51.4, 56.2, 24.4, 39.8, 50.4, 48.3, 58.1, 74.1] }, { region: '강원도 서부 지역', company: '웰리힐리', rooms: 766, rates: [64.3, 60.0, 9.6, 16.2, 30.6, 24.6, 53.9, 73.1] },
  { region: '강원도 동부 지역', company: '소노벨 양평', rooms: 193, rates: [52.9, 56.3, 38.6, 49.4, 61.7, 48.6, 50.3, 54.9] }, { region: '강원도 동부 지역', company: '델피노', rooms: 1257, rates: [59.0, 62.3, 25.9, 42.5, 52.4, 51.8, 73.6, 84.4] }, { region: '강원도 동부 지역', company: '쏠비치 양양', rooms: 497, rates: [55.6, 61.2, 33.9, 50.7, 59.2, 70.4, 91.2, 96.3] }, { region: '강원도 동부 지역', company: '쏠비치 삼척', rooms: 707, rates: [61.6, 69.6, 38.1, 63.6, 67.6, 85.2, 97.3, 98.4] }, { region: '강원도 동부 지역', company: '롯데리조트 속초', rooms: 392, rates: [64.6, 71.5, 47.9, 65.2, 75.0, 88.5, 89.0, 87.4] }, { region: '강원도 동부 지역', company: '카시아리조트', rooms: 674, rates: [38.0, 42.0, 30.0, 36.0, 45.0, 46.0, 58.0, 67.0] }, { region: '강원도 동부 지역', company: '한화리조트 속초', rooms: 1554, rates: [29.9, 29.3, 11.5, 43.9, 30.3, 23.3, 70.2, 59.6] }, { region: '강원도 동부 지역', company: '한화브리드 양양', rooms: 56, rates: [72.5, 71.3, 56.0, 61.8, 66.5, 72.9, 82.5, 89.1] }, { region: '강원도 동부 지역', company: '윈덤 호텔 고성', rooms: 529, rates: [15.0, 19.0, 9.0, 20.0, 31.7, 40.5, 54.7, 81.0] }, { region: '강원도 동부 지역', company: '르네블루 by 쏠비치 고성', rooms: 87, rates: [80.4, 82.6, 57.5, 66.3, 77.0, 90.8, 91.3, 95.3] }, { region: '강원도 동부 지역', company: '켄싱턴리조트 속초', rooms: 176, rates: [73.5, 70.8, 41.9, 64.6, 71.5, 87.6, 92.1, 92.1] },
  { region: '경상도 지역', company: '소노캄 경주', rooms: 417, rates: [74.5, 80.5, 56.0, 91.8, 74.1, 78.2, 89.1, 97.7] }, { region: '경상도 지역', company: '라한셀렉트', rooms: 430, rates: [78.6, 74.9, 63.8, 94.3, 89.0, 87.6, 91.9, 94.1] }, { region: '경상도 지역', company: '켄싱턴', rooms: 501, rates: [47.1, 54.4, 34.3, 72.8, 64.9, 50.0, 59.2, 59.2] }, { region: '경상도 지역', company: '한화리조트 경주', rooms: 393, rates: [61.1, 61.1, 56.8, 84.2, 79.6, 67.4, 75.6, 78.9] }, { region: '경상도 지역', company: '소노벨 단양', rooms: 843, rates: [57.4, 60.9, 31.1, 41.8, 48.3, 47.6, 66.1, 68.0] },
  { region: '충청/전북 지역', company: '포레스트 리솜', rooms: 450, rates: [81.0, 83.5, 55.0, 73.9, 83.7, 81.8, 90.8, 92.5] }, { region: '충청/전북 지역', company: '소노벨 청송', rooms: 320, rates: [68.8, 70.3, 35.6, 43.3, 46.6, 38.6, 44.7, 57.3] }, { region: '충청/전북 지역', company: '소노벨 천안', rooms: 450, rates: [75.5, 77.5, 36.9, 50.5, 64.4, 54.4, 77.5, 68.0] }, { region: '충청/전북 지역', company: '덕산스플라스 리솜', rooms: 405, rates: [90.1, 88.2, 42.1, 62.1, 64.4, 68.6, 88.4, 88.4] }, { region: '충청/전북 지역', company: '안면도 아일랜드 리솜', rooms: 248, rates: [60.5, 68.1, 49.4, 78.4, 86.8, 85.0, 92.8, 91.4] }, { region: '충청/전북 지역', company: '소노벨 변산', rooms: 503, rates: [46.4, 62.0, 31.5, 50.6, 60.0, 64.5, 75.0, 89.9] },
  { region: '전라/경상도 지역', company: '소노캄 여수', rooms: 310, rates: [40.9, 49.1, 42.0, 64.7, 59.0, 51.6, 47.3, 60.9] }, { region: '전라/경상도 지역', company: '쏠비치 진도', rooms: 561, rates: [52.0, 66.7, 29.4, 58.1, 59.5, 59.3, 70.6, 85.7] }, { region: '전라/경상도 지역', company: '벨메르 한화', rooms: 100, rates: [43.5, 49.3, 43.6, 62.5, 70.9, 54.2, 68.5, 80.7] }, { region: '전라/경상도 지역', company: '신라스테이 여수', rooms: 315, rates: [81.0, 84.2, 72.4, 82.5, 80.8, 77.7, 84.0, 89.1] }, { region: '전라/경상도 지역', company: '유탑마리나', rooms: 298, rates: [64.6, 68.7, 55.4, 69.2, 62.7, 62.6, 78.3, 88.7] }, { region: '전라/경상도 지역', company: '금호리조트 통영', rooms: 272, rates: [67.6, 82.4, 65.0, 79.1, 72.6, 67.7, 76.4, 82.9] }, { region: '전라/경상도 지역', company: '쏠비치 남해', rooms: 449, rates: [54.1, 61.0, 40.8, 61.3, 65.3, 71.7, 81.5, 91.6] }, { region: '전라/경상도 지역', company: '소노캄 거제', rooms: 509, rates: [52.0, 60.5, 35.5, 49.0, 57.3, 58.3, 76.2, 85.2] }, { region: '전라/경상도 지역', company: '한화리조트 벨버디어', rooms: 470, rates: [45.9, 54.5, 30.7, 38.8, 53.6, 62.8, 79.4, 85.3] },
  { region: '부산지역', company: '소노문 해운대', rooms: 235, rates: [68.3, 67.8, 60.0, 77.8, 83.4, 80.6, 75.3, 91.3] }, { region: '부산지역', company: '한화리조트 해운대', rooms: 417, rates: [62.3, 63.7, 38.1, 57.9, 83.1, 83.7, 89.1, 86.1] }, { region: '부산지역', company: '롯데 L7호텔 해운대', rooms: 383, rates: [65.3, 77.2, 72.6, 83.1, 84.0, 86.0, 87.6, 85.0] }, { region: '부산지역', company: '베스트웨스턴', rooms: 134, rates: [62.3, 64.6, 58.5, 72.0, 82.2, 79.8, 73.2, 90.7] }, { region: '부산지역', company: '라마다 해운대', rooms: 402, rates: [65.3, 66.3, 62.1, 74.2, 82.6, 80.2, 71.3, 90.5] }, { region: '부산지역', company: '롯데리조트 김해', rooms: 250, rates: [58.4, 54.9, 37.3, 48.5, 64.0, 64.5, 72.0, 78.1] },
  { region: '제주도 지역', company: '소노벨 제주', rooms: 397, rates: [56.7, 55.3, 55.0, 77.0, 74.5, 82.4, 78.4, 82.6] }, { region: '제주도 지역', company: '소노캄 제주', rooms: 368, rates: [44.9, 40.6, 42.0, 64.7, 57.6, 56.9, 44.1, 55.3] }, { region: '제주도 지역', company: '한화리조트 제주', rooms: 395, rates: [48.8, 39.7, 39.2, 59.9, 61.6, 46.1, 47.2, 55.4] }, { region: '제주도 지역', company: '롯데 아트빌라스 제주', rooms: 66, rates: [55.4, 60.8, 49.2, 71.2, 75.0, 72.9, 70.6, 78.9] }, { region: '제주도 지역', company: '휘닉스아일랜드', rooms: 300, rates: [55.5, 57.8, 43.1, 68.3, 72.7, 60.7, 69.0, 82.7] }, { region: '제주도 지역', company: '켄싱턴', rooms: 214, rates: [76.6, 64.4, 55.3, 72.2, 67.9, 65.1, 79.6, 79.6] }, { region: '제주도 지역', company: '금호리조트 제주', rooms: 324, rates: [72.7, 56.7, 46.7, 72.9, 70.7, 60.9, 71.6, 83.4] }, { region: '제주도 지역', company: '해비치리조트 제주', rooms: 503, rates: [71.2, 70.5, 66.5, 79.0, 81.0, 74.0, 85.0, 87.5] },
  { region: '서울/경기', company: '소노캄 고양', rooms: 824, rates: [38.6, 44.7, 49.9, 66.1, 52.9, 49.3, 69.7, 54.8] }, { region: '서울/경기', company: '안토(구. 파라스파라)', rooms: 334, rates: [33.1, 69.1, 25.0, 30.0, 38.1, 37.1, 41.0, 47.0] },
];

const isWelli = (company: string) => company === '웰리힐리';
const percent = (value: number | undefined | null) => value === undefined || value === null || !Number.isFinite(value) ? '미집계' : `${value.toFixed(1)}%`;

export default function CompetitorOccupancy() {
  const [monthIndex, setMonthIndex] = useState(7);
  const [region, setRegion] = useState('전체 지역');
  const [uploadedData, setUploadedData] = useState<{ rows: OccupancyRow[]; months: string[]; sourceDate: string; fileName: string } | null>(null);
  const [sourceMetrics, setSourceMetrics] = useState<CompetitorSourceMetrics>({ months: [], adr: {}, revpar: {}, revenue: [], rooms: {}, sourceFileNames: [] });
  const [serverSavedAt, setServerSavedAt] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<{ data: { rows: OccupancyRow[]; months: string[]; sourceDate: string; fileName: string }; metrics: CompetitorSourceMetrics; period: string } | null>(null);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dataRows = uploadedData?.rows ?? rows;
  const dataMonths = uploadedData?.months ?? months;
  const dataSourceDate = uploadedData?.sourceDate ?? sourceDate;
  const regions = useMemo(() => ['전체 지역', ...Array.from(new Set(dataRows.map((row) => row.region)))], [dataRows]);
  const activeMonthIndex = Math.min(monthIndex, dataMonths.length - 1);
  const activeMonth = dataMonths[activeMonthIndex] ?? '1월';
  const filteredRows = region === '전체 지역' ? dataRows : dataRows.filter((row) => row.region === region);
  const activeRows = useMemo(() => [...filteredRows].sort((a, b) => (b.rates[activeMonthIndex] ?? -1) - (a.rates[activeMonthIndex] ?? -1)), [filteredRows, activeMonthIndex]);
  const companyNames = useMemo(() => dataRows.map((row) => row.company).filter((company, index, all) => all.indexOf(company) === index).sort(), [dataRows]);
  const activeCompany = selectedCompany && companyNames.includes(selectedCompany) ? selectedCompany : companyNames[0] ?? '';
  const selectedRow = dataRows.find((row) => row.company === activeCompany);
  const selectedRevenue = sourceMetrics.revenue.find((row) => row.company === activeCompany);
  const welli = dataRows.find((row) => isWelli(row.company));
  const rankedRows = activeRows.filter((row) => Number.isFinite(row.rates[activeMonthIndex]));
  const welliRank = rankedRows.findIndex((row) => isWelli(row.company)) + 1;
  const averageValues = activeRows.map((row) => row.rates[activeMonthIndex]).filter((value): value is number => Number.isFinite(value));
  const average = averageValues.length ? averageValues.reduce((sum, value) => sum + value, 0) / averageValues.length : null;
  const trend = dataMonths.map((month, index) => { const values = filteredRows.map((row) => row.rates[index]).filter((value): value is number => Number.isFinite(value)); return { month, '웰리힐리': welli?.rates[index] ?? null, '선택 지역 평균': values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null }; });
  const ranking = rankedRows.map((row) => ({ company: row.company, 가동률: row.rates[activeMonthIndex], isWelli: isWelli(row.company) })).reverse();

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('competitor_occupancy_sources').select('period,source_files,occupancy_rows,performance_metrics,uploaded_at').order('period', { ascending: false }).limit(1).maybeSingle();
      if (error || !data) return;
      const rows = Array.isArray(data.occupancy_rows) ? data.occupancy_rows as OccupancyRow[] : [];
      const metrics = data.performance_metrics && typeof data.performance_metrics === 'object' ? data.performance_metrics as CompetitorSourceMetrics : null;
      if (rows.length) setUploadedData({ rows, months: metrics?.months?.length ? metrics.months : months, sourceDate: `${data.period} 서버 저장 자료`, fileName: Array.isArray(data.source_files) ? data.source_files.join(', ') : '서버 저장 자료' });
      if (metrics) setSourceMetrics(metrics);
      if (rows[0]) setSelectedCompany(rows[0].company);
      setServerSavedAt(data.uploaded_at);
    })();
  }, []);

  useEffect(() => {
    if (monthIndex >= dataMonths.length) setMonthIndex(Math.max(0, dataMonths.length - 1));
  }, [dataMonths.length, monthIndex]);

  useEffect(() => {
    if (region !== '전체 지역' && !regions.includes(region)) setRegion('전체 지역');
  }, [region, regions]);

  const handleSourceUpload = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setUploadBusy(true);
    setUploadError('');
    try {
      const files = Array.from(fileList);
      let market: Awaited<ReturnType<typeof parseCompetitorOccupancyPdf>> | null = null;
      let workbook: Awaited<ReturnType<typeof parseCompetitorWorkbook>> | null = null;
      let performance: Partial<Awaited<ReturnType<typeof parseCompetitorWorkbook>>> | null = null;
      for (const file of files) {
        const name = file.name.normalize('NFC');
        if (/\.xlsx?$/i.test(name)) workbook = await parseCompetitorWorkbook(file);
        else if (/투숙|실적/.test(name)) performance = await parseCompetitorPerformancePdf(file);
        else if (/\.pdf$/i.test(name)) market = await parseCompetitorOccupancyPdf(file);
      }
      if (!market && !workbook) throw new Error('시장 현황 PDF 또는 동종사 실적 Excel이 필요합니다.');
      const base = market ?? workbook!;
      const metrics: CompetitorSourceMetrics = {
        ...(workbook?.metrics ?? { months: base.months, adr: {}, revpar: {}, revenue: [], rooms: {}, sourceFileNames: [] }),
        revenue: performance?.metrics?.revenue ?? [],
        sourceFileNames: files.map((file) => file.name),
      };
      const nextData = { rows: base.rows, months: base.months, sourceDate: `${files.length}개 원자료 서버 저장본`, fileName: files.map((file) => file.name).join(', ') };
      setUploadedData(nextData);
      setSourceMetrics(metrics);
      const periodMatch = files.map((file) => file.name.normalize('NFC').match(/(20\d{2})[^\d]?([01]?\d)월|26[._-](\d{2})/)).find(Boolean);
      const year = periodMatch?.[1] ?? '2026';
      const month = periodMatch?.[2] ?? periodMatch?.[3] ?? String(new Date().getMonth() + 1).padStart(2, '0');
      setPendingSource({ data: nextData, metrics, period: `${year}-${String(Number(month)).padStart(2, '0')}-01` });
      setSelectedCompany(base.rows[0]?.company ?? '');
      setRegion('전체 지역');
      setMonthIndex(Math.max(0, base.months.length - 1));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '자료를 읽지 못했습니다.');
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveSourceSet = async () => {
    if (!pendingSource) return;
    setUploadBusy(true);
    setUploadError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error('로그인이 필요합니다.');
      const { error: saveError } = await supabase.from('competitor_occupancy_sources').upsert({ period: pendingSource.period, source_files: pendingSource.metrics.sourceFileNames, occupancy_rows: pendingSource.data.rows, performance_metrics: pendingSource.metrics, uploaded_by: userId, uploaded_at: new Date().toISOString() }, { onConflict: 'period' });
      if (saveError) throw new Error(`서버 저장 실패: ${saveError.message}`);
      setServerSavedAt(new Date().toISOString());
      setPendingSource(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '서버 저장에 실패했습니다.');
    } finally {
      setUploadBusy(false);
    }
  };

  const resetUploadedPdf = () => {
    setUploadedData(null);
    setUploadError('');
    setRegion('전체 지역');
    setMonthIndex(7);
  };

  return <main className="occupancy-dashboard">
    <header className="occupancy-hero"><div><p>COMPETITOR OCCUPANCY REPORT</p><h1>동종사 가동률 현황</h1><span>PDF 전체 리조트의 월별 객실 가동률을 지역별로 비교합니다.</span></div><div className="occupancy-source">{dataSourceDate}<small>가용객실수 기준 · 총 {dataRows.length}개사</small></div></header>
    <section className="occupancy-upload occupancy-panel"><div className="occupancy-upload-copy"><div className="occupancy-upload-icon"><FileUp size={20} /></div><div><strong>월별 자료 세트 업로드 <em>PDF · Excel</em></strong><p>{uploadedData ? `${uploadedData.fileName}을 적용 중입니다.` : '시장 현황 PDF, 투숙 실적 PDF, Excel 파일을 함께 선택합니다.'}</p><small>{pendingSource ? '자료를 확인했습니다. 아래 저장 버튼을 눌러 서버에 반영하세요.' : serverSavedAt ? `서버 저장 완료 · ${new Date(serverSavedAt).toLocaleString('ko-KR')}` : 'PDF 2개와 Excel 1개를 선택할 수 있습니다.'}</small></div></div><div className="occupancy-upload-actions"><input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" multiple onChange={(event) => void handleSourceUpload(event.target.files)} hidden /><button type="button" className="occupancy-upload-button" onClick={() => fileInputRef.current?.click()} disabled={uploadBusy}><FileUp size={16} />{uploadBusy ? '자료 읽는 중…' : 'PDF·Excel 자료 선택'}</button>{pendingSource && <button type="button" className="occupancy-save-button" onClick={() => void saveSourceSet()} disabled={uploadBusy}>{uploadBusy ? '서버 저장 중…' : '서버에 저장'}</button>}{serverSavedAt && !pendingSource && <span className="occupancy-saved-badge">✓ 서버 저장됨</span>}{uploadedData && <button type="button" className="occupancy-reset-button" onClick={resetUploadedPdf}><RotateCcw size={15} />기본 자료로 복원</button>}</div>{uploadError && <p className="occupancy-upload-error" role="alert">{uploadError}</p>}</section>
    <nav className="occupancy-toolbar" aria-label="가동률 조회 조건"><label>지역<select value={region} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item}>{item}</option>)}</select></label><div className="occupancy-months">{dataMonths.map((month, index) => <button key={month} className={activeMonthIndex === index ? 'active' : ''} onClick={() => setMonthIndex(index)}>{month}</button>)}</div></nav>
    <section className="occupancy-metrics"><article><small>웰리힐리 {activeMonth} 가동률</small><strong>{welli ? percent(welli.rates[activeMonthIndex]) : '미집계'}</strong><span>{welli && Number.isFinite(welli.rates[activeMonthIndex]) ? `${welliRank}위 / ${rankedRows.length}개사` : '해당 월 자료 없음'}</span></article><article><small>동종사 평균</small><strong>{percent(average)}</strong><span>{welli && average !== null && Number.isFinite(welli.rates[activeMonthIndex]) ? `웰리힐리 대비 ${(welli.rates[activeMonthIndex] - average >= 0 ? '+' : '') + (welli.rates[activeMonthIndex] - average).toFixed(1)}%p` : '해당 월 자료 없음'}</span></article><article><small>웰리힐리 가용객실수</small><strong>{welli ? `${welli.rooms.toLocaleString()}실` : '미집계'}</strong><span>업로드 표 기준</span></article><article><small>최고 가동률</small><strong>{rankedRows[0] ? percent(rankedRows[0].rates[activeMonthIndex]) : '미집계'}</strong><span>{rankedRows[0]?.company ?? '해당 월 자료 없음'}</span></article></section>
    <section className="occupancy-panel occupancy-finance"><header><div><p>PERFORMANCE & REVENUE</p><h2>투숙 실적·금액 요약</h2></div><span>{sourceMetrics.revenue.length ? `${sourceMetrics.revenue.length}개사 매출` : '금액 자료 업로드 필요'}</span></header><div className="occupancy-finance-grid"><article><small>2026 누계 매출</small><strong>{sourceMetrics.revenue.length ? sourceMetrics.revenue.reduce((sum, row) => sum + row.total, 0).toLocaleString() : '미집계'}</strong><span>투숙 실적 PDF 원자료 합계</span></article><article><small>전년 대비 매출</small><strong>{sourceMetrics.revenue.length ? `${sourceMetrics.revenue.reduce((sum, row) => sum + row.change, 0) >= 0 ? '+' : ''}${sourceMetrics.revenue.reduce((sum, row) => sum + row.change, 0).toLocaleString()}` : '미집계'}</strong><span>2026년 합계 - 2025년 합계</span></article><article><small>Excel RevPAR · 천원</small><strong>{sourceMetrics.revpar['웰리힐리']?.[activeMonthIndex] ? `${sourceMetrics.revpar['웰리힐리'][activeMonthIndex].toLocaleString()}천원` : '미집계'}</strong><span>웰리힐리 {activeMonth} 기준</span></article></div></section>
    {sourceMetrics.revenue.length > 0 && <details className="occupancy-panel occupancy-finance-detail"><summary>동종사별 Revenue 상세 보기</summary><div className="occupancy-table-wrap"><table><thead><tr><th>업체</th><th>2026년 합계</th><th>2025년 합계</th><th>증감액</th><th>증감률</th></tr></thead><tbody>{sourceMetrics.revenue.map((row) => <tr key={row.company}><td>{row.company}</td><td>{row.total.toLocaleString()}</td><td>{row.previousTotal.toLocaleString()}</td><td className={row.change >= 0 ? 'positive' : 'negative'}>{row.change >= 0 ? '+' : ''}{row.change.toLocaleString()}</td><td>{row.changeRate === null ? '—' : `${row.changeRate >= 0 ? '+' : ''}${row.changeRate.toFixed(1)}%`}</td></tr>)}</tbody></table></div></details>}
    <section className="occupancy-panel occupancy-company-detail"><header><div><p>COMPANY DETAIL</p><h2>업체별 상세 분석</h2></div><label>업체 선택<select value={activeCompany} onChange={(event) => setSelectedCompany(event.target.value)}>{companyNames.map((company) => <option key={company}>{company}</option>)}</select></label></header>{selectedRow ? <div className="occupancy-company-detail-grid"><article><small>가용객실수</small><strong>{selectedRow.rooms.toLocaleString()}실</strong><span>업로드 자료 기준</span></article><article><small>{activeMonth} 가동률</small><strong>{percent(selectedRow.rates[activeMonthIndex])}</strong><span>{Number.isFinite(selectedRow.rates[activeMonthIndex]) ? `전체 업체 순위 ${rankedRows.findIndex((row) => row.company === activeCompany) + 1}위` : '해당 월 자료 없음'}</span></article><article><small>{activeMonth} ADR · 천원</small><strong>{sourceMetrics.adr[activeCompany]?.[activeMonthIndex] ? `${sourceMetrics.adr[activeCompany][activeMonthIndex].toLocaleString()}천원` : '미집계'}</strong><span>Excel 원자료 기준</span></article><article><small>{activeMonth} RevPAR · 천원</small><strong>{sourceMetrics.revpar[activeCompany]?.[activeMonthIndex] ? `${sourceMetrics.revpar[activeCompany][activeMonthIndex].toLocaleString()}천원` : '미집계'}</strong><span>Excel 원자료 기준</span></article><div className="occupancy-company-months"><h3>월별 가동률·ADR·RevPAR · 천원</h3><div className="occupancy-table-wrap"><table><thead><tr><th>월</th><th>가동률</th><th>ADR</th><th>RevPAR</th></tr></thead><tbody>{dataMonths.map((month, index) => <tr key={month}><td>{month}</td><td>{selectedRow.rates[index] === undefined ? '—' : percent(selectedRow.rates[index])}</td><td>{sourceMetrics.adr[activeCompany]?.[index] ? `${sourceMetrics.adr[activeCompany][index].toLocaleString()}천원` : '—'}</td><td>{sourceMetrics.revpar[activeCompany]?.[index] ? `${sourceMetrics.revpar[activeCompany][index].toLocaleString()}천원` : '—'}</td></tr>)}</tbody></table></div></div>{selectedRevenue && <div className="occupancy-company-revenue"><h3>투숙 실적·매출</h3><div><span>2026년 합계 <strong>{selectedRevenue.total.toLocaleString()}</strong></span><span>2025년 합계 <strong>{selectedRevenue.previousTotal.toLocaleString()}</strong></span><span>증감률 <strong className={selectedRevenue.change >= 0 ? 'positive' : 'negative'}>{selectedRevenue.changeRate === null ? '—' : `${selectedRevenue.changeRate >= 0 ? '+' : ''}${selectedRevenue.changeRate.toFixed(1)}%`}</strong></span></div></div>}</div> : <p className="occupancy-empty">선택된 업체의 상세 자료가 없습니다.</p>}</section>
    <section className="occupancy-grid"><article className="occupancy-panel"><header><div><p>MONTHLY TREND</p><h2>{dataMonths[0]}~{dataMonths[dataMonths.length - 1]} 가동률 추이</h2></div><TrendingUp size={20} /></header><div className="occupancy-chart occupancy-chart--trend"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ left: 0, right: 16, top: 10, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5eeeb" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} width={44} /><Tooltip formatter={(value) => value === null ? '미집계' : percent(Number(value))} /><Legend /><Line type="monotone" dataKey="웰리힐리" stroke="#e87936" strokeWidth={3} dot={{ r: 4 }} connectNulls={false} /><Line type="monotone" dataKey="선택 지역 평균" stroke="#247767" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></article><article className="occupancy-panel"><header><div><p>{activeMonth} RANKING</p><h2>{region} 가동률 순위</h2></div><span>{activeRows.length}개사</span></header><div className="occupancy-chart occupancy-chart--rank"><ResponsiveContainer width="100%" height="100%"><BarChart data={ranking} layout="vertical" margin={{ left: 4, right: 24, top: 4, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5eeeb" /><XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="company" width={118} axisLine={false} tickLine={false} fontSize={11} /><Tooltip formatter={(value) => percent(Number(value))} /><Bar dataKey="가동률" radius={[0, 5, 5, 0]}>{ranking.map((entry) => <Cell key={entry.company} fill={entry.isWelli ? '#e87936' : '#247767'} />)}</Bar></BarChart></ResponsiveContainer></div></article></section>
    <section className="occupancy-panel occupancy-table"><header><div><p>COMPANY DETAIL</p><h2>{activeMonth} 업체별 상세</h2></div><span>웰리힐리 강조 표시</span></header><div className="occupancy-table-wrap"><table><thead><tr><th>순위</th><th>업체</th><th>가용객실수</th>{dataMonths.map((month) => <th key={month}>{month}</th>)}</tr></thead><tbody>{activeRows.map((row, index) => <tr key={row.company} className={isWelli(row.company) ? 'is-welli' : ''}><td>{index + 1}</td><td><span>{isWelli(row.company) && <Building2 size={15} />}{row.company}</span></td><td>{row.rooms.toLocaleString()}실</td>{dataMonths.map((_, rateIndex) => <td key={`${row.company}-${rateIndex}`}>{row.rates[rateIndex] === undefined ? '—' : percent(row.rates[rateIndex])}</td>)}</tr>)}</tbody></table></div></section>
    <footer className="occupancy-note">※ 기본 자료는 제공된 PDF 54개 행입니다. 새 PDF를 업로드하면 현재 화면의 비교·순위·추이가 업로드 자료 기준으로 바뀌고, 다음 방문에도 유지됩니다.</footer>
  </main>;
}
