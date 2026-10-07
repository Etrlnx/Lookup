import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto("http://localhost:5173");
await page.waitForSelector(".node-root");

async function dumpEdges(label) {
  const info = await page.evaluate(() => {
    return [...document.querySelectorAll(".edge")].map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { opacity: cs.opacity, transform: cs.transform, w: r.width, h: r.height };
    });
  });
  console.log(`--- ${label} --- edge count=${info.length}`);
  for (const i of info) console.log(JSON.stringify(i));
}

await dumpEdges("1. landing page (initial)");
await page.screenshot({ path: "shot-1-landing.png" });

// click first root bucket
await page.click(".node-root");
await page.waitForTimeout(1500); // let spring settle
await dumpEdges("2. inside bucket (category ring), settled");
await page.screenshot({ path: "shot-2-bucket.png" });

// click the center node to go back out to root/landing
await page.click(".node-center");
await page.waitForTimeout(100);
await dumpEdges("3a. just after clicking back (mid-exit)");
await page.screenshot({ path: "shot-3a-mid-exit.png" });

await page.waitForTimeout(1500); // let exit spring fully settle
await dumpEdges("3b. back at landing page, settled");
await page.screenshot({ path: "shot-3b-landing-after.png" });

console.log("console/page errors:", errors);
await browser.close();
