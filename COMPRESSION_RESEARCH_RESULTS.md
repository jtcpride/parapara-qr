# Compression Research Results

## Summary

今回の研究では、**ブラウザ内へ現実的に入れやすい前処理**に絞って比較し、まず `WAV/PCM` 向けの軽量化試作を `parapara-qr-poc.html` に追加した。

結論は次のとおり。

- `WAV/PCM` のような**未圧縮入力**には、`mono + 12kHz + silence trim + normalize` の組み合わせが効く
- `.m4a` など**すでに圧縮済みの入力は、形式保持のほうが有利**で、今回の研究前処理は適用対象にしないほうがよい
- `normalize` 単体は音量面では意味があるが、**QR枚数削減の主因にはならない**
- `Opus/AAC` への再エンコードは理論上かなり効くが、**現行のブラウザ内実装へ安全に入れるにはまだ重い**

## Candidate Comparison

| Candidate | QR枚数への効き | 実装難易度 | 音質影響 | 今回の判断 |
| --- | --- | --- | --- | --- |
| モノラル化 | ステレオ `WAV/PCM` には大きい | 低 | 小 | 採用 |
| サンプルレート低下 | `WAV/PCM` には大きい | 低 | 高域が少し落ちる | 採用 |
| 前後の無音トリム | 短い音声で効く | 低 | ほぼなし | 採用 |
| 音量正規化 | 容量にはほぼ効かない | 低 | 音量が揃う | 単独では不採用、補助として採用 |
| 帯域制限 | 効く余地あり | 中 | 調整次第 | 今回は見送り |
| Opus 再エンコード | 理論上とても大きい | 高 | 変換依存 | 今回は見送り |
| 入力形式保持 | 圧縮済み音声では有利 | 低 | なし | 維持 |

## Prototype

`parapara-qr-poc.html` に研究用モードを追加した。

- 追加UI: `圧縮研究モード`
- 既定値: `オリジナル保持`
- 試作値: `研究版: WAV軽量化（mono + 12kHz + trim + normalize）`

研究版の挙動:

- `audio/wav` / `audio/wave` / `audio/x-wav` 系だけに適用
- `RIFF/WAVE` を自前で読み、モノラル化、無音トリム、12kHz へ線形リサンプル、ピーク正規化を実行
- 再出力は `16-bit PCM WAV`
- 軽量化しても改善しない場合は元データへフォールバック
- 非 `WAV` 入力では元形式をそのまま使う

## Measured Results

### Real Data 1: short spoken phrase (`say`)

生成方法:

```sh
say -r 320 -o /tmp/parapara-qr-research/short.aiff 'はい 保存'
afconvert /tmp/parapara-qr-research/short.aiff /tmp/parapara-qr-research/short.wav -f WAVE -d LEI16@16000 -c 2
afconvert /tmp/parapara-qr-research/short.aiff /tmp/parapara-qr-research/short.m4a -f m4af -d aac -b 64000
```

入力情報:

- `short.wav`: 31,668 B, `2ch / 16,000 Hz / PCM`
- `short.m4a`: 7,908 B, `1ch / 22,050 Hz / AAC`

結果:

| Input | Mode | Result |
| --- | --- | --- |
| `short.wav` | オリジナル保持 | `>12` 枚になり、現行上限超過で失敗 |
| `short.wav` | 研究版 WAV軽量化 | `9,500 B`, `6` 枚まで削減して成功 |
| `short.m4a` | オリジナル保持 | `5` 枚で成功 |
| `short.m4a` | 研究版 WAV軽量化 | 非 `WAV` のため保持。`5` 枚で変化なし |

研究版 `short.wav` の処理内訳:

- `2ch / 16,000 Hz -> 1ch / 12,000 Hz`
- 無音トリム: `589 samples`
- peak: `0.558 -> 0.920`
- QR比較: `>12 -> 6`
- サイズ比較: `31,668 B -> 9,500 B`

### Real Data 2: longer spoken phrase (`say`)

生成方法:

```sh
say -o /tmp/parapara-qr-research/phrase.aiff 'これはパラパラQRの圧縮研究サンプルです'
afconvert /tmp/parapara-qr-research/phrase.aiff /tmp/parapara-qr-research/phrase.wav -f WAVE -d LEI16@16000 -c 2
afconvert /tmp/parapara-qr-research/phrase.aiff /tmp/parapara-qr-research/phrase.m4a -f m4af -d aac -b 64000
```

入力情報:

- `phrase.wav`: 235,264 B, `2ch / 16,000 Hz / PCM`
- `phrase.m4a`: 34,957 B, `1ch / 22,050 Hz / AAC`

結果:

- `phrase.wav` オリジナル: `144` 枚相当で失敗
- `phrase.wav` 研究版: `53` 枚相当まで減るが、まだ現行上限 `12` を大きく超える
- `phrase.m4a`: `22` 枚相当で失敗

ここから分かること:

- `WAV/PCM` 前処理はかなり効くが、**長め音声を単独で救う魔法ではない**
- より長い音声には、引き続き**元形式の圧縮効率**や**将来的な Opus/AAC 再エンコード**が重要

## What Worked

- 未圧縮 `WAV/PCM` を研究対象に限定したことで、ブラウザ内実装が単純になった
- `mono + resample + trim` の組み合わせで、短い音声では QR 枚数を実際に減らせた
- 既定動作を変えず、研究モードだけで比較できる形にできた
- 大きすぎる `WAV` でも、まず前処理を試してから判定するようにしたため、研究モードが死ににくくなった

## What Did Not Work

- `normalize` 単体ではサイズは減らない
- 3.6 秒級の PCM 音声は、今回の前処理だけではまだ `12` 枚上限を越える
- `.m4a` のような圧縮済み入力には今回の前処理はほぼ効かない
- ブラウザ内だけで安全に `Opus/AAC` へ再エンコードする試作までは今回踏み込まなかった

## Tests

実施:

- `npm test`

追加した自動テスト:

- `tests/poc.spec.ts`
  `研究版の WAV 軽量化で QR 枚数を減らせる`

確認内容:

- 既存の単一QR / 分割QR / decoder / readable レイアウトのテストが壊れていない
- 研究モードで `WAV` 入力の QR 枚数が減ること

## Merge Suggestion

本流へ合流するなら、まずは次の最小単位が安全。

1. `parapara-qr-poc.html`
   研究用の圧縮モードと `WAV/PCM` 前処理ロジック
2. `tests/poc.spec.ts`
   QR枚数削減の回帰テスト
3. `COMPRESSION_RESEARCH_RESULTS.md`
   判断理由と検証結果の記録

段階的な入れ方:

1. まず研究モードを hidden / experimental 扱いで入れる
2. 実機で `WAV` 系ユースケースを追加確認する
3. その後、録音 `webm/opus` や `.m4a` 系へ広げるかを別研究に切る

## Next Research

- `MediaRecorder` 録音データに対する browser-only な `Opus` 再圧縮の現実性確認
- 帯域制限を加えたときの読み取り成功率と主観音質の比較
- chunk 上限 `12` 固定のまま前処理を厚くするか、`readable` レイアウト側で許容枚数を増やすかの比較
