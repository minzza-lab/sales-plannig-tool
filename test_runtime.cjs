const puppeteer = require('puppeteer');
require('dotenv').config();

async function check() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('BROWSER ERROR:', msg.text());
  });
  page.on('pageerror', error => console.log('PAGE CRASH ERROR:', error.message));

  console.log("Navigating...");
  try {
    await page.goto('http://localhost:5173');
    await page.waitForSelector('input[type="text"]', { timeout: 5000 });
    await page.type('input[type="text"]', process.env.WADM_ID);
    await page.type('input[type="password"]', process.env.WADM_PW);
    await page.click('button[type="submit"]');
    
    // Wait for dashboard to load or error
    await new Promise(r => setTimeout(r, 4000));
    
  } catch(e) {
    console.error("Script error:", e);
  }
  await browser.close();
}
check();
