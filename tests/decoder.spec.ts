import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';

const decoderPath = pathToFileURL(path.resolve(__dirname, '..', 'parapara-qr-decoder.html')).href;

function buildPayload(audioBytes: number[]) {
  const binary = Buffer.from(audioBytes).toString('base64');
  const html = `<audio controls autoplay src="data:audio/webm;base64,${binary}"></audio>`;
  return `data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`;
}

test.beforeEach(async ({ page }) => {
  await page.goto(decoderPath);
});

test('手動貼り付けで payload を復元できる', async ({ page }) => {
  const payload = buildPayload([1, 2, 3, 4, 5]);
  await page.locator('#payloadInput').fill(payload);
  await page.getByRole('button', { name: '貼り付けたpayloadを復元する' }).click();

  await expect(page.locator('#previewFrame')).toBeVisible();
  await expect(page.locator('#audioPlayer')).toBeVisible();
  await expect(page.locator('#downloadLink')).toBeVisible();

  const src = await page.locator('#audioPlayer').getAttribute('src');
  expect(src?.startsWith('data:audio/webm;base64,')).toBeTruthy();
});
