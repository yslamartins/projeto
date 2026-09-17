import path from 'path';
import { launchManagedChrome } from '../src/lib/scanner/chrome-launcher';
import { installAntiDetect } from '../src/lib/scanner/browser-context';

(async () => {
  const { context, dispose } = await launchManagedChrome({
    userDataDir: path.resolve('.probe_profile'),
    headless: true,
  });
  await installAntiDetect(context);
  await context.addInitScript(() => {
    (window as unknown as { __marker?: number }).__marker = 42;
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  const result = await page.evaluate(() => ({
    webdriver: (navigator as unknown as { webdriver?: unknown }).webdriver,
    marker: (window as unknown as { __marker?: number }).__marker,
    hasChrome: Boolean((window as unknown as { chrome?: unknown }).chrome),
  }));
  console.log('result =', JSON.stringify(result), '| pages =', context.pages().length, '| url =', page.url());
  await dispose();
  console.log('disposed OK');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
