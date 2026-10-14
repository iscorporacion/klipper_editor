const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const widgets = Array.from({ length: 12 }, (_, index) => ({ id: `custom-macros:spacing-${index}`, title: `Group ${index}`, buttons: [] }));
  const values = {
    'ratos-viewer-locale': 'es', 'klipper-editor-home-widgets': JSON.stringify(widgets.map((item) => item.id)),
    'klipper-editor-custom-macro-widgets': JSON.stringify(widgets),
    'klipper-editor-home-grid-layout': JSON.stringify({ columns: { desktop: 3, tablet: 2, mobile: 1 } })
  };
  await context.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    let data = {};
    if (pathname === '/api/preferences') data = { id: 'spacing-test', values };
    else if (pathname === '/api/tree') data = { root: 'test', children: [] };
    else if (pathname === '/api/macros') data = { macros: [] };
    else if (pathname === '/api/printer/status') data = { webhooksState: 'ready', printState: 'standby', printing: false };
    await route.fulfill({ json: data });
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto(process.env.TEST_URL || 'http://localhost:3023', { timeout: 90000 });
  await page.getByRole('heading', { name: 'Group 11', exact: true }).waitFor();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 500 });
    await page.waitForTimeout(150);
    await page.locator('.home-widgets-scroll').evaluate((grid) => { grid.scrollTop = grid.scrollHeight; });
    const dimensions = await page.evaluate(() => {
      const grid = document.querySelector('.home-widgets-scroll');
      const footer = document.querySelector('.statusbar').getBoundingClientRect();
      const lastBottom = Math.max(...[...document.querySelectorAll('.home-grid-column')].map((column) => column.querySelector('.home-widget:last-of-type')?.getBoundingClientRect().bottom ?? 0));
      return { gap: footer.top - lastBottom, gridBottom: grid.getBoundingClientRect().bottom, footerTop: footer.top, scrollHeight: grid.scrollHeight, clientHeight: grid.clientHeight };
    });
    console.log(width, dimensions);
    assert.ok(dimensions.scrollHeight > dimensions.clientHeight, 'Fixture must overflow');
    assert.ok(dimensions.gap >= 32, `Widgets need bottom spacing at ${width}px; got ${dimensions.gap}`);
    assert.ok(dimensions.gridBottom <= dimensions.footerTop + 1, 'Widget scroller must stay above status bar');
  }
  console.log('OK: bottom spacing at maximum scroll on desktop and mobile');
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
