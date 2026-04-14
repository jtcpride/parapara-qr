import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const encoderPath = pathToFileURL(path.resolve(__dirname, '..', 'parapara-qr-poc.html')).href;
const decoderPath = pathToFileURL(path.resolve(__dirname, '..', 'parapara-qr-decoder.html')).href;
const BINARY_MAGIC = [0x50, 0x51, 0x34];

function decodeQrFromPng(buffer: Buffer) {
  const png = PNG.sync.read(buffer);
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (!decoded) throw new Error('QR decode failed');
  return decoded;
}

function buildWavBytes(samples = 2400) {
  const sampleRate = 8000;
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

test('Mac で少し長めの音声を複数QR化して decoder へ順に貼ると復元できる', async ({ page, context }) => {
  await page.goto(encoderPath);
  await page.setInputFiles('#fileInput', {
    name: 'longer.wav',
    mimeType: 'audio/wav',
    buffer: buildWavBytes(),
  });

  await expect(page.locator('#chunkNav')).toBeVisible();
  await expect(page.locator('#meta')).toContainText('分割QR');

  const metaText = await page.locator('#meta').textContent();
  const match = metaText?.match(/分割QR: (\d+) 枚/);
  expect(match).not.toBeNull();
  const total = Number(match?.[1]);
  expect(total).toBeGreaterThan(1);

  const chunks: Array<{ kind: 'text' | 'binary'; payload: string | number[] }> = [];
  for (let index = 0; index < total; index += 1) {
    const decoded = decodeQrFromPng(await page.locator('#qrContainer canvas').screenshot());
    if (decoded.binaryData?.[0] === BINARY_MAGIC[0] && decoded.binaryData?.[1] === BINARY_MAGIC[1] && decoded.binaryData?.[2] === BINARY_MAGIC[2]) {
      chunks.push({ kind: 'binary', payload: decoded.binaryData });
    } else {
      expect(decoded.data.startsWith('PQR2') || decoded.data.startsWith('PQR3')).toBeTruthy();
      chunks.push({ kind: 'text', payload: decoded.data });
    }
    if (index < total - 1) {
      await page.getByRole('button', { name: '次のQR →' }).click();
    }
  }

  const decoder = await context.newPage();
  await decoder.goto(decoderPath);

  for (let index = 0; index < chunks.length; index += 1) {
    if (chunks[index].kind === 'text') {
      await decoder.locator('#payloadInput').fill(chunks[index].payload as string);
      await decoder.getByRole('button', { name: '貼り付けたpayloadを復元する' }).click();
    } else {
      const state = await decoder.evaluate(async (bytes) => {
        const anyWindow = window as any;
        const parsed = anyWindow.parseBinaryChunk(new Uint8Array(bytes));
        const result = anyWindow.acceptBinaryChunk(parsed);
        if (result?.complete) {
          await anyWindow.restoreBinaryResult(result);
        }
        return result ? { complete: !!result.complete } : { complete: false };
      }, chunks[index].payload as number[]);
      void state;
    }
    if (index < chunks.length - 1) {
      await expect(decoder.locator('#status')).toContainText(`(${index + 1}/${chunks.length})`);
    }
  }

  await expect(decoder.locator('#audioPlayer')).toBeVisible();
  await expect(decoder.locator('#downloadLink')).toBeVisible();
  await expect(decoder.locator('#downloadLink')).toHaveAttribute('download', 'restored-audio.wav');
});
