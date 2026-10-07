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

test("submission workbook embeds three linked camera ranges without reference-month image data", async () => {
  const { attachVoucherCameras } = await import("./nicepayVatCamera.ts");
  const JSZip = (await import("jszip")).default;
  const originalDocument = globalThis.document;
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==";
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ scale() {}, fillRect() {}, strokeRect() {}, fillText() {}, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} }), toDataURL: () => `data:image/png;base64,${png}` }) } });
  try {
    const workbook = new ExcelJS.Workbook();
    const facilities = [{ id: "water", name: "워터파크", excelColumn: "AU", displayOrder: 1, enabled: true }];
    const rows = [{ MID: "shinanrs1m", 상품명: "워터 입장권", 승인일: "2026/08/01", 거래금액: 10000, 결제수수료: 100, VAT: 10, 정산금액: 9890, 상태: "승인" }];
    const result = processVatSettlement(rows, [], [], facilities);
    buildVatSettlementWorkbook(workbook, rows, result, [], [], facilities, [], false);
    const sheet = workbook.getWorksheet("전표제출용")!;
    const output = await attachVoucherCameras(await workbook.xlsx.writeBuffer(), sheet);
    const zip = await JSZip.loadAsync(output);
    const drawing = await zip.file("xl/drawings/nicepayVoucherCamera.xml")!.async("string");
    assert.equal((drawing.match(/a14:cameraTool/g) || []).length, 3);
    assert.match(drawing, /cellRange="\$AN\$2:\$AZ\$5"/);
    assert.match(drawing, /cellRange="\$BB\$2:\$BF\$18"/);
    assert.match(drawing, /cellRange="\$BB\$21:\$BE\$26"/);
    assert.ok(zip.file("xl/media/nicepayCamera1.png"));
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(Buffer.from(output) as unknown as Parameters<typeof reopened.xlsx.load>[0]);
    assert.ok(reopened.getWorksheet("전표제출용"));
  } finally { Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument }); }
});

test("submission-only grouping uses the chosen AN/AO label", async () => {
  const workbook = new ExcelJS.Workbook();
  const rows = [{ MID: "shinanrs1m", 상품명: "워터 입장권", 승인일: "2026/08/01", 거래금액: 10000, 결제수수료: 100, VAT: 10, 정산금액: 9890, 상태: "승인" }];
  const rules = [{ id: "water", priority: 1, includeKeywords: ["워터"], excludeKeywords: [], standardProductName: "워터플래닛입장권", packageName: "워터플래닛입장권", enabled: true, description: "" }];
  const facilities = [{ id: "water", name: "워터파크", excelColumn: "AU", displayOrder: 1, enabled: true }];
  const result = processVatSettlement(rows, rules, [], facilities);
  buildVatSettlementWorkbook(workbook, rows, result, rules, [], facilities, [], false, [{ id: "test", name: "직접 지정", productNames: ["워터플래닛입장권"], displayOrder: 1 }]);
  assert.equal(workbook.getWorksheet("전표제출용")!.getCell("AN4").value, "직접 지정");
  assert.notEqual(workbook.getWorksheet("상품별 금액 합계")!.getCell("A2").value, "직접 지정");
});
