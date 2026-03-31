# Editorial Engine

[Pretext](https://github.com/chenglou/pretext) を使った DOM 計測ゼロのエディトリアルレイアウトデモ。

光球（Orb）がページ上を漂い、日本語テキストがリアルタイムに障害物を避けて流れます。マルチカラム、プルクォート、ドロップキャップを含む雑誌風レイアウトを 60fps で実現。

## 操作

- 光球をドラッグして移動
- 光球をクリックで一時停止/再開
- ウィンドウリサイズで 1〜3 段組みが切り替わる

## 技術

- **Pretext** (`@chenglou/pretext`) — `layoutNextLine` で行ごとに障害物を回避
- **Bun** — 開発サーバー・バンドラー
- **TypeScript**

## 起動

```bash
bun install
bun ./index.html
# http://localhost:3000
```
