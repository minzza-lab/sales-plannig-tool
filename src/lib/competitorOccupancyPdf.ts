import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export type ParsedOccupancyRow = { region: string; company: string; rooms: number; rates: number[] };
export type ParsedOccupancyPdf = { rows: ParsedOccupancyRow[]; months: string[]; sourceDate: string; pageCount: number };
type TextItem = { str: string; x: number; y: number };

const HEADER_PATTERN = /^(구분|가용객실수|\d{1,2}월\s*실적|지역|\d{4}년)/;
const clean = (value: string) => value.replace(/\s+/g, ' ').trim();

function normalizeRegion(value: string) {
  const region = clean(value);
  if (/강원도/.test(region) && /서부/.test(region)) return '강원도 서부 지역';
  if (/강원도/.test(region) && /동부/.test(region)) return '강원도 동부 지역';
  if (/경상도/.test(region)) return '경상도 지역';
  if (/충청\/전북/.test(region)) return '충청/전북 지역';
  if (/전라\/경상도/.test(region)) return '전라/경상도 지역';
  if (/부산/.test(region)) return '부산지역';
  if (/제주도/.test(region)) return '제주도 지역';
  if (/서울\/경기/.test(region)) return '서울/경기';
  return region;
}

function findRegion(value: string) {
  const text = clean(value);
  if (/강원도.*서부\s*지역/.test(text)) return '강원도 서부 지역';
  if (/강원도.*동부\s*지역/.test(text)) return '강원도 동부 지역';
  if (/충청\/전북\s*지역/.test(text)) return '충청/전북 지역';
  if (/전라\/경상도\s*지역/.test(text)) return '전라/경상도 지역';
  if (/경상도\s*지역/.test(text)) return '경상도 지역';
  if (/부산\s*지역/.test(text)) return '부산지역';
  if (/제주도\s*지역/.test(text)) return '제주도 지역';
  if (/서울\/경기/.test(text)) return '서울/경기';
  return null;
}

function groupItems(items: TextItem[]) {
  const groups: Array<{ y: number; items: TextItem[] }> = [];
  for (const item of items) {
    const group = groups.find((candidate) => Math.abs(candidate.y - item.y) < 2.5);
    if (group) group.items.push(item);
    else groups.push({ y: item.y, items: [item] });
  }
  return groups.sort((a, b) => b.y - a.y).map((group) => group.items.sort((a, b) => a.x - b.x));
}

function findCompany(items: TextItem[]) {
  return items.filter((item) => item.x >= 270 && item.x < 500).map((item) => clean(item.str))
    .find((value) => value && !HEADER_PATTERN.test(value) && !/지역$/.test(value)) || null;
}

function findRooms(items: TextItem[]) {
  const value = items.filter((item) => item.x >= 480 && item.x < 555).map((item) => clean(item.str))
    .find((candidate) => /^\d{1,3}(?:,\d{3})*$/.test(candidate));
  if (!value) return null;
  const rooms = Number(value.replaceAll(',', ''));
  return Number.isFinite(rooms) ? rooms : null;
}

function findRates(items: TextItem[]) {
  return items.filter((item) => item.x >= 560).sort((a, b) => a.x - b.x)
    .map((item) => clean(item.str).match(/^(\d+(?:\.\d+)?)%$/)?.[1])
    .filter((value): value is string => Boolean(value)).map(Number).filter(Number.isFinite);
}

function findHeaderMonths(items: TextItem[]) {
  return items.map((item) => clean(item.str).match(/^(\d{1,2})월\s*실적$/)?.[1])
    .filter((value): value is string => Boolean(value)).map((value) => `${value}월`);
}

function findRegionAnchors(items: TextItem[]) {
  const regionItems = items.filter((item) => item.x < 270 && item.y < 1080 && /강원도|서부|동부|경상도|충청\/전북|전라\/경상도|부산지역|제주도|서울\/경기|지역/.test(item.str));
  const clusters: TextItem[][] = [];
  for (const item of regionItems.sort((a, b) => b.y - a.y)) {
    const cluster = clusters[clusters.length - 1];
    if (cluster && Math.abs(cluster[cluster.length - 1].y - item.y) < 25) cluster.push(item);
    else clusters.push([item]);
  }
  return clusters.flatMap((cluster) => {
    const region = findRegion(cluster.map((item) => item.str).join(' '));
    return region ? [{ region, y: cluster.reduce((sum, item) => sum + item.y, 0) / cluster.length }] : [];
  }).sort((a, b) => b.y - a.y);
}

export async function parseCompetitorOccupancyPdf(file: File): Promise<ParsedOccupancyPdf> {
  const document = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const rows: Array<ParsedOccupancyRow & { rowY: number }> = [];
  const headerMonths: string[] = [];
  let currentRegion = '미분류';
  let regionPrefix = '';
  const regionAnchors: Array<{ region: string; y: number }> = [];
  let pendingRegionRowIndex: number | null = null;

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.flatMap((item) => {
      if (!('str' in item) || typeof item.str !== 'string' || !item.str.trim()) return [];
      return [{ str: item.str, x: item.transform[4], y: item.transform[5] }];
    });
    regionAnchors.push(...findRegionAnchors(items));
    for (const line of groupItems(items)) {
      const lineText = clean(line.map((item) => item.str).join(' '));
      const regionCellText = clean(line.filter((item) => item.x < 270).map((item) => item.str).join(' '));
      const detectedRegion = findRegion(`${regionPrefix} ${regionCellText} ${lineText}`);
      if (detectedRegion) {
        currentRegion = normalizeRegion(detectedRegion);
        if (pendingRegionRowIndex !== null && rows[pendingRegionRowIndex]) {
          rows[pendingRegionRowIndex].region = currentRegion;
          pendingRegionRowIndex = null;
        }
        if (rows.some((row) => row.region === '미분류')) {
          for (const row of rows) if (row.region === '미분류') row.region = currentRegion;
        }
        regionPrefix = '';
      } else if (regionCellText && !/^(구분|지역)$/.test(regionCellText)) {
        regionPrefix = regionCellText;
      }
      headerMonths.push(...findHeaderMonths(line));
      const company = findCompany(line);
      const rooms = findRooms(line);
      const rates = findRates(line);
      if (!company || rooms === null || rates.length < 2) continue;
      if (rows.some((row) => row.company === company && row.region === currentRegion)) continue;
      rows.push({ region: currentRegion, company, rooms, rates, rowY: line[0]?.y ?? 0 });
      if (!detectedRegion && regionCellText) pendingRegionRowIndex = rows.length - 1;
    }
  }

  if (!rows.length) throw new Error('PDF에서 업체별 가동률 표를 찾지 못했습니다. 원본 표 형식의 PDF인지 확인해주세요.');
  const monthCount = Math.max(...rows.map((row) => row.rates.length));
  const months = Array.from(new Set(headerMonths)).slice(0, monthCount);
  const anchors = regionAnchors.filter((anchor, index, all) => index === 0 || Math.abs(anchor.y - all[index - 1].y) > 5);
  const resolvedRows = rows.map(({ rowY, ...row }) => {
    const anchorIndex = anchors.findIndex((anchor, index) => {
      const upper = index === 0 ? Infinity : (anchors[index - 1].y + anchor.y) / 2;
      const lower = index === anchors.length - 1 ? -Infinity : (anchor.y + anchors[index + 1].y) / 2;
      return rowY <= upper && rowY > lower;
    });
    return anchorIndex >= 0 ? { ...row, region: anchors[anchorIndex].region } : row;
  });
  const dedupedRows = resolvedRows.filter((row, index, all) => all.findIndex((candidate) => candidate.region === row.region && candidate.company === row.company && candidate.rooms === row.rooms && candidate.rates.join('|') === row.rates.join('|')) === index);

  return {
    rows: dedupedRows,
    months: months.length >= monthCount ? months : Array.from({ length: monthCount }, (_, index) => `${index + 1}월`),
    sourceDate: `${file.name} 업로드본`,
    pageCount: document.numPages,
  };
}
