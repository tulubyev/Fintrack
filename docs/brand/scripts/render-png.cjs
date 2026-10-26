/**
 * PNG из SVG для Expo (иконка, adaptive icon, сплэш) и веба (apple-touch-icon, PWA).
 * Запуск из папки brand: node scripts/render-png.cjs  (нужен playwright с chromium)
 */
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const B = path.join(__dirname, "..");
const jobs = [
  // [svg, png, size, прозрачный фон]
  ["app-icon/android/ic_launcher_foreground.svg", "app-icon/png/adaptive-foreground-1024.png", 1024, true],
  ["app-icon/android/ic_launcher_background.svg", "app-icon/png/adaptive-background-1024.png", 1024, false],
  ["app-icon/android/ic_launcher_monochrome.svg", "app-icon/png/adaptive-monochrome-1024.png", 1024, true],
  ["app-icon/pwa-maskable-512.svg", "app-icon/png/icon-1024.png", 1024, false],
  ["app-icon/splash-icon-light.svg", "app-icon/png/splash-icon-light-1024.png", 1024, true],
  ["app-icon/splash-icon-dark.svg", "app-icon/png/splash-icon-dark-1024.png", 1024, true],
  ["app-icon/pwa-maskable-512.svg", "app-icon/png/pwa-maskable-512.png", 512, false],
  ["app-icon/pwa-maskable-512.svg", "app-icon/png/pwa-192.png", 192, false],
  ["app-icon/pwa-maskable-512.svg", "app-icon/png/apple-touch-icon-180.png", 180, false],
];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  fs.mkdirSync(path.join(B, "app-icon/png"), { recursive: true });
  for (const [svg, png, size, transparent] of jobs) {
    const data = Buffer.from(fs.readFileSync(path.join(B, svg))).toString("base64");
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${data}" style="width:${size}px;height:${size}px;display:block"></body></html>`);
    await page.screenshot({ path: path.join(B, png), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
    console.log(png);
  }
  await browser.close();
})();
