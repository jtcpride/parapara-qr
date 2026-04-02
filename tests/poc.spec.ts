import { test, expect } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const htmlPath = pathToFileURL(path.resolve(__dirname, '..', 'parapara-qr-poc.html')).href;
const CHUNK_PREFIX = 'PQR1:';

function buildStereoSpeechLikeWav() {
  const sampleRate = 16000;
  const silenceFrames = Math.floor(sampleRate * 0.08);
  const voiceFrames = Math.floor(sampleRate * 0.12);
  const totalFrames = silenceFrames * 2 + voiceFrames;
  const channelCount = 2;
  const bitsPerSample = 16;
  const blockAlign = channelCount * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + totalFrames * blockAlign);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + totalFrames * blockAlign, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(totalFrames * blockAlign, 40);

  for (let frame = 0; frame < totalFrames; frame += 1) {
    const inVoice = frame >= silenceFrames && frame < silenceFrames + voiceFrames;
    const t = (frame - silenceFrames) / sampleRate;
    const left = inVoice ? Math.sin(2 * Math.PI * 440 * t) * 0.2 : 0;
    const right = inVoice ? Math.sin(2 * Math.PI * 660 * t) * 0.18 : 0;
    buffer.writeInt16LE(Math.round(left * 0x7fff), 44 + frame * blockAlign);
    buffer.writeInt16LE(Math.round(right * 0x7fff), 44 + frame * blockAlign + 2);
  }

  return buffer;
}

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

test('サイズ超過ガード', async ({ page }) => {
  await page.setInputFiles('#fileInput', {
    name: 'big.webm', mimeType: 'audio/webm', buffer: Buffer.alloc(30000, 7),
  });
  await expect(page.locator('#errorMessage')).toContainText('ファイルが大きすぎます');
});

test('研究版の WAV 軽量化で QR 枚数を減らせる', async ({ page }) => {
  const source = buildStereoSpeechLikeWav();

  await page.setInputFiles('#fileInput', {
    name: 'voice.wav',
    mimeType: 'audio/wav',
    buffer: source,
  });
  await expect(page.locator('#meta')).toContainText('分割QR');
  const originalMeta = await page.locator('#meta').textContent();
  const originalMatch = originalMeta?.match(/分割QR: (\d+) 枚/);
  expect(originalMatch).not.toBeNull();
  const originalCount = Number(originalMatch?.[1]);

  await page.getByRole('button', { name: '← やり直し' }).click();
  await page.selectOption('#compressionMode', 'wav-voice');
  await page.setInputFiles('#fileInput', {
    name: 'voice.wav',
    mimeType: 'audio/wav',
    buffer: source,
  });

  await expect(page.locator('#meta')).toContainText('前処理: WAV軽量化を適用');
  await expect(page.locator('#meta')).toContainText('QR比較:');

  const optimizedMeta = await page.locator('#meta').textContent();
  const optimizedChunkMatch = optimizedMeta?.match(/分割QR: (\d+) 枚/);
  const optimizedCount = optimizedChunkMatch ? Number(optimizedChunkMatch[1]) : 1;
  expect(optimizedCount).toBeLessThan(originalCount);
});
