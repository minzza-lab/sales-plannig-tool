type ReferenceResult = { url: string; title: string; description: string; text: string }

const blockedHost = (host: string) => {
  const value = host.toLowerCase()
  if (value === 'localhost' || value.endsWith('.local') || value === '::1') return true
  if (/^(0|10|127)\.|^192\.168\.|^169\.254\./.test(value)) return true
  const private172 = /^172\.(\d+)\./.exec(value)
  return Boolean(private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31)
}

const htmlText = (html: string) => html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/\s+/g, ' ')
  .trim()

async function readPage(input: string): Promise<ReferenceResult> {
  let url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol) || blockedHost(url.hostname)) throw new Error('공개 http/https 웹사이트 주소만 참고할 수 있습니다.')
  let response: Response | null = null
  for (let index = 0; index < 3; index += 1) {
    response = await fetch(url.toString(), { redirect: 'manual', headers: { 'User-Agent': 'SalesPlanningReferenceBot/1.0' } })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    if (!location) break
    url = new URL(location, url)
    if (!['http:', 'https:'].includes(url.protocol) || blockedHost(url.hostname)) throw new Error('안전하지 않은 이동 주소는 참고할 수 없습니다.')
  }
  if (!response?.ok) throw new Error(`페이지를 불러오지 못했습니다. (${response?.status || '연결 오류'})`)
  if (!response.headers.get('content-type')?.includes('text/html')) throw new Error('HTML 웹페이지 주소만 참고할 수 있습니다.')
  const html = (await response.text()).slice(0, 180000)
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ? htmlText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]).slice(0, 180) : ''
  const description = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/i)?.[1] || ''
  return { url: url.toString(), title, description: htmlText(description).slice(0, 500), text: htmlText(html).slice(0, 6000) }
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  try {
    const { url } = await request.json() as { url?: string }
    if (!url?.trim()) throw new Error('웹사이트 주소를 입력해주세요.')
    return Response.json(await readPage(url.trim()))
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '페이지를 참고하지 못했습니다.' }, { status: 400 })
  }
}
