// データベース設定
const DB_NAME = 'reversi_puzzles_stats';
const DB_VERSION = 1;
const STORE_NAME = 'results';

function openDb() {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = (ev) => {
			const db = ev.target.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
				store.createIndex('puzzleId', 'puzzleId', { unique: false });
				store.createIndex('outcome', 'outcome', { unique: false });
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function recordResult(puzzleId, outcome) {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const rec = { puzzleId: String(puzzleId), outcome: outcome, ts: Date.now() };
		const r = store.add(rec);
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});
}

async function getAllRecords() {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readonly');
		const store = tx.objectStore(STORE_NAME);
		const req = store.getAll();
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function getStats() {
	const all = await getAllRecords();
	const map = {};
	all.forEach(r => {
		const id = r.puzzleId || 'unknown';
		if (!map[id]) map[id] = { puzzleId: id, success: 0, fail: 0, total: 0 };
		if (r.outcome === 'success') map[id].success++;
		else map[id].fail++;
		map[id].total++;
	});
	return Object.values(map).sort((a,b) => b.total - a.total);
}

async function clearResults() {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, 'readwrite');
		const store = tx.objectStore(STORE_NAME);
		const req = store.clear();
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

// 公開
window.db = {
	recordResult,
	getAllRecords,
	getStats,
	clearResults
};


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
let currentPuzzleOriginalLine = '';
let currentPuzzleTransform = null;
let currentPuzzleIndex = -1;
let absolutePuzzleIndex = -1;
let lastMove = null;
let showHints = false;
let cachedHints = {};
let cachedBestHint = null;
let puzzleStartPlayer = 'X';
let isBotEnabled = true;
let isBotThinking = false;
let modalCallback = null;
let moveHistory = []; // stack of { board, player, lastMove }
let suppressRecord = false; // reset/undo 使用時は直後の保存を抑制する

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
        puzzleInfo.textContent = 'No puzzle data found.';
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

    // Update filter header to show selected count and a compact summary when folded
    const filterHeader = document.getElementById('filter-header');
    if (filterHeader)
    {
        const span = filterHeader.querySelector('span');
        if (span) {
            const emptySummary = checkedEmptyCounts.length > 0 ? checkedEmptyCounts.slice().sort((a,b)=>a-b).join(',') : 'All';
            let typeSummary = '';
            if (turnFilterValue === 'all') typeSummary = 'BW';
            else if (turnFilterValue === 'X') typeSummary = 'B';
            else typeSummary = 'W';
            span.textContent = `▼ Filter: ${emptySummary} ${typeSummary} ( ${puzzles.length} / ${allPuzzles.length} )`;
        }
    }

    // Also update the filter-content count display (inside expanded panel)
    const filterCountEl = document.getElementById('filter-count');
    if (filterCountEl)
    {
        filterCountEl.textContent = `${puzzles.length} / ${allPuzzles.length} puzzles selected`;
    }

    if (puzzles.length === 0)
    {
        puzzleInfo.textContent = 'No puzzles match the filters.';
    }
}

function loadRandomPuzzle()
{
    if (puzzles.length === 0) return;
    const randomIndex = Math.floor(Math.random() * puzzles.length);
    currentPuzzleIndex = randomIndex;
    absolutePuzzleIndex = allPuzzles.indexOf(puzzles[randomIndex]);
    const puzzleData = puzzles[randomIndex].line;
    // store original (for identification) and apply a random transform for display
    currentPuzzleOriginalLine = puzzleData;
    const transformed = applyRandomTransformLine(puzzleData);
    currentPuzzleTransform = transformed.transform;
    renderPuzzle(transformed.line);
}

function renderPuzzle(line)
{
    currentPuzzleLine = line;
    lastMove = null;
    moveHistory = []; // clear undo history on new puzzle
    // showHints = false; // Persistent hints
    cachedHints = {};
    cachedBestHint = null;
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
                        const key = `${r}-${c}`;
                        const hintText = document.createElement('span');
                        hintText.className = 'hint-text';
                        const score = cachedHints[key];
                        hintText.textContent = (score > 0 ? '+' : '') + score;
                        if (key === cachedBestHint) hintText.classList.add('best');
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

    if (currentPuzzleIndex !== -1 && puzzles[currentPuzzleIndex]) {
        const p = puzzles[currentPuzzleIndex];
        const turnText = p.turn === 'X' ? 'Black to move' : 'White to move';
        puzzleInfo.textContent = `Puzzle ${absolutePuzzleIndex + 1}: ${turnText}, ${p.emptyCells} empty cells`;
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
    cachedHints = {};
    cachedBestHint = null;
    currentBoard[r][c] = currentPlayer;
    flipList.forEach(([fr, fc]) => { currentBoard[fr][fc] = currentPlayer; });

    const nextPlayer = (currentPlayer === 'X' ? 'O' : 'X');
    const msgArea = document.getElementById('next-turn-msg');

    // Normal turn switch
    if (hasValidMove(nextPlayer)) {
        currentPlayer = nextPlayer;
        msgArea.textContent = '　';
        if (showHints) calculateHints();
        updateUI();
        checkBotTurn();
        return;
    }

    // nextPlayer must pass but current player has moves
    if (hasValidMove(currentPlayer)) {
        // First update the board to reflect the move
        if (showHints) calculateHints();
        updateUI();

        const isYou = (nextPlayer === puzzleStartPlayer);
        if (isYou) {
            msgArea.textContent = 'pass😧';
            if (turnArrow) { turnArrow.textContent = '　pass😧　'; turnArrow.style.textAlign = 'center'; }
        } else {
            // msgArea.textContent = '連打👍';
            msgArea.textContent = 'pass👍';
            if (turnArrow) { turnArrow.textContent = '　pass👍　'; turnArrow.style.textAlign = 'center'; }
            // msgArea.textContent = 'pass👍';
            // if (turnArrow) { turnArrow.textContent = '　pass👍　'; turnArrow.style.textAlign = 'center'; }
        }

        setTimeout(() => {
            msgArea.textContent = '　';
            // After resolving the pass, allow bot to act if it's their turn
            checkBotTurn();
        }, 2000);
        return;
    }

    // Game over
    const counts = updateUI();
    const resultMsg = getWinnerMessage(counts.blackCount, counts.whiteCount);
    const userWon = (puzzleStartPlayer === 'X' ? counts.blackCount > counts.whiteCount : counts.whiteCount > counts.blackCount);
    msgArea.textContent = resultMsg;
    if (turnArrow) {
        turnArrow.textContent = userWon ? '  Correct!  ' : '  Failed!  ';
        turnArrow.style.textAlign = 'center';
    }

    if (!showHints && isBotEnabled) {
        try {
            if (!suppressRecord) {
                const puzzleId = (absolutePuzzleIndex !== -1) ? String(absolutePuzzleIndex + 1) : currentPuzzleLine;
                if (typeof window.recordPuzzleResult === 'function') {
                    window.recordPuzzleResult(puzzleId, !!userWon);
                }
            } else {
                suppressRecord = false;
            }
        } catch (e) {
            console.error('recordPuzzleResult error', e);
            suppressRecord = false;
        }
    } else {
        suppressRecord = false;
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
    isBotThinking = true;

    const { black, white } = boardToBitboards(currentBoard);
    const p = (currentPlayer === 'X' ? black : white);
    const o = (currentPlayer === 'X' ? white : black);
    const emptyMask = (~(black | white)) & MASK64;
    const pc = popcount(p);
    const oc = popcount(o);

    memoBB.clear();

    const moves = [];
    let t = emptyMask;
    while (t !== 0n) {
        const s = t & -t;
        const flipped = getFlippedMaskBB(s, p, o);
        if (flipped !== 0n) {
            moves.push({ s, flipped });
        }
        t ^= s;
    }

    if (moves.length === 0) {
        isBotThinking = false;
        return;
    }

    let bestMove = moves[0];
    let bestValue = -100;

    for (const move of moves) {
        const k = popcount(move.flipped);
        const value = -solveBB(o ^ move.flipped, p | move.s | move.flipped, oc - k, pc + 1 + k, emptyMask ^ move.s, false);
        if (value > bestValue) {
            bestValue = value;
            bestMove = move;
        }
    }

    setTimeout(() => {
        isBotThinking = false;
        const index = Number(BigInt.asUintN(64, bestMove.s).toString(2).length - 1);
        handleCellClick(Math.floor(index / 8), index % 8);
    }, showHints ? 2000 : 1000);
}

function getWinnerMessage(black, white)
{
    if (black > white) return `Black wins! (${black} vs ${white})`;
    if (white > black) return `White wins! (${white} vs ${black})`;
    return `Draw (${black} vs ${white})`;
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
    // 「戻る」操作なので直近の結果保存を抑制する
    suppressRecord = true;
    const snapshot = moveHistory.pop();
    currentBoard = snapshot.board;
    currentPlayer = snapshot.player;
    lastMove = snapshot.lastMove;
    cachedHints = {};
    cachedBestHint = null;
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

// --- Bitboard Engine ---
const MASK64 = 0xffffffffffffffffn;
const H_MASK = 0x7e7e7e7e7e7e7e7en;
const memoBB = new Map();

function boardToBitboards(board) {
    let black = 0n, white = 0n;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const char = board[r][c];
            if (char === 'X') black |= (1n << BigInt(r * 8 + c));
            else if (char === 'O') white |= (1n << BigInt(r * 8 + c));
        }
    }
    return { black, white };
}

function getFlippedMaskBB(s, p, o) {
    let flipped = 0n, t, om = o & H_MASK;
    // Right
    t = (s << 1n) & om; t |= (t << 1n) & om; t |= (t << 1n) & om; t |= (t << 1n) & om; t |= (t << 1n) & om; t |= (t << 1n) & om;
    if ((t << 1n) & p) flipped |= t;
    // Left
    t = (s >> 1n) & om; t |= (t >> 1n) & om; t |= (t >> 1n) & om; t |= (t >> 1n) & om; t |= (t >> 1n) & om; t |= (t >> 1n) & om;
    if ((t >> 1n) & p) flipped |= t;
    // Down
    t = (s << 8n) & o; t |= (t << 8n) & o; t |= (t << 8n) & o; t |= (t << 8n) & o; t |= (t << 8n) & o; t |= (t << 8n) & o;
    if ((t << 8n) & p) flipped |= t;
    // Up
    t = (s >> 8n) & o; t |= (t >> 8n) & o; t |= (t >> 8n) & o; t |= (t >> 8n) & o; t |= (t >> 8n) & o; t |= (t >> 8n) & o;
    if ((t >> 8n) & p) flipped |= t;
    // Diagonals
    t = (s << 9n) & om; t |= (t << 9n) & om; t |= (t << 9n) & om; t |= (t << 9n) & om; t |= (t << 9n) & om; t |= (t << 9n) & om;
    if ((t << 9n) & p) flipped |= t;
    t = (s << 7n) & om; t |= (t << 7n) & om; t |= (t << 7n) & om; t |= (t << 7n) & om; t |= (t << 7n) & om; t |= (t << 7n) & om;
    if ((t << 7n) & p) flipped |= t;
    t = (s >> 7n) & om; t |= (t >> 7n) & om; t |= (t >> 7n) & om; t |= (t >> 7n) & om; t |= (t >> 7n) & om; t |= (t >> 7n) & om;
    if ((t >> 7n) & p) flipped |= t;
    t = (s >> 9n) & om; t |= (t >> 9n) & om; t |= (t >> 9n) & om; t |= (t >> 9n) & om; t |= (t >> 9n) & om; t |= (t >> 9n) & om;
    if ((t >> 9n) & p) flipped |= t;
    return flipped;
}

function solveBB(p, o, pc, oc, emptyMask, isPass) {
    const key = (p << 64n) | o;
    const cached = memoBB.get(key);
    if (cached !== undefined) return cached;
    let bestValue = -100, t = emptyMask, hasMove = false;
    while (t !== 0n) {
        const s = t & -t;
        const flipped = getFlippedMaskBB(s, p, o);
        if (flipped !== 0n) {
            hasMove = true;
            let k = popcount(flipped);
            const v = -solveBB(o ^ flipped, p | s | flipped, oc - k, pc + 1 + k, emptyMask ^ s, false);
            if (v > bestValue) bestValue = v;
        }
        t ^= s;
    }
    if (!hasMove) {
        if (isPass) return pc - oc;
        const result = -solveBB(o, p, oc, pc, emptyMask, true);
        memoBB.set(key, result);
        return result;
    }
    memoBB.set(key, bestValue);
    return bestValue;
}

function popcount(n) {
    let count = 0;
    let temp = n;
    while (temp !== 0n) { temp &= (temp - 1n); count++; }
    return count;
}

function calculateHints()
{
    const { black, white } = boardToBitboards(currentBoard);
    const p = (currentPlayer === 'X' ? black : white);
    const o = (currentPlayer === 'X' ? white : black);
    const emptyMask = (~(black | white)) & MASK64;
    const pc = popcount(p);
    const oc = popcount(o);

    cachedHints = {};
    cachedBestHint = null;
    memoBB.clear();

    const moves = [];
    let t = emptyMask;
    while (t !== 0n) {
        const s = t & -t;
        const flipped = getFlippedMaskBB(s, p, o);
        if (flipped !== 0n) {
            const index = Number(BigInt.asUintN(64, s).toString(2).length - 1);
            const r = Math.floor(index / 8);
            const c = index % 8;
            const k = popcount(flipped);
            const relativeScore = -solveBB(o ^ flipped, p | s | flipped, oc - k, pc + 1 + k, emptyMask ^ s, false);
            // Convert relative score to absolute score (Black - White)
            // If currentPlayer is 'X' (Black), score is already (X - O)
            // If currentPlayer is 'O' (White), score is (O - X), so negate to get (X - O)
            const score = (currentPlayer === 'X' ? relativeScore : -relativeScore);
            cachedHints[`${r}-${c}`] = score;
            moves.push({ r, c, score, key: `${r}-${c}` });
        }
        t ^= s;
    }

    if (moves.length === 0) return;
    
    let bestScore = (currentPlayer === 'X' ? -Infinity : Infinity);
    for (const m of moves) {
        if (currentPlayer === 'X') {
            if (m.score > bestScore) { bestScore = m.score; cachedBestHint = m.key; }
        } else {
            if (m.score < bestScore) { bestScore = m.score; cachedBestHint = m.key; }
        }
    }
}

// --- Board transform utilities ---
function boardStrToMatrix(str)
{
    const m = [];
    for (let r = 0; r < 8; r++) m[r] = str.substring(r*8, (r+1)*8).split('');
    return m;
}

function matrixToBoardStr(m)
{
    return m.map(row => row.join('')).join('');
}

function rotateMatrix90(m)
{
    const n = Array.from({length:8}, () => Array(8).fill('-'));
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) n[r][c] = m[8-1-c][r];
    return n;
}

function flipMatrixHorizontal(m)
{
    const n = Array.from({length:8}, () => Array(8).fill('-'));
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) n[r][c] = m[r][8-1-c];
    return n;
}

function applyTransform(matrix, transform)
{
    // transform: { rot: 0|1|2|3, flip: boolean }
    let m = matrix;
    for (let i = 0; i < (transform.rot || 0); i++) m = rotateMatrix90(m);
    if (transform.flip) m = flipMatrixHorizontal(m);
    return m;
}

function applyRandomTransformLine(line)
{
    // line format: "<64chars> <turn> ..."
    const parts = line.split(' ').filter(p => p.length > 0);
    if (parts.length < 1) return { line, transform: null };
    const boardStr = parts[0];
    const rest = parts.slice(1).join(' ');
    const matrix = boardStrToMatrix(boardStr);
    // pick random transform from 8 dihedral group elements
    const rot = Math.floor(Math.random() * 4); // 0..3
    const flip = Math.random() < 0.5; // true/false
    const transform = { rot, flip };
    const outMatrix = applyTransform(matrix, transform);
    const outBoardStr = matrixToBoardStr(outMatrix);
    const outLine = outBoardStr + (rest ? (' ' + rest) : '');
    return { line: outLine, transform };
}

nextButton.addEventListener('click', loadRandomPuzzle);
resetButton.addEventListener('click', () =>
{
    if (currentPuzzleLine)
    {
        // 「始めからやり直す」操作なので直近の結果保存を抑制する
        suppressRecord = true;
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
    // ESC closes modal if open
    if (key === 'escape') {
        const modal = document.getElementById('modal-overlay');
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
            return;
        }
    }
    if (key === 'n')
    {
        loadRandomPuzzle();
    } else if (key === 's') {
        const sb = document.getElementById('stats-button');
        if (sb) sb.click();
    } else if (key === 'r')
    {
        if (currentPuzzleLine)
        {
            // キーボード操作によるリセットも抑制対象にする
            suppressRecord = true;
            renderPuzzle(currentPuzzleLine);
        }
    } else if (key === 'h')
    {
        hintButton.click();
    } else if (key === 'u')
    {
        undoLastMove();
    // } else if (key === 's')
    // {
    //     statsBtn.click();
    }
});

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    // db 初期化（open を一度呼ぶ）
    if (window.db && typeof window.db.getStats === 'function') {
        // no-op; db.js self-handles open on demand
    }

    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalOk = document.getElementById('modal-ok-btn');
    const clearStatsBtn = document.getElementById('clear-stats-btn');
    const clearZeroFailBtn = document.getElementById('clear-zero-fail-btn');
    const statsBtn = document.getElementById('stats-button');

    function openModal(title, html, showClear = false) {
        modalTitle.textContent = title;
        modalMessage.innerHTML = html;
        clearStatsBtn.style.display = showClear ? 'inline-block' : 'none';
        if (clearZeroFailBtn) clearZeroFailBtn.style.display = showClear ? 'inline-block' : 'none';
        modalOverlay.classList.remove('hidden');
    }
    function closeModal() {
        modalOverlay.classList.add('hidden');
    }

    modalOk.addEventListener('click', closeModal);

    statsBtn.addEventListener('click', async () => {
        if (!window.db) return;
        const stats = await window.db.getStats();
        if (stats.length === 0) {
            openModal('Stats', '<p>No records available.</p>', false);
            return;
        }
        let html = '<table style="width:100%; border-collapse:collapse;"><tr><th style="text-align:left">Puzzle ID</th><th>Type</th><th>Success</th><th>Failure</th></tr>';
        stats.forEach(s => {
            // Determine type (例: "2W" のように空きマス数 + 色)
            let typeVal = '';
            try {
                if (/^\d+$/.test(s.puzzleId)) {
                    const absIndex = parseInt(s.puzzleId, 10) - 1;
                    if (absIndex >= 0 && absIndex < allPuzzles.length) {
                        const p = allPuzzles[absIndex];
                        typeVal = `${p.emptyCells}${p.turn === 'X' ? 'B' : 'W'}`;
                    }
                } else {
                    const found = allPuzzles.find(p => p.line && p.line.includes(s.puzzleId));
                    if (found) typeVal = `${found.emptyCells}${found.turn === 'X' ? 'B' : 'W'}`;
                }
            } catch (e) {
                typeVal = '';
            }

            html += `<tr data-pid="${escapeHtml(s.puzzleId)}" style="cursor:pointer"><td style="padding:4px 8px">${escapeHtml(s.puzzleId)}</td><td style="text-align:center">${escapeHtml(typeVal)}</td><td style="text-align:center">${s.success}</td><td style="text-align:center">${s.fail}</td></tr>`;
        });
        html += '</table>';
        openModal('Stats', html, true);

        // テーブル行をクリックすると該当問題を表示
        // setTimeout で DOM 挿入後に query する
        setTimeout(() => {
            const rows = modalMessage.querySelectorAll('tr[data-pid]');
            rows.forEach(row => {
                row.addEventListener('click', () => {
                    const pid = row.getAttribute('data-pid');
                    closeModal();
                    loadPuzzleById(pid);
                });
            });
        }, 0);
    });
 

    // 問題ID から該当問題を表示する（保存時は 1 始まりで保存している想定）
    function loadPuzzleById(puzzleId) {
        if (!puzzleId) return;
        // 数字の場合は 1始まり -> 0始まりに変換
        if (/^\d+$/.test(puzzleId)) {
            const absIndex = parseInt(puzzleId, 10) - 1;
            if (absIndex >= 0 && absIndex < allPuzzles.length) {
                absolutePuzzleIndex = absIndex;
                // フィルタ済み配列内のインデックスを設定（存在しない場合は -1）
                currentPuzzleIndex = puzzles.indexOf(allPuzzles[absIndex]);
                renderPuzzle(allPuzzles[absIndex].line);
                return;
            }
        }
        // 数字でない、または範囲外の場合は全件から line に一致する項目を探す
        const found = allPuzzles.findIndex(p => p.puzzleId === puzzleId || p.line.includes(puzzleId));
        if (found !== -1) {
            absolutePuzzleIndex = found;
            currentPuzzleIndex = puzzles.indexOf(allPuzzles[found]);
            renderPuzzle(allPuzzles[found].line);
            return;
        }
        openModal('Error', '<p>No matching puzzle found.</p>', false);
    }
    
    clearStatsBtn.addEventListener('click', async () => {
        if (!confirm('Clear all records? Are you sure?')) return;
        await window.db.clearResults();
        openModal('Statistics', '<p>Records cleared.</p>', false);
    });

    if (clearZeroFailBtn) {
        clearZeroFailBtn.addEventListener('click', async () => {
            if (!confirm('Delete all records with 0 failures? Are you sure?')) return;
            // gather stats and find puzzleIds with fail === 0
            const stats = await window.db.getStats();
            const idsToDelete = stats.filter(s => s.fail === 0).map(s => s.puzzleId);
            if (idsToDelete.length === 0) {
                openModal('Statistics', '<p>No matching records found.</p>', false);
                return;
            }
            try {
                await deleteRecordsForPuzzleIds(idsToDelete);
                // reopen stats to refresh view
                statsBtn.click();
            } catch (e) {
                console.error('clearZeroFail error', e);
                openModal('Error', '<p>An error occurred during deletion.</p>', false);
            }
        });
    }

    // Delete all records matching any of given puzzleId values
    async function deleteRecordsForPuzzleIds(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return;
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const idx = store.index('puzzleId');
            let remaining = ids.length;
            ids.forEach(id => {
                const req = idx.openCursor(IDBKeyRange.only(String(id)));
                req.onsuccess = (ev) => {
                    const cursor = ev.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    } else {
                        remaining--;
                        if (remaining === 0) resolve();
                    }
                };
                req.onerror = (ev) => {
                    reject(req.error || ev.target.error);
                };
            });
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    // 外部から結果を記録するためのユーティリティ
    window.recordPuzzleResult = async function(puzzleId, success) {
        if (!window.db) return;
        try {
            await window.db.recordResult(puzzleId, success ? 'success' : 'fail');
        } catch (e) {
            console.error('recordPuzzleResult error', e);
        }
    };

    try {
        init();
    } catch (e) {
        console.error('init error', e);
        if (puzzleInfo) puzzleInfo.textContent = 'Startup error: ' + (e && e.message ? e.message : String(e));
    }

    // Show global errors in the UI to help debugging
    window.addEventListener('error', (ev) => {
        console.error('Unhandled error', ev.error || ev.message);
        if (puzzleInfo) puzzleInfo.textContent = 'Error: ' + (ev.error && ev.error.message ? ev.error.message : ev.message || String(ev));
    });
});
