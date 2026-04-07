import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const htmlPath = pathToFileURL(path.resolve(__dirname, '..', 'parapara-qr-poc.html')).href;
const CHUNK_PREFIX = 'PQR1:';

function decodeQrFromPng(buffer: Buffer): string {
  const png = PNG.sync.read(buffer);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!decoded) throw new Error('QR decode failed');
  return decoded.data;
}

test.beforeEach(async ({ page }) => {
  await page.goto(htmlPath);
});

test('初期画面表示', async ({ page }) => {
  await expect(page.getByRole('button', { name: '📁 ファイル→QR生成' })).toBeVisible();
  await expect(page.getByRole('button', { name: '🎙 録音→QR' })).toBeVisible();
});

test('QR生成（ファイル入力）', async ({ page }) => {
  await page.setInputFiles('#fileInput', {
    name: 'tiny.webm',
    mimeType: 'audio/webm',
    buffer: Buffer.from([0x11, 0x22, 0x33, 0x44, 0x55]),
  });

  const canvas = page.locator('#qrContainer canvas');
  await expect(canvas).toBeVisible();

  const png = await canvas.screenshot();
  const decoded = decodeQrFromPng(png);
  expect(decoded.startsWith('data:text/html;base64,')).toBeTruthy();
});

test('QR生成（分割QR）', async ({ page }) => {
  await page.setInputFiles('#fileInput', {
    name: 'chunked.webm',
    mimeType: 'audio/mp4',
    buffer: Buffer.alloc(12795, 0x61),
  });

  await expect(page.locator('#chunkNav')).toBeVisible();
  await expect(page.getByRole('button', { name: '▶ テスト再生' })).toBeDisabled();
  await expect(page.locator('#meta')).toContainText('分割QR');
  await expect(page.locator('#meta')).toContainText('分割QR: 8 枚');

  const first = await page.locator('#qrContainer').getAttribute('title');
  expect(first.startsWith(CHUNK_PREFIX)).toBeTruthy();

  await page.getByRole('button', { name: '次のQR →' }).click();
  const second = await page.locator('#qrContainer').getAttribute('title');
  expect(second.startsWith(CHUNK_PREFIX)).toBeTruthy();
  expect(second).not.toEqual(first);
});

test('QR生成（モック録音）', async ({ page }) => {
  await page.addInitScript(() => {
    class FakeMediaRecorder {
      static isTypeSupported(type) { return type.includes('opus'); }
      constructor(stream, options) { this.stream = stream; this.options = options; this.state = 'inactive'; this.ondataavailable = null; this.onstop = null; this.onerror = null; }
      start() {
        this.state = 'recording';
        setTimeout(() => {
          const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' });
          this.ondataavailable?.({ data: blob });
        }, 20);
      }
      stop() { this.state = 'inactive'; this.onstop?.(); }
    }

    // @ts-ignore
    window.MediaRecorder = FakeMediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
      configurable: true,
    });
  });

  await page.goto(htmlPath);
  await page.getByRole('button', { name: '🎙 録音→QR' }).click();
  const canvas = page.locator('#qrContainer canvas');
  await expect(canvas).toBeVisible();

  const decoded = decodeQrFromPng(await canvas.screenshot());
  expect(decoded.startsWith('data:text/html;base64,')).toBeTruthy();
});

test('ラウンドトリップ', async ({ page }) => {
  const sample = Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]);
  await page.setInputFiles('#fileInput', {
    name: 'a.webm',
    mimeType: 'audio/webm',
    buffer: sample,
  });

  const payload = decodeQrFromPng(await page.locator('#qrContainer canvas').screenshot());
  const outer = payload.replace('data:text/html;base64,', '');
  const html = Buffer.from(outer, 'base64').toString('utf8');
  const m = html.match(/base64,([^"]+)/);
  expect(m).not.toBeNull();
  const audio = Buffer.from(m![1], 'base64');
  expect(audio.equals(sample)).toBeTruthy();
});

test('テスト再生ボタン', async ({ page }) => {
  await page.setInputFiles('#fileInput', {
    name: 'tiny.webm', mimeType: 'audio/webm', buffer: Buffer.from([1, 2, 3]),
  });
  await page.getByRole('button', { name: '▶ テスト再生' }).click();
  const frame = page.locator('#playbackFrame');
  await expect(frame).toBeVisible();
  const src = await frame.getAttribute('src');
  expect(src?.startsWith('data:text/html;base64,')).toBeTruthy();
});

test('印刷プレビュー用HTMLを生成できる', async ({ page }) => {
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
  expect(html.match(/class="print-qr"/g)?.length).toBe(8);
  expect(html).toContain('QR 1 / 8');
});

test('サイズ超過ガード', async ({ page }) => {
  await page.setInputFiles('#fileInput', {
    name: 'big.webm', mimeType: 'audio/webm', buffer: Buffer.alloc(30000, 7),
  });
  await expect(page.locator('#errorMessage')).toContainText('ファイルが大きすぎます');
});
