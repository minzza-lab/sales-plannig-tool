import type { Worksheet } from 'exceljs'

type PrintValue = (sheet: Worksheet, address: string) => string | number | Date

const escapeHtml = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')

const color = (value?: { argb?: string; indexed?: number; theme?: number; tint?: number }) => {
  if (!value) return undefined
  const indexed: Record<number, string> = { 0: '000000', 1: 'FFFFFF', 2: 'FF0000', 3: '00FF00', 4: '0000FF', 5: 'FFFF00', 6: 'FF00FF', 7: '00FFFF', 8: '000000', 9: 'FFFFFF', 22: 'C0C0C0', 23: '808080', 64: '000000' }
  const themes: Record<number, string> = { 0: 'FFFFFF', 1: '000000', 2: 'E7E6E6', 3: '44546A', 4: '5B9BD5', 5: 'ED7D31', 6: 'A5A5A5', 7: 'FFC000', 8: '4472C4', 9: '70AD47', 10: '0563C1', 11: '954F72' }
  let hex = value.argb?.slice(-6) || (value.indexed != null ? indexed[value.indexed] : undefined) || (value.theme != null ? themes[value.theme] : undefined)
  if (!hex) return undefined
  if (value.tint) hex = hex.match(/.{2}/g)!.map(part => { const n = parseInt(part, 16); const tint = value.tint!; return Math.max(0, Math.min(255, Math.round(tint < 0 ? n * (1 + tint) : n * (1 - tint) + 255 * tint))).toString(16).padStart(2, '0') }).join('')
  return `#${hex}`
}

const printValue = (value: string | number | Date, format = '') => {
  if (value instanceof Date) return `${value.getFullYear()}.${String(value.getMonth() + 1).padStart(2, '0')}.${String(value.getDate()).padStart(2, '0')}`
  if (typeof value !== 'number') return value
  if (format.includes('%')) return `${(value * 100).toLocaleString('ko-KR', { maximumFractionDigits: format.match(/\.([0#]+)/)?.[1].length || 0 })}%`
  if (value === 0 && format.includes('"-"')) return '-'
  if (/[#0]/.test(format)) {
    const decimalCount = format.split(';')[0].match(/\.([0#]+)/)?.[1].length || 0
    const amount = Math.abs(value).toLocaleString('ko-KR', { minimumFractionDigits: decimalCount, maximumFractionDigits: decimalCount })
    return value < 0 ? (format.split(';')[1]?.includes('(') ? `(${amount})` : `-${amount}`) : amount
  }
  return Number.isInteger(value) ? value.toLocaleString('ko-KR') : value.toFixed(2)
}

const columnNumber = (label: string) => [...label].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0)

export function worksheetToPrintHtml(sheet: Worksheet, resolveValue: PrintValue, maxHeightPx = 690, includeHiddenColumns = false) {
  const printArea = sheet.pageSetup.printArea?.split(',')[0]?.trim()
  const areaMatch = printArea?.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i)
  const startColumn = areaMatch ? columnNumber(areaMatch[1].toUpperCase()) : 1
  const startRow = areaMatch ? Number(areaMatch[2]) : 1
  const endColumn = areaMatch ? columnNumber(areaMatch[3].toUpperCase()) : Math.max(sheet.columnCount, 1)
  const endRow = areaMatch ? Number(areaMatch[4]) : Math.max(sheet.rowCount, 1)
  const visibleColumns = Array.from({ length: endColumn - startColumn + 1 }, (_, i) => startColumn + i).filter(column => includeHiddenColumns || !sheet.getColumn(column).hidden)
  const widths = visibleColumns.map(column => Math.max(2, sheet.getColumn(column).width || 10))
  const widthTotal = widths.reduce((sum, width) => sum + width, 0) || 1
  const colgroup = widths.map(width => `<col style="width:${(width / widthTotal * 100).toFixed(4)}%">`).join('')
  const merges = (sheet.model.merges || []).map(range => {
    const [from, to] = range.split(':')
    const a = from.match(/^([A-Z]+)(\d+)$/i)!, b = to.match(/^([A-Z]+)(\d+)$/i)!
    return { c1: columnNumber(a[1].toUpperCase()), r1: Number(a[2]), c2: columnNumber(b[1].toUpperCase()), r2: Number(b[2]) }
  }).filter(range => range.r1 >= startRow && range.r1 <= endRow && range.c1 <= endColumn && range.c2 >= startColumn)
  const htmlRows: string[] = []
  let naturalHeight = 0
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber++) {
    const row = sheet.getRow(rowNumber)
    if (row.hidden) continue
    const rowHeight = Math.max(5, (row.height || 15) * 96 / 72)
    naturalHeight += rowHeight
    const cells: string[] = []
    for (const column of visibleColumns) {
      const merge = merges.find(item => rowNumber >= item.r1 && rowNumber <= item.r2 && column >= item.c1 && column <= item.c2)
      if (merge && (rowNumber !== merge.r1 || column !== merge.c1)) continue
      const cell = row.getCell(column)
      const raw = resolveValue(sheet, cell.address)
      const value = printValue(raw, cell.numFmt)
      const style = cell.style
      const horizontal = cell.alignment?.horizontal || (typeof raw === 'number' ? 'right' : 'center')
      const css = [`text-align:${horizontal}`, `vertical-align:${cell.alignment?.vertical || 'middle'}`, 'overflow:hidden', 'white-space:nowrap', 'text-overflow:clip', 'padding:1px', `height:${rowHeight}px`]
      if (style.font?.bold) css.push('font-weight:700')
      if (style.font?.italic) css.push('font-style:italic')
      if (style.font?.size) css.push(`font-size:${style.font.size * (sheet.pageSetup.scale || 100) / 100 * 96 / 72}px`)
      if (rowNumber === 3 && sheet.name !== '기준') css.push('white-space:normal', 'overflow-wrap:anywhere', 'line-height:1.05')
      if (style.font?.name) css.push(`font-family:'${style.font.name.replaceAll("'", '')}',Arial,sans-serif`)
      const fontColor = color(style.font?.color as never)
      if (fontColor) css.push(`color:${fontColor}`)
      if (style.fill?.type === 'pattern' && style.fill.pattern === 'solid') {
        const fill = color(style.fill.fgColor as never)
        if (fill) css.push(`background-color:${fill}`)
      }
      if (rowNumber === startRow && column === startColumn) css.push('overflow:visible', 'text-overflow:clip', 'position:relative', 'z-index:2')
      const borderStyle = (side: string) => {
        const border = (style.border as Record<string, { style?: string; color?: { argb?: string; indexed?: number; theme?: number; tint?: number } } | undefined>)?.[side]
        if (!border?.style) return `${side}:none`
        const weight = border.style === 'double' ? '3px double' : border.style === 'medium' || border.style === 'thick' ? '1.5px solid' : border.style === 'hair' || border.style === 'dotted' ? '0.5px dotted' : '0.7px solid'
        return `border-${side}:${weight} ${color(border.color) || '#000'}`
      }
      css.push(borderStyle('top'), borderStyle('right'), borderStyle('bottom'), borderStyle('left'))
      const spanCols = merge ? visibleColumns.filter(item => item >= merge.c1 && item <= merge.c2).length : 1
      const spanRows = merge ? Array.from({ length: merge.r2 - merge.r1 + 1 }, (_, i) => merge.r1 + i).filter(number => !sheet.getRow(number).hidden).length : 1
      cells.push(`<td${spanCols > 1 ? ` colspan="${spanCols}"` : ''}${spanRows > 1 ? ` rowspan="${spanRows}"` : ''} style="${css.join(';')}">${escapeHtml(value)}</td>`)
    }
    htmlRows.push(`<tr style="height:${rowHeight}px">${cells.join('')}</tr>`)
  }
  const scale = Math.min(1, maxHeightPx / Math.max(1, naturalHeight))
  const scaledHeight = naturalHeight * scale
  return `<div class="sheet-fit" style="height:${scaledHeight.toFixed(2)}px"><table style="width:calc(100% / ${scale.toFixed(5)});transform:scale(${scale.toFixed(5)})"><colgroup>${colgroup}</colgroup><tbody>${htmlRows.join('')}</tbody></table></div>`
}
