async function testSubApi() {
  const payload = new URLSearchParams({
    p_sale_sdate: '20260504',
    p_sale_edate: '20260504',
    p_upjang_code: 'WB01', // 매표소 업장코드
    p_sub_code: '1' // 상세 상품용 서브코드
  }).toString();

  try {
    const response = await fetch('https://wapi.wellihillipark.com/sub2/portal/portal.asp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0'
      },
      body: payload
    });

    const json = await response.json();
    console.log('--- DETAILED ITEM LIST (WB01) ---');
    console.log(JSON.stringify(json, null, 2).substring(0, 1500));
  } catch (error) {
    console.error('Error fetching detailed API:', error);
  }
}

testSubApi();
