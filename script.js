const BOARD_SIZE = 8;
const boardElement = document.getElementById('board');
const nextButton = document.getElementById('next-button');
const resetButton = document.getElementById('reset-button');
const hintButton = document.getElementById('hint-button');
const turnArrow = document.getElementById('turn-arrow');
const turnDisplay = document.getElementById('next-turn-msg');
const puzzleInfo = document.getElementById('puzzle-info');
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalOkBtn = document.getElementById('modal-ok-btn');

let allPuzzles = [];
let puzzles = [];

let currentBoard = [];
let currentPlayer = 'X';
let currentPuzzleLine = '';
let currentPuzzleIndex = -1;
let absolutePuzzleIndex = -1;
let lastMove = null;
let showHints = false;
let cachedHints = {};
let puzzleStartPlayer = 'X';
let isBotEnabled = true;
let isBotThinking = false;
let modalCallback = null;
let moveHistory = []; // stack of { board, player, lastMove }

function init()
{
    allPuzzles = DB_DATA.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .map(line =>
        {
            const parts = line.split(' ').filter(p => p.length > 0);
            const boardState = parts[0];
            const emptyCount = (boardState.match(/-/g) || []).length;
            return {
                line: line,
                turn: parts[1],
                emptyCells: emptyCount
            };
        });

    if (allPuzzles.length === 0)
    {
        puzzleInfo.textContent = 'パズルデータが見つかりません。';
        return;
    }

    const turnRadios = document.querySelectorAll('input[name="turn"]');
    turnRadios.forEach(radio =>
    {
        radio.addEventListener('change', () =>
        {
            applyFilter();
            loadRandomPuzzle();
        });
    });

    const emptyChecks = document.querySelectorAll('.empty-check');
    emptyChecks.forEach(check =>
    {
        check.addEventListener('change', () =>
        {
            applyFilter();
            loadRandomPuzzle();
        });
    });

    const selectAllBtn = document.getElementById('select-all-empty');
    selectAllBtn.addEventListener('click', () =>
    {
        emptyChecks.forEach(check => check.checked = true);
        applyFilter();
        loadRandomPuzzle();
    });

    const filterHeader = document.getElementById('filter-header');
    const filterContent = document.getElementById('filter-content');
    const closeFilterBtn = document.getElementById('close-filter-btn');

    if (filterHeader && filterContent && closeFilterBtn) {
        filterHeader.addEventListener('click', () => {
            filterContent.classList.remove('hidden');
            filterHeader.classList.add('hidden');
        });

        closeFilterBtn.addEventListener('click', () => {
            filterContent.classList.add('hidden');
            filterHeader.classList.remove('hidden');
        });
    }

    const undoButton = document.getElementById('undo-button');
    if (undoButton) undoButton.addEventListener('click', undoLastMove);

    modalOkBtn.addEventListener('click', () =>
    {
        modalOverlay.classList.add('hidden');
        if (modalCallback)
        {
            modalCallback();
            modalCallback = null;
        }
    });

    applyFilter();
    const blackLabel = document.getElementById('black-label');
    const whiteLabel = document.getElementById('white-label');

    const toggleBot = (e) =>
    {
        const span = e.target;
        if (span.textContent === 'You') return; // Cannot turn "You" into Bot

        if (span.textContent === 'Bot')
        {
            span.textContent = '---';
            isBotEnabled = false;
        } else
        {
            span.textContent = 'Bot';
            isBotEnabled = true;
            checkBotTurn();
        }
    };

    blackLabel.addEventListener('click', toggleBot);
    whiteLabel.addEventListener('click', toggleBot);

    loadRandomPuzzle();
}

function applyFilter()
{
    const turnFilterValue = document.querySelector('input[name="turn"]:checked').value;
    const checkedEmptyCounts = Array.from(document.querySelectorAll('.empty-check:checked'))
        .map(check => parseInt(check.value));

    puzzles = allPuzzles.filter(p =>
    {
        const turnMatch = (turnFilterValue === 'all' || p.turn === turnFilterValue);
        const emptyMatch = checkedEmptyCounts.includes(p.emptyCells);
        return turnMatch && emptyMatch;
    });

    // Update filter header to show selected count
    const filterHeader = document.getElementById('filter-header');
    if (filterHeader)
    {
        const span = filterHeader.querySelector('span');
        if (span) span.textContent = `▼ Filter (全${allPuzzles.length}問中 ${puzzles.length}問)`;
    }

    if (puzzles.length === 0)
    {
        puzzleInfo.textContent = '条件に合うパズルがありません。';
    }
}

function loadRandomPuzzle()
{
    if (puzzles.length === 0) return;
    const randomIndex = Math.floor(Math.random() * puzzles.length);
    currentPuzzleIndex = randomIndex;
    absolutePuzzleIndex = allPuzzles.indexOf(puzzles[randomIndex]);
    const puzzleData = puzzles[randomIndex].line;
    renderPuzzle(puzzleData);
}

function renderPuzzle(line)
{
    currentPuzzleLine = line;
    lastMove = null;
    moveHistory = []; // clear undo history on new puzzle
    // showHints = false; // Persistent hints
    cachedHints = {};
    const parts = line.split(' ').filter(p => p.length > 0);
    if (parts.length < 2) return;

    const boardStateStr = parts[0];
    currentPlayer = parts[1];
    puzzleStartPlayer = parts[1];
    isBotThinking = false;

    // Update player labels
    const blackLabel = document.getElementById('black-label');
    const whiteLabel = document.getElementById('white-label');
    if (puzzleStartPlayer === 'X')
    {
        blackLabel.textContent = 'You';
        whiteLabel.textContent = isBotEnabled ? 'Bot' : '---';
    } else
    {
        blackLabel.textContent = isBotEnabled ? 'Bot' : '---';
        whiteLabel.textContent = 'You';
    }

    // Reset turn message
    document.getElementById('next-turn-msg').textContent = '';

    currentBoard = [];
    for (let r = 0; r < 8; r++)
    {
        currentBoard[r] = boardStateStr.substring(r * 8, (r + 1) * 8).split('');
    }

    if (showHints) calculateHints();
    updateUI();
    checkBotTurn();
}

function updateUI()
{
    boardElement.innerHTML = '';
    let blackCount = 0;
    let whiteCount = 0;

    for (let r = 0; r < 8; r++)
    {
        for (let c = 0; c < 8; c++)
        {
            const char = currentBoard[r][c];
            const cell = document.createElement('div');
            cell.className = 'cell';

            if (char === 'X')
            {
                blackCount++;
                const stone = document.createElement('div');
                stone.className = 'stone black';
                if (lastMove && lastMove.r === r && lastMove.c === c)
                {
                    stone.classList.add('last-move');
                }
                stone.textContent = '';
                cell.appendChild(stone);
            } else if (char === 'O')
            {
                whiteCount++;
                const stone = document.createElement('div');
                stone.className = 'stone white';
                if (lastMove && lastMove.r === r && lastMove.c === c)
                {
                    stone.classList.add('last-move');
                }
                stone.textContent = '';
                cell.appendChild(stone);
            } else
            {
                if (isValidMove(r, c, currentPlayer).length > 0)
                {
                    cell.classList.add('valid-move');
                    if (showHints && cachedHints[`${r}-${c}`] !== undefined)
                    {
                        const hintText = document.createElement('span');
                        hintText.className = 'hint-text';
                        const score = cachedHints[`${r}-${c}`];
                        hintText.textContent = (score > 0 ? '+' : '') + score;
                        cell.appendChild(hintText);
                    }
                }
            }

            cell.addEventListener('click', () => handleCellClick(r, c));
            boardElement.appendChild(cell);
        }
    }

    document.getElementById('black-count').textContent = blackCount;
    document.getElementById('white-count').textContent = whiteCount;

    // Update hint button active state
    if (hintButton)
    {
        hintButton.classList.toggle('active', showHints);
    }

    // Update turn arrow
    if (turnArrow)
    {
        if (currentPlayer === 'X')
        {
            // turnArrow.textContent = '⬅ next turn　';
            turnArrow.textContent = '⬅　　　';
            turnArrow.style.textAlign = 'left';
        } else
        {
            // turnArrow.textContent = '　next turn ➡';
            turnArrow.textContent = '　　　➡';
            turnArrow.style.textAlign = 'right';
        }
    }

    if (currentPuzzleIndex !== -1 && puzzles[currentPuzzleIndex])
    {
        const p = puzzles[currentPuzzleIndex];
        const turnText = p.turn === 'X' ? '黒番' : '白番';
        // puzzleInfo.textContent = `第 ${absolutePuzzleIndex + 1} / ${allPuzzles.length} 問：${turnText}、${p.emptyCells} マス問題です`;
        puzzleInfo.textContent = `第 ${absolutePuzzleIndex + 1} 問：　${turnText}、${p.emptyCells} マス問題`;
    }

    return { blackCount, whiteCount };
}

function handleCellClick(r, c)
{
    if (isBotThinking) return;
    const flipList = isValidMove(r, c, currentPlayer);
    if (flipList.length === 0) return;

    // Save state for undo
    moveHistory.push({
        board: currentBoard.map(row => [...row]),
        player: currentPlayer,
        lastMove: lastMove ? { ...lastMove } : null
    });

    lastMove = { r, c };
    // showHints = false; // Persistent hints
    cachedHints = {};
    currentBoard[r][c] = currentPlayer;
    flipList.forEach(([fr, fc]) =>
    {
        currentBoard[fr][fc] = currentPlayer;
    });

    const nextPlayer = (currentPlayer === 'X' ? 'O' : 'X');
    const msgArea = document.getElementById('next-turn-msg');

    if (hasValidMove(nextPlayer))
    {
        currentPlayer = nextPlayer;
        msgArea.textContent = '　';
        if (showHints) calculateHints();
        updateUI();
    } else
    {
        if (hasValidMove(currentPlayer))
        {
            if (showHints) calculateHints();
            updateUI();
            msgArea.textContent = `${nextPlayer === 'X' ? '黒' : '白'}番がパスしました。`;
        } else
        {
            const counts = updateUI();
            const resultMsg = getWinnerMessage(counts.blackCount, counts.whiteCount);
            // showHints = false; // Persistent hints: don't turn off at game end

            const userWon = (puzzleStartPlayer === 'X' ? counts.blackCount > counts.whiteCount : counts.whiteCount > counts.blackCount);
            // msgArea.textContent = (userWon ? '正解！ ' : '失敗... ') + resultMsg;
            msgArea.textContent = resultMsg;
            if (turnArrow)
            {
                turnArrow.textContent = userWon ? '　正解！　' : '　失敗！　';  // '──';
                turnArrow.style.textAlign = 'center';
            }
        }
    }
    checkBotTurn();
}

function checkBotTurn()
{
    if (!isBotEnabled || isBotThinking) return;

    // Bot plays as the non-starting player
    const BotColor = (puzzleStartPlayer === 'X' ? 'O' : 'X');
    if (currentPlayer === BotColor)
    {
        executeBotMove();
    }
}

function executeBotMove()
{
    const moves = getValidMoves(currentBoard, currentPlayer);
    if (moves.length === 0) return;

    isBotThinking = true;

    // Use simulateGame to find the best move (minimax)
    let bestMove = moves[0];
    let bestValue = (currentPlayer === 'X' ? -100 : 100);

    for (const move of moves)
    {
        const nextBoard = currentBoard.map(row => [...row]);
        nextBoard[move.r][move.c] = currentPlayer;
        move.flips.forEach(([fr, fc]) => nextBoard[fr][fc] = currentPlayer);

        const value = simulateGame(nextBoard, currentPlayer === 'X' ? 'O' : 'X');
        if (currentPlayer === 'X')
        {
            if (value > bestValue)
            {
                bestValue = value;
                bestMove = move;
            }
        } else
        {
            if (value < bestValue)
            {
                bestValue = value;
                bestMove = move;
            }
        }
    }

    setTimeout(() =>
    {
        isBotThinking = false;
        handleCellClick(bestMove.r, bestMove.c);
    }, showHints ? 2000 : 1000);
}

function getWinnerMessage(black, white)
{
    if (black > white) return `黒の勝ち！ (${black} vs ${white})`;
    if (white > black) return `白の勝ち！ (${white} vs ${black})`;
    return `引き分け (${black} vs ${white})`;
}

function hasValidMove(color)
{
    for (let r = 0; r < 8; r++)
    {
        for (let c = 0; c < 8; c++)
        {
            if (isValidMove(r, c, color).length > 0) return true;
        }
    }
    return false;
}

function showModal(title, message, callback)
{
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalOverlay.classList.remove('hidden');
    modalCallback = callback;
}

function undoLastMove()
{
    if (isBotThinking || moveHistory.length === 0) return;
    const snapshot = moveHistory.pop();
    currentBoard = snapshot.board;
    currentPlayer = snapshot.player;
    lastMove = snapshot.lastMove;
    cachedHints = {};
    const msgArea = document.getElementById('next-turn-msg');
    if (msgArea) msgArea.textContent = '　';
    if (turnArrow) turnArrow.textContent = '';
    if (showHints) calculateHints();
    updateUI();
}


function isValidMove(r, c, color)
{
    if (currentBoard[r][c] !== '-') return [];

    const opponent = (color === 'X' ? 'O' : 'X');
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    let allFlips = [];

    for (const [dr, dc] of directions)
    {
        let currentFlips = [];
        let tr = r + dr;
        let tc = c + dc;

        while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && currentBoard[tr][tc] === opponent)
        {
            currentFlips.push([tr, tc]);
            tr += dr;
            tc += dc;
        }

        if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && currentBoard[tr][tc] === color && currentFlips.length > 0)
        {
            allFlips = allFlips.concat(currentFlips);
        }
    }

    return allFlips;
}

function getValidMoves(board, color)
{
    const moves = [];
    for (let r = 0; r < 8; r++)
    {
        for (let c = 0; c < 8; c++)
        {
            const flips = isValidMoveOnBoard(board, r, c, color);
            if (flips.length > 0) moves.push({ r, c, flips });
        }
    }
    return moves;
}

function isValidMoveOnBoard(board, r, c, color)
{
    if (board[r][c] !== '-') return [];
    const opponent = (color === 'X' ? 'O' : 'X');
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    let allFlips = [];
    for (const [dr, dc] of directions)
    {
        let currentFlips = [];
        let tr = r + dr, tc = c + dc;
        while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && board[tr][tc] === opponent)
        {
            currentFlips.push([tr, tc]);
            tr += dr; tc += dc;
        }
        if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && board[tr][tc] === color && currentFlips.length > 0)
        {
            allFlips = allFlips.concat(currentFlips);
        }
    }
    return allFlips;
}

function simulateGame(board, player)
{
    const moves = getValidMoves(board, player);
    if (moves.length === 0)
    {
        const nextPlayer = (player === 'X' ? 'O' : 'X');
        if (getValidMoves(board, nextPlayer).length === 0)
        {
            let black = 0, white = 0;
            for (let r = 0; r < 8; r++)
            {
                for (let c = 0; c < 8; c++)
                {
                    if (board[r][c] === 'X') black++;
                    else if (board[r][c] === 'O') white++;
                }
            }
            return black - white;
        }
        return simulateGame(board, nextPlayer);
    }

    let bestValue = (player === 'X' ? -100 : 100);
    for (const move of moves)
    {
        const nextBoard = board.map(row => [...row]);
        nextBoard[move.r][move.c] = player;
        move.flips.forEach(([fr, fc]) => nextBoard[fr][fc] = player);

        const value = simulateGame(nextBoard, player === 'X' ? 'O' : 'X');
        if (player === 'X')
        {
            bestValue = Math.max(bestValue, value);
        } else
        {
            bestValue = Math.min(bestValue, value);
        }
    }
    return bestValue;
}

function calculateHints()
{
    const moves = getValidMoves(currentBoard, currentPlayer);
    cachedHints = {};
    for (const move of moves)
    {
        const nextBoard = currentBoard.map(row => [...row]);
        nextBoard[move.r][move.c] = currentPlayer;
        move.flips.forEach(([fr, fc]) => nextBoard[fr][fc] = currentPlayer);
        cachedHints[`${move.r}-${move.c}`] = simulateGame(nextBoard, currentPlayer === 'X' ? 'O' : 'X');
    }
}

nextButton.addEventListener('click', loadRandomPuzzle);
resetButton.addEventListener('click', () =>
{
    if (currentPuzzleLine)
    {
        renderPuzzle(currentPuzzleLine);
    }
});

hintButton.addEventListener('click', () =>
{
    if (showHints)
    {
        showHints = false;
    } else
    {
        calculateHints();
        showHints = true;
    }
    updateUI();
});

// Add keyboard shortcuts
window.addEventListener('keydown', (e) =>
{
    // If the user is typing in a text field, don't trigger shortcuts
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const key = e.key.toLowerCase();
    if (key === 'n')
    {
        loadRandomPuzzle();
    } else if (key === 'r')
    {
        if (currentPuzzleLine)
        {
            renderPuzzle(currentPuzzleLine);
        }
    } else if (key === 'h')
    {
        hintButton.click();
    } else if (key === 'u')
    {
        undoLastMove();
    }
});

init();
