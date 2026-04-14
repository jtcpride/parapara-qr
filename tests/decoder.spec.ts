import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';

const decoderPath = pathToFileURL(path.resolve(__dirname, '..', 'parapara-qr-decoder.html')).href;
const entryPath = pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const CHUNK_PREFIX = 'PQR3';
const BINARY_MAGIC = [0x50, 0x51, 0x34];
const SINGLE_PREFIX = 'PQS1';
const MAX_CHUNK_PAYLOAD_BYTES = 2900;
const MIME_CODES: Record<string, string> = {
  'audio/webm': 'w',
  'audio/mp4': 'm',
  'audio/wav': 'a',
  'audio/ogg': 'o',
  'audio/mpeg': '3',
  'audio/octet-stream': 'b',
};

const BASE91_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';

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
  const base64 = audioBytes.toString('base64');
  return `${SINGLE_PREFIX}${MIME_CODES[mimeType]}${base64}`;
}

function buildChunkPayloads(audioBytes: Buffer, mimeType = 'audio/wav') {
  const audioB64 = encodeBase91(audioBytes);
  let total = 1;
  while (true) {
    const headerLength = `${CHUNK_PREFIX}${MIME_CODES[mimeType]}${total.toString(36).padStart(2, '0')}${total.toString(36).padStart(2, '0')}`.length;
    const chunkSize = MAX_CHUNK_PAYLOAD_BYTES - headerLength;
    const nextTotal = Math.ceil(audioB64.length / chunkSize);
    if (nextTotal === total) {
      const chunks = [];
      for (let index = 1, start = 0; index <= total; index += 1, start += chunkSize) {
        chunks.push(`${CHUNK_PREFIX}${MIME_CODES[mimeType]}${total.toString(36).padStart(2, '0')}${index.toString(36).padStart(2, '0')}${audioB64.slice(start, start + chunkSize)}`);
      }
      return chunks;
    }
    total = nextTotal;
  }
}

function encodeBase91(buf: Buffer) {
  let value = 0;
  let bits = 0;
  let output = '';
  for (const byte of buf) {
    value |= byte << bits;
    bits += 8;
    if (bits > 13) {
      let chunk = value & 8191;
      if (chunk > 88) {
        value >>= 13;
        bits -= 13;
      } else {
        chunk = value & 16383;
        value >>= 14;
        bits -= 14;
      }
      output += BASE91_ALPHABET[chunk % 91] + BASE91_ALPHABET[Math.floor(chunk / 91)];
    }
  }
  if (bits) {
    output += BASE91_ALPHABET[value % 91];
    if (bits > 7 || value > 90) {
      output += BASE91_ALPHABET[Math.floor(value / 91)];
    }
  }
  return output;
}

function buildLegacyPayload(audioBytes: Buffer, mimeType = 'audio/wav') {
  const binary = audioBytes.toString('base64');
  const html = `<audio controls autoplay src="data:${mimeType};base64,${binary}"></audio>`;
  return `data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`;
}

function buildBinaryChunks(audioBytes: Buffer, mimeType = 'audio/wav') {
  const mimeBytes = Buffer.from(mimeType, 'ascii');
  const headerLength = 6 + mimeBytes.length;
  const maxChunk = 2953 - headerLength;
  const total = Math.ceil(audioBytes.length / maxChunk);
  const chunks: number[][] = [];
  for (let index = 1, start = 0; index <= total; index += 1, start += maxChunk) {
    const payload = audioBytes.subarray(start, start + maxChunk);
    const chunk = Buffer.alloc(headerLength + payload.length);
    chunk[0] = BINARY_MAGIC[0];
    chunk[1] = BINARY_MAGIC[1];
    chunk[2] = BINARY_MAGIC[2];
    chunk[3] = index;
    chunk[4] = total;
    chunk[5] = mimeBytes.length;
    mimeBytes.copy(chunk, 6);
    payload.copy(chunk, 6 + mimeBytes.length);
    chunks.push([...chunk]);
  }
  return chunks;
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

test('旧single payload も互換復元できる', async ({ page }) => {
  const payload = buildLegacyPayload(buildWavBytes());
  await page.locator('#payloadInput').fill(payload);
  await page.getByRole('button', { name: '貼り付けたpayloadを復元する' }).click();

  await expect(page.locator('#previewFrame')).toBeVisible();
  await expect(page.locator('#downloadLink')).toBeVisible();
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

test('binary chunk を順番に渡すと復元できる', async ({ page }) => {
  const chunks = buildBinaryChunks(Buffer.alloc(5000, 0x64), 'audio/webm');
  expect(chunks.length).toBeGreaterThan(1);

  for (let index = 0; index < chunks.length; index += 1) {
    const state = await page.evaluate(async (bytes) => {
      const anyWindow = window as any;
      const parsed = anyWindow.parseBinaryChunk(new Uint8Array(bytes));
      const result = anyWindow.acceptBinaryChunk(parsed);
      if (result?.complete) {
        await anyWindow.restoreBinaryResult(result);
      }
      return result ? { complete: !!result.complete } : { complete: false };
    }, chunks[index]);
    if (index < chunks.length - 1) {
      await expect(page.locator('#status')).toContainText(`(${index + 1}/${chunks.length})`);
    } else {
      expect(state.complete).toBeTruthy();
    }
  }

  await expect(page.locator('#audioPlayer')).toBeVisible();
  await expect(page.locator('#downloadLink')).toBeVisible();
  await expect(page.locator('#downloadLink')).toHaveAttribute('download', /restored-audio\.webm/);
});
