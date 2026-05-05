const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.goto('https://wadm.wellihillipark.com/login', { waitUntil: 'networkidle2' });
  
  await page.type('input[type="text"]', '20203029', { delay: 50 });
  await page.type('input[type="password"]', '0000', { delay: 50 });
  
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, div.v-btn'));
    const loginBtn = btns.find(b => b.innerText.includes('로그인') || b.innerText.includes('Login'));
    if (loginBtn) loginBtn.click();
    else document.querySelector('form').submit();
  });
  
  await new Promise(r => setTimeout(r, 4000));
  
  await page.goto('https://wadm.wellihillipark.com/customer/inquiry/edit?seq=13746', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  
  const html = await page.evaluate(() => document.body.innerHTML);
  fs.writeFileSync('detail_dom.html', html);
  
  console.log('Saved DOM to detail_dom.html');
  await browser.close();
})();
