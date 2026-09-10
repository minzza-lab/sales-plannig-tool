import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import { buildVatSettlementWorkbook } from "../src/components/nicepayVatWorkbook.ts";
import { DEFAULT_CLASSIFICATION_RULES, DEFAULT_FACILITIES, DEFAULT_PACKAGE_COMPONENTS } from "../src/components/nicepayVatDefaults.ts";
import type { ProcessedRow, ProcessingResult } from "../src/components/nicepayVatEngine.ts";

const products = ["워터PKG", "워터조식", "웰리바베큐", "룸온리"];
const rows: ProcessedRow[] = products.map((product, index) => ({
  rowNumber: index + 2,
  source: { MID: "shinanrs1m", TID: `TID-${index + 1}`, 주문번호: `ORDER-${index + 1}`, 승인번호: `APPROVAL-${index + 1}` },
  productName: `${product} 테스트 상품`, standardProductName: product, packageName: product,
  appliedKeywords: product, classificationStatus: "분류완료", transactionDate: "2026-09-10", status: "승인",
  transactionAmount: 100000 + index * 10000, settlementAmount: 97000 + index * 9700,
  paymentFee: 2000 + index * 200, escrowFee: 0, authenticationFee: 0, vat: 1000 + index * 100, feeTotal: 3000 + index * 300,
}));
const feeTotal = rows.reduce((sum, row) => sum + row.feeTotal, 0);
const result: ProcessingResult = {
  rows, summaries: [], unclassified: [], errors: [],
  report: { inputCount: rows.length, outputCount: rows.length, approvedCount: rows.length, cancelledCount: 0, classifiedCount: rows.length, unclassifiedCount: 0, missingAllocationPackageCount: 0, feeBeforeAllocation: feeTotal, feeAfterAllocation: feeTotal, allocationDifferenceCount: 0, facilityTotals: {} },
};

const workbook = new ExcelJS.Workbook();
buildVatSettlementWorkbook(workbook, rows.map((row) => row.source), result, DEFAULT_CLASSIFICATION_RULES, DEFAULT_PACKAGE_COMPONENTS, DEFAULT_FACILITIES, true);
const classified = workbook.getWorksheet("분류 결과");
const report = workbook.getWorksheet("2607월 부가세");
if (!classified || !report) throw new Error("검증 시트를 찾지 못했습니다.");
const fills = products.map((_, index) => classified.getCell(index + 2, 4).fill);
const colors = fills.map((fill) => fill.type === "pattern" ? fill.fgColor?.argb : undefined);
if (new Set(colors).size !== products.length) throw new Error("상품별 색상이 구분되지 않습니다.");
products.forEach((_, index) => {
  const reportFill = report.getCell(index + 4, 24).fill;
  const reportColor = reportFill.type === "pattern" ? reportFill.fgColor?.argb : undefined;
  if (reportColor !== colors[index]) throw new Error("시트 간 상품 색상이 일치하지 않습니다.");
});
const outputDir = "outputs/01a089c6-3cbb-7873-84ee-8c4da13b930d";
await mkdir(outputDir, { recursive: true });
const outputPath = `${outputDir}/nicepay-vat-palette-preview.xlsx`;
await workbook.xlsx.writeFile(outputPath);
console.log(JSON.stringify({ outputPath, products, colors, sheets: workbook.worksheets.map((sheet) => sheet.name) }, null, 2));
