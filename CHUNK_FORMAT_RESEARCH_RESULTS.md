# Chunk Format Research Results

更新日: 2026-04-14

## 研究の問い

分割QRについて、`PQR2` / `PQR3` の次にまだ一般的で、
長期保存にも向く改善があるかを調べた。

今回の焦点は次の4つだった。

1. さらに一般化できる chunk codec はあるか
2. 枚数削減に効くか
3. 紙に焼く保存思想と矛盾しないか
4. 何を本流へ入れ、何を研究継続に回すべきか

## 比較した候補

### 1. `PQR2` + Base64

現在の compact header 基準案。

- 固定長 header
- MIME 記号化
- chunk 本文は Base64
- byte mode 前提

### 2. `PQR3` + Base91

今回すでに実装済みの本文効率改善案。

- `PQR3` header
- chunk 本文は Base91
- byte mode のまま使える
- encoder は `PQR2` と `PQR3` を自動比較して有利な方を採用

### 3. `PQ4` raw binary byte mode

今回の継続実装で追加した、生バイトを QR byte mode に直接載せる案。

- header は `PQ4 + index + total + mime-length + mime`
- chunk 本文は元ファイル bytes をそのまま格納
- decoder は `jsQR.binaryData` から直接復元
- `PQR1` / `PQR2` / `PQR3` と共存可能

printable ASCII ではないが、QR の byte mode 自体は標準仕様であり、
format も短く説明できる。

### 4. `PQR4` + Base45 + alphanumeric mode

今回の研究で「次の本命」と見えた未実装候補。

- Base45 は QR の alphanumeric mode へ載せやすい
- byte mode より同じ QR に多く載せられる可能性が高い
- ただし現状の renderer は alphanumeric mode 指定を使っていないため、理論比較止まり

### 5. manifest first chunk

共通情報を最初の1枚へ寄せる案。

- MIME
- total
- codec
- digest

などを manifest chunk に置き、以後の chunk を軽くする。

数字上は効くが、
「1枚ずつでもある程度 self-describing であること」を弱める。

### 6. parity / 冗長 chunk

枚数削減ではなく復元性改善の案。

- 例: 8枚ごとに 1枚 parity を足す
- 1枚欠けても復元できる余地を増やす

紙や実機スキャンには有望だが、
今回は「枚数削減」が主テーマなので採用は見送る。

## 実測スクリプト

比較スクリプト:

- [scripts/research-chunk-formats.js](/Users/miwakenomac/Projects/parapara-qr/scripts/research-chunk-formats.js)

実行:

```bash
node scripts/research-chunk-formats.js
```

補足:

- `PQR2` / `PQR3` / `PQR4` / manifest / parity の比較は上記スクリプトで再現できる
- `PQ4` は今回の実装と Playwright 実測結果を文書へ反映している

## 実測結果

| strategy | dense 1,400B | readable 1,400B | dense 12,795B | readable 12,795B | dense 24,000B | readable 24,000B | generality | longevity | complexity |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| PQR2 + Base64 | 1 | 2 | 8 | 16 | 15 | 30 | high | high | mid |
| PQR3 + Base91 | 1 | 2 | 8 | 15 | 14 | 28 | high | high | mid |
| PQ4 + raw binary byte mode | 1 | 1 | 5 | 5 | 9 | 9 | high | high | mid |
| PQR4 + Base45 + alphanumeric | 1 | 2 | 7 | 13 | 12 | 23 | high | high | high |
| manifest first chunk + Base91 | 1 | 2 | 8 | 15 | 14 | 28 | high | mid | high |
| PQR3 + parity every 8 chunks | 2 | 3 | 9 | 17 | 16 | 32 | mid | high | high |

## 何が分かったか

### 1. 枚数削減だけを見るなら `PQ4` が最強だった

理由:

- 分割本文の文字エンコード overhead が消える
- 12,795B ケースで `8 -> 5`
- 24,000B ケースでも `14/15 -> 9` 相当まで落ちる

弱点:

- 人間が payload を目視で読むことはできない
- `BarcodeDetector` のような string-only API では扱いにくい
- renderer 側に integer cell / quiet zone の調整が必要だった

つまり、
**最も効くが、ASCII 形式よりは少し道具寄り**
という位置づけになった。

### 2. `PQR3` は今すぐ使う一般解としてかなり良い

理由:

- MIME に依存せず任意バイト列へ使える
- byte mode のまま導入できる
- decoder 実装も比較的単純
- readable では実際に `16 -> 15` の枚数削減が出た
- printable ASCII に閉じるので仕様を紙に書きやすい

つまり、
**「実装可能性・一般性・保存思想」のバランスが最も良い ASCII 現実解**
だった。

### 3. 次の本命は `PQR4`

Base45 自体より重要なのは、
**QR の alphanumeric mode をちゃんと使うこと**
だった。

理論比較では:

- `12,795B`: readable `15 -> 13`
- `24,000B`: readable `28 -> 23`

まで下がる見込みがある。

ただし現状は、

- renderer が byte mode 前提
- alphanumeric mode 指定の差し込みが必要
- 実測ではなく理論推計段階

なので、今回は本流投入ではなく「次の研究テーマ」とした。

### 4. manifest first chunk は数字のわりに保存思想と相性が悪い

効くこと:

- 共通情報を毎回送らなくてよい
- 長い系列ほど無駄を減らせる

弱いこと:

- 途中の chunk だけ見ても意味が取りにくくなる
- 最初の1枚が失われたときの復元性が下がる
- 紙に焼いた後の再実装性・可読性が少し悪くなる

結論:

- アプリ前提なら有力
- このプロジェクトの「紙にデータと復元手がかりを残す」思想には少し逆風

### 5. parity は枚数削減ではなく読み取り性改善の研究

枚数は増えるが、

- 何枚かの読み損じに耐えたい
- 印刷劣化や欠損を吸収したい

という意味では長期保存に向く。

つまり parity は
「圧縮の次の研究軸」
として扱うのが適切。

## 長期保存に向く形とは何か

今回の研究で、長期保存向けには次の性質が重要だと分かった。

### 必要な性質

- 仕様が短く説明できる
- chunk 単位でもある程度 self-describing である
- decoder を失っても再実装しやすい
- 特定企業やサービス固有の binary 仕様に寄りすぎない
- 必要に応じて ASCII 版と binary 版を使い分けられる

### その観点での評価

- `PQ4`: 良い
  - QR 標準の byte mode に閉じる
  - format が短い
  - 元 bytes をそのまま持つので再実装しやすい
  - ただし肉眼可読性はない
- `PQR3`: 良い
  - ASCII
  - 実装が比較的短い
  - chunk 単位の self-describing をまだ保てる
- `PQR4`: かなり良い見込み
  - ASCII
  - QR そのものの強みをより活かせる
  - ただし renderer 実装がまだ必要
- manifest first chunk: やや弱い
  - 効率は上がる
  - ただし self-describing 性が下がる
- parity: 良いが役割が違う
  - 保存性は上がる
  - 圧縮ではない

## 今の推奨

### 本流へ戻すべきもの

1. `PQS1`
2. `PQ4`
3. `PQR3`
4. `PQR2`
5. decoder の新旧互換維持

### 次に研究すべきもの

1. `PQR4` の実装
2. parity / 冗長 chunk の実験
3. 形式を versioned spec として紙に残すための manifest 設計

## 提案する長期形

現時点で「一般的で長期保存に向く形」として最も自然なのは次の構成。

### 近未来の実用形

- 単一QR: `PQS1`
- 分割QR count-first: `PQ4`
- 分割QR ascii-first: `PQR3`
- 各 chunk は self-describing
- decoder は新旧互換を持つ

### その先の理想形

- 単一QR: `PQS1`
- 分割QR: `PQ4` / `PQR4` / `PQR3` を用途で使い分け
- 必要に応じて parity 系を追加
- 仕様書に codec / alphabet / chunk layout / digest を明記

## 結論

分割QRの継続研究としては、

- **枚数削減で最も効いた実装済み案は `PQ4`**
- **ASCII 性と保存思想のバランスが最も良い実装済み案は `PQR3`**
- **次の伸びしろが最も大きい未実装案は `PQR4`**

だった。

manifest first chunk や parity も価値はあるが、

- manifest は効率寄り
- parity は復元性寄り

であり、今回の「一般的で長期保存に向く分割形式」という意味では
`PQ4` を count-first 現実解、`PQR3` を ascii-first 現実解、`PQR4` を次の本命
と整理するのが最も妥当だった。
