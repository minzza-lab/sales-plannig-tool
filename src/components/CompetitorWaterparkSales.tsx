import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  ExternalLink,
  RefreshCw,
  ReceiptText,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './CompetitorWaterparkSales.css';

interface CompetitorResult {
  company: string;
  saunaVisitors: number;
  waterparkVisitors: number;
  totalVisitors: number;
  saunaRevenue: number;
  waterparkRevenue: number;
  admissionRevenue: number;
  ancillaryRevenue: number;
  foodRevenue: number;
  totalRevenue: number;
  admissionSpendPerVisitor: number;
  totalSpendPerVisitor: number;
  reported: boolean;
}
interface CompetitorPeriod {
  key: string;
  label: string;
  month: number | null;
  results: CompetitorResult[];
  reportedCompanyCount: number;
}

interface CompetitorSnapshot {
  year: number;
  latestReportedMonth: number;
  updatedAt: string;
  sourceUrl: string;
  annual: CompetitorPeriod;
  months: CompetitorPeriod[];
}

const COLORS = ['#1b7565', '#4e9b83', '#83b9a8'];

function compactWon(value: number): string {
  if (Math.abs(value) >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억원`;
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 10_000).toLocaleString()}만원`;
  return `${Math.round(value).toLocaleString()}원`;
}

function chartWon(value: number): string {
  return `${(value / 100_000_000).toFixed(1)}억`;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function MetricCard({ icon, label, value, detail, tone = 'green' }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: 'green' | 'blue' | 'orange' | 'charcoal';
}) {
  return (
    <article className={`competitor-metric competitor-metric--${tone}`}>
      <span className="competitor-metric__icon">{icon}</span>
      <div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div>
    </article>
  );
}

export default function CompetitorWaterparkSales() {
  const [snapshot, setSnapshot] = useState<CompetitorSnapshot | null>(null);
  const [periodKey, setPeriodKey] = useState('annual');
  const [trendCompany, setTrendCompany] = useState('웰리힐리');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/competitor-sales', { headers: { Accept: 'application/json' } });
      const body = await response.json() as CompetitorSnapshot & { error?: string };
      if (!response.ok) throw new Error(body.error || '동종사 데이터를 불러오지 못했습니다.');
      setSnapshot(body);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '동종사 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const availablePeriods = useMemo(() => snapshot
    ? [snapshot.annual, ...snapshot.months.filter((period) => period.reportedCompanyCount > 0)]
    : [], [snapshot]);

  const activePeriod = useMemo(() => {
    if (!snapshot) return null;
    if (periodKey === 'annual') return snapshot.annual;
    return snapshot.months.find((period) => period.key === periodKey) ?? snapshot.annual;
  }, [periodKey, snapshot]);

  const ranked = useMemo(() => activePeriod?.results
    .filter((result) => result.reported)
    .sort((left, right) => right.totalRevenue - left.totalRevenue) ?? [], [activePeriod]);
  const welli = ranked.find((result) => result.company.includes('웰리힐리'));
  const welliRank = welli ? ranked.findIndex((result) => result.company === welli.company) + 1 : 0;
  const industryTotal = ranked.reduce((sum, result) => sum + result.totalRevenue, 0);
  const medianRevenue = median(ranked.map((result) => result.totalRevenue));
  const medianGap = welli && medianRevenue ? (welli.totalRevenue / medianRevenue - 1) * 100 : null;

  const rankingData = ranked.map((result) => ({
    company: result.company.replace('파라다이스 스파 ', '').replace('오션어드벤처 ', ''),
    fullName: result.company,
    매출: result.totalRevenue,
    isWelli: result.company.includes('웰리힐리'),
  })).reverse();

  const compositionData = welli ? [
    { name: '입장 매출', value: welli.admissionRevenue },
    { name: '부대 매출', value: welli.ancillaryRevenue },
    { name: '식음 매출', value: welli.foodRevenue },
  ].filter((item) => item.value > 0) : [];

  const trendData = snapshot?.months
    .filter((period) => period.month && period.month <= snapshot.latestReportedMonth)
    .map((period) => {
      const result = period.results.find((item) => item.company === trendCompany);
      return { month: period.label, 매출: result?.reported ? result.totalRevenue : null };
    }) ?? [];

  const companyOptions = snapshot?.annual.results.map((result) => result.company) ?? [];

  if (loading && !snapshot) {
    return <div className="competitor-state" role="status"><RefreshCw className="spin" /> 동종사 실적을 불러오는 중입니다.</div>;
  }

  if (error && !snapshot) {
    return (
      <div className="competitor-state competitor-state--error" role="alert">
        <AlertCircle /><strong>데이터를 불러오지 못했습니다.</strong><p>{error}</p>
        <button type="button" onClick={() => void load()}><RefreshCw size={16} /> 다시 시도</button>
      </div>
    );
  }

  if (!snapshot || !activePeriod) return null;

  return (
    <main className="competitor-dashboard">
      <header className="competitor-hero">
        <div>
          <p className="competitor-eyebrow">WATERPARK MARKET REPORT</p>
          <h1>동종사 워터파크 매출현황</h1>
          <p>동종사 입장객과 매출 구성을 비교하고 웰리힐리의 시장 위치를 확인합니다.</p>
        </div>
        <div className="competitor-hero__actions">
          <a href={snapshot.sourceUrl} target="_blank" rel="noreferrer">원본 시트 <ExternalLink size={15} /></a>
          <button type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> 최신 데이터
          </button>
        </div>
      </header>

      {error && <div className="competitor-inline-error"><AlertCircle size={17} /> {error}</div>}

      <section className="competitor-toolbar" aria-label="조회 기간">
        <button className={periodKey === 'annual' ? 'active' : ''} onClick={() => setPeriodKey('annual')}>{snapshot.year} 누계</button>
        {availablePeriods.slice(1).map((period) => (
          <button key={period.key} className={periodKey === period.key ? 'active' : ''} onClick={() => setPeriodKey(period.key)}>{period.label}</button>
        ))}
        <span>최근 집계 {snapshot.latestReportedMonth}월 · VAT 제외</span>
      </section>

      <section className="competitor-metrics">
        <MetricCard icon={<WalletCards />} label="비교사 총매출" value={compactWon(industryTotal)} detail={`${ranked.length}개사 집계 합계`} />
        <MetricCard icon={<ReceiptText />} label="웰리힐리 총매출" value={welli ? compactWon(welli.totalRevenue) : '미집계'} detail={welliRank ? `${welliRank}위 / ${ranked.length}개사` : '해당 기간 자료 없음'} tone="blue" />
        <MetricCard icon={<TrendingUp />} label="중앙값 대비" value={medianGap === null ? '미집계' : `${medianGap >= 0 ? '+' : ''}${medianGap.toFixed(1)}%`} detail={`동종사 중앙값 ${compactWon(medianRevenue)}`} tone="orange" />
        <MetricCard icon={<Users />} label="웰리힐리 내장객" value={welli ? `${welli.totalVisitors.toLocaleString()}명` : '미집계'} detail={welli ? `전체 객단가 ${welli.totalSpendPerVisitor.toLocaleString()}원` : '해당 기간 자료 없음'} tone="charcoal" />
      </section>

      <section className="competitor-grid competitor-grid--primary">
        <article className="competitor-panel competitor-panel--ranking">
          <header><div><p>REVENUE RANKING</p><h2>{activePeriod.label} 총매출 순위</h2></div><span>{ranked.length}개사</span></header>
          <div className="competitor-chart competitor-chart--ranking">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rankingData} layout="vertical" margin={{ left: 8, right: 42, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e6edea" />
                <XAxis type="number" tickFormatter={chartWon} axisLine={false} tickLine={false} fontSize={11} />
                <YAxis type="category" dataKey="company" width={104} axisLine={false} tickLine={false} fontSize={11} />
                <Tooltip formatter={(value) => compactWon(Number(value))} labelFormatter={(_, payload) => payload[0]?.payload.fullName ?? ''} />
                <Bar dataKey="매출" radius={[0, 6, 6, 0]}>
                  {rankingData.map((entry) => <Cell key={entry.fullName} fill={entry.isWelli ? '#e87936' : '#247767'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="competitor-panel competitor-panel--mix">
          <header><div><p>WELLIHILLI MIX</p><h2>웰리힐리 매출 구성</h2></div></header>
          {compositionData.length ? (
            <>
              <div className="competitor-chart competitor-chart--mix">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={compositionData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={3}>
                      {compositionData.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => compactWon(Number(value))} />
                    <Legend verticalAlign="bottom" height={28} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="competitor-mix-total"><span>총매출</span><strong>{compactWon(welli?.totalRevenue ?? 0)}</strong></div>
            </>
          ) : <div className="competitor-empty">선택 기간의 웰리힐리 매출 구성이 없습니다.</div>}
        </article>
      </section>

      <section className="competitor-panel competitor-panel--trend">
        <header>
          <div><p>MONTHLY TREND</p><h2>업체별 월간 총매출 추이</h2></div>
          <label>비교 업체<select value={trendCompany} onChange={(event) => setTrendCompany(event.target.value)}>{companyOptions.map((company) => <option key={company}>{company}</option>)}</select></label>
        </header>
        <div className="competitor-chart competitor-chart--trend">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ left: 8, right: 18, top: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6edea" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} fontSize={12} />
              <YAxis tickFormatter={chartWon} axisLine={false} tickLine={false} fontSize={11} width={52} />
              <Tooltip formatter={(value) => value == null ? '미집계' : compactWon(Number(value))} />
              <Line type="monotone" dataKey="매출" stroke="#e87936" strokeWidth={3} dot={{ r: 4, fill: '#e87936' }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="competitor-panel competitor-panel--table">
        <header><div><p>COMPANY DETAIL</p><h2>{activePeriod.label} 업체별 상세</h2></div><span>금액은 VAT 제외</span></header>
        <div className="competitor-table-wrap">
          <table>
            <thead><tr><th>순위</th><th>업체</th><th>내장객</th><th>입장 매출</th><th>부대 매출</th><th>식음 매출</th><th>총매출</th><th>전체 객단가</th></tr></thead>
            <tbody>
              {ranked.map((result, index) => (
                <tr key={result.company} className={result.company.includes('웰리힐리') ? 'is-welli' : ''}>
                  <td><b>{index + 1}</b></td><td><span className="company-name">{result.company.includes('웰리힐리') && <Building2 size={15} />}{result.company}</span></td>
                  <td>{result.totalVisitors.toLocaleString()}명</td><td>{compactWon(result.admissionRevenue)}</td><td>{compactWon(result.ancillaryRevenue)}</td><td>{compactWon(result.foodRevenue)}</td><td><strong>{compactWon(result.totalRevenue)}</strong></td><td>{result.totalSpendPerVisitor.toLocaleString()}원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer>원본 시트의 0 또는 공란은 미집계 자료로 분리하며, 순위와 합계에서 제외합니다.</footer>
      </section>
    </main>
  );
}
