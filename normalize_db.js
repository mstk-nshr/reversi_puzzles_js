const fs = require('fs');
const path = require('path');

function extractDBText(dbPath) {
  const txt = fs.readFileSync(dbPath, 'utf8');
  const m = txt.match(/const\s+DB_DATA\s*=\s*`([\s\S]*?)`/m);
  if (!m) throw new Error('DB_DATA not found in ' + dbPath);
  return m[1];
}

function idx(r, c) { return r * 8 + c; }

function transformBoard(boardStr, transform) {
  // boardStr is 64 chars row-major
  const out = new Array(64);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      let rr, cc;
      switch (transform) {
        case 0: // identity
          rr = r; cc = c; break;
        case 1: // rot90
          rr = c; cc = 7 - r; break;
        case 2: // rot180
          rr = 7 - r; cc = 7 - c; break;
        case 3: // rot270
          rr = 7 - c; cc = r; break;
        case 4: // reflect (mirror horizontally across vertical axis)
          rr = r; cc = 7 - c; break;
        case 5: // reflect + rot90
          rr = 7 - c; cc = 7 - r; break;
        case 6: // reflect + rot180
          rr = 7 - r; cc = c; break;
        case 7: // reflect + rot270
          rr = c; cc = r; break;
        default:
          rr = r; cc = c;
      }
      out[idx(r, c)] = boardStr[idx(rr, cc)];
    }
  }
  return out.join('');
}

function boardToBigInt(boardStr) {
  // map: '-' => 0, 'X' => 1, 'O' => 2 using 2 bits: '00','01','10'
  let v = 0n;
  for (let i = 0; i < 64; i++) {
    const ch = boardStr[i];
    let code = 0;
    if (ch === 'X') code = 1;
    else if (ch === 'O') code = 2;
    else code = 0;
    v = (v << 2n) | BigInt(code);
  }
  return v;
}

function normalizeBoard(boardStr) {
  let bestV = null;
  let bestBoard = null;
  for (let t = 0; t < 8; t++) {
    const tb = transformBoard(boardStr, t);
    const v = boardToBigInt(tb);
    if (bestV === null || v < bestV) {
      bestV = v;
      bestBoard = tb;
    }
  }
  return { value: bestV, board: bestBoard };
}

function parseDB(dbText) {
  const lines = dbText.split(/\r?\n/);
  const records = [];
  for (const L of lines) {
    const line = L.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;
    // each data line: <board64> [rest]
    const m = line.match(/^(\S+)\s*(.*)$/);
    if (!m) continue;
    const board = m[1];
    const rest = m[2] || '';
    records.push({ raw: line, board, rest });
  }
  return records;
}

function applyToDb(jsPath, normalizedLines) {
  const origText = fs.readFileSync(jsPath, 'utf8');
  const m = origText.match(/const\s+DB_DATA\s*=\s*`([\s\S]*?)`/m);
  if (!m) throw new Error('DB_DATA not found in ' + jsPath);
  const inner = m[1];
  const origLines = inner.split(/\r?\n/);
  const newInnerLines = [];
  let idxNorm = 0;
  for (const L of origLines) {
    const trimmed = L.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      newInnerLines.push(L);
      continue;
    }
    const norm = normalizedLines[idxNorm++];
    if (!norm) {
      // no normalized available, keep original
      newInnerLines.push(L);
      continue;
    }
    const m2 = L.match(/^(\s*)(\S+)(\s*)(.*)$/);
    if (!m2) { newInnerLines.push(norm); continue; }
    const lead = m2[1] || '';
    const sep = m2[3] || ' ';
    const tail = m2[4] || '';
    newInnerLines.push(lead + norm + sep + tail);
  }

  const newInner = newInnerLines.join('\n');
  const newText = origText.replace(/const\s+DB_DATA\s*=\s*`([\s\S]*?)`/m, `const DB_DATA = \`${newInner}\``);
  fs.writeFileSync(jsPath, newText, 'utf8');
}

function main() {
  const dbPath = path.join(__dirname, 'db.js');
  const txt = extractDBText(dbPath);
  const origLines = txt.split(/\r?\n/);
  const recs = parseDB(txt);
  const out = [];
  for (const r of recs) {
    if (r.board.length !== 64) {
      out.push({ raw: r.raw, error: 'board length != 64' });
      continue;
    }
    const norm = normalizeBoard(r.board);
    out.push({
      raw: r.raw,
      board: r.board,
      normalizedBoard: norm.board,
      canonicalHex: '0x' + norm.value.toString(16),
      canonicalDec: norm.value.toString(10)
    });
  }
  const outPath = path.join(__dirname, 'normalize_db.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote', outPath, 'records:', out.length);

  // if --apply given, overwrite db.js after backup
  if (process.argv.includes('--apply')) {
    const backupPath = dbPath + '.backup-' + Date.now();
    fs.copyFileSync(dbPath, backupPath);
    console.log('Backup created:', backupPath);
    // prepare normalized board lines (only the board token)
    const normBoards = out.map(x => x.normalizedBoard || x.board || '');
    applyToDb(dbPath, normBoards);
    console.log('db.js updated in place');
  }
}

if (require.main === module) main();

module.exports = { normalizeBoard, boardToBigInt, transformBoard };
