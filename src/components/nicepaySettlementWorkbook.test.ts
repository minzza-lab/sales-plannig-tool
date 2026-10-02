import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { buildSettlementPrintHtml, buildSettlementWorkbook, normalizeSettlementCategory, type SettlementWorkbookRow } from "./nicepaySettlementWorkbook.ts";

test("legacy ski and water season categories share the season pass subtotal", async () => {
  const makeRow = (category: string, amount: number, productName: string): SettlementWorkbookRow => ({
    MID: "shinanrs1m", 상품명: productName,
    __date: "2026-09-03", __category: category, __amount: amount,
    __settlement: amount, __fee: 0, __vat: 0,
  });
  const rows = [
    makeRow("스키시즌권", 100, "스키 시즌권"),
    makeRow("워터시즌권", 200, "워터 시즌권"),
    makeRow("스마트예약", 50, "입장권"),
  ];
  const mappings = [
    { keyword: "스키 시즌권", result: "스키시즌권" },
    { keyword: "워터 시즌권", result: "워터시즌권" },
  ];
  assert.equal(normalizeSettlementCategory("스키시즌권"), "시즌권");
  assert.equal(normalizeSettlementCategory("워터시즌권"), "시즌권");
  assert.equal(normalizeSettlementCategory("스마트예약"), "스마트예약");

  const workbook = new ExcelJS.Workbook();
  buildSettlementWorkbook(workbook, rows, mappings);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = reopened.getWorksheet("09월03일");
  const mappingSheet = reopened.getWorksheet("매핑데이터");
  assert.ok(sheet && mappingSheet);
  assert.equal(sheet.getCell("X4").result, "시즌권");
  assert.equal(sheet.getCell("X5").result, "시즌권");
  assert.equal(mappingSheet.getCell("D6").value, "시즌권");
  assert.equal(mappingSheet.getCell("D7").value, "시즌권");

  const seasonRow = Array.from({ length: sheet.rowCount }, (_, index) => index + 1)
    .find((row) => sheet.getCell(`B${row}`).value === "시즌권");
  assert.ok(seasonRow);
  assert.equal(sheet.getCell(`D${seasonRow}`).result, 2);
  assert.equal(sheet.getCell(`R${seasonRow}`).result, 300);
  assert.ok(!JSON.stringify(sheet.getCell(`R${seasonRow}`).value).includes("워터시즌권"));

  const printed = buildSettlementPrintHtml(rows);
  assert.ok(printed.includes("시즌권"));
  assert.ok(!printed.includes("워터시즌권"));
  assert.ok(!printed.includes("워터파크시즌패스"));
});
