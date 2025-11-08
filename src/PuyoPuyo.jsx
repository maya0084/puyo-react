import React, { useEffect, useRef, useState } from "react";

// Puyo Puyo — Single-file React component
// - 改良版: 得点表示を大きく、横置き時の片方落下（浮き防止）を実装

const ROWS = 13;
const VISIBLE_ROWS_START = 1;
const VISIBLE_ROWS_END = 12;
const COLS = 6;
const COLORS = ["red", "green", "blue", "yellow", "purple"];

const emptyGrid = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));
const cloneGrid = (g) => g.map((r) => r.slice());
const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

function generateBagPairs(nPairs = 50) {
  const singles = [];
  for (let i = 0; i < nPairs * 2; i++) singles.push(COLORS[i % COLORS.length]);
  for (let i = singles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [singles[i], singles[j]] = [singles[j], singles[i]];
  }
  const pairs = [];
  for (let i = 0; i < singles.length; i += 2) pairs.push([singles[i], singles[i + 1]]);
  return pairs;
}

const SPAWN_POS = { r: 0, c: 2 };

function orientationOffset(orient) {
  switch (orient % 4) {
    case 0: return { r: -1, c: 0 };
    case 1: return { r: 0, c: 1 };
    case 2: return { r: 1, c: 0 };
    default: return { r: 0, c: -1 };
  }
}

export default function PuyoPuyoSingleFile() {
  const [grid, setGrid] = useState(emptyGrid);
  const [score, setScore] = useState(0);
  const [linesCleared, setLinesCleared] = useState(0);
  const [queue, setQueue] = useState(() => generateBagPairs(100));
  const [current, setCurrent] = useState(null);
  const [nextPiece, setNextPiece] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [running, setRunning] = useState(true);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!current) {
      ensureQueue();
      spawnFromQueue();
    }
  }, []);

  function ensureQueue() {
    setQueue((q) => (q.length < 10 ? q.concat(generateBagPairs(100)) : q));
  }

  function spawnFromQueue() {
    setQueue((q) => {
      const [pair, ...rest] = q;
      const next = rest[0] || null;
      setCurrent({ pivot: { ...SPAWN_POS }, orient: 2, colors: pair });
      setNextPiece(next);
      if (rest.length < 10) rest.push(...generateBagPairs(100));
      return rest;
    });
  }

  function fixCurrentToGrid(cur) {
    if (!cur) return;
    const g = cloneGrid(grid);
    const { pivot, orient, colors } = cur;
    const off = orientationOffset(orient);
    const ar = pivot.r + off.r;
    const ac = pivot.c + off.c;
    if (inBounds(pivot.r, pivot.c)) g[pivot.r][pivot.c] = colors[0];
    if (inBounds(ar, ac)) g[ar][ac] = colors[1];

    // 横置きで下に空間がある場合 → 下に落とす
    let moved = true;
    while (moved) {
      moved = false;
      for (let c = 0; c < COLS; c++) {
        for (let r = ROWS - 2; r >= 0; r--) {
          if (g[r][c] && !g[r + 1][c]) {
            g[r + 1][c] = g[r][c];
            g[r][c] = null;
            moved = true;
          }
        }
      }
    }

    setGrid(g);
    setCurrent(null);
    setTimeout(() => resolveChains(g), 0);
  }

  function resolveChains(g) {
    let curGrid = g;
    let totalScore = 0;
    let chain = 0;
    while (true) {
      const toRemove = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
      let any = false;
      const visited = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (visited[r][c] || curGrid[r][c] == null) continue;
          const color = curGrid[r][c];
          const q = [[r, c]];
          visited[r][c] = true;
          const group = [[r, c]];
          while (q.length) {
            const [cr, cc] = q.shift();
            const dirs = [ [1,0],[-1,0],[0,1],[0,-1] ];
            for (const [dr, dc] of dirs) {
              const nr = cr + dr, nc = cc + dc;
              if (!inBounds(nr, nc) || visited[nr][nc]) continue;
              if (curGrid[nr][nc] === color) {
                visited[nr][nc] = true;
                q.push([nr, nc]);
                group.push([nr, nc]);
              }
            }
          }
          if (group.length >= 4) {
            any = true;
            for (const [gr, gc] of group) toRemove[gr][gc] = true;
          }
        }
      }
      if (!any) break;
      let removedCount = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (toRemove[r][c]) { curGrid[r][c] = null; removedCount++; }
      for (let c = 0; c < COLS; c++) {
        let write = ROWS - 1;
        for (let r = ROWS - 1; r >= 0; r--) {
          if (curGrid[r][c] != null) {
            curGrid[write][c] = curGrid[r][c];
            if (write !== r) curGrid[r][c] = null;
            write--;
          }
        }
        for (let r = write; r >= 0; r--) curGrid[r][c] = null;
      }
      chain++;
      totalScore += removedCount * 10 * chain;
    }
    setGrid(curGrid);
    setScore((s) => s + totalScore);
    if (chain > 0) setLinesCleared((l) => l + chain);
    setTimeout(() => {
      for (let c = 0; c < COLS; c++) if (curGrid[0][c] != null) { setGameOver(true); setRunning(false); return; }
      spawnFromQueue();
    }, 100);
  }

  function tryMove(dr, dc, newOrient = null) {
    if (!current || gameOver) return;
    const orient = newOrient == null ? current.orient : newOrient;
    const np = { r: current.pivot.r + dr, c: current.pivot.c + dc };
    const off = orientationOffset(orient);
    const ar = np.r + off.r, ac = np.c + off.c;
    if (!inBounds(np.r, np.c) || !inBounds(ar, ac)) return false;
    if (grid[np.r][np.c] != null || grid[ar][ac] != null) return false;
    setCurrent({ ...current, pivot: np, orient });
    return true;
  }

  function tryRotate(dir = 1) {
    if (!current || gameOver) return;
    const newOrient = (current.orient + dir + 4) % 4;
    const piv = current.pivot;
    const offset = orientationOffset(newOrient);
    const kicks = [ [0,0], [0,-1], [0,1], [-1,0] ];
    for (const [dr, dc] of kicks) {
      const np = { r: piv.r + dr, c: piv.c + dc };
      const nr = np.r + offset.r, nc = np.c + offset.c;
      if (!inBounds(np.r, np.c) || !inBounds(nr, nc)) continue;
      if (grid[np.r][np.c] == null && grid[nr][nc] == null) {
        setCurrent({ ...current, pivot: np, orient: newOrient });
        return true;
      }
    }
    return false;
  }

  function tickDrop() {
    if (!current || gameOver || !running) return;
    const moved = tryMove(1, 0);
    if (!moved) fixCurrentToGrid(current);
  }

  function hardDrop() {
    if (!current || gameOver) return;
    while (tryMove(1, 0)) {}
    fixCurrentToGrid(current);
  }

  useEffect(() => {
    function onKey(e) {
      if (gameOver || !current) return;
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].indexOf(e.key) === -1) return;
      e.preventDefault();
      if (e.key === 'ArrowLeft') tryMove(0, -1);
      if (e.key === 'ArrowRight') tryMove(0, 1);
      if (e.key === 'ArrowUp') tryRotate(1);
      if (e.key === 'ArrowDown') tryMove(1, 0);
      if (e.key === ' ') hardDrop();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, grid, gameOver]);

  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => tickDrop(), 700);
    return () => clearInterval(tickRef.current);
  }, [current, running, grid, gameOver]);

  function renderCell(r, c) {
    if (current) {
      const { pivot, orient, colors } = current;
      const off = orientationOffset(orient);
      const ar = pivot.r + off.r, ac = pivot.c + off.c;
      if (pivot.r === r && pivot.c === c) return <Cell key={`${r}-${c}`} color={colors[0]} />;
      if (ar === r && ac === c) return <Cell key={`${r}-${c}`} color={colors[1]} />;
    }
    return <Cell key={`${r}-${c}`} color={grid[r][c]} />;
  }

  function Cell({ color }) {
    const base = "w-10 h-10 rounded-full m-0.5 flex items-center justify-center border";
    if (!color) return <div className={`bg-transparent ${base} border-gray-300`} />;
    const bg = { red:"bg-red-500", green:"bg-green-500", blue:"bg-blue-500", yellow:"bg-yellow-400", purple:"bg-purple-500" }[color] || "bg-gray-500";
    return <div className={`${base} ${bg}`} />;
  }

  function startNewGame() {
    setGrid(emptyGrid());
    setScore(0);
    setLinesCleared(0);
    setQueue(generateBagPairs(200));
    setGameOver(false);
    setRunning(true);
    setTimeout(() => spawnFromQueue(), 50);
  }

  function NextPreview({ piece }) {
    if (!piece) return <div className="p-2 border rounded bg-white/80">None</div>;
    return (
      <div className="p-2 border rounded bg-white/80 inline-block">
        <div className="flex">
          <div className="w-6 h-6 rounded-full mr-2 border" style={{backgroundColor: piece[0]}} />
          <div className="w-6 h-6 rounded-full border" style={{backgroundColor: piece[1]}} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 flex gap-6 font-sans">
      <div>
        <div className="bg-slate-100 p-3 rounded shadow-lg inline-block">
          <div className="text-2xl font-bold mb-2 text-center text-blue-700">Score: {score}</div>
          <div className="text-sm mb-2 text-center">Chains: {linesCleared}</div>
          <div className="grid grid-cols-6 gap-0 bg-blue-50 p-2 rounded">
            {Array.from({ length: VISIBLE_ROWS_END - VISIBLE_ROWS_START + 1 }).map((_, i) => {
              const r = VISIBLE_ROWS_START + i;
              return (
                <div key={`row-${r}`} className="col-span-6 flex">
                  {Array.from({ length: COLS }).map((__, c) => <div key={`cell-${r}-${c}`}>{renderCell(r, c)}</div>)}
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="px-3 py-1 bg-blue-500 text-white rounded" onClick={() => setRunning((v) => !v)}>{running ? 'Pause' : 'Resume'}</button>
          <button className="px-3 py-1 bg-green-500 text-white rounded" onClick={() => hardDrop()}>Hard Drop</button>
          <button className="px-3 py-1 bg-red-500 text-white rounded" onClick={() => startNewGame()}>New Game</button>
        </div>
        {gameOver && <div className="mt-3 text-red-600 font-bold text-xl">ゲームオーバー！</div>}
      </div>
      <div className="w-48">
        <div className="mb-2">NEXT</div>
        <NextPreview piece={nextPiece} />
      </div>
    </div>
  );
}
