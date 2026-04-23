import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  const url = 'https://www.atrapalo.com/espectaculos';
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 5000));

  const title = await page.title();
  console.log('Title:', title);
  console.log('URL:', page.url());

  const html = await page.content();
  console.log('HTML length:', html.length);
  console.log('Head snippet:', html.slice(0, 1200));

  const selectors = ['.card', 'article', '[class*="event"]', '[class*="card"]', '[class*="product"]', '[class*="show"]'];
  for (const selector of selectors) {
    const count = await page.$$eval(selector, els => els.length);
    console.log(`${selector}: ${count}`);
    if (count > 0) {
      const first = await page.$$eval(selector, els => els[0].outerHTML.slice(0, 800));
      console.log(`First ${selector}:`, first);
      break;
    }
  }

  const cards = await page.$$eval('.card', els => els.slice(0, 3).map(el => el.innerText));
  console.log('First 3 .card innerText:', cards);
  await browser.close();
})();