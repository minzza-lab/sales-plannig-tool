import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { processVatSettlement } from "./nicepayVatEngine.ts";
import { buildVatSettlementWorkbook } from "./nicepayVatWorkbook.ts";

test("submission sheet uses current MID fees and keeps supply-tax rounding editable", async () => {
  const facilities = [{ id: "water", name: "워터파크", excelColumn: "AU", displayOrder: 1, enabled: true }];
  const rules = [{ id: "water", priority: 1, includeKeywords: ["워터"], excludeKeywords: [], standardProductName: "워터플래닛입장권", packageName: "워터플래닛입장권", enabled: true, description: "" }];
  const components = [{ id: "water", packageName: "워터플래닛입장권", facilityName: "워터파크", baseAmount: 100, enabled: true }];
  const rows = (["1m", "4m", "5m"] as const).map((mid, index) => ({ MID: `shinanrs${mid}`, 상품명: "워터 입장권", 승인일: `2026/08/0${index + 1}`, 거래금액: 10000, 결제수수료: (index + 1) * 100, VAT: (index + 1) * 10, 정산금액: 10000 - (index + 1) * 110, 상태: "승인" }));
  const result = processVatSettlement(rows, rules, components, facilities);
  const workbook = new ExcelJS.Workbook();
  buildVatSettlementWorkbook(workbook, rows, result, rules, components, facilities, [], false);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());
  const sheet = reopened.getWorksheet("전표제출용");
  assert.ok(sheet);
  assert.equal(sheet.getCell("AW4").value, 660);
  assert.equal(sheet.getCell("BE12").value, 660);
  assert.equal(sheet.getCell("BB21").value, "■ 8월 세금계산서");
  assert.equal((sheet.getCell("BC4").value as { formula: string }).formula, "ROUND(BE4/1.1,0)");
  assert.deepEqual(sheet.getCell("BE23").value, { formula: "SUM(BC23:BD23)", result: 110 });
  assert.deepEqual(sheet.getCell("BE24").value, { formula: "SUM(BC24:BD24)", result: 220 });
  assert.deepEqual(sheet.getCell("BE25").value, { formula: "SUM(BC25:BD25)", result: 330 });
  assert.deepEqual(sheet.getCell("R84").value, { formula: "SUM(R81:R83)", result: 660 });
});
