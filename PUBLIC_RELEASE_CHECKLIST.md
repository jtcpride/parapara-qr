# Public Release Checklist

## GitHub 側

- リポジトリ visibility を `Public` にする
- `About` の description を入れる
- `Website` に `https://jtcpride.github.io/parapara-qr/` を入れる
- topics を入れる
- `README.md` が最新になっていることを確認する
- `VISION.md` が最新になっていることを確認する
- `RIGHTS_STATUS.md` を repo で見える位置に置く
- `v0.1.0` release を作る

## デモ導線

- 入口: `https://jtcpride.github.io/parapara-qr/`
- 標準エンコーダ: `https://jtcpride.github.io/parapara-qr/parapara-qr-poc.html`
- 読み取り優先試作: `https://jtcpride.github.io/parapara-qr/parapara-qr-poc-readable.html`
- デコーダ: `https://jtcpride.github.io/parapara-qr/parapara-qr-decoder.html`

## 実演確認

- 短い `.m4a` を QR 化できる
- iPhone で decoder を開ける
- QR 群を順に読める
- 復元ファイルが保存される
- 印刷した紙から復元できる
- 印刷ヘッダーの decoder QR が読み取れる

## X 投稿前

- 投稿に使う JPG を選ぶ
- 1投稿目に decoder URL を入れる
- 2投稿目に encoder と repo を入れる
- 必要なら 3投稿目で印刷復元を補足する
- ノック音など権利が明快なサンプルを使う

## 今回の公開で言い切ること

- 紙や画面上のQRを保存媒体として使える
- その紙から後でデータを復元できる
- その復元はブラウザだけで成立する

## 今回の公開で言い切らないこと

- 完成版である
- UX が仕上がっている
- 動画が完成している
- ライセンス方針が確定している
