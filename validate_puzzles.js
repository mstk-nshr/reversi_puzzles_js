const fs = require('fs');

const MASK64 = 0xffffffffffffffffn;
const H_MASK = 0x7e7e7e7e7e7e7e7en;

/** 
 *  Optimized flipping logic using bitwise propagation.
 *  Checks if moving at `s` (single bit) flips anything.
 */
function getFlippedMask(s, p, o) {
    let flipped = 0n, t, om = o & H_MASK;

    // Right
    t = (s << 1n) & om;
    t |= (t << 1n) & om;
    t |= (t << 1n) & om;
    t |= (t << 1n) & om;
    t |= (t << 1n) & om;
    t |= (t << 1n) & om;
    if ((t << 1n) & p) flipped |= t;

    // Left
    t = (s >> 1n) & om;
    t |= (t >> 1n) & om;
    t |= (t >> 1n) & om;
    t |= (t >> 1n) & om;
    t |= (t >> 1n) & om;
    t |= (t >> 1n) & om;
    if ((t >> 1n) & p) flipped |= t;

    // Down
    t = (s << 8n) & o;
    t |= (t << 8n) & o;
    t |= (t << 8n) & o;
    t |= (t << 8n) & o;
    t |= (t << 8n) & o;
    t |= (t << 8n) & o;
    if ((t << 8n) & p) flipped |= t;

    // Up
    t = (s >> 8n) & o;
    t |= (t >> 8n) & o;
    t |= (t >> 8n) & o;
    t |= (t >> 8n) & o;
    t |= (t >> 8n) & o;
    t |= (t >> 8n) & o;
    if ((t >> 8n) & p) flipped |= t;

    // Diagonals
    t = (s << 9n) & om;
    t |= (t << 9n) & om;
    t |= (t << 9n) & om;
    t |= (t << 9n) & om;
    t |= (t << 9n) & om;
    t |= (t << 9n) & om;
    if ((t << 9n) & p) flipped |= t;

    t = (s << 7n) & om;
    t |= (t << 7n) & om;
    t |= (t << 7n) & om;
    t |= (t << 7n) & om;
    t |= (t << 7n) & om;
    t |= (t << 7n) & om;
    if ((t << 7n) & p) flipped |= t;

    t = (s >> 7n) & om;
    t |= (t >> 7n) & om;
    t |= (t >> 7n) & om;
    t |= (t >> 7n) & om;
    t |= (t >> 7n) & om;
    t |= (t >> 7n) & om;
    if ((t >> 7n) & p) flipped |= t;

    t = (s >> 9n) & om;
    t |= (t >> 9n) & om;
    t |= (t >> 9n) & om;
    t |= (t >> 9n) & om;
    t |= (t >> 9n) & om;
    t |= (t >> 9n) & om;
    if ((t >> 9n) & p) flipped |= t;

    return flipped;
}

const memo = new Map();

function solve(p, o, pc, oc, emptyMask, isPass) {
    const key = (p << 64n) | o;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    let bestValue = -100;
    let t = emptyMask;
    let hasMove = false;

    while (t !== 0n) {
        const s = t & -t;
        const flipped = getFlippedMask(s, p, o);
        if (flipped !== 0n) {
            hasMove = true;
            let k = 0, tf = flipped;
            while (tf !== 0n) { tf &= (tf - 1n); k++; }
            const v = -solve(o ^ flipped, p | s | flipped, oc - k, pc + 1 + k, emptyMask ^ s, false);
            if (v > bestValue) bestValue = v;
        }
        t ^= s;
    }

    if (!hasMove) {
        if (isPass) return pc - oc;
        const result = -solve(o, p, oc, pc, emptyMask, true);
        memo.set(key, result);
        return result;
    }

    memo.set(key, bestValue);
    return bestValue;
}

function popcount(n) {
    let count = 0;
    while (n !== 0n) { n &= (n - 1n); count++; }
    return count;
}

function main() {
    console.log("データベースの検証を開始します (ハイブリッド最適化版)...");
    const dbContent = fs.readFileSync('db.js', 'utf8');
    const lines = dbContent.split('\n');
    let total = 0, valid = 0, startTime = Date.now();

    for (const lineStr of lines) {
        const trimmed = lineStr.trim();
        if (trimmed.length < 65 || trimmed.startsWith('#')) continue;
        const parts = trimmed.split(' ');
        const boardStr = parts[0], turn = parts[1];
        if (boardStr.length !== 64) continue;
        
        total++;
        let black = 0n, white = 0n;
        for (let j = 0; j < 64; j++) {
            if (boardStr[j] === 'X') black |= (1n << BigInt(j));
            else if (boardStr[j] === 'O') white |= (1n << BigInt(j));
        }
        
        const p = (turn === 'X' ? black : white);
        const o = (turn === 'X' ? white : black);
        const emptyMask = (~(black | white)) & MASK64;
        memo.clear();
        
        // Root evaluation
        let winningMoves = 0, bestScore = -100, scoreCount = 0;
        let t = emptyMask, pc = popcount(p), oc = popcount(o);
        while (t !== 0n) {
            const s = t & -t;
            const flipped = getFlippedMask(s, p, o);
            if (flipped !== 0n) {
                let k = popcount(flipped);
                const score = -solve(o ^ flipped, p | s | flipped, oc - k, pc + 1 + k, emptyMask ^ s, false);
                if (score > bestScore) { bestScore = score; scoreCount = 1; }
                else if (score === bestScore) scoreCount++;
                if (score > 0) winningMoves++;
            }
            t ^= s;
        }

        if (winningMoves > 0) valid++;
        if (total % 1000 === 0) {
            process.stdout.write(`\r進捗: ${total}件... 経過: ${((Date.now()-startTime)/1000).toFixed(1)}s`);
        }
    }
    console.log(`\n完了！ 総計: ${(Date.now()-startTime)/1000}s (正常: ${valid})`);
}
main();
