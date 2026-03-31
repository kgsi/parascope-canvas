# Parascope Canvas

Parascope のプロトタイプ・デモ配布リポジトリ。
デザインとAIをテーマにした実験やサンプルを格納する。

## ディレクトリ構成

```
sample/
└── <プロジェクト名>/    # kebab-case で命名
    ├── README.md        # 概要・使い方
    └── ...              # 技術に応じた任意のファイル
```

## プロトタイプ作成

1. `sample/` に新しいディレクトリを作成（kebab-case）
2. 各プロジェクトは完全に独立。技術スタック自由
3. `README.md` を含め、使い方を記載する
4. 必要なら `package.json` 等を各プロジェクト内に配置

## 規約

- 各プロジェクトは自己完結（プロジェクト間の依存禁止）
- `.pen` ファイルは Pencil MCP ツールのみで操作（Read/Grep 禁止）
- コミット: Conventional Commits、日本語1行
