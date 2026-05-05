const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
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
  const html = await page.evaluate(() => document.querySelector('tbody tr').outerHTML);
  console.log(html);
  await browser.close();
})();
