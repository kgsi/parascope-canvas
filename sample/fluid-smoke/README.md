# Fluid Smoke

[Pretext](https://github.com/chenglou/pretext) を使った日本語文字による流体シミュレーションデモ。

漢字の画数の多さ＝高密度、ひらがな＝低密度として、流体シミュレーションの密度値を日本語文字の「視覚的な濃さ」にマッピング。CJK 文字の正方形フォルムが流体グリッドと相性抜群。

## 操作

- マウスを動かすと煙がかき乱される
- 4 つのエミッターが軌道上を漂いながら煙を放出

## 技術

- **Pretext** (`@chenglou/pretext`) — `prepareWithSegments` で文字幅を計測
- **流体シミュレーション** — セミラグランジアン Advection + 拡散
- **明度マッピング** — Canvas で各文字のピクセル濃度を計測、二分探索で最適文字を選択
- **Bun** + **TypeScript**

## 起動

```bash
bun install
bun ./index.html
# http://localhost:3000
```
