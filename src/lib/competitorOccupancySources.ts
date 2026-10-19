import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ParsedOccupancyRow } from './competitorOccupancyPdf';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export type CompetitorSourceMetrics = {
  months: string[];
  adr: Record<string, number[]>;
  revpar: Record<string, number[]>;
  revenue: Array<{ company: string; member: number; nonMember: number; total: number; previousTotal: number; change: number; changeRate: number | null }>;
  rooms: Record<string, number>;
  sourceFileNames: string[];
};

export type ParsedCompetitorSources = {
  rows: ParsedOccupancyRow[];
  months: string[];
  metrics: CompetitorSourceMetrics;
  sourceDate: string;
};

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const number = (v: unknown) => { const n = Number(clean(v).replace(/[,%₩\s]/g, '')); return Number.isFinite(n) ? n : 0; };

function workbookRows(file: File) {
  return file.arrayBuffer().then((buffer) => XLSX.read(buffer, { type: 'array' }));
}

function parseMatrixSheet(workbook: XLSX.WorkBook, sheetName: string) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { rows: [] as Array<{ company: string; rooms: number; values: number[] }>, months: [] as string[] };
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
  const headerIndex = rows.findIndex((row) => row.some((cell) => /호텔앤리조트|호텔|리조트/.test(clean(cell))) && row.some((cell) => /1월/.test(clean(cell))));
  if (headerIndex < 0) return { rows: [], months: [] as string[] };
  const header = rows[headerIndex].map(clean);
  const monthColumns = header.map((value, index) => ({ value, index })).filter(({ value }) => /^\d{1,2}월$/.test(value));
  const parsed = rows.slice(headerIndex + 1).map((row) => ({
    company: clean(row[0]), rooms: number(row[1]), values: monthColumns.map(({ index }) => number(row[index])),
  })).filter((row) => row.company && !/월별|지역|호텔앤리조트|호텔/.test(row.company));
  return { rows: parsed, months: monthColumns.map(({ value }) => value) };
}

export async function parseCompetitorWorkbook(file: File): Promise<ParsedCompetitorSources> {
  const workbook = await workbookRows(file);
  const occ = parseMatrixSheet(workbook, 'Occ');
  const adr = parseMatrixSheet(workbook, 'ADR');
  const revpar = parseMatrixSheet(workbook, 'Revpar');
  if (!occ.rows.length) throw new Error('Excel의 Occ 시트를 찾지 못했습니다.');
  const rows = occ.rows.map((row) => ({ region: '전체 지역', company: row.company, rooms: row.rooms, rates: row.values }));
  const adrMap = Object.fromEntries(adr.rows.map((row) => [row.company, row.values]));
  const revparMap = Object.fromEntries(revpar.rows.map((row) => [row.company, row.values]));
  const rooms = Object.fromEntries(occ.rows.map((row) => [row.company, row.rooms]));
  return { rows, months: occ.months, metrics: { months: occ.months, adr: adrMap, revpar: revparMap, revenue: [], rooms, sourceFileNames: [file.name] }, sourceDate: `${file.name} 업로드본` };
}

type Item = { str: string; x: number; y: number };
function lines(items: Item[]) {
  const groups: Item[][] = [];
  for (const item of items) { const group = groups.find((candidate) => Math.abs(candidate[0].y - item.y) < 2); if (group) group.push(item); else groups.push([item]); }
  return groups.sort((a, b) => b[0].y - a[0].y).map((line) => line.sort((a, b) => a.x - b.x));
}
function parsePdfPage(content: { items: unknown[] }) {
  return content.items.flatMap((item) => { if (!item || typeof item !== 'object' || !('str' in item) || typeof item.str !== 'string' || !item.str.trim()) return []; const transform = 'transform' in item && Array.isArray(item.transform) ? item.transform as number[] : []; return [{ str: item.str, x: Math.round(transform[4] ?? 0), y: Math.round(transform[5] ?? 0) }]; });
}

export async function parseCompetitorPerformancePdf(file: File): Promise<Partial<ParsedCompetitorSources>> {
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const revenue: CompetitorSourceMetrics['revenue'] = [];
  let sourceMonths = ['9월'];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    if (pageNumber !== document.numPages) continue;
    const page = await document.getPage(pageNumber);
    const pageLines = lines(parsePdfPage(await page.getTextContent()));
    const header = pageLines.find((line) => line.some((item) => item.str === '구분'));
    const companies = (header ?? []).filter((item) => item.x >= 240).map((item) => ({ name: clean(item.str), x: item.x })).filter((item) => item.name && !/2025|2026|전년/.test(item.name));
    const section = pageLines.findIndex((line) => line.some((item) => item.str === 'Revenue'));
    if (section < 0 || !companies.length) continue;
    const relevant = pageLines.slice(section, section + 7);
    const rows2025 = relevant[0] ?? [];
    const totals2025 = relevant[2] ?? [];
    const rows2026 = relevant[3] ?? [];
    const totals2026 = relevant[5] ?? [];
    for (const company of companies) {
      const val = (line: Item[]) => line.find((item) => Math.abs(item.x - company.x) < 38);
      const total = number(val(totals2026)?.str); const previousTotal = number(val(totals2025)?.str); const member = number(val(rows2026 ?? [])?.str);
      if (total || previousTotal || member) revenue.push({ company: company.name, member, nonMember: 0, total, previousTotal, change: total - previousTotal, changeRate: previousTotal ? (total - previousTotal) / previousTotal * 100 : null });
    }
  }
  sourceMonths = ['누계'];
  return { metrics: { months: sourceMonths, adr: {}, revpar: {}, revenue, rooms: {}, sourceFileNames: [file.name] }, sourceDate: `${file.name} 업로드본` };
}
