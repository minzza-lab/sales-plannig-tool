const puppeteer = require('puppeteer');
require('dotenv').config();
const fs = require('fs');

async function extractDOM() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  
  try {
    await page.goto('https://wadm.wellihillipark.com/login', { waitUntil: 'networkidle2' });
    const idInputs = await page.$$('input');
    if (idInputs.length >= 2) {
      await idInputs[0].type('20203029', { delay: 50 });
      await idInputs[1].type('0000', { delay: 50 });
    } else {
      await page.type('input[type="text"]', '20203029');
      await page.type('input[type="password"]', '0000');
    }
    
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, div.v-btn'));
      const loginBtn = btns.find(b => b.innerText.includes('로그인') || b.innerText.includes('Login'));
      if (loginBtn) loginBtn.click();
      else { const form = document.querySelector('form'); if(form) form.submit(); }
    });
    
    await new Promise(r => setTimeout(r, 4000));
    
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    fs.writeFileSync('admin_dom.html', html);
    console.log('DOM saved to admin_dom.html');
  } finally {
    await browser.close();
  }
}

extractDOM();
