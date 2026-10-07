export const NAVER_VAT_CATEGORIES = ['콘도객실','히든힐스','리프트(히든힐스)','장비렌탈(히든힐스)','강습(히든힐스)','취소위약금','카바나','워터파크']

export type NaverFeeTotal = { date: string; category: string; supply: number; tax: number; total: number; count: number }
export type NaverFeeDetail = { date: string; product: string; order: unknown; productOrder: unknown; npayFee: number; salesFee: number; installmentFee: number; total: number; category: string }

export async function buildNaverVatStep3Workbook(input: {
  template: ArrayBuffer
  month: string
  dates: string[]
  totals: NaverFeeTotal[]
  details: NaverFeeDetail[]
}): Promise<Uint8Array> {
  const ExcelJS = await import('exceljs')
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(input.template)
  book.creator = 'WELLIHILLI Sales Planning'
  book.calcProperties.fullCalcOnLoad = true

  const summary = book.getWorksheet('8월')
  if (!summary) throw new Error('수수료 내역 양식의 월별 시트를 찾지 못했습니다.')
  summary.name = `${Number(input.month.slice(5, 7))}월 수수료`
  const categories = [...NAVER_VAT_CATEGORIES, ...Array.from({ length: 8 }, () => '')]
  const firstDateRow = 5
  let totalRow = 28
  while (input.dates.length > totalRow - firstDateRow) {
    const sourceRow = summary.getRow(totalRow - 1)
    summary.insertRow(totalRow, [])
    const inserted = summary.getRow(totalRow)
    for (let column = 1; column <= 52; column++) inserted.getCell(column).style = structuredClone(sourceRow.getCell(column).style)
    inserted.height = sourceRow.height
    totalRow++
  }
  const lastDateRow = totalRow - 1
  const totalsByKey = new Map(input.totals.map(item => [`${item.date}\u0000${item.category}`, item]))
  const activeCategories = new Set(input.totals.filter(item => item.total > 0).map(item => item.category))

  for (let row = 1; row <= 4; row++) for (let column = 1; column <= 52; column++) summary.getCell(row, column).value = null
  summary.getCell('A1').value = `■ ${input.month.slice(0, 4)}년 ${Number(input.month.slice(5, 7))}월 온라인 상품 판매 수수료 내역_네이버`
  summary.getCell('AX2').value = '(단위 : 원)'
  summary.getCell('A3').value = '구분'
  categories.forEach((category, index) => {
    const start = 2 + index * 3
    summary.getCell(3, start).value = category || ''
    summary.getCell(4, start).value = '공급가액'
    summary.getCell(4, start + 1).value = '세액'
    summary.getCell(4, start + 2).value = '소계'
    for (let offset = 0; offset < 3; offset++) {
      const column = summary.getColumn(start + offset)
      const visible = Boolean(category && activeCategories.has(category))
      column.hidden = !visible
      if (visible) column.width = 10.625
    }
  })
  summary.getCell('AX3').value = '총계'
  summary.getCell('AX4').value = '공급가액'
  summary.getCell('AY4').value = '세액'
  summary.getCell('AZ4').value = '소계'

  for (let rowNumber = firstDateRow; rowNumber <= lastDateRow; rowNumber++) {
    const date = input.dates[rowNumber - firstDateRow]
    summary.getRow(rowNumber).hidden = !date
    summary.getCell(rowNumber, 1).value = date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : null
    categories.forEach((category, index) => {
      const start = 2 + index * 3
      const item = date && category ? totalsByKey.get(`${date}\u0000${category}`) : undefined
      const subtotal = item?.total ?? 0
      const supplyCell = summary.getCell(rowNumber, start)
      const taxCell = summary.getCell(rowNumber, start + 1)
      if (index < NAVER_VAT_CATEGORIES.length) {
        const subtotalLetter = summary.getColumn(start + 2).letter
        const supplyLetter = summary.getColumn(start).letter
        const roundSupply = [1, 5, 6, 7].includes(index)
        supplyCell.value = { formula: roundSupply ? `ROUND(${subtotalLetter}${rowNumber}/1.1,0)` : `${subtotalLetter}${rowNumber}/1.1` }
        taxCell.value = { formula: `${subtotalLetter}${rowNumber}-${supplyLetter}${rowNumber}` }
      }
      summary.getCell(rowNumber, start + 2).value = subtotal
    })
  }

  for (let index = 0; index < 16; index++) {
    const start = 2 + index * 3
    for (let offset = 0; offset < 3; offset++) {
      const letter = summary.getColumn(start + offset).letter
      summary.getCell(totalRow, start + offset).value = { formula: `SUM(${letter}${firstDateRow}:${letter}${lastDateRow})` }
    }
  }
  summary.getCell(totalRow, 1).value = '합 계'
  const supplyLetters = Array.from({ length: 16 }, (_, index) => summary.getColumn(2 + index * 3).letter)
  const taxLetters = Array.from({ length: 16 }, (_, index) => summary.getColumn(3 + index * 3).letter)
  for (let index = 0; index < input.dates.length; index++) {
    const rowNumber = firstDateRow + index
    summary.getCell(rowNumber, 50).value = { formula: `SUM(${supplyLetters.map(letter => `${letter}${rowNumber}`).join(',')})` }
    summary.getCell(rowNumber, 51).value = { formula: `SUM(${taxLetters.map(letter => `${letter}${rowNumber}`).join(',')})` }
    summary.getCell(rowNumber, 52).value = { formula: `ROUND(SUM(AX${rowNumber}:AY${rowNumber}),1)` }
  }
  summary.getCell(totalRow, 50).value = { formula: `SUM(AX${firstDateRow}:AX${lastDateRow})` }
  summary.getCell(totalRow, 51).value = { formula: `SUM(AY${firstDateRow}:AY${lastDateRow})` }
  summary.getCell(totalRow, 52).value = { formula: `ROUNDDOWN(SUM(AZ${firstDateRow}:AZ${lastDateRow}),0)` }
  summary.pageSetup.printArea = `A1:AZ${totalRow}`
  summary.pageSetup.fitToPage = true
  summary.pageSetup.fitToWidth = 1
  summary.pageSetup.fitToHeight = 0

  const border = { top: { style: 'thin' as const, color: { argb: 'FF000000' } }, bottom: { style: 'hair' as const, color: { argb: 'FF000000' } }, left: { style: 'hair' as const, color: { argb: 'FF000000' } }, right: { style: 'hair' as const, color: { argb: 'FF000000' } } }
  const copyStyle = (target: any, source: any) => { target.style = structuredClone(source.style) }
  const byDate = new Map<string, NaverFeeDetail[]>()
  input.details.forEach(detail => byDate.set(detail.date, [...(byDate.get(detail.date) || []), detail]))
  for (const [date, items] of byDate) {
    const sheet = book.addWorksheet(date.slice(5).replace('-', '.'))
    sheet.mergeCells(1, 1, 1, 8)
    sheet.getCell(1, 1).value = `■ ${input.month.slice(0, 4)}년 ${Number(input.month.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 수수료 상세`
    copyStyle(sheet.getCell(1, 1), summary.getCell('A1'))
    sheet.getCell(1, 1).alignment = { vertical: 'middle', horizontal: 'left' }
    sheet.getRow(1).height = 24.75
    sheet.addRow(['원본 상품명', '주문번호', '상품주문번호', 'Npay 수수료', '매출연동 수수료', '무이자할부 수수료', '수수료 합계', '월별표 구분'])
    for (let column = 1; column <= 8; column++) copyStyle(sheet.getCell(2, column), summary.getCell(3, 2))
    items.forEach(detail => sheet.addRow([detail.product, detail.order, detail.productOrder, detail.npayFee, detail.salesFee, detail.installmentFee, detail.total, detail.category]))
    const detailEnd = sheet.rowCount
    for (let row = 3; row <= detailEnd; row++) {
      for (let column = 1; column <= 8; column++) {
        const cell = sheet.getCell(row, column)
        cell.font = structuredClone(summary.getCell('A5').font)
        cell.border = structuredClone(border)
        cell.alignment = { vertical: 'middle', horizontal: column >= 4 && column <= 7 ? 'right' : column === 1 || column === 8 ? 'left' : 'center' }
      }
      sheet.getRow(row).height = 19.5
    }
    const titleRow = sheet.rowCount + 1
    sheet.addRow(['월별표 구분 합계', '', '', '', '', '', '', ''])
    for (let column = 1; column <= 8; column++) copyStyle(sheet.getCell(titleRow, column), summary.getCell(totalRow, 1))
    input.totals.filter(item => item.date === date).forEach(item => {
      const outputRow = sheet.addRow([item.category, '', '', '', '', '', item.total, ''])
      for (let column = 1; column <= 8; column++) {
        copyStyle(outputRow.getCell(column), summary.getCell(totalRow, 1))
        outputRow.getCell(column).border = structuredClone(border)
      }
    })
    sheet.views = [{ state: 'frozen', ySplit: 2 }]
    sheet.columns.forEach((column, index) => { column.width = [36, 20, 22, 19, 21, 21, 16, 24][index] || 14 })
    for (let row = 3; row <= detailEnd; row++) for (let column = 4; column <= 7; column++) sheet.getCell(row, column).numFmt = '#,##0;[Red]-#,##0;"-"'
    for (let row = titleRow + 1; row <= sheet.rowCount; row++) sheet.getCell(row, 7).numFmt = '#,##0;[Red]-#,##0;"-"'
    sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, printArea: `A1:H${sheet.rowCount}` }
  }
  return new Uint8Array(await book.xlsx.writeBuffer())
}
