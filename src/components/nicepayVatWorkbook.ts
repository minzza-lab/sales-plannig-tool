import type { Workbook, Worksheet } from "exceljs";
import type { ClassificationRule, Facility, PackageComponent, ProcessingResult, RawRow } from "./nicepayVatEngine.ts";
import { summarizeStandardProducts, valueByHeaders } from "./nicepayVatEngine.ts";

const border = { top: { style: "thin" as const, color: { argb: "FF7F7F7F" } }, left: { style: "thin" as const, color: { argb: "FF7F7F7F" } }, bottom: { style: "thin" as const, color: { argb: "FF7F7F7F" } }, right: { style: "thin" as const, color: { argb: "FF7F7F7F" } } };
const moneyFormat = "#,##0;[Red]-#,##0;0";
// Hidden columns copied from the supplied 2607월 부가세 reference sheet.
export const REFERENCE_HIDDEN_REPORT_COLUMNS = ["D", "E", "F", "G", "H", "K", "L", "N", "P", "Q", "T", "U", "V", "W", "AH", "AI", "AJ", "AK", "AL", "AN", "AQ", "AR", "AS", "AT", "AV", "AY", "AZ", "BA", "BB", "BC", "BH"];
const columnNumber = (column: string) => column.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
const cellText = (row: RawRow, names: string[]) => String(valueByHeaders(row, names) ?? "");

const setHeader = (sheet: Worksheet, row: number, from: number, to: number) => {
  for (let column = from; column <= to; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    cell.font = { name: "맑은 고딕", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = border;
  }
};

const styleTable = (sheet: Worksheet, fromRow: number, toRow: number, fromColumn: number, toColumn: number) => {
  for (let row = fromRow; row <= toRow; row += 1) for (let column = fromColumn; column <= toColumn; column += 1) {
    const cell = sheet.getCell(row, column);
    cell.border = border;
    cell.font = { name: "맑은 고딕", size: 9 };
    cell.alignment = { vertical: "middle", horizontal: column >= 9 ? "right" : "left" };
  }
};

const addRawSheet = (workbook: Workbook, rows: RawRow[]) => {
  const sheet = workbook.addWorksheet("원본 데이터");
  const headers = rows[0] ? Object.keys(rows[0]).filter((header) => !header.startsWith("__")) : [];
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(headers.map((header) => row[header] ?? "")));
  setHeader(sheet, 1, 1, Math.max(1, headers.length));
  styleTable(sheet, 2, Math.max(2, rows.length + 1), 1, Math.max(1, headers.length));
  headers.forEach((header, index) => { sheet.getColumn(index + 1).width = Math.min(36, Math.max(12, String(header).length * 2 + 8)); });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
};

export const buildVatSettlementWorkbook = (
  workbook: Workbook,
  sourceRows: RawRow[],
  result: ProcessingResult,
  rules: ClassificationRule[],
  components: PackageComponent[],
  facilities: Facility[],
  includeSettings: boolean,
) => {
  workbook.creator = "WELLIHILLI Sales Planning";
  addRawSheet(workbook, sourceRows);

  const classified = workbook.addWorksheet("분류 결과");
  const classifiedHeaders = ["원본 행", "원본 상품명", "적용 키워드", "표준 상품명", "PKG 분류명", "수수료계", "분류 상태", "승인일", "상태", "TID", "주문번호", "승인번호"];
  classified.addRow(classifiedHeaders);
  result.rows.forEach((row) => classified.addRow([row.rowNumber, row.productName, row.appliedKeywords, row.standardProductName, row.packageName, row.feeTotal, row.classificationStatus, row.transactionDate, row.status, cellText(row.source, ["TID"]), cellText(row.source, ["주문번호"]), cellText(row.source, ["승인번호"])]));
  setHeader(classified, 1, 1, classifiedHeaders.length);
  styleTable(classified, 2, Math.max(2, result.rows.length + 1), 1, classifiedHeaders.length);
  classified.getColumn(2).width = 42; classified.getColumn(3).width = 24; classified.getColumn(4).width = 24; classified.getColumn(5).width = 24;
  [1, 6, 7, 8, 9, 10, 11, 12].forEach((column) => { classified.getColumn(column).width = 16; });
  classified.getColumn(6).numFmt = moneyFormat;
  classified.views = [{ state: "frozen", ySplit: 1 }];

  const productSummary = workbook.addWorksheet("상품별 금액 합계");
  const productSummaryHeaders = ["분류 키워드", "X열 표준 상품명", "거래 건수", "거래금액", "결제수수료", "VAT", "수수료계", "실입금액"];
  productSummary.addRow(productSummaryHeaders);
  const standardProductTotals = summarizeStandardProducts(result.rows);
  standardProductTotals.forEach((item) => productSummary.addRow([item.keywords, item.standardProductName, item.transactionCount, item.transactionAmount, item.paymentFee, item.vat, item.feeTotal, item.settlementAmount]));
  productSummary.addRow(["합계", "", standardProductTotals.reduce((sum, item) => sum + item.transactionCount, 0), standardProductTotals.reduce((sum, item) => sum + item.transactionAmount, 0), standardProductTotals.reduce((sum, item) => sum + item.paymentFee, 0), standardProductTotals.reduce((sum, item) => sum + item.vat, 0), standardProductTotals.reduce((sum, item) => sum + item.feeTotal, 0), standardProductTotals.reduce((sum, item) => sum + item.settlementAmount, 0)]);
  setHeader(productSummary, 1, 1, productSummaryHeaders.length);
  styleTable(productSummary, 2, Math.max(2, standardProductTotals.length + 2), 1, productSummaryHeaders.length);
  [26, 28, 14, 18, 18, 18, 18, 18].forEach((width, index) => { productSummary.getColumn(index + 1).width = width; });
  for (let column = 4; column <= 8; column += 1) productSummary.getColumn(column).numFmt = moneyFormat;
  productSummary.getRow(standardProductTotals.length + 2).font = { name: "맑은 고딕", size: 9, bold: true };
  productSummary.views = [{ state: "frozen", ySplit: 1 }];

  const allocation = workbook.addWorksheet("PKG 집계 및 업장별 배분");
  const facilityList = facilities.filter((item) => item.enabled).sort((a, b) => a.displayOrder - b.displayOrder);
  const allocationHeaders = ["PKG명", "거래 건수", "승인 건수", "취소 건수", "배분 대상 수수료", ...facilityList.map((item) => item.name), "배분 합계", "차이", "검증 상태", "메시지"];
  allocation.addRow(allocationHeaders);
  result.summaries.forEach((summary) => {
    const byFacility = Object.fromEntries(summary.allocations.map((item) => [item.facilityName, item.allocatedFee]));
    allocation.addRow([summary.packageName, summary.transactionCount, summary.approvedCount, summary.cancelledCount, summary.feeTotal, ...facilityList.map((facility) => byFacility[facility.name] || 0), summary.allocatedTotal, summary.difference, summary.validation, summary.message]);
  });
  setHeader(allocation, 1, 1, allocationHeaders.length);
  styleTable(allocation, 2, Math.max(2, result.summaries.length + 1), 1, allocationHeaders.length);
  allocation.getRow(result.summaries.length + 3).values = ["검증", result.report.inputCount, result.report.outputCount, result.report.approvedCount, result.report.cancelledCount, result.report.classifiedCount, result.report.unclassifiedCount, result.report.feeBeforeAllocation, result.report.feeAfterAllocation, result.report.allocationDifferenceCount];
  allocation.getColumn(1).width = 28;
  for (let column = 2; column <= allocationHeaders.length; column += 1) allocation.getColumn(column).width = 15;
  for (let column = 5; column <= 5 + facilityList.length + 1; column += 1) allocation.getColumn(column).numFmt = moneyFormat;
  allocation.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];

  const errors = workbook.addWorksheet("미분류·오류 목록");
  errors.addRow(["유형", "원본 행", "원본 상품명", "PKG명", "수수료계", "내용"]);
  result.unclassified.forEach((row) => errors.addRow(["미분류", row.rowNumber, row.productName, "", row.feeTotal, "상품 분류 기준에 일치하는 규칙이 없습니다."]));
  result.errors.forEach((message) => errors.addRow(["배분 오류", "", "", "", "", message]));
  setHeader(errors, 1, 1, 6);
  styleTable(errors, 2, Math.max(2, result.unclassified.length + result.errors.length + 1), 1, 6);
  [12, 12, 44, 28, 16, 52].forEach((width, index) => { errors.getColumn(index + 1).width = width; });
  errors.getColumn(5).numFmt = moneyFormat;
  errors.views = [{ state: "frozen", ySplit: 1 }];

  const report = workbook.addWorksheet("2607월 부가세");
  report.mergeCells("A1:Z1");
  report.getCell("A1").value = "■나이스페이먼츠 세부 정산내역";
  report.getCell("A1").font = { name: "맑은 고딕", size: 14, bold: true };
  report.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  report.getRow(1).height = 25;
  const reportHeaders = ["NO.", "결제 서비스명", "정산일", "승인일", "매입요청일", "취소일", "상 호", "MID", "거래금액", "결제수수료", "에스크로수수료", "인증수수료", "VAT", "정산금액", "카드/은행", "승인번호", "주문번호", "구매자", "상품명", "거래구분", "TID", "상태", "원거래 TID", "표준화된 상품명", "정산금액", "수수료계"];
  report.getRow(3).values = reportHeaders;
  setHeader(report, 3, 1, 26);
  result.rows.forEach((item, index) => {
    const rowNo = index + 4;
    const row = report.getRow(rowNo);
    row.values = [index + 1, cellText(item.source, ["결제 서비스명"]), cellText(item.source, ["정산일"]), cellText(item.source, ["승인일"]), cellText(item.source, ["매입요청일", "입금일", "구매확인일"]), cellText(item.source, ["취소일"]), cellText(item.source, ["상 호", "상호"]), cellText(item.source, ["MID"]), item.transactionAmount, item.paymentFee, item.escrowFee, item.authenticationFee, item.vat, item.settlementAmount, cellText(item.source, ["카드/은행", "카드사"]), cellText(item.source, ["승인번호", "계좌번호", "휴대폰번호"]), cellText(item.source, ["주문번호"]), cellText(item.source, ["구매자"]), item.productName, cellText(item.source, ["거래구분"]), cellText(item.source, ["TID"]), item.status, cellText(item.source, ["원거래 TID", "원TID"]), item.standardProductName, { formula: `N${rowNo}`, result: item.settlementAmount }, { formula: `J${rowNo}+K${rowNo}+L${rowNo}+M${rowNo}`, result: item.feeTotal }];
    row.eachCell((cell) => { cell.border = border; cell.font = { name: "맑은 고딕", size: 9 }; cell.alignment = { vertical: "middle", horizontal: "left" }; });
    [9, 10, 11, 12, 13, 14, 25, 26].forEach((column) => { row.getCell(column).numFmt = moneyFormat; row.getCell(column).alignment = { horizontal: "right", vertical: "middle" }; });
  });
  const detailLastRow = Math.max(4, result.rows.length + 3);
  const totalRow = detailLastRow + 3;
  report.getCell(`A${totalRow}`).value = "합계";
  [9, 10, 11, 12, 13, 14, 25, 26].forEach((column) => {
    const letter = report.getColumn(column).letter;
    report.getCell(totalRow, column).value = { formula: `SUM(${letter}4:${letter}${detailLastRow})`, result: result.rows.reduce((sum, item) => {
      const values = { 9: item.transactionAmount, 10: item.paymentFee, 11: item.escrowFee, 12: item.authenticationFee, 13: item.vat, 14: item.settlementAmount, 25: item.settlementAmount, 26: item.feeTotal } as Record<number, number>;
      return sum + values[column];
    }, 0) };
    report.getCell(totalRow, column).numFmt = moneyFormat;
  });
  styleTable(report, totalRow, totalRow, 1, 26);
  report.getRow(totalRow).font = { name: "맑은 고딕", size: 9, bold: true };
  const summaryRow = totalRow + 3;
  report.getCell(summaryRow, 30).value = "PKG 분류명"; // AD
  facilityList.forEach((facility) => { report.getCell(summaryRow, columnNumber(facility.excelColumn)).value = facility.name; });
  report.getCell(summaryRow, 63).value = "배분 합계"; // BK
  report.getCell(summaryRow, 64).value = "배분 대상 수수료"; // BL
  report.getCell(summaryRow, 65).value = "검증"; // BM
  report.getCell(summaryRow, 66).value = "배분 차이"; // BN
  setHeader(report, summaryRow, 30, 66);
  result.summaries.forEach((summary, index) => {
    const rowNumber = summaryRow + 1 + index;
    report.getCell(rowNumber, 30).value = summary.packageName;
    summary.allocations.forEach((line) => { report.getCell(rowNumber, columnNumber(line.excelColumn)).value = line.allocatedFee; report.getCell(rowNumber, columnNumber(line.excelColumn)).numFmt = moneyFormat; });
    report.getCell(rowNumber, 63).value = { formula: `SUM(AE${rowNumber}:BJ${rowNumber})`, result: summary.allocatedTotal };
    report.getCell(rowNumber, 64).value = summary.feeTotal;
    report.getCell(rowNumber, 65).value = summary.validation;
    report.getCell(rowNumber, 66).value = { formula: `BK${rowNumber}-BL${rowNumber}`, result: summary.difference };
    [63, 64, 66].forEach((column) => { report.getCell(rowNumber, column).numFmt = moneyFormat; });
  });
  const allocationFirstRow = summaryRow + 1;
  const allocationLastRow = summaryRow + result.summaries.length;
  const allocationTotalRow = allocationLastRow + 1;
  const hasAllocationRows = result.summaries.length > 0;
  report.getCell(allocationTotalRow, 30).value = "합계";
  facilityList.forEach((facility) => {
    const column = columnNumber(facility.excelColumn);
    const letter = report.getColumn(column).letter;
    report.getCell(allocationTotalRow, column).value = hasAllocationRows
      ? { formula: `SUM(${letter}${allocationFirstRow}:${letter}${allocationLastRow})`, result: result.report.facilityTotals[facility.name] || 0 }
      : 0;
    report.getCell(allocationTotalRow, column).numFmt = moneyFormat;
  });
  report.getCell(allocationTotalRow, 63).value = hasAllocationRows ? { formula: `SUM(BK${allocationFirstRow}:BK${allocationLastRow})`, result: result.report.feeAfterAllocation } : 0;
  report.getCell(allocationTotalRow, 64).value = hasAllocationRows ? { formula: `SUM(BL${allocationFirstRow}:BL${allocationLastRow})`, result: result.report.feeBeforeAllocation } : 0;
  report.getCell(allocationTotalRow, 65).value = result.report.feeAfterAllocation === result.report.feeBeforeAllocation ? "정상" : "오류";
  report.getCell(allocationTotalRow, 66).value = { formula: `BK${allocationTotalRow}-BL${allocationTotalRow}`, result: result.report.feeAfterAllocation - result.report.feeBeforeAllocation };
  [63, 64, 66].forEach((column) => { report.getCell(allocationTotalRow, column).numFmt = moneyFormat; });
  styleTable(report, allocationFirstRow, allocationTotalRow, 30, 66);
  report.getRow(allocationTotalRow).font = { name: "맑은 고딕", size: 9, bold: true };
  [8, 15, 12, 12, 12, 12, 16, 13, 14, 12, 12, 12, 11, 13, 14, 14, 18, 12, 42, 12, 31, 12, 31, 26, 13, 13].forEach((width, index) => { report.getColumn(index + 1).width = width; });
  report.getColumn("P").width = 18; report.getColumn("Q").width = 22; report.getColumn("U").width = 34;
  for (let column = 30; column <= 66; column += 1) report.getColumn(column).width = column === 30 ? 26 : 14;
  REFERENCE_HIDDEN_REPORT_COLUMNS.forEach((column) => { report.getColumn(column).hidden = true; });
  report.views = [{ state: "frozen", ySplit: 3, xSplit: 2, showGridLines: true }];
  report.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 26 } };

  if (includeSettings) {
    const rulesSheet = workbook.addWorksheet("설정_상품 분류 기준");
    rulesSheet.addRow(["우선순위", "포함 키워드", "제외 키워드", "표준 상품명", "PKG 분류명", "사용 여부", "설명"]);
    rules.forEach((rule) => rulesSheet.addRow([rule.priority, rule.includeKeywords.join(", "), rule.excludeKeywords.join(", "), rule.standardProductName, rule.packageName, rule.enabled ? "사용" : "미사용", rule.description]));
    setHeader(rulesSheet, 1, 1, 7); styleTable(rulesSheet, 2, Math.max(2, rules.length + 1), 1, 7); [12, 30, 30, 24, 24, 12, 40].forEach((width, index) => { rulesSheet.getColumn(index + 1).width = width; });
    const componentSheet = workbook.addWorksheet("설정_PKG 구성표");
    componentSheet.addRow(["PKG명", "이용업장", "구성 기준금액", "배분율", "적용 시작일", "적용 종료일", "사용 여부"]);
    components.forEach((component) => { const total = components.filter((item) => item.enabled && item.packageName === component.packageName).reduce((sum, item) => sum + item.baseAmount, 0); componentSheet.addRow([component.packageName, component.facilityName, component.baseAmount, total ? component.baseAmount / total : 0, component.startDate || "", component.endDate || "", component.enabled ? "사용" : "미사용"]); });
    setHeader(componentSheet, 1, 1, 7); styleTable(componentSheet, 2, Math.max(2, components.length + 1), 1, 7); [28, 22, 18, 14, 15, 15, 12].forEach((width, index) => { componentSheet.getColumn(index + 1).width = width; }); componentSheet.getColumn(3).numFmt = moneyFormat; componentSheet.getColumn(4).numFmt = "0.000000%";
  }
};
