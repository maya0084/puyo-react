import React, { useEffect, useRef, useState } from "react";

// Puyo Puyo — 夜空＋落下途中も見えるver 🌌✨（上方向の画面外も表示）

const ROWS = 13;
const VISIBLE_ROWS_START = -1; // 画面外も含めて表示
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

const SPAWN_POS = { r: -1, c: 2 }; // 上方向に1マス画面外からスタート

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

  useEffect(() => { if (!current) { ensureQueue(); spawnFromQueue(); } }, []);

  function ensureQueue() { setQueue((q) => (q.length < 10 ? q.concat(generateBagPairs(100)) : q)); }

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

    setGrid(cloneGrid(g));

    let moved = true;
    function dropStep() {
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
      setGrid(cloneGrid(g));
      if (moved) requestAnimationFrame(dropStep);
      else setTimeout(() => resolveChains(g), 100);
    }
    requestAnimationFrame(dropStep);

    setCurrent(null);
  }

  // resolveChains, tryMove, tryRotate, tickDrop, hardDrop は元のコード通り
  function resolveChains(g) {
    let curGrid = cloneGrid(g);
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
              if (curGrid[nr][nc] === color) { visited[nr][nc] = true; q.push([nr, nc]); group.push([nr, nc]); }
            }
          }
          if (group.length >= 4) { any = true; for (const [gr, gc] of group) toRemove[gr][gc] = true; }
        }
      }
      if (!any) break;
      let removedCount = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (toRemove[r][c]) { curGrid[r][c] = null; removedCount++; }
      for (let c = 0; c < COLS; c++) {
        let write = ROWS - 1;
        for (let r = ROWS - 1; r >= 0; r--) {
          if (curGrid[r][c] != null) { curGrid[write][c] = curGrid[r][c]; if (write !== r) curGrid[r][c] = null; write--; setGrid(cloneGrid(curGrid)); }
        }
        for (let r = write; r >= 0; r--) curGrid[r][c] = null;
      }
      chain++;
      totalScore += removedCount * 5000 * chain;
      setGrid(cloneGrid(curGrid));
    }
    setScore((s) => s + totalScore);
    if (chain > 0) setLinesCleared((l) => l + chain);
    setTimeout(() => {
      for (let c = 0; c < COLS; c++) if (curGrid[0][c] != null) { setGameOver(true); setRunning(false); return; }
      spawnFromQueue();
    }, 200);
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
      if (grid[np.r][np.c] == null && grid[nr][nc] == null) { setCurrent({ ...current, pivot: np, orient: newOrient }); return true; }
    }
    return false;
  }

  function tickDrop() { if (!current || gameOver || !running) return; const moved = tryMove(1, 0); if (!moved) fixCurrentToGrid(current); }
  function hardDrop() { if (!current || gameOver) return; while (tryMove(1, 0)) {} fixCurrentToGrid(current); }

  useEffect(() => { function onKey(e) { if (gameOver || !current) return; if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) return; e.preventDefault(); if (e.key === 'ArrowLeft') tryMove(0,-1); if (e.key==='ArrowRight') tryMove(0,1); if(e.key==='ArrowUp') tryRotate(1); if(e.key==='ArrowDown') tryMove(1,0); if(e.key===' ') hardDrop(); } window.addEventListener('keydown', onKey); return ()=>window.removeEventListener('keydown',onKey); },[current,grid,gameOver]);
  useEffect(()=>{ if(!running) return; tickRef.current=setInterval(()=>tickDrop(),700); return ()=>clearInterval(tickRef.current); },[current,running,grid,gameOver]);

  function Cell({color}){ const base="w-10 h-10 rounded-full m-0.5 flex items-center justify-center border backdrop-blur-sm"; if(!color) return <div className={`bg-transparent ${base} border-gray-400/30`} />; const style={ background:`radial-gradient(circle at 30% 30%, white 0%, ${color} 70%)`, boxShadow:`0 0 12px ${color}, inset 0 0 8px white`, opacity:0.9 }; return <div className={`${base}`} style={style}><div className="text-xs font-bold text-white drop-shadow-sm">👀</div></div>; }

  function startNewGame() { setGrid(emptyGrid()); setScore(0); setLinesCleared(0); setQueue(generateBagPairs(200)); setGameOver(false); setRunning(true); setTimeout(()=>spawnFromQueue(),50); }
  function NextPreview({piece}){ if(!piece)return<div className="p-2 border rounded bg-white/80">None</div>; return <div className="p-2 border rounded bg-white/80 inline-block"><div className="flex"><div className="w-6 h-6 rounded-full mr-2 border" style={{backgroundColor:piece[0]}} /><div className="w-6 h-6 rounded-full border" style={{backgroundColor:piece[1]}} /></div></div>;}

  return (<div className="p-4 flex gap-6 font-sans min-h-screen items-center justify-center" style={{background:"linear-gradient(to bottom,#0f1c3f,#1a2a5c)",color:"white",position:"relative"}}>
    <div>
      <div className="bg-indigo-900/70 p-3 rounded-xl shadow-2xl inline-block border border-blue-400/40">
        <div className="text-5xl font-extrabold mb-3 text-center text-yellow-200 drop-shadow-lg">Score: {score}</div>
        <div className="text-lg mb-2 text-center text-blue-200 drop-shadow-sm">Chains: {linesCleared}</div>
        <div className="grid grid-cols-6 gap-0 bg-indigo-800/40 p-2 rounded-xl border border-blue-200/40 shadow-inner" style={{paddingTop:'12px'}}>
          {Array.from({ length: VISIBLE_ROWS_END-VISIBLE_ROWS_START+1 }).map((_,i)=>{ const r=VISIBLE_ROWS_START+i; return <div key={`row-${r}`} className="col-span-6 flex">{Array.from({length:COLS}).map((__,c)=><Cell key={`cell-${r}-${c}`} color={r>=0?grid[r][c]:null} />)}</div>})}
        </div>
      </div>
      <div className="mt-3 flex gap-2 justify-center">
        <button className="px-3 py-1 bg-blue-500 text-white rounded shadow hover:bg-blue-600 transition" onClick={()=>setRunning(!running)}>{running?'Pause':'Resume'}</button>
        <button className="px-3 py-1 bg-green-500 text-white rounded shadow hover:bg-green-600 transition" onClick={()=>hardDrop()}>Hard Drop</button>
        <button className="px-3 py-1 bg-red-500 text-white rounded shadow hover:bg-red-600 transition" onClick={()=>startNewGame()}>New Game</button>
      </div>
      {gameOver && <div className="mt-3 text-red-400 font-bold text-xl text-center drop-shadow">ゲームオーバー！</div>}
    </div>
    <div className="w-48 text-center">
      <div className="mb-2 font-semibold text-yellow-100 drop-shadow-sm">NEXT</div>
      <NextPreview piece={nextPiece} />
    </div>
  </div>);
}
