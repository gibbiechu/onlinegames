import { useEffect, useRef, useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';

const SIZES = [3, 4, 5, 6, 8, 10];

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 960 / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve({ src: c.toDataURL('image/jpeg', 0.82), w, h });
    };
    img.onerror = () => reject(new Error('That file could not be opened as a picture. Try a JPG or PNG.'));
    img.src = url;
  });
}

function samplePicture() {
  const w = 900;
  const h = 700;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#3e6be0');
  g.addColorStop(0.5, '#a24bc9');
  g.addColorStop(1, '#e8434c');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const icons = ['💌', '🌙', '⭐', '✈️', '💗', '🌏', '📮', '🧸'];
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (let r = 0; r < 6; r++) {
    for (let col = 0; col < 8; col++) {
      x.font = `${50 + ((r * 7 + col * 3) % 4) * 14}px serif`;
      x.fillText(icons[(r * 3 + col) % icons.length], 60 + col * 112 + (r % 2) * 40, 60 + r * 118);
    }
  }
  x.fillStyle = 'rgba(255,247,232,.92)';
  x.font = '800 96px "Bricolage Grotesque", sans-serif';
  x.fillText('miss you', w / 2, h / 2);
  return { src: c.toDataURL('image/jpeg', 0.85), w, h };
}

function shuffled(count) {
  let order;
  do {
    order = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  } while (order.every((p, i) => p === i));
  return order;
}

const fmt = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function Puzzle() {
  const { send, isHost, partner } = useRoom();
  const [phase, setPhase] = useState('setup');
  const [img, setImg] = useState(null);
  const [n, setN] = useState(4);
  const [mode, setMode] = useState('coop');
  const [slots, setSlots] = useState([]);
  const [sel, setSel] = useState(null);
  const [partnerSel, setPartnerSel] = useState(null);
  const [moves, setMoves] = useState(0);
  const [startAt, setStartAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [partnerProgress, setPartnerProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [peek, setPeek] = useState(false);
  const [partnerPrepping, setPartnerPrepping] = useState(false);
  const [err, setErr] = useState('');

  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const movesRef = useRef(0);
  const resultRef = useRef(null);
  resultRef.current = result;
  const myTimeRef = useRef(null);

  const total = n * n;
  const correct = slots.filter((p, i) => p === i).length;

  useEffect(() => {
    if (phase !== 'play' || result) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phase, result]);

  const begin = (d) => {
    setImg({ src: d.src, w: d.w, h: d.h });
    setN(d.n);
    setMode(d.mode);
    setSlots(d.order);
    movesRef.current = 0;
    myTimeRef.current = null;
    setMoves(0);
    setSel(null);
    setPartnerSel(null);
    setPartnerProgress(d.order.filter((p, i) => p === i).length);
    setResult(null);
    setStartAt(Date.now());
    setNow(Date.now());
    setPartnerPrepping(false);
    setPhase('play');
  };

  // ---- solved? ----
  useEffect(() => {
    if (phase !== 'play' || !slots.length || resultRef.current) return;
    if (!slots.every((p, i) => p === i)) return;
    const ms = Date.now() - startAt;
    if (mode === 'coop') {
      setResult({ kind: 'coop', ms });
    } else {
      myTimeRef.current = ms;
      send('puzzle:done', { ms });
      setResult({ kind: 'race', winner: 'me', ms });
    }
  }, [slots, phase, mode, startAt, send]);

  // ---- network ----
  useRoomEvent('puzzle:prep', () => setPartnerPrepping(true));
  useRoomEvent('puzzle:start', begin);
  useRoomEvent('puzzle:reset', () => {
    setPhase('setup');
    setResult(null);
  });
  useRoomEvent('puzzle:sel', (d) => setPartnerSel(d.i));
  useRoomEvent('puzzle:state', (d) => {
    setSlots(d.slots);
    setMoves(d.moves);
    setPartnerSel(null);
  });
  useRoomEvent('puzzle:req', (d) => {
    if (!isHost) return;
    setPartnerSel(null);
    applySwap(d.a, d.b);
  });
  useRoomEvent('puzzle:progress', (d) => setPartnerProgress(d.correct));
  useRoomEvent('puzzle:done', (d) => {
    setPartnerProgress(total);
    const mine = myTimeRef.current;
    if (!resultRef.current) setResult({ kind: 'race', winner: 'partner', ms: d.ms });
    else if (mine != null && d.ms < mine) setResult({ kind: 'race', winner: 'partner', ms: d.ms });
  });

  function applySwap(a, b) {
    const cur = slotsRef.current;
    if (cur[a] === a || cur[b] === b || a === b) return;
    const next = cur.slice();
    [next[a], next[b]] = [next[b], next[a]];
    movesRef.current += 1;
    setSlots(next);
    setMoves(movesRef.current);
    if (mode === 'coop') send('puzzle:state', { slots: next, moves: movesRef.current });
    else send('puzzle:progress', { correct: next.filter((p, i) => p === i).length });
  }

  const clickTile = (i) => {
    if (result || slots[i] === i) return;
    if (sel === null) {
      setSel(i);
      if (mode === 'coop') send('puzzle:sel', { i });
      return;
    }
    if (sel === i) {
      setSel(null);
      if (mode === 'coop') send('puzzle:sel', { i: null });
      return;
    }
    if (mode === 'coop' && !isHost) send('puzzle:req', { a: sel, b: i });
    else applySwap(sel, i);
    setSel(null);
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    try {
      setImg(await shrinkImage(file));
      send('puzzle:prep', {});
    } catch (x) {
      setErr(x.message);
    }
  };

  const startGame = () => {
    const d = { ...img, n, mode, order: shuffled(n * n) };
    send('puzzle:start', d);
    begin(d);
  };

  const newPuzzle = () => {
    send('puzzle:reset', {});
    setPhase('setup');
    setResult(null);
  };

  // ---------- SETUP ----------
  if (phase === 'setup') {
    return (
      <div className="panel puzzle-setup">
        <div className="setup-grid">
          <div className="photo-drop">
            {img ? (
              <img src={img.src} alt="Your puzzle picture" />
            ) : (
              <div className="photo-empty">
                <span aria-hidden="true">🖼️</span>
                <p>Pick a photo of the two of you, your pet, your last trip…</p>
              </div>
            )}
            <div className="row">
              <label className="btn primary">
                {img ? 'Change photo' : 'Upload a photo'}
                <input type="file" accept="image/*" onChange={pickFile} hidden />
              </label>
              <button className="btn ghost" onClick={() => setImg(samplePicture())}>
                Use a sample
              </button>
            </div>
            {err && <p className="error">{err}</p>}
          </div>

          <div className="setup-options">
            <h3>Pieces</h3>
            <div className="chips">
              {SIZES.map((s) => (
                <button key={s} className={'chip' + (n === s ? ' on' : '')} onClick={() => setN(s)}>
                  {s * s}
                </button>
              ))}
            </div>
            <h3>How do you want to play?</h3>
            <div className="mode-cards">
              <button className={'mode-card' + (mode === 'coop' ? ' on' : '')} onClick={() => setMode('coop')}>
                <strong>🤝 Together</strong>
                <span>One shared board. You both swap pieces and see each other’s picks.</span>
              </button>
              <button className={'mode-card' + (mode === 'race' ? ' on' : '')} onClick={() => setMode('race')}>
                <strong>🏁 Race</strong>
                <span>Same scramble, separate boards. First to finish wins.</span>
              </button>
            </div>
            <button className="btn primary wide" disabled={!img} onClick={startGame}>
              Start puzzle
            </button>
            {partnerPrepping && <p className="hint">{partner?.name} is picking a photo too — whoever starts first wins the pick.</p>}
            <p className="hint">Tap two pieces to swap them. Pieces in the right spot lock in place.</p>
          </div>
        </div>
      </div>
    );
  }

  // ---------- PLAY ----------
  const ratio = img.w / img.h;
  const solved = correct === total;
  const elapsed = result ? result.ms : now - startAt;

  return (
    <div className="puzzle-play">
      <div className="scorebar">
        <span>⏱ {fmt(elapsed)}</span>
        <span>
          {correct}/{total} placed
        </span>
        <span>{moves} swaps</span>
        {mode === 'race' && (
          <span className="partner-progress">
            {partner?.avatar} {partner?.name}
            <span className="meter">
              <span style={{ width: (partnerProgress / total) * 100 + '%' }} />
            </span>
          </span>
        )}
        <button className="btn ghost small" onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)} onPointerLeave={() => setPeek(false)}>
          Hold to peek
        </button>
      </div>

      <div className="puzzle-wrap">
        <div
          className={'puzzle-board' + (solved ? ' solved' : '')}
          style={{
            aspectRatio: `${img.w} / ${img.h}`,
            width: `min(100%, calc(64vh * ${ratio}))`,
            gridTemplateColumns: `repeat(${n}, 1fr)`,
          }}
        >
          {slots.map((p, i) => {
            const col = p % n;
            const row = Math.floor(p / n);
            const locked = p === i;
            return (
              <button
                key={i}
                className={'tile' + (locked ? ' locked' : '') + (sel === i ? ' sel' : '') + (partnerSel === i && mode === 'coop' ? ' psel' : '')}
                style={{
                  backgroundImage: `url(${img.src})`,
                  backgroundSize: `${n * 100}% ${n * 100}%`,
                  backgroundPosition: `${(col / (n - 1)) * 100}% ${(row / (n - 1)) * 100}%`,
                }}
                onClick={() => clickTile(i)}
                aria-label={locked ? 'Placed piece' : `Piece ${i + 1}`}
              />
            );
          })}
          {peek && <img className="peek" src={img.src} alt="" />}
        </div>
      </div>

      {result && (
        <div className="result-card">
          {result.kind === 'coop' ? (
            <h3>You solved it together in {fmt(result.ms)} 💞</h3>
          ) : result.winner === 'me' ? (
            <h3>You won! {fmt(result.ms)} 🏆</h3>
          ) : (
            <h3>
              {partner?.name} finished first in {fmt(result.ms)} 🏁
            </h3>
          )}
          <button className="btn primary" onClick={newPuzzle}>
            New puzzle
          </button>
        </div>
      )}
    </div>
  );
}
