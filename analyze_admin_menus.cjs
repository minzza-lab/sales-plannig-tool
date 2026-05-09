const puppeteer = require('puppeteer');
require('dotenv').config();

async function analyzeMenus() {
  console.log('🔍 웰리힐리 파크 관리자 메뉴 분석 시작...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  // Set viewport to a wide screen to ensure menu is fully visible
  await page.setViewport({ width: 1920, height: 1080 });
  
  try {
    console.log('1. 로그인 진행 중...');
    await page.goto('https://wadm.wellihillipark.com/login', { waitUntil: 'networkidle2' });
    
    const idInputs = await page.$$('input');
    if (idInputs.length >= 2) {
      await idInputs[0].type('20203029', { delay: 50 });
      await idInputs[1].type('0000', { delay: 50 });
    } else {
      await page.type('input[type="text"]', '20203029', { delay: 50 });
      await page.type('input[type="password"]', '0000', { delay: 50 });
    }
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn'));
      const loginBtn = btns.find(b => b.innerText.includes('로그인') || b.innerText.includes('Login'));
      if (loginBtn) {
        loginBtn.click();
      } else {
        const form = document.querySelector('form');
        if (form) form.submit();
      }
    });
    
    await new Promise(r => setTimeout(r, 4000));
    console.log('2. 로그인 완료. 메인 화면 캡처 중...');
    await page.screenshot({ path: 'admin_main.png' });

    console.log('3. 좌측 메뉴 DOM 구조 분석 중...');
    const menus = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button, .v-list-item, .v-list-group__header'));
      return links.map(l => ({
        text: l.innerText.trim().replace(/\n/g, ' '),
        href: l.href || 'no-href',
        className: l.className
      })).filter(l => l.text.length > 0);
    });
    
    // Write menu structure to a file
    const fs = require('fs');
    fs.writeFileSync('admin_menus.json', JSON.stringify(menus, null, 2));
    console.log('전체 메뉴 텍스트를 admin_menus.json에 저장했습니다.');

    // Look for target menus
    const targetKeywords = ['패키지', '시즌권', '주문', '상품'];
    const foundMenus = menus.filter(m => targetKeywords.some(k => m.text.includes(k)));
    console.log('\n[관심 메뉴 검색 결과]');
    foundMenus.forEach(m => console.log(`- ${m.text} (${m.href})`));

    // Try to navigate to "상품관리" or "주문관리" if there's a valid link in href
    // Sometimes it's a dropdown, so we might need to click it.
    // To keep it simple, we will just output the URLs and I will run a second script if needed.

  } catch (err) {
    console.error('분석 중 에러 발생:', err);
  } finally {
    await browser.close();
  }
}

analyzeMenus();
