# Mainstream Integration Plan

更新日: 2026-04-14

## 目的

圧縮研究の成果を、本流へ安全に戻すための
**コミットしやすい単位** と **推奨統合順** を明文化する。

このファイルは、実装済み差分を次の 3 つに分けて扱う前提で書いている。

1. payload / decoder 実装
2. 研究記録と再現スクリプト
3. README / 文脈整理

## 推奨コミット順

### Commit 1: Compact / Binary Payload Runtime

目的:

- 実際に動く payload / decoder / renderer / tests を先に入れる
- 本流機能として意味がある最小差分を、最初に独立して成立させる

含めるファイル:

- [parapara-qr-poc.html](/Users/miwakenomac/Projects/parapara-qr/parapara-qr-poc.html)
- [parapara-qr-poc-readable.html](/Users/miwakenomac/Projects/parapara-qr/parapara-qr-poc-readable.html)
- [parapara-qr-decoder.html](/Users/miwakenomac/Projects/parapara-qr/parapara-qr-decoder.html)
- [tests/poc.spec.ts](/Users/miwakenomac/Projects/parapara-qr/tests/poc.spec.ts)
- [tests/readable.spec.ts](/Users/miwakenomac/Projects/parapara-qr/tests/readable.spec.ts)
- [tests/flow.spec.ts](/Users/miwakenomac/Projects/parapara-qr/tests/flow.spec.ts)
- [tests/decoder.spec.ts](/Users/miwakenomac/Projects/parapara-qr/tests/decoder.spec.ts)

このコミットで入るもの:

- 単一QR compact payload `PQS1`
- 分割QR compact header `PQR2`
- 分割QR Base91 `PQR3`
- 分割QR raw binary `PQ4`
- decoder の旧形式互換維持
- binary chunk 復元と描画安定化
- E2E / decoder テスト更新

推奨コミットメッセージ:

```text
Add compact and binary QR payload formats with decoder compatibility
```

ステージング例:

```bash
git add \
  parapara-qr-poc.html \
  parapara-qr-poc-readable.html \
  parapara-qr-decoder.html \
  tests/poc.spec.ts \
  tests/readable.spec.ts \
  tests/flow.spec.ts \
  tests/decoder.spec.ts
```

### Commit 2: Compression Research Record

目的:

- 今回の研究で何が効いたかを、コードとは別に残す
- 将来の再検討や巻き戻し判断をしやすくする

含めるファイル:

- [COMPRESSION_RESEARCH_RESULTS.md](/Users/miwakenomac/Projects/parapara-qr/COMPRESSION_RESEARCH_RESULTS.md)
- [CHUNK_FORMAT_RESEARCH_RESULTS.md](/Users/miwakenomac/Projects/parapara-qr/CHUNK_FORMAT_RESEARCH_RESULTS.md)
- [scripts/measure-compression.js](/Users/miwakenomac/Projects/parapara-qr/scripts/measure-compression.js)
- [scripts/research-chunk-formats.js](/Users/miwakenomac/Projects/parapara-qr/scripts/research-chunk-formats.js)

このコミットで入るもの:

- 実測結果
- `PQS1` / `PQR2` / `PQR3` / `PQ4` 比較
- `PQ4` を count-first 現実解とする整理
- `PQR3` を ascii-first 現実解とする整理
- `PQR4` を次の本命とする整理

推奨コミットメッセージ:

```text
Document compression research results and add measurement scripts
```

ステージング例:

```bash
git add \
  COMPRESSION_RESEARCH_RESULTS.md \
  CHUNK_FORMAT_RESEARCH_RESULTS.md \
  scripts/measure-compression.js \
  scripts/research-chunk-formats.js
```

### Commit 3: Mainstream Docs Alignment

目的:

- README と周辺文書を、現在の本流既定動作に揃える
- PR やレビュー時の説明コストを下げる

含めるファイル:

- [README.md](/Users/miwakenomac/Projects/parapara-qr/README.md)
- [WORKING_CONTEXT.md](/Users/miwakenomac/Projects/parapara-qr/WORKING_CONTEXT.md)
- [PHASE1_MILESTONE.md](/Users/miwakenomac/Projects/parapara-qr/PHASE1_MILESTONE.md)
- [PR_DRAFT.md](/Users/miwakenomac/Projects/parapara-qr/PR_DRAFT.md)
- [NEXT_STEPS.md](/Users/miwakenomac/Projects/parapara-qr/NEXT_STEPS.md)
- [MAINSTREAM_INTEGRATION_PLAN.md](/Users/miwakenomac/Projects/parapara-qr/MAINSTREAM_INTEGRATION_PLAN.md)

このコミットで入るもの:

- 本流既定値の明示
- `PQS1` / `PQ4` / `PQR3` の役割整理
- 旧形式互換の説明
- 次の研究テーマの更新
- PR 用サマリの更新

推奨コミットメッセージ:

```text
Align README and project docs with mainstream payload policy
```

ステージング例:

```bash
git add \
  README.md \
  WORKING_CONTEXT.md \
  PHASE1_MILESTONE.md \
  PR_DRAFT.md \
  NEXT_STEPS.md \
  MAINSTREAM_INTEGRATION_PLAN.md
```

## 統合方針

本流での説明は、次の 1 行に寄せるのが最もぶれにくい。

- 単一QRの既定値は `PQS1`
- 分割QRの既定値は count-first で `PQ4`
- ASCII / 長期説明性を優先する現実解は `PQR3`
- 旧形式は decoder で互換維持

## 今回は含めないもの

今回の本流統合では、次のファイル群は切り離して扱うのがよい。

- [LIVE_PHOTO_RESEARCH_RESULTS.md](/Users/miwakenomac/Projects/parapara-qr/LIVE_PHOTO_RESEARCH_RESULTS.md)
- [live-photo-lab.html](/Users/miwakenomac/Projects/parapara-qr/live-photo-lab.html)
- [tests/live-photo-lab.spec.ts](/Users/miwakenomac/Projects/parapara-qr/tests/live-photo-lab.spec.ts)

理由:

- 今回の統合テーマは圧縮 / payload / 本流整理である
- Live Photo 系は別テーマとして独立度が高い
- レビュー観点を混ぜない方が安全

## 実務メモ

コミット前の検証は、少なくとも次を維持する。

```bash
npm test
```

現時点では、このテストは通過済みである。

## そのまま使える統合手順

### Step 1

```bash
git add \
  parapara-qr-poc.html \
  parapara-qr-poc-readable.html \
  parapara-qr-decoder.html \
  tests/poc.spec.ts \
  tests/readable.spec.ts \
  tests/flow.spec.ts \
  tests/decoder.spec.ts

git commit -m "Add compact and binary QR payload formats with decoder compatibility"
```

### Step 2

```bash
git add \
  COMPRESSION_RESEARCH_RESULTS.md \
  CHUNK_FORMAT_RESEARCH_RESULTS.md \
  scripts/measure-compression.js \
  scripts/research-chunk-formats.js

git commit -m "Document compression research results and add measurement scripts"
```

### Step 3

```bash
git add \
  README.md \
  WORKING_CONTEXT.md \
  PHASE1_MILESTONE.md \
  PR_DRAFT.md \
  NEXT_STEPS.md \
  MAINSTREAM_INTEGRATION_PLAN.md

git commit -m "Align README and project docs with mainstream payload policy"
```

### Optional final check

```bash
npm test
git status --short
```
