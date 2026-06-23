const { exec } = require('child_process');

async function testApi() {
  const sdate = '20260504';
  const edate = '20260504';
  
  const payload = new URLSearchParams({
    p_sale_sdate: sdate,
    p_sale_edate: edate,
    p_upjang_code: '',
    p_sub_code: ''
  }).toString();

  console.log('Sending payload to portal.asp:', payload);

  try {
    const response = await fetch('https://wapi.wellihillipark.com/sub2/portal/portal.asp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: payload
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const json = await response.json();
    console.log('--- PORTAL.ASP RESPONSE ---');
    console.log(JSON.stringify(json, null, 2));
  } catch (error) {
    console.error('Error fetching portal.asp:', error);
  }

  // 2. 통계 API 테스트
  const statsPayload = new URLSearchParams({
    p_sale_sdate: '20260501',
    p_sale_edate: '20260531',
    p_upjang_code: '',
    p_sub_code: '4'
  }).toString();

  console.log('\nFetching stats from wpstat_info with payload:', statsPayload);

  try {
    const response = await fetch(`https://api.wellihillipark.com:8060/api/statistics/wpstat_info?${statsPayload}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const json = await response.json();
    console.log('--- WPSTAT_INFO RESPONSE ---');
    console.log(JSON.stringify(json, null, 2).substring(0, 2000));
  } catch (error) {
    console.error('Error fetching wpstat_info:', error);
  }
}

testApi();
