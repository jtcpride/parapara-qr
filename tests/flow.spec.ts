import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test, expect } from '@playwright/test';

const encoderPath = pathToFileURL(path.resolve(__dirname, '..', 'parapara-qr-poc.html')).href;
const decoderPath = pathToFileURL(path.resolve(__dirname, '..', 'parapara-qr-decoder.html')).href;

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

  const chunks: string[] = [];
  for (let index = 0; index < total; index += 1) {
    const payload = await page.locator('#qrContainer').getAttribute('title');
    expect(payload?.startsWith('PQR1:')).toBeTruthy();
    chunks.push(payload!);
    if (index < total - 1) {
      await page.getByRole('button', { name: '次のQR →' }).click();
    }
  }

  const decoder = await context.newPage();
  await decoder.goto(decoderPath);

  for (let index = 0; index < chunks.length; index += 1) {
    await decoder.locator('#payloadInput').fill(chunks[index]);
    await decoder.getByRole('button', { name: '貼り付けたpayloadを復元する' }).click();
    if (index < chunks.length - 1) {
      await expect(decoder.locator('#status')).toContainText(`(${index + 1}/${chunks.length})`);
    }
  }

  await expect(decoder.locator('#previewFrame')).toBeVisible();
  await expect(decoder.locator('#downloadLink')).toBeVisible();
  await expect(decoder.locator('#downloadLink')).toHaveAttribute('download', 'restored-audio.wav');
});
