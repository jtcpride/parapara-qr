import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';

const decoderPath = pathToFileURL(path.resolve(__dirname, '..', 'parapara-qr-decoder.html')).href;
const entryPath = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const CHUNK_PREFIX = 'PQR1';
const MAX_CHUNK_PAYLOAD_BYTES = 2200;

function buildWavBytes() {
  const sampleRate = 8000;
  const samples = 800;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t) * 0.25;
    buffer.writeInt16LE(Math.round(sample * 0x7fff), 44 + i * 2);
  }
  return buffer;
}

function buildPayload(audioBytes: Buffer, mimeType = 'audio/wav') {
  const binary = audioBytes.toString('base64');
  const html = `<audio controls autoplay src="data:${mimeType};base64,${binary}"></audio>`;
  return `data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`;
}

function buildChunkPayloads(audioBytes: Buffer, mimeType = 'audio/wav') {
  const audioB64 = audioBytes.toString('base64');
  let total = 1;
  while (true) {
    const headerLength = `${CHUNK_PREFIX}:${total}:${total}:${mimeType}:`.length;
    const chunkSize = MAX_CHUNK_PAYLOAD_BYTES - headerLength;
    const nextTotal = Math.ceil(audioB64.length / chunkSize);
    if (nextTotal === total) {
      const chunks = [];
      for (let index = 1, start = 0; index <= total; index += 1, start += chunkSize) {
        chunks.push(`${CHUNK_PREFIX}:${index}:${total}:${mimeType}:${audioB64.slice(start, start + chunkSize)}`);
      }
      return chunks;
    }
    total = nextTotal;
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto(decoderPath);
});

test('入口ページから decoder へ遷移する', async ({ page }) => {
  await page.goto(entryPath);
  await expect(page).toHaveURL(/parapara-qr-decoder\.html$/);
});

test('手動貼り付けで payload を復元できる', async ({ page }) => {
  const payload = buildPayload(buildWavBytes());
  await page.locator('#payloadInput').fill(payload);
  await page.getByRole('button', { name: '貼り付けたpayloadを復元する' }).click();

  await expect(page.locator('#previewFrame')).toBeVisible();
  await expect(page.locator('#audioPlayer')).toBeVisible();
  await expect(page.locator('#downloadLink')).toBeVisible();
  await expect(page.locator('#compatDownloadLink')).toBeVisible();

  const src = await page.locator('#audioPlayer').getAttribute('src');
  expect(src?.startsWith('blob:')).toBeTruthy();
  await expect(page.locator('#downloadLink')).toHaveAttribute('download', /restored-audio/);
  await expect(page.locator('#compatDownloadLink')).toHaveAttribute('download', 'restored-audio.wav');
});

test('分割QR payload を順番に貼ると復元できる', async ({ page }) => {
  const chunks = buildChunkPayloads(Buffer.alloc(2600, 0x62), 'audio/webm');
  expect(chunks.length).toBeGreaterThan(1);

  await page.locator('#payloadInput').fill(chunks[0]);
  await page.getByRole('button', { name: '貼り付けたpayloadを復元する' }).click();
  await expect(page.locator('#status')).toContainText(`分割QRを読み取り中です (1/${chunks.length})`);

  await page.locator('#payloadInput').fill(chunks[1]);
  await page.getByRole('button', { name: '貼り付けたpayloadを復元する' }).click();

  await expect(page.locator('#previewFrame')).toBeVisible();
  await expect(page.locator('#downloadLink')).toBeVisible();
  await expect(page.locator('#downloadLink')).toHaveAttribute('download', /restored-audio\.webm/);
});
