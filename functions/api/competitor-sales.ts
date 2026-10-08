const SPREADSHEET_ID = '1TGJ_rvGV4k3bRCmuxiedKjDf3hUUf3jptlq6nEIWmtg';
const SOURCE_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit`;
const SHEET_ENDPOINT = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq`;
const SUMMARY_RANGE = 'B40:X55';
const ANNUAL_RANGE = 'B2:X17';
const MAX_SOURCE_BYTES = 250_000;

export interface CompetitorResult {
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

export interface CompetitorPeriod {
  key: string;
  label: string;
  month: number | null;
  results: CompetitorResult[];
  reportedCompanyCount: number;
}

export interface CompetitorSalesSnapshot {
  year: number;
  latestReportedMonth: number;
  updatedAt: string;
  sourceUrl: string;
  annual: CompetitorPeriod;
  months: CompetitorPeriod[];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(value);
      value = '';
    } else if (character === '\n') {
      row.push(value.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      value = '';
    } else value += character;
  }
  if (value || row.length) {
    row.push(value.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function numberAt(rows: string[][], rowIndex: number, columnIndex: number): number {
  const raw = rows[rowIndex]?.[columnIndex]?.replace(/[,%\s₩]/g, '') ?? '';
  if (!raw || raw === '-') return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function cleanCompany(value: string | undefined): string {
  return (value ?? '')
    .replace(/^\d{4}년(?:\s+\d{1,2}월)?\s+현황\s+구분\s*/u, '')
    .replace(/\s*\(\*.*$/u, '')
    .trim();
}

export function parseSummaryCsv(csv: string, key: string, label: string, month: number | null): CompetitorPeriod {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim()));
  const header = rows[0] ?? [];
  const results: CompetitorResult[] = [];

  for (let column = 2; column < header.length; column += 2) {
    const company = cleanCompany(header[column]);
    if (!company || /VAT|구분/u.test(company)) continue;

    const saunaVisitors = numberAt(rows, 1, column);
    const waterparkVisitors = numberAt(rows, 2, column);
    const totalVisitors = numberAt(rows, 3, column);
    const saunaRevenue = numberAt(rows, 4, column);
    const waterparkRevenue = numberAt(rows, 5, column);
    const admissionRevenue = numberAt(rows, 6, column);
    const ancillaryRevenue = numberAt(rows, 10, column);
    const foodRevenue = numberAt(rows, 11, column);
    const totalRevenue = numberAt(rows, 12, column);
    const admissionSpendPerVisitor = numberAt(rows, 9, column);
    const totalSpendPerVisitor = numberAt(rows, 13, column);
    // 입장객만 있고 매출이 0인 경우도 원본에서 매출 미집계 상태이므로 순위에서 제외한다.
    const reported = totalRevenue > 0 || admissionRevenue > 0;

    results.push({
      company,
      saunaVisitors,
      waterparkVisitors,
      totalVisitors,
      saunaRevenue,
      waterparkRevenue,
      admissionRevenue,
      ancillaryRevenue,
      foodRevenue,
      totalRevenue,
      admissionSpendPerVisitor,
      totalSpendPerVisitor,
      reported,
    });
  }

  return {
    key,
    label,
    month,
    results,
    reportedCompanyCount: results.filter((result) => result.reported).length,
  };
}

function sheetUrl(sheet: string, range?: string): string {
  const url = new URL(SHEET_ENDPOINT);
  url.searchParams.set('tqx', 'out:csv');
  url.searchParams.set('sheet', sheet);
  if (range) url.searchParams.set('range', range);
  return url.toString();
}

async function fetchBoundedCsv(sheet: string, range?: string): Promise<string> {
  const response = await fetch(sheetUrl(sheet, range), {
    headers: { 'User-Agent': 'SalesPlanningCompetitorDashboard/1.0' },
  });
  if (!response.ok) throw new Error(`${sheet} 시트를 불러오지 못했습니다. (${response.status})`);
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_SOURCE_BYTES) throw new Error(`${sheet} 시트 응답이 허용 크기를 초과했습니다.`);
  const csv = await response.text();
  if (csv.length > MAX_SOURCE_BYTES) throw new Error(`${sheet} 시트 응답이 허용 크기를 초과했습니다.`);
  if (!csv.trim()) throw new Error(`${sheet} 시트가 비어 있습니다.`);
  return csv;
}

export async function fetchCompetitorSalesSnapshot(): Promise<CompetitorSalesSnapshot> {
  const monthlySheets = Array.from({ length: 12 }, (_, index) => `26.${String(index + 1).padStart(2, '0')}`);
  const [annualCsv, ...monthlyCsv] = await Promise.all([
    fetchBoundedCsv('26Y 실적', ANNUAL_RANGE),
    ...monthlySheets.map((sheet) => fetchBoundedCsv(sheet, SUMMARY_RANGE)),
  ]);
  const yearMatch = annualCsv.match(/(20\d{2})년/u);
  const year = yearMatch ? Number(yearMatch[1]) : 2026;
  const months = monthlyCsv.map((csv, index) => parseSummaryCsv(
    csv,
    `${year}-${String(index + 1).padStart(2, '0')}`,
    `${index + 1}월`,
    index + 1,
  ));
  const latestReportedMonth = months.reduce(
    (latest, period) => period.reportedCompanyCount > 0 ? Math.max(latest, period.month ?? 0) : latest,
    0,
  );

  return {
    year,
    latestReportedMonth,
    updatedAt: new Date().toISOString(),
    sourceUrl: SOURCE_URL,
    annual: parseSummaryCsv(annualCsv, `${year}`, `${year}년 누계`, null),
    months,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=3600');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(JSON.stringify(body), { ...init, headers });
}

export const onRequestGet = async (): Promise<Response> => {
  try {
    return jsonResponse(await fetchCompetitorSalesSnapshot());
  } catch (error) {
    console.error(JSON.stringify({
      message: 'competitor sales sync failed',
      error: error instanceof Error ? error.message : String(error),
    }));
    return jsonResponse({
      error: error instanceof Error ? error.message : '동종사 매출 데이터를 불러오지 못했습니다.',
    }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
};
