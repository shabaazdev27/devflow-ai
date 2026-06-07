const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    colorScheme: "dark" // Emulate system dark mode!
  });
  const page = await context.newPage();

  page.on("console", msg => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", err => console.log("PAGE ERROR:", err.message));
  
  await page.goto("http://localhost:3000");
  await page.waitForTimeout(1000); // Wait for hydration
  
  console.log("=== Initial State (System Dark Mode, App Theme Dark) ===");
  const htmlClassInitial = await page.evaluate(() => document.documentElement.className);
  console.log("HTML class:", htmlClassInitial);
  
  const h1ColorDark = await page.evaluate(() => {
    const el = document.querySelector("header h1");
    return el ? window.getComputedStyle(el).color : "Not found";
  });
  console.log("H1 text color:", h1ColorDark);

  console.log("=== Toggling App to Light Mode ===");
  const themeToggle = page.locator('button[title*="Light Mode"]');
  await themeToggle.click();
  
  await page.waitForTimeout(500);

  const htmlClassLight = await page.evaluate(() => document.documentElement.className);
  console.log("HTML class after toggle:", htmlClassLight);

  const h1ColorLight = await page.evaluate(() => {
    const el = document.querySelector("header h1");
    return el ? window.getComputedStyle(el).color : "Not found";
  });
  console.log("H1 text color in Light Mode under system dark mode:", h1ColorLight);

  const bodyBgLight = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });
  console.log("Body background color:", bodyBgLight);

  await browser.close();
})();
