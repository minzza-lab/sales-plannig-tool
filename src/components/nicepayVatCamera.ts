import JSZip from "jszip";
import type { Worksheet } from "exceljs";

type CameraRange = { first: string; last: string; from: [number, number]; to: [number, number] };
const colNumber = (letters: string) => [...letters].reduce((number, letter) => number * 26 + letter.charCodeAt(0) - 64, 0);
const cellParts = (address: string) => { const [, letters, row] = address.match(/^([A-Z]+)(\d+)$/)!; return { column: colNumber(letters), row: Number(row) }; };
const displayValue = (value: unknown): string => {
  if (value && typeof value === "object") {
    if ("result" in value) return displayValue(value.result);
    if ("text" in value) return String(value.text);
  }
  return typeof value === "number" ? value.toLocaleString("ko-KR") : String(value ?? "");
};
const snapshot = (sheet: Worksheet, first: string, last: string) => {
  const from = cellParts(first); const to = cellParts(last);
  const widths = Array.from({ length: to.column - from.column + 1 }, (_, i) => Math.max(55, Math.round((sheet.getColumn(from.column + i).width || 12) * 7)));
  const heights = Array.from({ length: to.row - from.row + 1 }, (_, i) => Math.max(20, Math.round((sheet.getRow(from.row + i).height || 18) * 1.33)));
  const canvas = document.createElement("canvas"); canvas.width = widths.reduce((a, b) => a + b, 0) * 2; canvas.height = heights.reduce((a, b) => a + b, 0) * 2;
  const ctx = canvas.getContext("2d")!; ctx.scale(2, 2); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  for (let row = from.row; row <= to.row; row += 1) {
    let x = 0;
    for (let column = from.column; column <= to.column; column += 1) {
      const cell = sheet.getCell(row, column); const width = widths[column - from.column]; const height = heights[row - from.row];
      const fill = cell.fill && "fgColor" in cell.fill ? cell.fill.fgColor?.argb : undefined;
      ctx.fillStyle = fill ? `#${fill.slice(-6)}` : "#fff"; ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = "#8996a4"; ctx.lineWidth = 0.5; ctx.strokeRect(x, y, width, height);
      const value = displayValue(cell.value);
      if (value) {
        ctx.fillStyle = cell.font?.color && "argb" in cell.font.color ? `#${cell.font.color.argb?.slice(-6)}` : "#20313a";
        ctx.font = `${cell.font?.bold ? "bold " : ""}${Math.max(9, cell.font?.size || 9)}px sans-serif`;
        ctx.textBaseline = "middle";
        const right = cell.alignment?.horizontal === "right" || typeof cell.value === "number" || (cell.value && typeof cell.value === "object" && "result" in cell.value);
        ctx.textAlign = right ? "right" : "left";
        ctx.save(); ctx.beginPath(); ctx.rect(x + 2, y, width - 4, height); ctx.clip(); ctx.fillText(value, right ? x + width - 4 : x + 4, y + height / 2); ctx.restore();
      }
      x += width;
    }
    y += heights[row - from.row];
  }
  return canvas.toDataURL("image/png").split(",")[1];
};
const relationship = (id: number, type: string, target: string) => `<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
const rels = (items: string[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.join("")}</Relationships>`;
const position = ([column, row]: [number, number]) => `<xdr:col>${column}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff>`;

/** Adds native Excel Camera objects and fresh cached images to an ExcelJS workbook. */
export async function attachVoucherCameras(buffer: ArrayBuffer, sheet: Worksheet): Promise<Uint8Array> {
  const topTotalRow = sheet.getColumn("AN").values.findIndex((value, index) => index >= 4 && value === "합계");
  const feeTotalRow = sheet.getColumn("BB").values.findIndex((value, index) => index >= 4 && value === "합계");
  const invoiceTotalRow = sheet.getColumn("BB").values.findIndex((value, index) => index >= 20 && value === "합 계");
  const costTotalRow = sheet.getColumn("A").values.findIndex((value, index) => index >= 37 && value === "합계");
  if (topTotalRow < 4 || feeTotalRow < 4 || invoiceTotalRow < 20 || costTotalRow < 38) throw new Error("전표제출용 연결 그림의 원본 범위를 찾지 못했습니다.");
  const zip = await JSZip.loadAsync(buffer);
  const index = sheet.workbook.worksheets.findIndex((item) => item === sheet) + 1;
  const sheetPath = `xl/worksheets/sheet${index}.xml`;
  const sheetXml = await zip.file(sheetPath)?.async("string");
  if (!sheetXml) throw new Error("전표제출용 시트가 출력 파일에 없습니다.");
  const ranges: CameraRange[] = [
    { first: "AN2", last: `AZ${topTotalRow}`, from: [0, 1], to: [30, Math.max(36, topTotalRow + 1)] },
    { first: "BB2", last: `BF${feeTotalRow}`, from: [0, Math.max(71, topTotalRow + 36)], to: [12, Math.max(89, topTotalRow + feeTotalRow + 35)] },
    { first: `BB${invoiceTotalRow - 5}`, last: `BE${invoiceTotalRow}`, from: [12, Math.max(71, topTotalRow + 36)], to: [27, Math.max(78, topTotalRow + 43)] },
    { first: "BH2", last: "BP6", from: [12, Math.max(79, costTotalRow + 9)], to: [21, Math.max(84, costTotalRow + 14)] },
  ];
  const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006">${ranges.map((range, i) => `<mc:AlternateContent><mc:Choice Requires="a14"><xdr:twoCellAnchor editAs="oneCell"><xdr:from>${position(range.from)}</xdr:from><xdr:to>${position(range.to)}</xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Camera ${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/><a:extLst><a:ext uri="{84589F7E-364E-4C9E-8A38-B11213B215E9}"><a14:cameraTool cellRange="$${range.first.replace(/\d+/, "")}$${cellParts(range.first).row}:$${range.last.replace(/\d+/, "")}$${cellParts(range.last).row}" spid="_x0000_s${2073 + i}"/></a:ext></a:extLst></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor></mc:Choice><mc:Fallback/></mc:AlternateContent>`).join("")}</xdr:wsDr>`;
  const vml = `<xml xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="2"/></o:shapelayout><v:shapetype id="_x0000_t75" coordsize="21600,21600" o:spt="75" filled="f" stroked="f"/>${ranges.map((range, i) => `<v:shape id="camera${i + 1}" o:spid="_x0000_s${2073 + i}" type="#_x0000_t75" style="position:absolute;visibility:visible"><v:imagedata o:relid="rId${i + 1}"/><x:ClientData ObjectType="Pict"><x:FmlaPict>$${range.first.replace(/\d+/, "")}$${cellParts(range.first).row}:$${range.last.replace(/\d+/, "")}$${cellParts(range.last).row}</x:FmlaPict><x:CF>Pict</x:CF><x:Camera/></x:ClientData></v:shape>`).join("")}</xml>`;
  const drawingPath = "xl/drawings/nicepayVoucherCamera.xml"; const vmlPath = "xl/drawings/nicepayVoucherCamera.vml";
  zip.file(drawingPath, drawing); zip.file(vmlPath, vml);
  zip.file("xl/drawings/_rels/nicepayVoucherCamera.xml.rels", rels(ranges.map((_, i) => relationship(i + 1, "image", `../media/nicepayCamera${i + 1}.png`))));
  zip.file("xl/drawings/_rels/nicepayVoucherCamera.vml.rels", rels(ranges.map((_, i) => relationship(i + 1, "image", `../media/nicepayCamera${i + 1}.png`))));
  ranges.forEach((range, i) => zip.file(`xl/media/nicepayCamera${i + 1}.png`, snapshot(sheet, range.first, range.last), { base64: true }));
  const relationPath = `xl/worksheets/_rels/sheet${index}.xml.rels`;
  const oldRels = await zip.file(relationPath)?.async("string");
  const newRels = [relationship(91, "drawing", "../drawings/nicepayVoucherCamera.xml"), relationship(92, "vmlDrawing", "../drawings/nicepayVoucherCamera.vml")].join("");
  zip.file(relationPath, oldRels ? oldRels.replace("</Relationships>", `${newRels}</Relationships>`) : rels([newRels]));
  zip.file(sheetPath, sheetXml.replace("</worksheet>", `<drawing r:id="rId91"/><legacyDrawing r:id="rId92"/></worksheet>`));
  const types = await zip.file("[Content_Types].xml")?.async("string") || "";
  const addedTypes = `${types.includes('Extension="vml"') ? "" : '<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/>'}${types.includes('Extension="png"') ? "" : '<Default Extension="png" ContentType="image/png"/>'}<Override PartName="/xl/drawings/nicepayVoucherCamera.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
  zip.file("[Content_Types].xml", types.replace("</Types>", `${addedTypes}</Types>`));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
