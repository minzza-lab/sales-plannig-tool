import type { ProductAmountSummary } from "./nicepayVatEngine";

export type VatSummaryColumnKey = keyof ProductAmountSummary;
export type VatSummaryPrintColumn = { key: VatSummaryColumnKey; excelColumn: string; label: string; numeric?: boolean };
export type VatPrintTable = { title: string; headers: string[]; rows: Array<Array<string | number>>; totals?: Array<string | number> };
export type VatTaxInvoiceRow = { category: string; supplyAmount: number; taxAmount: number; totalAmount: number };

export const VAT_SUMMARY_PRINT_COLUMNS: VatSummaryPrintColumn[] = [
  { key: "keywords", excelColumn: "A", label: "분류 키워드" },
  { key: "standardProductName", excelColumn: "B", label: "X열 표준 상품명" },
  { key: "transactionCount", excelColumn: "C", label: "거래 건수", numeric: true },
  { key: "transactionAmount", excelColumn: "D", label: "거래금액", numeric: true },
  { key: "paymentFee", excelColumn: "E", label: "결제수수료", numeric: true },
  { key: "vat", excelColumn: "F", label: "VAT", numeric: true },
  { key: "feeTotal", excelColumn: "G", label: "수수료계", numeric: true },
  { key: "settlementAmount", excelColumn: "H", label: "실입금액", numeric: true },
];

const escapeHtml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const formatValue = (row: ProductAmountSummary, column: VatSummaryPrintColumn) => {
  const value = row[column.key];
  if (column.key === "transactionCount") return Number(value).toLocaleString("ko-KR");
  if (column.numeric) return `${Math.round(Number(value)).toLocaleString("ko-KR")}원`;
  return String(value ?? "-");
};

export const buildVatSummaryPrintHtml = (rows: ProductAmountSummary[], columns: VatSummaryPrintColumn[], sourceFileName = "") => {
  const scale = Math.max(0.55, Math.min(1, 38 / Math.max(rows.length, 1)));
  const total = (key: VatSummaryColumnKey) => rows.reduce((sum, row) => sum + (typeof row[key] === "number" ? Number(row[key]) : 0), 0);
  const body = rows.map((row, index) => `<tr><td class="no">${index + 1}</td>${columns.map((column) => `<td class="${column.numeric ? "number" : "text"}">${escapeHtml(formatValue(row, column))}</td>`).join("")}</tr>`).join("");
  const totals = columns.map((column, index) => {
    if (!column.numeric) return `<td>${index === 0 ? "합계" : "-"}</td>`;
    const value = total(column.key);
    return `<td class="number">${escapeHtml(column.key === "transactionCount" ? value.toLocaleString("ko-KR") : `${Math.round(value).toLocaleString("ko-KR")}원`)}</td>`;
  }).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>상품별 금액 합계 인쇄</title><style>@page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:"Noto Sans KR","Apple SD Gothic Neo",sans-serif;color:#172f4d}body{background:#fff}.sheet{zoom:${scale};width:${100 / scale}%;padding:0}.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1f4e78;padding-bottom:8px;margin-bottom:10px}.head h1{font-size:18px;margin:0 0 3px}.head p,.meta{font-size:8px;margin:0;color:#64748b}.meta{text-align:right}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8px}th,td{border:1px solid #cbd8e6;padding:4px 5px;line-height:1.25;word-break:break-all}th{background:#1f4e78;color:#fff;font-weight:700;text-align:center}.no{width:28px;text-align:center;background:#f1f5f9}.number{text-align:right;font-variant-numeric:tabular-nums}.text{text-align:left}tbody tr:nth-child(even){background:#f7fbff}tfoot td{background:#fff2cc;border-top:2px solid #1f4e78;font-weight:800}.foot{margin-top:6px;font-size:7px;color:#64748b;text-align:right}@media print{.sheet{page-break-inside:avoid}}</style></head><body><main class="sheet"><div class="head"><div><h1>상품별 금액 합계 · 인쇄용 시트</h1><p>선택한 열만 지정한 순서대로 구성했습니다.</p></div><div class="meta">${escapeHtml(sourceFileName || "NICEPAY STEP 3")}<br>${rows.length.toLocaleString("ko-KR")}개 상품 · ${columns.length}개 열</div></div><table><thead><tr><th class="no">No.</th>${columns.map((column) => `<th>${escapeHtml(column.excelColumn)}열<br>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${body}</tbody><tfoot><tr><td class="no"></td>${totals}</tr></tfoot></table><div class="foot">NICEPAY VAT SETTLEMENT · STEP 3</div></main><script>window.addEventListener("load",()=>setTimeout(()=>window.print(),180));</script></body></html>`;
};

export const buildVatCombinedPrintHtml = (tables: VatPrintTable[], taxRows: VatTaxInvoiceRow[], sourceFileName = "") => {
  const totalRows = tables.reduce((sum, table) => sum + table.rows.length + 3, 0) + (taxRows.length ? taxRows.length + 4 : 0);
  const scale = Math.max(0.48, Math.min(1, 42 / Math.max(totalRows, 1)));
  const renderTable = (table: VatPrintTable) => `<section><h2>${escapeHtml(table.title)}</h2><table><thead><tr>${table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${table.rows.map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`).join("")}</tbody>${table.totals ? `<tfoot><tr>${table.totals.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr></tfoot>` : ""}</table></section>`;
  const taxTotal = taxRows.reduce((sum, row) => ({ supplyAmount: sum.supplyAmount + row.supplyAmount, taxAmount: sum.taxAmount + row.taxAmount, totalAmount: sum.totalAmount + row.totalAmount }), { supplyAmount: 0, taxAmount: 0, totalAmount: 0 });
  const taxTable = taxRows.length ? renderTable({ title: "세금계산서", headers: ["구분", "공급가액", "세액", "합계"], rows: taxRows.map((row) => [row.category, `${Math.round(row.supplyAmount).toLocaleString("ko-KR")}원`, `${Math.round(row.taxAmount).toLocaleString("ko-KR")}원`, `${Math.round(row.totalAmount).toLocaleString("ko-KR")}원`]), totals: ["합계", `${Math.round(taxTotal.supplyAmount).toLocaleString("ko-KR")}원`, `${Math.round(taxTotal.taxAmount).toLocaleString("ko-KR")}원`, `${Math.round(taxTotal.totalAmount).toLocaleString("ko-KR")}원`] }) : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>NICEPAY 통합 인쇄용 시트</title><style>@page{size:A4 portrait;margin:7mm}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:"Noto Sans KR","Apple SD Gothic Neo",sans-serif;color:#172f4d}.sheet{zoom:${scale};width:${100 / scale}%}.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1f4e78;padding-bottom:7px;margin-bottom:8px}.head h1{font-size:18px;margin:0}.meta{font-size:8px;color:#64748b;text-align:right}section{margin:0 0 10px;page-break-inside:avoid}h2{margin:0 0 4px;padding:5px 7px;background:#d9eaf7;border-left:4px solid #1f4e78;font-size:10px}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7px}th,td{border:1px solid #cbd8e6;padding:3px 4px;line-height:1.2;word-break:break-all}th{background:#1f4e78;color:#fff;text-align:center}td{text-align:right;font-variant-numeric:tabular-nums}td:first-child{text-align:left}tbody tr:nth-child(even){background:#f7fbff}tfoot td{background:#fff2cc;border-top:2px solid #1f4e78;font-weight:800}.foot{font-size:7px;color:#64748b;text-align:right}</style></head><body><main class="sheet"><div class="head"><h1>NICEPAY STEP 3 · 통합 인쇄용 시트</h1><div class="meta">${escapeHtml(sourceFileName || "NICEPAY STEP 3")}<br>선택 데이터만 한 페이지 출력</div></div>${tables.map(renderTable).join("")}${taxTable}<div class="foot">NICEPAY VAT SETTLEMENT · STEP 3</div></main><script>window.addEventListener("load",()=>setTimeout(()=>window.print(),180));</script></body></html>`;
};
