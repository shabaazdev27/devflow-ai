const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Track all stylesheet requests
  const cssContents = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.endsWith(".css") || response.headers()["content-type"]?.includes("css")) {
      try {
        const text = await response.text();
        cssContents.push({ url, text });
      } catch (e) {
        // ignore
      }
    }
  });

  await page.goto("http://localhost:3000");
  await page.waitForTimeout(1000);

  console.log(`Found ${cssContents.length} CSS files.`);
  for (const css of cssContents) {
    console.log(`\n--- CSS File: ${css.url} ---`);
    console.log("Length:", css.text.length);
    
    // Check for "@custom-variant"
    if (css.text.includes("@custom-variant")) {
      console.log("WARNING: Found unprocessed '@custom-variant' in compiled CSS!");
    } else {
      console.log("No '@custom-variant' found (processed correctly).");
    }

    // Check for prefers-color-scheme
    const countPrefers = (css.text.match(/prefers-color-scheme/g) || []).length;
    console.log(`Found ${countPrefers} instances of 'prefers-color-scheme'.`);

    // Check for dark selector compilation
    const countDarkSelector = (css.text.match(/\.dark /g) || []).length;
    console.log(`Found ${countDarkSelector} instances of '.dark' selector.`);
  }

  await browser.close();
})();
