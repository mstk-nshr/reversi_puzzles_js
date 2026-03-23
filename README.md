# Reversi Puzzles

A modern, web-based Reversi puzzle application designed to challenge your endgame skills. Solve puzzles of varying difficulty by finding the optimal moves to win.

## Features

- **Puzzle Variety**: Solve puzzles with 2 thru 8 empty cells.
- **Smart Hints**: Real-time minimax evaluation scores to guide your strategy.
- **Bot Mode**: Toggle between player and Bot turns for practice or verification.
- **Filtering**: Easily filter puzzles by turn (Black/White) and number of empty cells.
- **Modern UI**: A sleek glassmorphism design with responsive elements and smooth transitions.
- **Keyboard Shortcuts**:
  - `N`: Load the next random puzzle.
  - `R`: Reset the current puzzle.
  - `H`: Toggle hint display.

## Technical Overview

The application is built with a clean separation of concerns using vanilla web technologies:

- **HTML5**: Semantic structure for the game board and control panels.
- **CSS3**: Custom glassmorphism styling, responsive layout, and polished animations.
- **JavaScript (ES6)**: Pure JS game logic including minimax simulation for hints and Bot play.
- **Data (db.js)**: A separated database file containing thousands of pre-calculated Reversi endgame states.

## Getting Started

Simply open `index.html` in any modern web browser to start solving puzzles.

## normalize_db.js の使い方

- **概要**: `normalize_db.js` はプロジェクト内の `db.js` に含まれる `DB_DATA`（バックティック文字列）を解析し、盤面表現を回転・反転変換で正規化（同値な盤面のうち最小のビット値を選択）します。標準実行では結果を `normalize_db.json` に書き出します。`--apply` オプションを付けると、バックアップを作成した上で `db.js` を正規化された盤面で上書きします。

- **前提**: Node.js がインストールされていること。

- **使い方（例）**:

```bash
# 解析して `normalize_db.json` を生成（db.js は変更しない）
node normalize_db.js

# 解析結果を `db.js` に適用（実行前にバックアップが作成される）
node normalize_db.js --apply
```

- **出力**:
  - `normalize_db.json`: 各レコードごとに `normalizedBoard`, `canonicalHex`, `canonicalDec` などを含む JSON 配列が書き出されます。
  - `db.js.backup-<timestamp>`: `--apply` 実行時に作成されるバックアップファイル。

- **備考**:
  - 変更を適用する前に `normalize_db.json` を確認してください。
  - スクリプトはリポジトリのルートで `db.js` と同じディレクトリにあることを前提に動作します。

## License

MIT License
