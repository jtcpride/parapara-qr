const BYTE_BUDGETS = Object.freeze({
  dense: 2200,
  readable: 1100,
});

const MIME = 'audio/mp4';
const MIME_CODE = 'm';
const BASE91_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~"';
const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const BINARY_HEADER_BYTES = 6 + MIME.length;

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

function encodeBase45(buf) {
  let out = '';
  for (let i = 0; i < buf.length; i += 2) {
    if (i + 1 < buf.length) {
      const value = buf[i] * 256 + buf[i + 1];
      const e = Math.floor(value / (45 * 45));
      const d = Math.floor(value / 45) % 45;
      const c = value % 45;
      out += BASE45_ALPHABET[c] + BASE45_ALPHABET[d] + BASE45_ALPHABET[e];
    } else {
      const value = buf[i];
      const d = Math.floor(value / 45);
      const c = value % 45;
      out += BASE45_ALPHABET[c] + BASE45_ALPHABET[d];
    }
  }
  return out;
}

function base64Length(byteLength) {
  return Buffer.alloc(byteLength, 0x61).toString('base64').length;
}

function charsPerBudget(mode, byteBudget) {
  if (mode === 'byte') return byteBudget;
  if (mode === 'alphanumeric') {
    // Compare on a bit-budget basis to current byte-mode limits.
    return Math.floor((byteBudget * 8) / 5.5);
  }
  throw new Error(`Unknown mode: ${mode}`);
}

function chunkCount(totalChars, usableChars) {
  return Math.ceil(totalChars / usableChars);
}

function totalCharsWithFixedHeader(totalChars, chunkCountValue, fixedHeaderChars, usableChars) {
  const payloadCounts = [];
  let start = 0;
  for (let index = 0; index < chunkCountValue; index += 1) {
    const take = Math.min(usableChars, totalChars - start);
    payloadCounts.push(fixedHeaderChars + take);
    start += take;
  }
  return payloadCounts.reduce((sum, value) => sum + value, 0);
}

function solveFixedHeaderStrategy(encodedChars, budget, mode, headerChars) {
  const capacity = charsPerBudget(mode, budget);
  let total = 1;
  while (true) {
    const usable = capacity - headerChars(total);
    const nextTotal = chunkCount(encodedChars, usable);
    if (nextTotal === total) {
      return {
        chunks: total,
        chars: totalCharsWithFixedHeader(encodedChars, total, headerChars(total), usable),
        usableChars: usable,
      };
    }
    total = nextTotal;
  }
}

function solveSharedMetaStrategy(encodedChars, budget, mode, manifestHeaderChars, dataHeaderChars) {
  const capacity = charsPerBudget(mode, budget);
  let totalData = 1;
  while (true) {
    const manifestUsable = capacity - manifestHeaderChars(totalData);
    const dataUsable = capacity - dataHeaderChars(totalData);
    const remainingChars = Math.max(0, encodedChars - manifestUsable);
    const nextTotalData = 1 + chunkCount(remainingChars, dataUsable);
    if (nextTotalData === totalData) {
      const firstChars = Math.min(encodedChars, manifestUsable) + manifestHeaderChars(totalData);
      const remainder = Math.max(0, encodedChars - Math.min(encodedChars, manifestUsable));
      const restChunks = totalData - 1;
      const restChars = restChunks > 0
        ? totalCharsWithFixedHeader(remainder, restChunks, dataHeaderChars(totalData), dataUsable)
        : 0;
      return {
        chunks: totalData,
        chars: firstChars + restChars,
        manifestUsable,
        dataUsable,
      };
    }
    totalData = nextTotalData;
  }
}

function scoreLabel(value) {
  return ['low', 'mid', 'high'][value - 1];
}

function row(values) {
  return `| ${values.join(' | ')} |`;
}

const sampleSizes = [
  { name: 'single-fit webm-like', bytes: 1400 },
  { name: 'multi-target m4a-like', bytes: 12795 },
  { name: 'larger media-like', bytes: 24000 },
];

const strategies = [
  {
    id: 'pqr2',
    label: 'PQR2 + Base64 (byte mode)',
    encoded: (bytes) => Buffer.alloc(bytes, 0x61).toString('base64').length,
    mode: 'byte',
    solve: (bytes, budget) => solveFixedHeaderStrategy(
      Buffer.alloc(bytes, 0x61).toString('base64').length,
      budget,
      'byte',
      (total) => `PQR2${MIME_CODE}${total.toString(36).padStart(2, '0')}${total.toString(36).padStart(2, '0')}`.length,
    ),
    generality: 3,
    longevity: 3,
    complexity: 2,
    notes: 'Current compact baseline',
  },
  {
    id: 'pqr3',
    label: 'PQR3 + Base91 (byte mode)',
    encoded: (bytes) => encodeBase91(Buffer.alloc(bytes, 0x61)).length,
    mode: 'byte',
    solve: (bytes, budget) => solveFixedHeaderStrategy(
      encodeBase91(Buffer.alloc(bytes, 0x61)).length,
      budget,
      'byte',
      (total) => `PQR3${MIME_CODE}${total.toString(36).padStart(2, '0')}${total.toString(36).padStart(2, '0')}`.length,
    ),
    generality: 3,
    longevity: 3,
    complexity: 2,
    notes: 'Implemented and auto-selected when better',
  },
  {
    id: 'pq4',
    label: 'PQ4 + raw binary byte mode',
    encoded: (bytes) => bytes,
    mode: 'byte',
    solve: (bytes) => {
      const usableBytes = 2950 - BINARY_HEADER_BYTES;
      return {
        chunks: chunkCount(bytes, usableBytes),
        chars: bytes + chunkCount(bytes, usableBytes) * BINARY_HEADER_BYTES,
        usableChars: usableBytes,
      };
    },
    generality: 3,
    longevity: 3,
    complexity: 2,
    notes: 'Implemented; decoder uses jsQR binaryData',
  },
  {
    id: 'pqr4',
    label: 'PQR4 + Base45 (alphanumeric mode)',
    encoded: (bytes) => encodeBase45(Buffer.alloc(bytes, 0x61)).length,
    mode: 'alphanumeric',
    solve: (bytes, budget) => solveFixedHeaderStrategy(
      encodeBase45(Buffer.alloc(bytes, 0x61)).length,
      budget,
      'alphanumeric',
      (total) => `PQR4${MIME_CODE}${total.toString(36).padStart(2, '0')}${total.toString(36).padStart(2, '0')}`.length,
    ),
    generality: 3,
    longevity: 3,
    complexity: 3,
    notes: 'Theoretical until renderer supports alphanumeric mode',
  },
  {
    id: 'meta-first',
    label: 'Manifest first chunk + Base91',
    encoded: (bytes) => encodeBase91(Buffer.alloc(bytes, 0x61)).length,
    mode: 'byte',
    solve: (bytes, budget) => solveSharedMetaStrategy(
      encodeBase91(Buffer.alloc(bytes, 0x61)).length,
      budget,
      'byte',
      (total) => `PQM1${MIME_CODE}${total.toString(36).padStart(2, '0')}s91sha256`.length,
      () => `PQD1${MIME_CODE}00`.length,
    ),
    generality: 3,
    longevity: 2,
    complexity: 3,
    notes: 'More efficient, but weaker random-access / self-containedness',
  },
  {
    id: 'parity',
    label: 'PQR3 + parity every 8 chunks',
    encoded: (bytes) => encodeBase91(Buffer.alloc(bytes, 0x61)).length,
    mode: 'byte',
    solve: (bytes, budget) => {
      const base = solveFixedHeaderStrategy(
        encodeBase91(Buffer.alloc(bytes, 0x61)).length,
        budget,
        'byte',
        (total) => `PQR3${MIME_CODE}${total.toString(36).padStart(2, '0')}${total.toString(36).padStart(2, '0')}`.length,
      );
      const parity = Math.ceil(base.chunks / 8);
      return { chunks: base.chunks + parity, chars: base.chars, usableChars: base.usableChars };
    },
    generality: 2,
    longevity: 3,
    complexity: 3,
    notes: 'Robustness-first, not count-first',
  },
];

const lines = [];
lines.push('# Chunk Format Research');
lines.push('');
lines.push('## Measured Chunk Counts');
lines.push('');
lines.push(row(['strategy', 'dense 1,400B', 'readable 1,400B', 'dense 12,795B', 'readable 12,795B', 'dense 24,000B', 'readable 24,000B', 'generality', 'longevity', 'complexity', 'notes']));
lines.push(row(['---', '---', '---', '---', '---', '---', '---', '---', '---', '---', '---']));

for (const strategy of strategies) {
  const values = [strategy.label];
  for (const sample of sampleSizes) {
    values.push(strategy.solve(sample.bytes, BYTE_BUDGETS.dense).chunks);
    values.push(strategy.solve(sample.bytes, BYTE_BUDGETS.readable).chunks);
  }
  values.push(scoreLabel(strategy.generality));
  values.push(scoreLabel(strategy.longevity));
  values.push(scoreLabel(strategy.complexity));
  values.push(strategy.notes);
  lines.push(row(values));
}

lines.push('');
lines.push('## Long-Term Preservation Reading');
lines.push('');
lines.push('- `PQR3` is the best currently implemented general-purpose chunk body codec.');
lines.push('- `PQR4` could be stronger if we add true alphanumeric-mode QR generation; today it is a promising but unimplemented renderer path.');
lines.push('- `Manifest first chunk` improves efficiency further, but weakens the property that every chunk is individually self-describing.');
lines.push('- `Parity` improves restoration odds from paper / real-world scanning, but increases total QR count on purpose.');

console.log(lines.join('\n'));
