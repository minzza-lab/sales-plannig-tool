import assert from 'node:assert/strict'
import test from 'node:test'
import { allowedHosts, judgeDirectText, lookupCoupon, parseTicketDetails, validateLookupUrl } from './coupon-status.ts'

test('URL allowlist blocks localhost, private/direct IP, and unapproved domains', () => {
  const hosts = allowedHosts({})
  assert.equal(validateLookupUrl('https://tket.me/abc', hosts).hostname, 'tket.me')
  for (const url of ['http://localhost/test', 'http://127.0.0.1/test', 'http://10.0.0.1/test', 'https://example.com/test', 'file:///etc/passwd']) {
    assert.throws(() => validateLookupUrl(url, hosts))
  }
})

test('direct wording rules prioritize invalid and used states', () => {
  assert.equal(judgeDirectText('<p>사용 완료</p>').status, 'used')
  assert.equal(judgeDirectText('<p>사용 가능</p>').status, 'unused')
  assert.equal(judgeDirectText('<p>유효하지 않은 쿠폰</p>').status, 'error')
  assert.equal(judgeDirectText('<p>환영합니다</p>').status, 'error')
})

test('TicketChannel response extracts barcode details', () => {
  assert.deepEqual(parseTicketDetails({ data: { mobileTicketList: [{ barcode: 'A100', barcode_name: '리프트권', barcode_use_yn: 'Y' }] } }), [
    { barcode: 'A100', productName: '리프트권', used: true },
  ])
})

test('reservedMainRsInfo uses ALL_TICKET and parses API response', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.startsWith('https://tket.me/')) return new Response(null, { status: 302, headers: { location: 'https://www.ticketchannelmanager.com/mobile?command=reservedMainRsInfo&rsNo=7' } })
    if (!init?.method || init.method === 'GET') return new Response("<script>const x={mainRsSeqInspect:'7',prodSeq:'37884',rs_chk:'CHECK7'}</script>", { status: 200 })
    return Response.json({ mobileTicketList: [{ barcode: 'B7', barcode_name: '스노우파크', barcode_use_yn: 'N' }] })
  }) as typeof fetch
  const result = await lookupCoupon({ url: 'https://tket.me/sample', barcode: 'B7', mode: 'api' }, {})
  assert.equal(result.method, 'API')
  assert.equal(result.status, 'unused')
  assert.match(String(calls.at(-1)?.init?.body), /callType=ALL_TICKET/)
  assert.match(String(calls.at(-1)?.init?.body), /mainRsSeqInspect=7/)
  assert.match(String(calls.at(-1)?.init?.body), /command=getConfirmedMobileTicketInfo/)
})

test('ordinary confirmation URL uses ONE_TICKET', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const bodies: string[] = []
  let calls = 0
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    calls += 1
    if (init?.method === 'POST') {
      bodies.push(String(init.body))
      if (String(init.body).includes('command=rsConfirmRdList')) return Response.json({ list: [{ rs_seq_inspect: 'S1', rs_status_cd: 'C' }] })
      return Response.json({ mobileTicketList: [{ barcode: 'ONE1', barcode_name: '예약권', barcode_use_yn: 'Y' }] })
    }
    return new Response("<script>const x={mainRsSeqInspect:'1',prodSeq:'2',rs_chk:'C1'}</script>", { status: 200 })
  }) as typeof fetch
  const result = await lookupCoupon({ url: 'https://www.ticketchannelmanager.com/mobile?reservation=1', barcode: 'ONE1', mode: 'api' }, {})
  assert.equal(result.status, 'used')
  assert.equal(calls, 3)
  assert.match(bodies[1], /callType=ONE_TICKET/)
  assert.match(bodies[1], /rsSeqInspect=S1/)
})

test('multiple mobile-ticket buttons are all queried and combined', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') return new Response("<script>const x={mainRsSeqInspect:'11',prodSeq:'22',rs_chk:'CC'}</script>")
    const body = String(init.body)
    if (body.includes('command=rsConfirmRdList')) return Response.json({ list: [
      { rs_seq_inspect: 'DAY1', rs_status_cd: 'C' },
      { rs_seq_inspect: 'DAY2', rs_status_cd: 'C' },
    ] })
    const suffix = body.includes('DAY1') ? '1' : '2'
    return Response.json({ mobileTicketList: [{ barcode: `T${suffix}`, barcode_name: `티켓${suffix}`, barcode_use_yn: suffix === '1' ? 'Y' : 'N' }] })
  }) as typeof fetch
  const result = await lookupCoupon({ url: 'https://www.ticketchannelmanager.com/rsInfo.do?command=reservedConfirmMainRsInfo&rs_seq=11&rs_chk=CC', barcode: '', mode: 'api' }, {})
  assert.equal(result.details.length, 2)
  assert.deepEqual(result.details.map((detail) => detail.barcode), ['T1', 'T2'])
})

test('auto mode falls back to direct wording when API is incomplete', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let ticketCalls = 0
  globalThis.fetch = (async () => {
    ticketCalls += 1
    if (ticketCalls === 1) return new Response(null, { status: 302, headers: { location: 'https://www.ticketchannelmanager.com/mobile?id=9' } })
    if (ticketCalls === 2) return new Response("<script>const x={mainRsSeqInspect:'9',prodSeq:'2',rs_chk:'C9'}</script>", { status: 200 })
    if (ticketCalls === 3) return Response.json({ list: [{ rs_seq_inspect: 'A9', rs_status_cd: 'C' }] })
    if (ticketCalls === 4) return Response.json({ mobileTicketList: [] })
    return new Response('<p>쿠폰번호 C9 사용 가능</p>', { status: 200 })
  }) as typeof fetch
  const result = await lookupCoupon({ url: 'https://tket.me/auto', barcode: 'C9', mode: 'auto' }, {})
  assert.equal(result.method, 'URL 직접조회')
  assert.equal(result.status, 'unused')
  assert.match(result.reason, /API 조회 불가 후/)
})

test('redirect to unapproved host is blocked', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = (async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } })) as typeof fetch
  await assert.rejects(() => lookupCoupon({ url: 'https://tket.me/escape', barcode: '', mode: 'url' }, {}), /IP 주소|내부망/)
})
