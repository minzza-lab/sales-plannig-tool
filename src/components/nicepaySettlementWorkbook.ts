import type { Workbook, Worksheet } from "exceljs";

type RawRow = Record<string, unknown>;

export type SettlementWorkbookRow = RawRow & {
  __date: string;
  __category: string;
  __amount: number;
  __settlement: number;
  __fee: number;
  __vat: number;
};

export type SettlementMapping = { keyword: string; result: string };

const BLUE = "FF4E73DF";
const DETAIL_HEADER_FILL = "FFD9E1F2";
const YELLOW = "FFFFFF00";
const BORDER = {
  top: { style: "thin" as const, color: { argb: "FF7F7F7F" } },
  left: { style: "thin" as const, color: { argb: "FF7F7F7F" } },
  bottom: { style: "thin" as const, color: { argb: "FF7F7F7F" } },
  right: { style: "thin" as const, color: { argb: "FF7F7F7F" } },
};
const MONEY_FORMAT = "#,##0;[Red](#,##0);0";
const FIXED_CATEGORIES = ["스마트예약", "워터시즌권", "패키지外"];
const HIDDEN_DETAIL_COLUMNS = ["D", "E", "F", "G", "H", "K", "L", "N", "P", "Q", "T", "U", "V", "W"];
const DATE_TAB_COLORS = ["FFD5E8D4", "FFE1D5E7", "FFFCE4D6", "FFFFF2CC", "FFD9E1F2", "FFE2EFDA", "FFF8CECC"];

const normalizeHeader = (value: unknown) =>
  String(value ?? "").replace(/[\n\r\s]/g, "").toLowerCase();

const getValue = (row: RawRow, names: string[]) => {
  for (const name of names) {
    const target = normalizeHeader(name);
    const exact = Object.keys(row).find((key) => normalizeHeader(key) === target);
    if (exact && row[exact] !== "" && row[exact] != null) return row[exact];
    const partial = Object.keys(row).find((key) => normalizeHeader(key).includes(target));
    if (partial && row[partial] !== "" && row[partial] != null) return row[partial];
  }
  return "";
};

const toCellValue = (value: unknown): string | number | boolean | Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return value == null || value === "" ? null : String(value);
};

const styleRange = (
  sheet: Worksheet,
  startRow: number,
  endRow: number,
  startColumn: number,
  endColumn: number,
) => {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let column = startColumn; column <= endColumn; column += 1) {
      const cell = sheet.getCell(row, column);
      cell.border = BORDER;
      cell.font = { name: "맑은 고딕", size: 9 };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
  }
};

const mergeAndSet = (
  sheet: Worksheet,
  range: string,
  value: string | number | { formula: string; result: number },
) => {
  sheet.mergeCells(range);
  sheet.getCell(range.split(":")[0]).value = value;
};

const addSummaryAndVoucher = (
  sheet: Worksheet,
  detailStartRow: number,
  detailEndRow: number,
  totals: Record<string, { count: number; amount: number; fee: number; vat: number; settlement: number }>,
) => {
  const sumRow = detailEndRow + 2;
  mergeAndSet(sheet, `A${sumRow}:H${sumRow}`, "합계");
  const all = Object.values(totals).reduce(
    (value, item) => ({
      amount: value.amount + item.amount,
      fee: value.fee + item.fee,
      vat: value.vat + item.vat,
      settlement: value.settlement + item.settlement,
    }),
    { amount: 0, fee: 0, vat: 0, settlement: 0 },
  );
  [[9, all.amount], [10, all.fee], [13, all.vat], [14, all.settlement], [25, all.settlement], [26, all.fee + all.vat]].forEach(([column, result]) => {
    const letter = sheet.getColumn(column).letter;
    const sourceLetter = column === 25 ? "Y" : column === 26 ? "Z" : letter;
    sheet.getCell(sumRow, column).value = {
      formula: `SUM(${sourceLetter}${detailStartRow}:${sourceLetter}${detailEndRow})`,
      result,
    };
    sheet.getCell(sumRow, column).numFmt = MONEY_FORMAT;
  });
  styleRange(sheet, sumRow, sumRow, 1, 26);
  sheet.getRow(sumRow).font = { name: "맑은 고딕", size: 9, bold: true };
  for (let column = 9; column <= 26; column += 1) {
    sheet.getCell(sumRow, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
  }

  const summaryHeader = sumRow + 2;
  const categoryRows = FIXED_CATEGORIES.map((category, index) => ({
    category,
    row: summaryHeader + 1 + index,
    values: totals[category] || { count: 0, amount: 0, fee: 0, vat: 0, settlement: 0 },
  }));
  const summaryTotalRow = summaryHeader + 4;
  const summaryColumns = [
    ["B", "C", "구분"], ["D", "E", "건수"], ["F", "I", "거래금액"],
    ["J", "M", "결제수수료"], ["N", "Q", "VAT"], ["R", "U", "정산금액"],
    ["V", "Y", "수수료+VAT"],
  ] as const;
  summaryColumns.forEach(([from, to, label]) => {
    mergeAndSet(sheet, `${from}${summaryHeader}:${to}${summaryHeader}`, label);
  });
  categoryRows.forEach(({ category, row, values }) => {
    mergeAndSet(sheet, `B${row}:C${row}`, category);
    mergeAndSet(sheet, `D${row}:E${row}`, {
      formula: `COUNTIF($X$${detailStartRow}:$X$${detailEndRow},B${row})`,
      result: values.count,
    });
    const metrics: Array<[string, string, string, number]> = [
      ["F", "I", "I", values.amount], ["J", "M", "J", values.fee],
      ["N", "Q", "M", values.vat], ["R", "U", "N", values.settlement],
      ["V", "Y", "Z", values.fee + values.vat],
    ];
    metrics.forEach(([from, to, source, result]) => {
      mergeAndSet(sheet, `${from}${row}:${to}${row}`, {
        formula: `SUMIF($X$${detailStartRow}:$X$${detailEndRow},B${row},$${source}$${detailStartRow}:$${source}$${detailEndRow})`,
        result,
      });
      sheet.getCell(`${from}${row}`).numFmt = MONEY_FORMAT;
    });
  });
  mergeAndSet(sheet, `B${summaryTotalRow}:Q${summaryTotalRow}`, "전체 합계");
  mergeAndSet(sheet, `R${summaryTotalRow}:U${summaryTotalRow}`, {
    formula: `SUM(R${summaryHeader + 1}:R${summaryHeader + 3})`, result: categoryRows.reduce((sum, item) => sum + item.values.settlement, 0),
  });
  mergeAndSet(sheet, `V${summaryTotalRow}:Y${summaryTotalRow}`, {
    formula: `SUM(V${summaryHeader + 1}:V${summaryHeader + 3})`, result: categoryRows.reduce((sum, item) => sum + item.values.fee + item.values.vat, 0),
  });
  sheet.getCell(`R${summaryTotalRow}`).numFmt = MONEY_FORMAT;
  sheet.getCell(`V${summaryTotalRow}`).numFmt = MONEY_FORMAT;
  styleRange(sheet, summaryHeader, summaryTotalRow, 2, 25);
  for (let row = summaryHeader + 1; row < summaryTotalRow; row += 1) {
    for (let column = 2; column <= 25; column += 1) {
      sheet.getCell(row, column).font = { name: "Calibri", size: 11, color: { argb: "FF000000" } };
    }
  }
  for (let column = 2; column <= 25; column += 1) {
    sheet.getCell(summaryHeader, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    sheet.getCell(summaryHeader, column).font = { name: "맑은 고딕", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  }
  sheet.getRow(summaryTotalRow).font = { name: "맑은 고딕", size: 9, bold: true };
  for (let column = 2; column <= 25; column += 1) {
    sheet.getCell(summaryTotalRow, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
  }

  const depositHeader = summaryTotalRow + 3;
  mergeAndSet(sheet, `B${depositHeader}:H${depositHeader}`, "구 분");
  mergeAndSet(sheet, `I${depositHeader}:J${depositHeader}`, "정산금액");
  const deposits = [
    ["워터시즌권代", categoryRows[1].row, categoryRows[1].values.settlement],
    ["워터입장권代", categoryRows[0].row, categoryRows[0].values.settlement],
    ["패키지代外", categoryRows[2].row, categoryRows[2].values.settlement],
  ] as const;
  deposits.forEach(([label, sourceRow, result], index) => {
    const row = depositHeader + 1 + index;
    mergeAndSet(sheet, `B${row}:H${row}`, label);
    mergeAndSet(sheet, `I${row}:J${row}`, { formula: `R${sourceRow}`, result });
    sheet.getCell(`I${row}`).numFmt = MONEY_FORMAT;
  });
  const depositTotalRow = depositHeader + 4;
  mergeAndSet(sheet, `B${depositTotalRow}:H${depositTotalRow}`, "계");
  mergeAndSet(sheet, `I${depositTotalRow}:J${depositTotalRow}`, {
    formula: `SUM(I${depositHeader + 1}:I${depositHeader + 3})`,
    result: deposits.reduce((sum, item) => sum + item[2], 0),
  });
  sheet.getCell(`I${depositTotalRow}`).numFmt = MONEY_FORMAT;
  styleRange(sheet, depositHeader, depositTotalRow, 2, 10);
  for (let column = 2; column <= 10; column += 1) {
    sheet.getCell(depositHeader, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
    sheet.getCell(depositHeader, column).font = { name: "맑은 고딕", size: 9, bold: true };
  }

  const voucherHeader = depositTotalRow + 2;
  sheet.getCell(`B${voucherHeader}`).value = "계정";
  mergeAndSet(sheet, `C${voucherHeader}:H${voucherHeader}`, "구분");
  sheet.getCell(`I${voucherHeader}`).value = "적요";
  mergeAndSet(sheet, `J${voucherHeader}:L${voucherHeader}`, "차변");
  mergeAndSet(sheet, `M${voucherHeader}:O${voucherHeader}`, "대변");
  const voucherRows: Array<[number, string, string, number, number]> = [
    [11110311, "현금 및 현금등가물", "패키지代外", deposits.reduce((sum, item) => sum + item[2], 0), 0],
    [21130199, "미지급금", "지급보류(대변)", 0, 0],
    [21130199, "미지급금", "보류해제(차변)", 0, 0],
    [21140107, "패키지", "패키지代外", 0, deposits[2][2]],
    [21140114, "워터파크", "워터파크입장권代外", 0, deposits[1][2]],
    [21140106, "시즌권", "워터파크시즌패스代", 0, deposits[0][2]],
    [21159999, "기타", "국순당행사참가비", 0, 0],
    [21159999, "기타", "숲체원행사참가비", 0, 0],
  ];
  voucherRows.forEach(([account, division, description, debit, credit], index) => {
    const row = voucherHeader + 1 + index;
    sheet.getCell(`B${row}`).value = account;
    mergeAndSet(sheet, `C${row}:H${row}`, division);
    sheet.getCell(`I${row}`).value = description;
    mergeAndSet(sheet, `J${row}:L${row}`, index === 0 ? { formula: `I${depositTotalRow}`, result: debit } : 0);
    mergeAndSet(sheet, `M${row}:O${row}`, index >= 3 && index <= 5 ? {
      formula: index === 3 ? `I${depositHeader + 3}` : index === 4 ? `I${depositHeader + 2}` : `I${depositHeader + 1}`,
      result: credit,
    } : 0);
    sheet.getCell(`J${row}`).numFmt = MONEY_FORMAT;
    sheet.getCell(`M${row}`).numFmt = MONEY_FORMAT;
  });
  const validationRow = voucherHeader + 9;
  mergeAndSet(sheet, `B${validationRow}:I${validationRow}`, "검 증");
  mergeAndSet(sheet, `J${validationRow}:L${validationRow}`, {
    formula: `SUM(J${voucherHeader + 1}:J${voucherHeader + 8})`,
    result: deposits.reduce((sum, item) => sum + item[2], 0),
  });
  mergeAndSet(sheet, `M${validationRow}:O${validationRow}`, {
    formula: `SUM(M${voucherHeader + 1}:M${voucherHeader + 8})`,
    result: deposits.reduce((sum, item) => sum + item[2], 0),
  });
  sheet.getCell(`J${validationRow}`).numFmt = MONEY_FORMAT;
  sheet.getCell(`M${validationRow}`).numFmt = MONEY_FORMAT;
  styleRange(sheet, voucherHeader, validationRow, 2, 15);
  for (let column = 2; column <= 15; column += 1) {
    sheet.getCell(voucherHeader, column).fill = { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW } };
    sheet.getCell(voucherHeader, column).font = { name: "맑은 고딕", size: 9, bold: true };
  }
  sheet.getRow(validationRow).font = { name: "맑은 고딕", size: 9, bold: true };
  return { depositHeader, validationRow };
};

export const buildSettlementWorkbook = (
  workbook: Workbook,
  rows: SettlementWorkbookRow[],
  mappings: SettlementMapping[],
) => {
  const mappingSheet = workbook.addWorksheet("매핑데이터");
  mappingSheet.getCell("B2").value = "⚙️ 상품 매핑 규칙 마스터";
  mappingSheet.getCell("B2").font = { name: "맑은 고딕", size: 14, bold: true, color: { argb: BLUE } };
  mappingSheet.getCell("C5").value = "검색 키워드";
  mappingSheet.getCell("D5").value = "최종 분류 결과";
  mappings.forEach((rule, index) => {
    mappingSheet.getCell(6 + index, 3).value = rule.keyword;
    mappingSheet.getCell(6 + index, 4).value = rule.result;
  });
  styleRange(mappingSheet, 5, Math.max(5, 5 + mappings.length), 3, 4);
  for (let row = 6; row <= 5 + mappings.length; row += 1) {
    [3, 4].forEach((column) => {
      mappingSheet.getCell(row, column).font = { name: "Calibri", size: 11, color: { argb: "FF000000" } };
    });
  }
  ["C5", "D5"].forEach((address) => {
    mappingSheet.getCell(address).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    mappingSheet.getCell(address).font = { name: "맑은 고딕", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  });
  mappingSheet.getColumn("C").width = 40;
  mappingSheet.getColumn("D").width = 30;
  mappingSheet.views = [{ showGridLines: false, zoomScale: 100 }];

  const byDate = new Map<string, SettlementWorkbookRow[]>();
  rows.forEach((row) => byDate.set(row.__date, [...(byDate.get(row.__date) || []), row]));
  const mappingEndRow = Math.max(6, 5 + mappings.length);
  Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([date, dateRows], dateIndex) => {
    const [, month, day] = date.split("-");
    const sheet = workbook.addWorksheet(`${month}월${day}일`);
    sheet.views = [{ state: "normal", showGridLines: true, zoomScale: 90 }];
    sheet.properties.tabColor = { argb: DATE_TAB_COLORS[dateIndex % DATE_TAB_COLORS.length] };
    sheet.mergeCells("A1:Z1");
    sheet.getCell("A1").value = `■ 나이스페이 정산_${month}.${day}`;
    sheet.getCell("A1").font = { name: "맑은 고딕", size: 14, bold: true };
    sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "center" };
    sheet.getRow(1).height = 25;
    const headers = ["NO.", "결제 서비스명", "정산일", "승인일", "매입요청일", "취소일", "상 호", "MID", "거래금액", "결제수수료", "에스크로수수료", "인증수수료", "VAT", "정산금액", "카드사", "승인번호", "주문번호", "구매자", "상품명", "거래구분", "TID", "상태", "원TID", "변환결과(X)", "정산금액(Y)", "수수료+VAT(Z)"];
    sheet.getRow(3).values = headers;
    sheet.getRow(3).height = 30;
    sheet.getRow(3).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DETAIL_HEADER_FILL } };
      cell.font = { name: "맑은 고딕", size: 9, bold: true, color: { argb: "FF000000" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = BORDER;
    });
    const totals: Record<string, { count: number; amount: number; fee: number; vat: number; settlement: number }> = {};
    dateRows.forEach((row, index) => {
      const excelRow = sheet.getRow(4 + index);
      const feeVat = row.__fee + row.__vat;
      excelRow.values = [
        index + 1,
        toCellValue(getValue(row, ["결제 서비스명", "결제서비스명", "결제수단"])), date.replaceAll("-", "/"),
        toCellValue(getValue(row, ["승인일"])), toCellValue(getValue(row, ["매입요청일"])), toCellValue(getValue(row, ["취소일"])),
        toCellValue(getValue(row, ["상 호", "상호"])), toCellValue(getValue(row, ["MID"])), row.__amount, row.__fee,
        toCellValue(getValue(row, ["에스크로수수료"])), toCellValue(getValue(row, ["인증수수료"])), row.__vat, row.__settlement,
        toCellValue(getValue(row, ["카드사"])), toCellValue(getValue(row, ["승인번호"])), toCellValue(getValue(row, ["주문번호"])),
        toCellValue(getValue(row, ["구매자"])), toCellValue(getValue(row, ["상품명"])), toCellValue(getValue(row, ["거래구분"])),
        toCellValue(getValue(row, ["TID"])), toCellValue(getValue(row, ["상태"])), toCellValue(getValue(row, ["원TID"])),
      ];
      const rowNumber = 4 + index;
      excelRow.getCell(24).value = {
        formula: `IFERROR(LOOKUP(2,1/(ISNUMBER(SEARCH(매핑데이터!$C$6:$C$${mappingEndRow},S${rowNumber}))*(매핑데이터!$C$6:$C$${mappingEndRow}<>"")),매핑데이터!$D$6:$D$${mappingEndRow}),"미분류")`,
        result: row.__category,
      };
      excelRow.getCell(25).value = { formula: `N${rowNumber}`, result: row.__settlement };
      excelRow.getCell(26).value = { formula: `J${rowNumber}+M${rowNumber}`, result: feeVat };
      excelRow.font = { name: "맑은 고딕", size: 9, ...(row.__amount < 0 ? { color: { argb: "FFFF0000" } } : {}) };
      excelRow.alignment = { vertical: "middle", horizontal: "center" };
      excelRow.eachCell((cell) => { cell.border = BORDER; });
      [9, 10, 11, 12, 13, 14, 25, 26].forEach((column) => { excelRow.getCell(column).numFmt = MONEY_FORMAT; });
      [9, 10, 11, 12, 13, 14, 25, 26].forEach((column) => { excelRow.getCell(column).alignment = { vertical: "middle", horizontal: "right" }; });
      excelRow.getCell(19).alignment = { vertical: "middle", horizontal: "left" };
      const value = totals[row.__category] || { count: 0, amount: 0, fee: 0, vat: 0, settlement: 0 };
      value.count += 1;
      value.amount += row.__amount;
      value.fee += row.__fee;
      value.vat += row.__vat;
      value.settlement += row.__settlement;
      totals[row.__category] = value;
    });
    const detailEndRow = 3 + dateRows.length;
    sheet.addConditionalFormatting({
      ref: `X4:X${detailEndRow}`,
      rules: [
        ["미분류", "FFFF0000", "FFFFFFFF"], ["패키지外", "FFE2EFDA", "FF333333"],
        ["스마트예약", "FFD9E1F2", "FF333333"], ["워터시즌권", "FFFFF2CC", "FF333333"],
        ["체험행사", "FFFCE4D6", "FF333333"], ["스키시즌권", "FFE1D5E7", "FF333333"],
      ].map(([label, fill, font], index) => ({
        type: "cellIs" as const, operator: "equal" as const, priority: index + 1,
        formulae: [`"${label}"`],
        style: { fill: { type: "pattern" as const, pattern: "solid" as const, bgColor: { argb: fill } }, font: { color: { argb: font } } },
      })),
    });
    const { depositHeader, validationRow } = addSummaryAndVoucher(sheet, 4, detailEndRow, totals);
    [6, 15, 12, 12, 12, 12, 12, 12, 13, 11, 10, 10, 11, 12, 16, 12, 15, 11, 32, 12, 12, 12, 12, 16, 13, 13].forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
    HIDDEN_DETAIL_COLUMNS.forEach((column) => { sheet.getColumn(column).hidden = true; });
    sheet.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, printArea: `B${depositHeader}:O${validationRow}` };
  });
};

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatPrintMoney = (value: number) => Math.round(value).toLocaleString("ko-KR");

export const buildSettlementPrintHtml = (rows: SettlementWorkbookRow[]) => {
  const grouped = new Map<string, SettlementWorkbookRow[]>();
  rows.forEach((row) => grouped.set(row.__date, [...(grouped.get(row.__date) || []), row]));
  const pages = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, dateRows]) => {
    const settlements = Object.fromEntries(FIXED_CATEGORIES.map((category) => [category, 0])) as Record<string, number>;
    dateRows.forEach((row) => {
      if (row.__category in settlements) settlements[row.__category] += row.__settlement;
    });
    const waterSeason = settlements["워터시즌권"];
    const waterAdmission = settlements["스마트예약"];
    const packageAmount = settlements["패키지外"];
    const total = waterSeason + waterAdmission + packageAmount;
    const voucherRows: Array<[string, number]> = [
      ["워터시즌권代", waterSeason], ["워터입장권代", waterAdmission], ["패키지代外", packageAmount], ["계", total],
    ];
    const ledgerRows: Array<[string, string, string, number, number]> = [
      ["11110311", "현금 및 현금등가물", "패키지代外", total, 0],
      ["21130199", "미지급금", "지급보류(대변)", 0, 0],
      ["21130199", "미지급금", "보류해제(차변)", 0, 0],
      ["21140107", "패키지", "패키지代外", 0, packageAmount],
      ["21140114", "워터파크", "워터파크입장권代外", 0, waterAdmission],
      ["21140106", "시즌권", "워터파크시즌패스代", 0, waterSeason],
      ["21159999", "기타", "국순당행사참가비", 0, 0],
      ["21159999", "기타", "숲체원행사참가비", 0, 0],
    ];
    return `<section class="voucher-page">
      <h1>${escapeHtml(date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1년 $2월 $3일"))} 나이스페이 입금전표</h1>
      <table class="deposit"><thead><tr><th>구 분</th><th>정산금액</th></tr></thead><tbody>
        ${voucherRows.map(([label, amount], index) => `<tr class="${index === 3 ? "total" : ""}"><td>${escapeHtml(label)}</td><td>${formatPrintMoney(amount)}</td></tr>`).join("")}
      </tbody></table>
      <table class="ledger"><thead><tr><th>계정</th><th>구분</th><th>적요</th><th>차변</th><th>대변</th></tr></thead><tbody>
        ${ledgerRows.map(([account, division, description, debit, credit]) => `<tr><td>${account}</td><td>${escapeHtml(division)}</td><td>${escapeHtml(description)}</td><td>${formatPrintMoney(debit)}</td><td>${formatPrintMoney(credit)}</td></tr>`).join("")}
        <tr class="validation"><td colspan="3">검 증</td><td>${formatPrintMoney(total)}</td><td>${formatPrintMoney(total)}</td></tr>
      </tbody></table>
    </section>`;
  }).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>나이스페이 전체 날짜 전표</title><style>
    @page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#111;font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif}.voucher-page{page-break-after:always;break-after:page}.voucher-page:last-child{page-break-after:auto;break-after:auto}h1{margin:0 0 12px;font-size:17px}table{border-collapse:collapse;font-size:10px;text-align:center}th,td{border:1px solid #666;height:25px;padding:4px 6px}th{background:#ff0;font-weight:700}.deposit{width:68%;margin-bottom:18px}.deposit th:first-child{width:72%}.deposit td:last-child,.ledger td:nth-child(4),.ledger td:nth-child(5){text-align:right}.total,.validation{font-weight:700}.ledger{width:100%}.ledger th:nth-child(1){width:14%}.ledger th:nth-child(2){width:27%}.ledger th:nth-child(3){width:27%}.ledger th:nth-child(4),.ledger th:nth-child(5){width:16%}@media screen{body{background:#e5e7eb;padding:20px}.voucher-page{max-width:760px;margin:0 auto 20px;padding:28px;background:#fff;box-shadow:0 4px 18px #0002}}@media print{.voucher-page{padding:0}}
  </style></head><body>${pages}<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));</script></body></html>`;
};
