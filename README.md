# Reversi Puzzles

A modern, web-based Reversi puzzle application designed to challenge your endgame skills. Solve puzzles of varying difficulty by finding the optimal moves to win.

## Features

- **Puzzle Variety**: Solve puzzles with 2 thru 8 empty cells.
- **Smart Hints**: Real-time minimax evaluation scores to guide your strategy.
- **CPU Mode**: Toggle between player and CPU turns for practice or verification.
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
- **JavaScript (ES6)**: Pure JS game logic including minimax simulation for hints and CPU play.
- **Data (db.js)**: A separated database file containing thousands of pre-calculated Reversi endgame states.

## Getting Started

Simply open `index.html` in any modern web browser to start solving puzzles.

## License

MIT License
