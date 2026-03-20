const fs = require('fs');

function getValidMoves(board, color) {
    const moves = [];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const flips = isValidMoveOnBoard(board, r, c, color);
            if (flips.length > 0) moves.push({ r, c, flips });
        }
    }
    return moves;
}

function isValidMoveOnBoard(board, r, c, color) {
    if (board[r][c] !== '-') return [];
    const opponent = (color === 'X' ? 'O' : 'X');
    const directions = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
    let allFlips = [];
    for (const [dr, dc] of directions) {
        let currentFlips = [];
        let tr = r + dr, tc = c + dc;
        while (tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && board[tr][tc] === opponent) {
            currentFlips.push([tr, tc]);
            tr += dr; tc += dc;
        }
        if (tr >= 0 && tr < 8 && tc >= 0 && tc < 8 && board[tr][tc] === color && currentFlips.length > 0) {
            allFlips = allFlips.concat(currentFlips);
        }
    }
    return allFlips;
}

function simulateGame(board, player) {
    const moves = getValidMoves(board, player);
    if (moves.length === 0) {
        const nextPlayer = (player === 'X' ? 'O' : 'X');
        if (getValidMoves(board, nextPlayer).length === 0) {
            let black = 0, white = 0;
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    if (board[r][c] === 'X') black++;
                    else if (board[r][c] === 'O') white++;
                }
            }
            return black - white;
        }
        return simulateGame(board, nextPlayer);
    }

    let bestValue = (player === 'X' ? -100 : 100);
    for (const move of moves) {
        const nextBoard = board.map(row => [...row]);
        nextBoard[move.r][move.c] = player;
        move.flips.forEach(([fr, fc]) => nextBoard[fr][fc] = player);

        const value = simulateGame(nextBoard, player === 'X' ? 'O' : 'X');
        if (player === 'X') {
            bestValue = Math.max(bestValue, value);
        } else {
            bestValue = Math.min(bestValue, value);
        }
    }
    return bestValue;
}

function main() {
    console.log("データベースの検証を開始します...");
    
    let dbContent;
    try {
        dbContent = fs.readFileSync('db.js', 'utf8');
    } catch(err) {
        // Fallback or read directly if needed
        console.error("db.js の読み込みに失敗しました！", err);
        return;
    }
    
    // Also try to read db.txt if needed, but db.js has the DB_DATA
    const lines = dbContent.split('\n');
    let total = 0;
    let valid = 0;
    let invalid = 0;

    for (let i = 0; i < lines.length; i++) {
        const lineStr = lines[i].trim();
        // Ignore lines that don't look like puzzle definitions
        if (lineStr.length < 65 || lineStr.startsWith('#') || lineStr.startsWith('const ') || lineStr.startsWith('`')) {
            continue;
        }
        
        const parts = lineStr.split(' ').filter(p => p.length > 0);
        if (parts.length < 2) continue;
        
        total++;
        const boardStr = parts[0];
        const turn = parts[1];
        
        if (boardStr.length !== 64) {
            console.log(`[行 ${i + 1}] 無効: 盤面の文字数が64ではありません。`);
            invalid++;
            continue;
        }
        
        const board = [];
        for (let r = 0; r < 8; r++) {
            board[r] = boardStr.substring(r * 8, (r + 1) * 8).split('');
        }
        
        const moves = getValidMoves(board, turn);
        if (moves.length < 2) {
            console.log(`[行 ${i + 1}] 無効: 選択肢が2つ以上ありません。 (${lineStr})`);
            invalid++;
            continue;
        }
        
        let winningMoves = 0;
        let highestScore = turn === 'X' ? -100 : 100;
        let scoreOccurrences = 0;
        
        for (const move of moves) {
            const nextBoard = board.map(row => [...row]);
            nextBoard[move.r][move.c] = turn;
            move.flips.forEach(([fr, fc]) => nextBoard[fr][fc] = turn);
            
            const score = simulateGame(nextBoard, turn === 'X' ? 'O' : 'X');
            
            if (turn === 'X') {
                if (score > highestScore) {
                    highestScore = score;
                    scoreOccurrences = 1;
                } else if (score === highestScore) {
                    scoreOccurrences++;
                }
                
                if (score > 0) winningMoves++;
            } else { // turn === 'O'
                if (score < highestScore) {
                    highestScore = score;
                    scoreOccurrences = 1;
                } else if (score === highestScore) {
                    scoreOccurrences++;
                }
                
                if (score < 0) winningMoves++;
            }
        }
        
        // 判定ロジック:
        // 「正常に解くことができるか？」 ＝ 唯一の最善手があり、かつそれが勝ちにつながるか
        if (winningMoves > 0 && scoreOccurrences === 1) {
            console.log(`[行 ${i + 1}] 正常: 唯一の必勝手が存在します。`);
            valid++;
        } else if (winningMoves > 0) {
            console.log(`[行 ${i + 1}] 正常: 必勝手が存在しますが、複数の最善手があります。 (勝ち手数: ${winningMoves}, 最善スコア手数: ${scoreOccurrences})`);
            // Assuming the author considers it solvable if there's at least one winning move. 
            // The prompt says "正常に解くことができるか？" which implies at least one winning move. 
            // If they want exactly ONE winning move, we denote it. Let's count it as valid but warn.
            valid++;
        } else {
            console.log(`[行 ${i + 1}] 無効: 勝てる手がありません。 (${lineStr}) -> 勝ち手数: ${winningMoves}`);
            invalid++;
        }

        
        if (total % 100 === 0) {
            console.log(`進捗: ${total}件処理完了... (正常: ${valid}, 無効: ${invalid})`);
        }
    }
    
    console.log("=====================================");
    console.log(`検証完了: 全 ${total} 件中、正常 ${valid} 件、無効 ${invalid} 件`);
}

main();
