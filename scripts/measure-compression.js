const MIME_FALLBACK = 'audio/octet-stream';
const LEGACY_HTML_PREFIX = 'data:text/html;base64,';
const COMPACT_SINGLE_PREFIX = 'PQS1';
const CHUNK_PREFIX = 'PQR2';
const CHUNK_BASE91_PREFIX = 'PQR3';
const LEGACY_CHUNK_PREFIX = 'PQR1';
const MIME_CODE_MAP = Object.freeze({
  'audio/webm': 'w',
  'audio/mp4': 'm',
  'audio/wav': 'a',
  'audio/ogg': 'o',
  'audio/mpeg': '3',
  'audio/octet-stream': 'b',
});
const BASE91_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';

function normalizeMimeType(mimeType) {
  const normalized = String(mimeType || MIME_FALLBACK).split(';')[0].trim().toLowerCase();
  return normalized || MIME_FALLBACK;
}

function encodeMimeCode(mimeType) {
  return MIME_CODE_MAP[normalizeMimeType(mimeType)] || '';
}

function toBase36Fixed(value, width) {
  return value.toString(36).padStart(width, '0');
}

function buildLegacyHtmlPayload(audioB64, mimeType) {
  const html = `<audio controls autoplay src="data:${mimeType};base64,${audioB64}"></audio>`;
  return `${LEGACY_HTML_PREFIX}${Buffer.from(html, 'utf8').toString('base64')}`;
}

function buildCompactSinglePayload(audioB64, mimeType) {
  const mimeCode = encodeMimeCode(mimeType);
  if (!mimeCode) return '';
  return `${COMPACT_SINGLE_PREFIX}${mimeCode}${audioB64}`;
}

function buildLegacyChunkHeader(index, total, mimeType) {
  return `${LEGACY_CHUNK_PREFIX}:${index}:${total}:${mimeType}:`;
}

function buildCompactChunkHeader(index, total, mimeType) {
  const mimeCode = encodeMimeCode(mimeType);
  if (!mimeCode) return '';
  return `${CHUNK_PREFIX}${mimeCode}${toBase36Fixed(total, 2)}${toBase36Fixed(index, 2)}`;
}

function buildBase91ChunkHeader(index, total, mimeType) {
  const mimeCode = encodeMimeCode(mimeType);
  if (!mimeCode) return '';
  return `${CHUNK_BASE91_PREFIX}${mimeCode}${toBase36Fixed(total, 2)}${toBase36Fixed(index, 2)}`;
}

function encodeBase91(buf) {
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
    if (bits > 7 || value > 90) output += BASE91_ALPHABET[Math.floor(value / 91)];
  }
  return output;
}

function buildChunkPayloads(audioB64, mimeType, maxChunkPayloadBytes, useCompact) {
  let total = 1;
  while (true) {
    const header = useCompact
      ? buildCompactChunkHeader(total, total, mimeType)
      : buildLegacyChunkHeader(total, total, mimeType);
    if (!header) {
      return null;
    }
    const chunkSize = maxChunkPayloadBytes - header.length;
    if (chunkSize <= 0) {
      throw new Error('chunk size unavailable');
    }
    const nextTotal = Math.ceil(audioB64.length / chunkSize);
    if (nextTotal === total) {
      const payloads = [];
      for (let index = 1, start = 0; index <= total; index += 1, start += chunkSize) {
        const nextHeader = useCompact
          ? buildCompactChunkHeader(index, total, mimeType)
          : buildLegacyChunkHeader(index, total, mimeType);
        payloads.push(`${nextHeader}${audioB64.slice(start, start + chunkSize)}`);
      }
      return payloads;
    }
    total = nextTotal;
  }
}

function buildBase91ChunkPayloads(encoded, mimeType, maxChunkPayloadBytes) {
  let total = 1;
  while (true) {
    const header = buildBase91ChunkHeader(total, total, mimeType);
    if (!header) return null;
    const chunkSize = maxChunkPayloadBytes - header.length;
    if (chunkSize <= 0) throw new Error('chunk size unavailable');
    const nextTotal = Math.ceil(encoded.length / chunkSize);
    if (nextTotal === total) {
      const payloads = [];
      for (let index = 1, start = 0; index <= total; index += 1, start += chunkSize) {
        payloads.push(`${buildBase91ChunkHeader(index, total, mimeType)}${encoded.slice(start, start + chunkSize)}`);
      }
      return payloads;
    }
    total = nextTotal;
  }
}

function buildWav({ sampleRate, channels, samples }) {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataLength = samples[0].length * blockAlign;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  let offset = 44;
  for (let index = 0; index < samples[0].length; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, samples[channel][index]));
      buffer.writeInt16LE(Math.round(sample * 0x7fff), offset);
      offset += 2;
    }
  }
  return buffer;
}

function parseWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAV file');
  }
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  const dataLength = buffer.readUInt32LE(40);
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = dataLength / bytesPerSample / channels;
  const samples = Array.from({ length: channels }, () => new Float32Array(sampleCount));
  let offset = 44;
  for (let index = 0; index < sampleCount; index += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      samples[channel][index] = buffer.readInt16LE(offset) / 0x7fff;
      offset += 2;
    }
  }
  return { sampleRate, channels, samples };
}

function trimSilence(wav, threshold = 0.015) {
  let start = 0;
  let end = wav.samples[0].length - 1;
  const isSilentAt = (index) => wav.samples.every((channel) => Math.abs(channel[index]) < threshold);
  while (start < wav.samples[0].length && isSilentAt(start)) start += 1;
  while (end > start && isSilentAt(end)) end -= 1;
  const trimmed = wav.samples.map((channel) => channel.slice(start, end + 1));
  return { sampleRate: wav.sampleRate, channels: wav.channels, samples: trimmed };
}

function toMono(wav) {
  if (wav.channels === 1) return wav;
  const mono = new Float32Array(wav.samples[0].length);
  for (let index = 0; index < mono.length; index += 1) {
    let sum = 0;
    for (let channel = 0; channel < wav.channels; channel += 1) {
      sum += wav.samples[channel][index];
    }
    mono[index] = sum / wav.channels;
  }
  return { sampleRate: wav.sampleRate, channels: 1, samples: [mono] };
}

function downsample(wav, targetSampleRate) {
  if (targetSampleRate >= wav.sampleRate) return wav;
  const ratio = wav.sampleRate / targetSampleRate;
  const length = Math.floor(wav.samples[0].length / ratio);
  const nextSamples = wav.samples.map((channel) => {
    const output = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      output[index] = channel[Math.min(channel.length - 1, Math.floor(index * ratio))];
    }
    return output;
  });
  return { sampleRate: targetSampleRate, channels: wav.channels, samples: nextSamples };
}

function createSyntheticSpeechLikeWav() {
  const sampleRate = 16000;
  const silenceSamples = Math.round(sampleRate * 0.3);
  const activeSamples = Math.round(sampleRate * 0.6);
  const total = silenceSamples * 2 + activeSamples;
  const left = new Float32Array(total);
  const right = new Float32Array(total);

  for (let index = 0; index < activeSamples; index += 1) {
    const t = index / sampleRate;
    const envelope = Math.sin(Math.PI * (index / activeSamples));
    const base = envelope * 0.3 * Math.sin(2 * Math.PI * 440 * t);
    const harmonic = envelope * 0.1 * Math.sin(2 * Math.PI * 880 * t);
    left[silenceSamples + index] = base + harmonic;
    right[silenceSamples + index] = base * 0.95 + harmonic * 0.8;
  }

  return buildWav({ sampleRate, channels: 2, samples: [left, right] });
}

function summarizeSample(name, mimeType, buffer) {
  const normalizedMimeType = normalizeMimeType(mimeType);
  const audioB64 = buffer.toString('base64');
  const legacySingle = buildLegacyHtmlPayload(audioB64, normalizedMimeType);
  const compactSingle = buildCompactSinglePayload(audioB64, normalizedMimeType);
  const denseLegacy = buildChunkPayloads(audioB64, normalizedMimeType, 2200, false);
  const denseCompact = buildChunkPayloads(audioB64, normalizedMimeType, 2200, true);
  const denseBase91 = buildBase91ChunkPayloads(encodeBase91(buffer), normalizedMimeType, 2200);
  const readableLegacy = buildChunkPayloads(audioB64, normalizedMimeType, 1100, false);
  const readableCompact = buildChunkPayloads(audioB64, normalizedMimeType, 1100, true);
  const readableBase91 = buildBase91ChunkPayloads(encodeBase91(buffer), normalizedMimeType, 1100);

  return {
    name,
    rawBytes: buffer.length,
    base64Chars: audioB64.length,
    legacySingleLength: legacySingle.length,
    compactSingleLength: compactSingle ? compactSingle.length : null,
    denseLegacyCount: denseLegacy ? denseLegacy.length : null,
    denseCompactCount: denseCompact ? denseCompact.length : null,
    denseBase91Count: denseBase91 ? denseBase91.length : null,
    readableLegacyCount: readableLegacy ? readableLegacy.length : null,
    readableCompactCount: readableCompact ? readableCompact.length : null,
    readableBase91Count: readableBase91 ? readableBase91.length : null,
    denseLegacyTotalChars: denseLegacy ? denseLegacy.reduce((sum, payload) => sum + payload.length, 0) : null,
    denseCompactTotalChars: denseCompact ? denseCompact.reduce((sum, payload) => sum + payload.length, 0) : null,
    denseBase91TotalChars: denseBase91 ? denseBase91.reduce((sum, payload) => sum + payload.length, 0) : null,
    readableLegacyTotalChars: readableLegacy ? readableLegacy.reduce((sum, payload) => sum + payload.length, 0) : null,
    readableCompactTotalChars: readableCompact ? readableCompact.reduce((sum, payload) => sum + payload.length, 0) : null,
    readableBase91TotalChars: readableBase91 ? readableBase91.reduce((sum, payload) => sum + payload.length, 0) : null,
    denseHeaderSavings: denseLegacy && denseCompact
      ? buildLegacyChunkHeader(denseLegacy.length, denseLegacy.length, normalizedMimeType).length
        - buildCompactChunkHeader(denseCompact.length, denseCompact.length, normalizedMimeType).length
      : null,
    readableHeaderSavings: readableLegacy && readableCompact
      ? buildLegacyChunkHeader(readableLegacy.length, readableLegacy.length, normalizedMimeType).length
        - buildCompactChunkHeader(readableCompact.length, readableCompact.length, normalizedMimeType).length
      : null,
  };
}

function formatCell(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function row(cells) {
  return `| ${cells.map(formatCell).join(' | ')} |`;
}

const representativeSamples = [
  summarizeSample('single-fit webm (1,400B)', 'audio/webm', Buffer.alloc(1400, 0x61)),
  summarizeSample('multi-target m4a-like (12,795B)', 'audio/mp4', Buffer.alloc(12795, 0x61)),
  summarizeSample('generated wav (4,844B)', 'audio/wav', buildWav({
    sampleRate: 8000,
    channels: 1,
    samples: [Float32Array.from({ length: 2400 }, (_, i) => Math.sin(2 * Math.PI * 440 * (i / 8000)) * 0.25)],
  })),
];

const speechLikeOriginal = parseWav(createSyntheticSpeechLikeWav());
const speechLikeVariants = [
  { name: 'original stereo 16k wav', wav: speechLikeOriginal },
  { name: 'trim silence', wav: trimSilence(speechLikeOriginal) },
  { name: 'trim + mono', wav: toMono(trimSilence(speechLikeOriginal)) },
  { name: 'trim + mono + 8k', wav: downsample(toMono(trimSilence(speechLikeOriginal)), 8000) },
].map(({ name, wav }) => summarizeSample(name, 'audio/wav', buildWav(wav)));

const lines = [];
lines.push('# Compression Measurement');
lines.push('');
lines.push('## Payload format comparison');
lines.push('');
lines.push(row(['sample', 'raw bytes', 'base64 chars', 'legacy single', 'compact single', 'dense legacy', 'dense pqr2', 'dense pqr3(base91)', 'readable legacy', 'readable pqr2', 'readable pqr3(base91)']));
lines.push(row(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---']));
for (const sample of representativeSamples) {
  lines.push(row([
    sample.name,
    sample.rawBytes,
    sample.base64Chars,
    sample.legacySingleLength,
    sample.compactSingleLength,
    sample.denseLegacyCount,
    sample.denseCompactCount,
    sample.denseBase91Count,
    sample.readableLegacyCount,
    sample.readableCompactCount,
    sample.readableBase91Count,
  ]));
}

lines.push('');
lines.push('## Header savings per QR');
lines.push('');
lines.push(row(['sample', 'dense pqr2 saved vs legacy', 'dense pqr3 saved vs pqr2', 'readable pqr2 saved vs legacy', 'readable pqr3 saved vs pqr2']));
lines.push(row(['---', '---', '---', '---', '---']));
for (const sample of representativeSamples) {
  lines.push(row([
    sample.name,
    sample.denseHeaderSavings,
    sample.denseCompactTotalChars - sample.denseBase91TotalChars,
    sample.readableHeaderSavings,
    sample.readableCompactTotalChars - sample.readableBase91TotalChars,
  ]));
}

lines.push('');
lines.push('## WAV preprocessing experiment');
lines.push('');
lines.push(row(['variant', 'raw bytes', 'compact single length', 'dense pqr2 chunks', 'dense pqr3 chunks', 'readable pqr2 chunks', 'readable pqr3 chunks']));
lines.push(row(['---', '---', '---', '---', '---', '---', '---']));
for (const sample of speechLikeVariants) {
  lines.push(row([
    sample.name,
    sample.rawBytes,
    sample.compactSingleLength,
    sample.denseCompactCount,
    sample.denseBase91Count,
    sample.readableCompactCount,
    sample.readableBase91Count,
  ]));
}

console.log(lines.join('\n'));
