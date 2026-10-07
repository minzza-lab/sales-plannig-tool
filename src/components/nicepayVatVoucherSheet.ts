import type { Workbook, Worksheet } from "exceljs";
import {
  ALLOCATION_DISPLAY_GROUPS,
  calculateAllocationDisplayTotals,
  summarizeStandardProducts,
  valueByHeaders,
  type Facility,
  type ProcessingResult,
} from "./nicepayVatEngine.ts";

const moneyFormat = "#,##0;[Red]-#,##0;0";
const ink = "FF17365D";
const pale = "FFE8D2FA";
const gold = "FFFFF2CC";
const border = { top: { style: "thin" as const }, bottom: { style: "thin" as const }, left: { style: "thin" as const }, right: { style: "thin" as const } };
const referenceGroups = [
  ["워터파크", "워터플래닛입장권", "카바나", "선베드", "웰팍코인", "Q-PASS"],
  ["시즌권", "워터플래닛시즌패스"],
  ["콘도기타", "웰리굿즈"],
  ["바베큐", "바베큐"], ["루지", "루지"], ["레이싱카트", "레이싱카트"],
  ["고카트", "고카트"], ["사계절썰매", "사계절썰매"], ["아레나파크", "아레나파크"],
  ["관광곤돌라", "관광곤돌라"], ["플라잉라인", "플라잉라인"], ["깡통열차", "깡통열차"],
  ["패키지", "공홈특가올인원", "비씨올인원", "룸온리", "여름올인클루시브", "비씨어텀올인원", "공홈특가플레이", "워터파크PKG", "가을올인클루", "공홈특가조식", "원타임1인추가", "비비큐PKG", "워터조식PKG", "어텀워터", "어텀레포츠", "어텀조식"],
] as const;

export type VoucherGroup = { id: string; name: string; productNames: string[]; displayOrder: number };
export const DEFAULT_VOUCHER_GROUPS: VoucherGroup[] = referenceGroups.map(([name, ...productNames], index) => ({ id: `reference-${index + 1}`, name, productNames: [...productNames], displayOrder: index + 1 }));

const setCell = (sheet: Worksheet, address: string, value: string | number | { formula: string; result: number }, options: { header?: boolean; total?: boolean; numeric?: boolean; accent?: boolean } = {}) => {
  const cell = sheet.getCell(address);
  cell.value = value;
  cell.border = border;
  cell.font = { name: "맑은 고딕", size: 9, bold: options.header || options.total || options.accent, color: { argb: options.header ? "FFFFFFFF" : "FF20313A" } };
  cell.alignment = { horizontal: options.numeric ? "right" : "center", vertical: "middle", wrapText: !options.numeric };
  if (options.header || options.total || options.accent) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: options.header ? ink : options.total ? gold : pale } };
  if (options.numeric) cell.numFmt = moneyFormat;
};
const excelRound = (value: number) => value < 0 ? -Math.round(-value) : Math.round(value);

/** Adds the submission sheet shown in the August reference workbook using the current Step 3 result. */
export const addVatVoucherSubmissionSheet = (workbook: Workbook, result: ProcessingResult, facilities: Facility[], voucherGroups: VoucherGroup[] = DEFAULT_VOUCHER_GROUPS) => {
  const sheet = workbook.addWorksheet("전표제출용", { pageSetup: { paperSize: 9, orientation: "portrait" } });
  sheet.views = [{ showGridLines: false }];
  sheet.getColumn("A").width = 17.875;
  for (let column = 2; column <= 58; column += 1) sheet.getColumn(column).width = 13;
  Object.entries({ AR: 12.125, AS: 9.25, AT: 12.125, AU: 11, AV: 10.125, AW: 11, AX: 12.125, AY: 12.875, BB: 13.625, BC: 12.25, BD: 10.125, BE: 12.25, BF: 12.125 }).forEach(([column, width]) => { sheet.getColumn(column).width = width; });
  sheet.getRow(3).height = 24;
  ["E", "K", "N", "S", "V", "AE"].forEach((column) => { sheet.getColumn(column).hidden = true; });

  sheet.getCell("AN2").value = "■ 나이스페이먼츠 결제내역";
  sheet.getCell("BB2").value = "■ 수수료 내역";
  ["AN2", "BB2"].forEach((address) => { sheet.getCell(address).font = { name: "맑은 고딕", size: 11, bold: true }; });
  const topHeaders: Array<[string, string]> = [["AN", "구분"], ["AR", "거래금액 합계"], ["AS", "거래 건수"], ["AT", "거래금액"], ["AU", "결제수수료"], ["AV", "VAT"], ["AW", "수수료계"], ["AX", "실입금액"], ["AY", "개별"], ["AZ", "합계"]];
  topHeaders.forEach(([column, label]) => setCell(sheet, `${column}3`, label, { header: true }));
  sheet.mergeCells("AN3:AQ3");

  const products = summarizeStandardProducts(result.rows);
  const byName = new Map(products.map((product) => [product.standardProductName, product]));
  const groups: Array<{ name: string; items: typeof products }> = [];
  [...voucherGroups].sort((a, b) => a.displayOrder - b.displayOrder).forEach(({ name, productNames }) => {
    const items = productNames.flatMap((productName) => { const found = byName.get(productName); if (found) byName.delete(productName); return found ? [found] : []; });
    if (items.length) groups.push({ name, items });
  });
  byName.forEach((product) => groups.push({ name: product.standardProductName, items: [product] }));
  let topRow = 4;
  groups.forEach((group) => {
    const first = topRow;
    group.items.forEach((product) => {
      const row = topRow++;
      if (group.name !== product.standardProductName || group.items.length > 1) {
        setCell(sheet, `AP${row}`, product.standardProductName, { accent: true });
        sheet.mergeCells(`AP${row}:AQ${row}`);
      }
      const values: Array<[string, number]> = [["AR", product.transactionAmount], ["AS", product.transactionCount], ["AT", product.transactionAmount], ["AU", product.paymentFee], ["AV", product.vat], ["AW", product.feeTotal], ["AX", product.settlementAmount]];
      values.forEach(([column, amount]) => setCell(sheet, `${column}${row}`, amount, { numeric: true }));
      setCell(sheet, `AY${row}`, { formula: `AX${row}`, result: product.settlementAmount }, { numeric: true });
    });
    const last = topRow - 1;
    setCell(sheet, `AN${first}`, group.name, { accent: true });
    sheet.mergeCells(last > first ? `AN${first}:AO${last}` : group.name === group.items[0].standardProductName ? `AN${first}:AQ${first}` : `AN${first}:AO${first}`);
    setCell(sheet, `AZ${first}`, { formula: last > first ? `SUM(AY${first}:AY${last})` : `AY${first}`, result: group.items.reduce((sum, item) => sum + item.settlementAmount, 0) }, { numeric: true });
    if (last > first) sheet.mergeCells(`AZ${first}:AZ${last}`);
  });
  const topTotalRow = topRow;
  sheet.getRow(topTotalRow).height = 23.25;
  setCell(sheet, `AN${topTotalRow}`, "합계", { total: true });
  sheet.mergeCells(`AN${topTotalRow}:AQ${topTotalRow}`);
  const totalProducts = products.reduce((totals, item) => ({ transactionAmount: totals.transactionAmount + item.transactionAmount, count: totals.count + item.transactionCount, paymentFee: totals.paymentFee + item.paymentFee, vat: totals.vat + item.vat, fee: totals.fee + item.feeTotal, settlement: totals.settlement + item.settlementAmount }), { transactionAmount: 0, count: 0, paymentFee: 0, vat: 0, fee: 0, settlement: 0 });
  const totalColumns: Array<[string, number]> = [["AR", totalProducts.transactionAmount], ["AS", totalProducts.count], ["AT", totalProducts.transactionAmount], ["AU", totalProducts.paymentFee], ["AV", totalProducts.vat], ["AW", totalProducts.fee], ["AX", totalProducts.settlement], ["AY", totalProducts.settlement], ["AZ", totalProducts.settlement]];
  totalColumns.forEach(([column, amount]) => setCell(sheet, `${column}${topTotalRow}`, { formula: `SUM(${column}4:${column}${topTotalRow - 1})`, result: amount }, { numeric: true, total: true }));

  const facilityTotals = result.report.facilityTotals;
  const displayTotals = calculateAllocationDisplayTotals((name) => facilityTotals[name] || 0);
  const feeDefinitions: Array<[string, number]> = [
    ["객실료", facilityTotals["객실료"] || 0], ["한식당", facilityTotals["한식당"] || 0], ["양식당", facilityTotals["양식당"] || 0],
    ["커피샵", facilityTotals["커피샵"] || 0], ["관광곤돌라", facilityTotals["관광곤돌라"] || 0], ["플라잉라인", facilityTotals["플라잉라인"] || 0],
    ["리프트", facilityTotals["리프트"] || 0], ["시즌권", facilityTotals["시즌권"] || 0], ["워터파크", displayTotals.waterTotal],
    ["사계절썰매", facilityTotals["사계절썰매"] || 0], ["사우나", facilityTotals["사우나"] || 0], ["스키임대", displayTotals.skiRentalTotal + (facilityTotals["스키임대"] || 0)],
    ["공통배부", facilityTotals["공통배부"] || 0], ["콘도기타", facilityTotals["콘도기타"] || 0],
  ];
  const covered = new Set(["객실료", "한식당", "양식당", "커피샵", "관광곤돌라", "플라잉라인", "리프트", "시즌권", "워터파크", "카바나", "선베드", "사계절썰매", "사우나", "스키임대", "루지", "레이싱카트", "고카트", "깡통열차", "아레나", "공통배부", "콘도기타"]);
  Object.entries(facilityTotals).forEach(([name, amount]) => { if (!covered.has(name) && amount) feeDefinitions.push([name, amount]); });
  [["BB", "구분"], ["BC", "공급가액"], ["BD", "세액"], ["BE", "소계"], ["BF", "검증"]].forEach(([column, label]) => setCell(sheet, `${column}3`, label, { header: true }));
  feeDefinitions.forEach(([label, amount], index) => {
    const row = index + 4;
    const supply = excelRound(amount / 1.1);
    setCell(sheet, `BB${row}`, label);
    setCell(sheet, `BC${row}`, { formula: `ROUND(BE${row}/1.1,0)`, result: supply }, { numeric: true });
    setCell(sheet, `BD${row}`, { formula: `BE${row}-BC${row}`, result: amount - supply }, { numeric: true });
    setCell(sheet, `BE${row}`, amount, { numeric: true });
    setCell(sheet, `BF${row}`, { formula: `BC${row}+BD${row}`, result: amount }, { numeric: true });
  });
  const feeTotalRow = feeDefinitions.length + 4;
  const feeTotal = feeDefinitions.reduce((sum, [, amount]) => sum + amount, 0);
  const feeSupplyTotal = feeDefinitions.reduce((sum, [, amount]) => sum + excelRound(amount / 1.1), 0);
  setCell(sheet, `BB${feeTotalRow}`, "합계", { total: true });
  [["BC", feeSupplyTotal], ["BD", feeTotal - feeSupplyTotal], ["BE", feeTotal], ["BF", feeTotal]].forEach(([column, amount]) => setCell(sheet, `${column}${feeTotalRow}`, { formula: column === "BF" ? `BC${feeTotalRow}+BD${feeTotalRow}` : column === "BD" ? `BE${feeTotalRow}-BC${feeTotalRow}` : `SUM(${column}4:${column}${feeTotalRow - 1})`, result: Number(amount) }, { numeric: true, total: true }));

  const invoiceTitleRow = Math.max(21, feeTotalRow + 3);
  const monthCounts = new Map<number, number>();
  result.rows.forEach((row) => {
    const month = Number(row.transactionDate.match(/^20\d{2}[-/.](\d{1,2})/)?.[1]);
    if (month >= 1 && month <= 12) monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
  });
  const reportMonth = [...monthCounts].sort((a, b) => b[1] - a[1])[0]?.[0];
  sheet.getCell(`BB${invoiceTitleRow}`).value = reportMonth ? `■ ${reportMonth}월 세금계산서` : "■ 세금계산서";
  sheet.getCell(`BB${invoiceTitleRow}`).font = { name: "맑은 고딕", size: 11, bold: true };
  [["BB", "구분"], ["BC", "공급가액"], ["BD", "세액"], ["BE", "합계"]].forEach(([column, label]) => setCell(sheet, `${column}${invoiceTitleRow + 1}`, label, { header: true }));
  const midTotals: Record<string, { supply: number; tax: number }> = { "1M": { supply: 0, tax: 0 }, "4M": { supply: 0, tax: 0 }, "5M": { supply: 0, tax: 0 } };
  result.rows.forEach((row) => {
    const rawMid = String(valueByHeaders(row.source, ["MID"]) || "").trim().toLowerCase();
    const mid = rawMid.match(/(?:shinanrs)?([145])m$/)?.[1];
    if (!mid) return;
    midTotals[`${mid}M`].supply += row.paymentFee + row.escrowFee + row.authenticationFee;
    midTotals[`${mid}M`].tax += row.vat;
  });
  ["1M", "4M", "5M"].forEach((mid, index) => {
    const row = invoiceTitleRow + 2 + index;
    const { supply, tax } = midTotals[mid];
    setCell(sheet, `BB${row}`, mid);
    setCell(sheet, `BC${row}`, supply, { numeric: true });
    setCell(sheet, `BD${row}`, tax, { numeric: true });
    setCell(sheet, `BE${row}`, { formula: `SUM(BC${row}:BD${row})`, result: supply + tax }, { numeric: true });
  });
  const invoiceTotalRow = invoiceTitleRow + 5;
  setCell(sheet, `BB${invoiceTotalRow}`, "합 계", { total: true });
  [["BC", Object.values(midTotals).reduce((sum, mid) => sum + mid.supply, 0)], ["BD", Object.values(midTotals).reduce((sum, mid) => sum + mid.tax, 0)], ["BE", Object.values(midTotals).reduce((sum, mid) => sum + mid.supply + mid.tax, 0)]].forEach(([column, amount]) => setCell(sheet, `${column}${invoiceTotalRow}`, { formula: `SUM(${column}${invoiceTitleRow + 2}:${column}${invoiceTotalRow - 1})`, result: Number(amount) }, { numeric: true, total: true }));

  const costTitleRow = Math.max(37, topTotalRow + 2);
  sheet.getCell(`A${costTitleRow}`).value = "■ 원가 배분";
  sheet.getCell(`A${costTitleRow}`).font = { name: "맑은 고딕", size: 11, bold: true };
  sheet.getRow(costTitleRow).height = 17.25;
  const costHeaderRow = costTitleRow + 1;
  sheet.getRow(costHeaderRow).height = 24;
  const facilityList = [...facilities].filter((item) => item.enabled).sort((a, b) => a.displayOrder - b.displayOrder);
  const facilityStart = 2;
  const totalStart = facilityStart + facilityList.length;
  setCell(sheet, `A${costHeaderRow}`, "PKG 분류명", { header: true });
  facilityList.forEach((facility, index) => setCell(sheet, `${sheet.getColumn(facilityStart + index).letter}${costHeaderRow}`, facility.name, { header: true }));
  ["배분 합계", "배분 대상 수수료", ...ALLOCATION_DISPLAY_GROUPS.map((item) => item.label)].forEach((label, index) => setCell(sheet, `${sheet.getColumn(totalStart + index).letter}${costHeaderRow}`, label, { header: true }));
  result.summaries.forEach((summary, index) => {
    const row = costHeaderRow + 1 + index;
    const byFacility = Object.fromEntries(summary.allocations.map((item) => [item.facilityName, item.allocatedFee]));
    const displays = calculateAllocationDisplayTotals((name) => byFacility[name] || 0);
    setCell(sheet, `A${row}`, summary.packageName, { accent: true });
    facilityList.forEach((facility, columnIndex) => setCell(sheet, `${sheet.getColumn(facilityStart + columnIndex).letter}${row}`, byFacility[facility.name] || 0, { numeric: true }));
    [summary.allocatedTotal, summary.feeTotal, ...ALLOCATION_DISPLAY_GROUPS.map((item) => displays[item.key])].forEach((amount, columnIndex) => setCell(sheet, `${sheet.getColumn(totalStart + columnIndex).letter}${row}`, amount, { numeric: true }));
  });
  const costTotalRow = costHeaderRow + result.summaries.length + 1;
  sheet.getRow(costTotalRow).height = 17.25;
  setCell(sheet, `A${costTotalRow}`, "합계", { total: true });
  const costEndColumn = totalStart + 1 + ALLOCATION_DISPLAY_GROUPS.length;
  for (let column = facilityStart; column <= costEndColumn; column += 1) {
    const letter = sheet.getColumn(column).letter;
    const amount = column < totalStart ? result.report.facilityTotals[facilityList[column - facilityStart].name] || 0 : column === totalStart ? result.report.feeAfterAllocation : column === totalStart + 1 ? result.report.feeBeforeAllocation : displayTotals[ALLOCATION_DISPLAY_GROUPS[column - totalStart - 2].key];
    setCell(sheet, `${letter}${costTotalRow}`, result.summaries.length ? { formula: `SUM(${letter}${costHeaderRow + 1}:${letter}${costTotalRow - 1})`, result: amount } : 0, { numeric: true, total: true });
  }

  const entryTitleRow = Math.max(80, costTotalRow + 10);
  sheet.getCell(`M${entryTitleRow}`).value = "■ 전표 입력";
  sheet.getCell(`M${entryTitleRow}`).font = { name: "맑은 고딕", size: 11, bold: true };
  const water = displayTotals.waterTotal;
  const season = facilityTotals["시즌권"] || 0;
  const entryRows: Array<[string, number]> = [["패키지 外", feeTotal - water - season], ["워터파크입장권 外", water], ["워터시즌권 外", season]];
  entryRows.forEach(([label, amount], index) => {
    const row = entryTitleRow + 1 + index;
    setCell(sheet, `M${row}`, label);
    setCell(sheet, `R${row}`, amount, { numeric: true });
    sheet.mergeCells(`M${row}:Q${row}`);
    sheet.mergeCells(`R${row}:U${row}`);
  });
  setCell(sheet, `M${entryTitleRow + 4}`, "計", { total: true });
  setCell(sheet, `R${entryTitleRow + 4}`, { formula: `SUM(R${entryTitleRow + 1}:R${entryTitleRow + 3})`, result: feeTotal }, { numeric: true, total: true });
  sheet.mergeCells(`M${entryTitleRow + 4}:Q${entryTitleRow + 4}`);
  sheet.mergeCells(`R${entryTitleRow + 4}:U${entryTitleRow + 4}`);
  return sheet;
};
