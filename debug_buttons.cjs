const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto('https://wadm.wellihillipark.com/login', { waitUntil: 'networkidle2' });
  
  await page.type('input[type="text"]', '20203029', { delay: 50 });
  await page.type('input[type="password"]', '0000', { delay: 50 });
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, div.v-btn'));
    const loginBtn = btns.find(b => b.innerText.includes('로그인') || b.innerText.includes('Login'));
    if (loginBtn) loginBtn.click();
    else { const form = document.querySelector('form'); if(form) form.submit(); }
  });
  await new Promise(r => setTimeout(r, 4000));
  
  await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    const orderMenu = elements.find(el => el.textContent && el.textContent.trim() === '주문관리' && el.children.length === 0);
    if (orderMenu) orderMenu.click();
  });
  await new Promise(r => setTimeout(r, 1500));
  
  await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    const seasonMenu = elements.find(el => el.textContent && el.textContent.trim() === '시즌권 주문관리' && el.children.length === 0);
    if (seasonMenu) seasonMenu.click();
  });
  await new Promise(r => setTimeout(r, 5000));
  
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, .v-btn, .btn, span')).map(b => b.innerText ? b.innerText.trim() : '').filter(t => t);
  });
  
  console.log('Available Texts:', buttons.join(' | '));
  await browser.close();
})();
