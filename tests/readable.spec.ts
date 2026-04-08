import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';

const readablePath = pathToFileURL(path.resolve(__dirname, '..', 'parapara-qr-poc-readable.html')).href;

test('試作用HTMLで読み取り優先表示へ切り替えられる', async ({ page }) => {
  await page.goto(readablePath);
  await page.setInputFiles('#fileInput', {
    name: 'chunked.m4a',
    mimeType: 'audio/mp4',
    buffer: Buffer.alloc(12795, 0x61),
  });

  await expect(page.locator('#chunkNav')).toBeVisible();
  await expect(page.locator('#meta')).toContainText('レイアウト: 読み取り優先');
  await expect(page.locator('#meta')).toContainText('分割QR: 16 枚');
  await expect(page.locator('#meta')).toContainText('表示中: 1 / 8 ページ');
  await expect(page.locator('.qr-card')).toHaveCount(2);
  await expect(page.locator('.qr-label').first()).toContainText('QR 1 / 16');
});

test('試作用HTMLで全QRをまとめた印刷プレビューHTMLを生成できる', async ({ page }) => {
  await page.goto(readablePath);
  await page.evaluate(() => {
    window.__printHtml = '';
    window.open = () => {
      const stub = {
        document: {
          open() {},
          write(html) { window.__printHtml += html; },
          close() {},
        },
        focus() {},
      };
      return stub;
    };
  });

  await page.setInputFiles('#fileInput', {
    name: 'chunked.m4a',
    mimeType: 'audio/mp4',
    buffer: Buffer.alloc(12795, 0x61),
  });
  await page.getByRole('button', { name: '🖨 印刷' }).click();

  const html = await page.evaluate(() => window.__printHtml);
  expect(html).toContain('パラパラQR 音声チャンク');
  expect(html.match(/class="print-qr"/g)?.length).toBe(16);
  expect(html).toContain('QR 16 / 16');
  expect(html).toContain('decoder-qr');
  expect(html).toContain('parapara-qr-decoder.html');
});
