const puppeteer = require('puppeteer');

async function test() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  try {
    await page.goto('https://wadm.wellihillipark.com/login', { waitUntil: 'networkidle2' });
    const idInputs = await page.$$('input');
    if (idInputs.length >= 2) {
      await idInputs[0].type('20203029');
      await idInputs[1].type('0000');
    } else {
      await page.type('input[type="text"]', '20203029');
      await page.type('input[type="password"]', '0000');
    }
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn'));
      const loginBtn = btns.find(b => b.innerText.includes('로그인') || b.innerText.includes('Login'));
      if (loginBtn) loginBtn.click();
      else document.querySelector('form').submit();
    });
    
    await new Promise(r => setTimeout(r, 4000));
    await page.goto('https://wadm.wellihillipark.com/customer/inquiry/list', { waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 3000));
    
    const elements = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button, div, span'));
      return links.filter(el => {
        const text = el.innerText.trim();
        return (text === '2' || text === '3' || text === '다음' || text === 'Next' || text === '▶' || text === '>');
      }).map(el => {
        return {
          tag: el.tagName,
          className: el.className,
          text: el.innerText.trim(),
          html: el.outerHTML
        };
      });
    });
    
    console.log('--- PAGINATION ELEMENTS ---');
    console.log(JSON.stringify(elements, null, 2));
    
  } finally {
    await browser.close();
  }
}
test();
