import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

// hover the 上海 li
const li = page.locator(".destination-index li").first();
await li.hover();
await page.waitForTimeout(400);

const info = await page.evaluate(() => {
  const first = document.querySelector(".destination-index li");
  if (!first) return null;
  const cs = getComputedStyle(first, "::before");
  const csA = getComputedStyle(first, "::after");
  return {
    beforeContent: cs.content?.slice(0, 80),
    beforeOpacity: cs.opacity,
    afterContent: csA.content?.slice(0, 80),
    afterOpacity: csA.opacity,
    afterWH: `${csA.width}x${csA.height}`,
    tooltipUrl: first.getAttribute("data-tooltip"),
  };
});
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: "D:/my_project/travel-assistant_web/frontend/_shots/hover-test.png", fullPage: true });
await browser.close();
