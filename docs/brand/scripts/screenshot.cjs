/** Скриншот превью: node scripts/screenshot.cjs [ширина]  → brand-preview.png (полная страница) */
const path = require("path");
const { chromium } = require("playwright");
const B = path.join(__dirname, "..");
const width = Number(process.argv[2] || 1280);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(B, "brand-preview.html"), { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(B, width < 600 ? "brand-preview-mobile.png" : "brand-preview.png");
  await page.screenshot({ path: out, fullPage: true });
  const fontOk = await page.evaluate(() => document.fonts.check("16px Onest"));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(out, "Onest загружен:", fontOk, "горизонтальный перелив:", overflow);
  await browser.close();
})();
