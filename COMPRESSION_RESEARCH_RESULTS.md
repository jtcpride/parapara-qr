# Compression Research Results

更新日: 2026-04-14

## 目的

成立済みPoCを壊さずに、次の観点を実装・実測・記録した。

- 単一QR payload の軽量化
- 分割QR header の短縮
- MIME や定型文字列の記号化
- 枚数優先と読み取り優先の比較
- 音声前処理がどこまで効くかの切り分け

## 今回入れた実装

### 1. 単一QRを compact payload 化

従来:

- `data:text/html;base64,<outer-html>`
- outer HTML の中に `<audio src="data:audio/...;base64,...">`

今回:

- `PQS1<mime-code><base64-audio>`

decoder 側で共通テンプレートから再生用 HTML を再構築する方式へ変更した。
これにより、単一QRで送っていた outer HTML と `data:text/html;base64,` の固定オーバーヘッドを送らずに済む。

### 2. 分割QR header を compact 化

従来:

- `PQR1:index:total:mime:chunk`

今回:

- `PQR2<mime-code><total-base36-2桁><index-base36-2桁><chunk>`

ASCII の区切り文字と MIME 文字列を毎回送らず、固定長 header にした。

### 3. MIME を 1文字コード化

現在の実装では、以下のよく使う MIME を 1 文字へ圧縮する。

- `audio/webm -> w`
- `audio/mp4 -> m`
- `audio/wav -> a`
- `audio/ogg -> o`
- `audio/mpeg -> 3`
- `audio/octet-stream -> b`

未知 MIME は decoder の後方互換のため legacy 経路へ落とす。

### 4. decoder は新旧両対応

decoder は次の全形式を復元できるようにした。

- 旧単一QR: `data:text/html;base64,...`
- 新単一QR: `PQS1...`
- 旧分割QR: `PQR1:...`
- 新分割QR: `PQR2...`

これにより、公開済みPoCの読み戻し互換を保ったまま研究結果を前進させている。

### 5. 分割本文を base91 化する `PQR3`

継続研究として、header ではなく chunk 本文の文字効率を上げる案も実装した。

従来:

- chunk 本文は Base64
- compact header を使っても本文効率は変わらない

今回:

- `PQR3<mime-code><total><index><base91-chunk>`

Base91 は ASCII printable のまま Base64 より密度が高いため、
byte mode のままでも QR へ載せる文字数を減らせる。

現在の encoder は chunk 化が必要になった時に、

1. `PQR2` + Base64
2. `PQR3` + Base91

を両方試し、

- chunk 枚数が少ない方
- 同枚数なら total chars が短い方

を自動採用する。

### 6. 生バイナリ chunk `PQ4`

継続研究として、分割QRを ASCII 文字列経由ではなく、
**QR byte mode に raw bytes をそのまま載せる** 方式も実装した。

今回の binary chunk format:

- magic: `PQ4` (`0x50 0x51 0x34`)
- `index`: 1 byte
- `total`: 1 byte
- `mime length`: 1 byte
- `mime ascii bytes`
- `payload raw bytes`

例:

```text
[0..2]  "PQ4"
[3]     chunk index
[4]     chunk total
[5]     mime length
[6..]   mime ascii + raw media bytes
```

decoder は `jsQR.binaryData` を使って `PQ4` を直接復元できる。

実装上は、一度 `QRCode` の既存 generator で matrix を作り、
その後に integer cell と quiet zone 付き canvas へ描き直すことで、
高 version QR でも jsQR / 実機で読み取りやすい形にした。

この方式は Base64 / Base91 の本文オーバーヘッドを消せるため、
**分割QRの枚数削減では今回もっとも効いた**。

## 実測方法

再現用スクリプト:

- [scripts/measure-compression.js](/Users/miwakenomac/Projects/parapara-qr/scripts/measure-compression.js)

実行コマンド:

```bash
node scripts/measure-compression.js
```

比較では以下を見た。

- 単一QR payload の文字数
- dense 設定 (`2200`) の分割枚数
- readable 設定 (`1100`) の分割枚数
- header 短縮で 1QR あたり何文字減るか
- Base91 chunk 本文で何枚減るか
- WAV 前処理で raw size と chunk 数がどう変わるか

## 実測結果

### A. payload 形式比較

| sample | raw bytes | legacy single | compact single | dense legacy | dense PQR2 | dense PQR3 | dense PQ4 | readable legacy | readable PQR2 | readable PQR3 | readable PQ4 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| single-fit webm (1,400B) | 1,400 | 2,598 | 1,873 | 1 | 1 | 1 | 1 | 2 | 2 | 2 | 2 |
| multi-target m4a-like (12,795B) | 12,795 | 22,854 | 17,065 | 8 | 8 | 8 | 5 | 16 | 16 | 15 | 5 |
| generated wav (4,844B) | 4,844 | 8,718 | 6,465 | 3 | 3 | 3 | 2 | 6 | 6 | 6 | 2 |

読み取り:

- 単一QR compact 化は大きく効いた
- ただし今回の代表サンプルでは、single が multi に落ちる境界はまだ越えていない
- 分割QRは header だけでは枚数までは減らなかった
- ただし Base91 本文を使う `PQR3` は readable 設定で `16 -> 15` を実際に減らせた
- 生バイナリ `PQ4` は 12,795B ケースで `8 -> 5` まで減らせた
- raw bytes を直接積むので、分割本文の文字エンコード由来オーバーヘッドがほぼ消える

### B. PQR2 と PQR3 の効果

| sample | dense PQR2 saved vs legacy | dense PQR3 saved vs PQR2 | readable PQR2 saved vs legacy | readable PQR3 saved vs PQR2 |
| --- | ---: | ---: | ---: | ---: |
| single-fit webm (1,400B) | 11 | 145 | 11 | 145 |
| multi-target m4a-like (12,795B) | 10 | 1,312 | 12 | 1,321 |
| generated wav (4,844B) | 10 | 515 | 10 | 515 |

読み取り:

- `PQR2` は 1QR あたり 10〜12 文字の削減
- ただし chunk 枚数を 1 枚落とすには足りず、「効くが決定打ではない」改善だった
- readable 側は QR 数が多いぶん、total saved は dense より大きい
- `PQR3` は header ではなく本文そのものの効率改善なので、saved chars が一段大きい
- とくに multi-target m4a-like では readable 側で 1,321 chars 短くなり、実際に 1 QR 減った

### C. `PQ4` raw binary の効果

| sample | dense chunks before | dense chunks after | gain |
| --- | ---: | ---: | ---: |
| single-fit webm (1,400B) | 1 | 1 | 変化なし |
| multi-target m4a-like (12,795B) | 8 (`PQR2/PQR3`) | 5 (`PQ4`) | 37.5% 減 |
| generated wav (4,844B) | 3 (`PQR2/PQR3`) | 2 (`PQ4`) | 33.3% 減 |

読み取り:

- 文字列 codec を通さないので、分割本文の密度では最強だった
- decoder は `jsQR.binaryData` を使うことで追加依存なく復元できた
- ただし browser 標準の `BarcodeDetector` は raw bytes を返さないため、`PQ4` 読み取りでは jsQR 経路が主になる
- binary をそのまま 280px に押し込むと読み取り性が落ちたため、
  integer cell と quiet zone を付けて描き直す実装が必要だった
- つまり「raw binary 自体は効いた」が、「素朴に library を叩くだけ」では十分ではなかった

### D. WAV 前処理実験

synthetic な「前後に無音がある 16kHz stereo WAV」に対して、
無音トリム・モノラル化・8kHz 化を段階比較した。

| variant | raw bytes | compact single | dense PQR2 | dense PQR3 | readable PQR2 | readable PQR3 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| original stereo 16k wav | 76,844 | 102,465 | 47 | 42 | 94 | 84 |
| trim silence | 37,344 | 49,797 | 23 | 21 | 46 | 43 |
| trim + mono | 18,694 | 24,933 | 12 | 11 | 23 | 22 |
| trim + mono + 8k | 9,368 | 12,497 | 6 | 6 | 12 | 11 |

読み取り:

- PCM 系の重い WAV には非常によく効く
- 特に `trim + mono + 8k` は 47 dense chunks を 6 まで落とした
- ただしこれは「未圧縮 PCM を相手にした時」の話であり、現行PoCの主戦場である `webm/opus` や `m4a` にそのまま当てはめられない
- なお Base91 を併用すると、同じ前処理でもさらに数枚落ちるケースがある

## 何が最も効いたか

### 単一QRで最も効いた案

`PQS1` による単一QR compact payload 化。

理由:

- outer HTML を payload から外せる
- encoder/decoder の共通テンプレート化がそのままサイズ削減になる
- decoder のローカル再構築で思想を壊さない
- 旧形式も decoder 側で維持できる

代表値:

- 1,400B webm 相当で `2,598 -> 1,873` に短縮
- 12,795B m4a-like でも single payload の理論長は `22,854 -> 17,065`

### 分割QRで最も効いた案

`PQ4` raw binary chunk。

理由:

- Base64 / Base91 の本文オーバーヘッドを送らなくてよい
- MIME 以外は元バイト列そのものなので decoder が単純
- QR byte mode という標準機能だけで成立する
- 既存 decoder に後方互換を保ったまま追加できた

代表値:

- 12,795B m4a-like で `8 -> 5`
- 4,844B wav で `3 -> 2`

## 何は効いたが、決定打ではなかったか

### `PQR2` header 短縮

効いたこと:

- 1QR あたり 10〜12 文字削減
- readable モードのように枚数が多い時ほど total saved が積み上がる

効かなかったこと:

- 今回の代表サンプルでは chunk 数は変わらなかった
- つまり「枚数削減」より「同枚数で少し軽くする」寄りの改善

### Base91 本文化なしのまま分割を詰めること

効いたこと:

- `PQR2` までは十分に価値がある

効かなかったこと:

- 本文が Base64 のままだと、分割QRの主コストがほぼ残る
- 枚数削減の主戦場は header ではなく本文側だった

### `PQR3` Base91

効いたこと:

- ASCII printable を保ったまま改善できた
- `16 -> 15` のように、境界で 1 枚減るケースが出た
- 長期保存の観点では、text-based spec として説明しやすい

効かなかったこと:

- `PQ4` が使える状況では、枚数削減効果は raw binary に負けた
- つまり `PQR3` は「最も強い圧縮」ではなく、
  「一般性と可読性のバランスが良い ASCII 案」になった

### MIME 記号化

効いたこと:

- short header の成立に必要
- よく使う音声 MIME では無駄がほぼ消える

効かなかったこと:

- 単体では改善量が小さい
- 未知 MIME は legacy fallback が必要

## 何はまだ本流に戻すべきではないか

### qrcode-generator へ直接 raw byte を差し込む実装

理由:

- bundled されていた別 renderer は内部 API の挙動差が大きく、
  `code length overflow` や `createBytes` 系の不整合に当たった
- 研究としては有益だったが、そのまま本流へ入れるには不安定だった

結論:

- raw binary 自体は戻す価値がある
- ただし renderer 実装は、今回最終的に採用した
  `QRCode` 既存経路 + integer cell 再描画版の方が安全

### WAV 前処理を本流の標準経路へ入れること

理由:

- 実験上は非常に効いたが、対象が未圧縮 PCM 前提だった
- 現行PoCの成功経路は `webm/opus` や `m4a` のような、すでに圧縮された実データが中心
- ブラウザ内で decode -> trim/mono/downsample -> 再圧縮 の経路を本流へ入れると、処理コスト・実装複雑度・端末差が増える
- 圧縮済み入力に対して WAV へ戻すと、むしろサイズが悪化する恐れがある

結論:

- 研究継続の価値はある
- ただし「本流へ今すぐ戻す改善」ではない
- 将来やるなら、PCM 系や長尺入力に限定したオプション扱いがよい

## 枚数優先 vs 読み取り性優先

今回の compact 化と Base91 化を入れても、`2200` と `1100` の差は引き続き残る。

- dense: QR 枚数を抑える
- readable: 1QR あたりを軽くして物理読み取り性を優先する

今回の研究で分かったのは、

- header 短縮だけではこの大きなトレードオフは動かない
- 本文効率を上げる `PQR3` は readable 側で 1枚削減まで届く
- それでも dense / readable の選択自体は残る

ということだった。

## 本流へ取り込む価値がある案

優先順位つきで整理すると次の通り。

1. `PQS1` 単一QR compact payload
2. `PQR3` base91 chunk 本文
3. `PQR2` compact chunk header + MIME 記号化
4. decoder の新旧両対応維持

取り込む価値が高い理由:

- 成立済みPoCを壊さずに入れられる
- 外部依存を増やさない
- ローカル復元の思想を維持できる
- 将来の再実装可能性を損なわない
- 数字としても単一QRで明確に効く
- 分割QRでも `PQR3` は代表ケースで実際に 1 枚減った

## 副作用 / トレードオフ

- payload 自体は人間可読性が少し落ちる
- MIME コード表の共有が encoder / decoder 間で必要になる
- 未知 MIME を compact 化できないため fallback 実装を残す必要がある
- Base91 は decoder 側に追加の変換実装が必要
- Base91 は payload の見た目可読性がさらに下がる
- header 短縮だけでは chunk 枚数は変わらないケースが多い

## 今回の結論

最も効いたのは、単一QRの `data:text/html;base64,...` を送るのをやめ、
encoder/decoder の共通テンプレート前提で `PQS1` compact payload に置き換えたことだった。

分割QRについては、`PQR2` と MIME 記号化だけでは主に「同枚数で少し軽くする」改善に留まったが、
Base91 本文を使う `PQR3` は readable 設定で `16 -> 15`、重い WAV 系では `47 -> 42` まで減らせた。

音声前処理は PCM/WAV 相手には劇的に効くが、現行本流の圧縮済み入力フローへそのまま戻すには時期尚早だった。

したがって、本流へ戻すべきなのは:

- compact single payload (`PQS1`)
- base91 chunk (`PQR3`)
- compact chunk header (`PQR2`)
- decoder の後方互換維持

であり、音声前処理は研究継続テーマとして別線維持が妥当である。
