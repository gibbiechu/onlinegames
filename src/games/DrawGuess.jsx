import { useEffect, useRef, useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';
import { WORDS } from '../data/decks.js';

const CW = 800;
const CH = 560;
const DURATION = 80;
const PAPER = '#fffaf0';
const COLORS = ['#1d2140', '#e8434c', '#ff8a3d', '#f5c24b', '#3fae6a', '#3e6be0', '#a24bc9', '#8a5a3c'];
const SIZES = [4, 10, 22];

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
function lev(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
const pick3 = () => {
  const s = new Set();
  while (s.size < 3) s.add(WORDS[Math.floor(Math.random() * WORDS.length)]);
  return [...s];
};

export default function DrawGuess() {
  const { send, isHost, partner } = useRoom();
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState('pick');
  const [choices, setChoices] = useState(pick3);
  const [word, setWord] = useState('');
  const [mask, setMask] = useState('');
  const [hints, setHints] = useState({});
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [guesses, setGuesses] = useState([]);
  const [guess, setGuess] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [eraser, setEraser] = useState(false);
  const [reveal, setReveal] = useState(null);
  const [score, setScore] = useState({ points: 0, guessed: 0, played: 0 });

  const canvasRef = useRef(null);
  const drawing = useRef(null);
  const hintSent = useRef(false);
  const endedRef = useRef(false);

  const iDraw = (round % 2 === 0) === isHost;
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));

  const ctx = () => canvasRef.current?.getContext('2d');
  const clearCanvas = () => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = PAPER;
    c.fillRect(0, 0, CW, CH);
  };
  const seg = (x0, y0, x1, y1, col, w) => {
    const c = ctx();
    if (!c) return;
    c.strokeStyle = col;
    c.lineWidth = w;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
  };

  useEffect(clearCanvas, []);

  useEffect(() => {
    if (phase !== 'draw') return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [phase]);

  // drawer runs the clock and hints
  useEffect(() => {
    if (!iDraw || phase !== 'draw') return;
    if (!hintSent.current && left <= DURATION / 2 && word) {
      hintSent.current = true;
      const i = [...word].findIndex((ch) => ch !== ' ');
      send('dg:hint', { i, ch: word[i] });
    }
    if (left <= 0 && !endedRef.current) endRound(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, phase, iDraw]);

  const startRound = (w) => {
    setWord(w);
    const m = w.replace(/[^ ]/g, '_');
    setMask(m);
    setHints({});
    hintSent.current = false;
    endedRef.current = false;
    const end = Date.now() + DURATION * 1000;
    setEndsAt(end);
    setNow(Date.now());
    setGuesses([]);
    setReveal(null);
    clearCanvas();
    setPhase('draw');
    send('dg:start', { mask: m, round });
  };

  useRoomEvent('dg:start', (d) => {
    setWord('');
    setMask(d.mask);
    setHints({});
    endedRef.current = false;
    setEndsAt(Date.now() + DURATION * 1000);
    setNow(Date.now());
    setGuesses([]);
    setReveal(null);
    clearCanvas();
    setPhase('draw');
  });
  useRoomEvent('dg:hint', (d) => setHints((h) => ({ ...h, [d.i]: d.ch })));
  useRoomEvent('dg:seg', (s) => seg(...s));
  useRoomEvent('dg:clear', clearCanvas);

  const applyEnd = (d) => {
    endedRef.current = true;
    setReveal(d);
    if (d.correct) setGuesses((list) => list.map((g) => (norm(g.text) === norm(d.word) ? { ...g, correct: true } : g)));
    setPhase('reveal');
    setScore((s) => ({
      points: s.points + (d.correct ? 10 + Math.ceil(d.left / 4) : 0),
      guessed: s.guessed + (d.correct ? 1 : 0),
      played: s.played + 1,
    }));
  };
  const endRound = (correct) => {
    if (endedRef.current) return;
    const d = { word, correct, left };
    send('dg:end', d);
    applyEnd(d);
  };
  useRoomEvent('dg:end', applyEnd);

  // drawer checks the guesses
  useRoomEvent('dg:guess', (d) => {
    if (!iDraw || phase !== 'draw') return;
    const g = norm(d.text);
    const w = norm(word);
    const correct = g === w;
    const close = !correct && w.length > 3 && lev(g, w) <= 1;
    setGuesses((list) => [...list.slice(-30), { text: d.text, correct, close }]);
    if (close) send('dg:close', { text: d.text });
    if (correct) endRound(true);
  });
  useRoomEvent('dg:close', (d) => setGuesses((list) => list.map((x) => (x.text === d.text ? { ...x, close: true } : x))));

  const submitGuess = (e) => {
    e.preventDefault();
    const text = guess.trim();
    if (!text) return;
    send('dg:guess', { text });
    setGuesses((list) => [...list.slice(-30), { text, mine: true }]);
    setGuess('');
  };

  const next = (fromNet, r) => {
    const nr = fromNet ? r : round + 1;
    if (!fromNet) send('dg:next', { round: nr });
    setRound(nr);
    setChoices(pick3());
    setPhase('pick');
    setReveal(null);
    setWord('');
    clearCanvas();
  };
  useRoomEvent('dg:next', (d) => next(true, d.round));

  // ---- pointer drawing ----
  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) * CW) / r.width, ((e.clientY - r.top) * CH) / r.height];
  };
  const canDraw = iDraw && phase === 'draw';
  const onDown = (e) => {
    if (!canDraw) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = pos(e);
    onMove(e);
  };
  const onMove = (e) => {
    if (!canDraw || !drawing.current) return;
    const [x0, y0] = drawing.current;
    const [x1, y1] = pos(e);
    const col = eraser ? PAPER : color;
    const w = eraser ? size * 2.2 : size;
    const s = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), col, w];
    seg(...s);
    send('dg:seg', s);
    drawing.current = [x1, y1];
  };
  const onUp = () => (drawing.current = null);

  const shownMask = [...mask].map((ch, i) => (hints[i] ? hints[i] : ch)).join(' ');

  return (
    <div className="draw-game">
      <div className="draw-top">
        <span className="pill">{iDraw ? '✏️ You draw' : `👀 You guess, ${partner?.name} draws`}</span>
        {phase === 'draw' && <span className={'pill timer' + (left <= 10 ? ' hurry' : '')}>⏱ {left}s</span>}
        <span className="pill">Team score {score.points}</span>
        <span className="pill">
          {score.guessed} of {score.played} guessed
        </span>
      </div>

      <div className="draw-main">
        <div className="canvas-col">
          <div className="word-line" aria-live="polite">
            {phase === 'draw' && (iDraw ? <>Draw: <strong>{word}</strong></> : <span className="mask">{shownMask}</span>)}
          </div>
          <div className="canvas-frame">
            <canvas
              ref={canvasRef}
              width={CW}
              height={CH}
              className={'draw-canvas' + (canDraw ? ' live' : '')}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              aria-label="Drawing board"
            />
            {phase === 'pick' && (
              <div className="canvas-overlay">
                {iDraw ? (
                  <>
                    <h3>Pick a word to draw</h3>
                    <div className="row">
                      {choices.map((w) => (
                        <button key={w} className="btn primary" onClick={() => startRound(w)}>
                          {w}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <h3>{partner?.name} is picking a word…</h3>
                )}
              </div>
            )}
            {phase === 'reveal' && reveal && (
              <div className="canvas-overlay">
                <h3>{reveal.correct ? `Got it! It was “${reveal.word}” 🎉` : `Time’s up — it was “${reveal.word}”`}</h3>
                <button className="btn primary" onClick={() => next(false)}>
                  Next round (swap roles)
                </button>
              </div>
            )}
          </div>
          {canDraw && (
            <div className="tools">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={'swatch' + (!eraser && color === c ? ' on' : '')}
                  style={{ background: c }}
                  onClick={() => {
                    setColor(c);
                    setEraser(false);
                  }}
                  aria-label={'Colour ' + c}
                />
              ))}
              <span className="tool-sep" />
              {SIZES.map((s) => (
                <button key={s} className={'size' + (size === s ? ' on' : '')} onClick={() => setSize(s)} aria-label={'Brush size ' + s}>
                  <span style={{ width: s, height: s }} />
                </button>
              ))}
              <button className={'chip' + (eraser ? ' on' : '')} onClick={() => setEraser((x) => !x)}>
                Eraser
              </button>
              <button
                className="chip"
                onClick={() => {
                  clearCanvas();
                  send('dg:clear', {});
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <aside className="guess-col">
          <h3>Guesses</h3>
          {!iDraw && phase === 'draw' && (
            <form onSubmit={submitGuess} className="guess-form">
              <input value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="Your guess" maxLength={40} aria-label="Your guess" />
              <button className="btn primary">Guess</button>
            </form>
          )}
          <ul className="guess-list">
            {[...guesses].reverse().map((g, i) => (
              <li key={i} className={g.correct ? 'right' : g.close ? 'close' : ''}>
                {g.text}
                {g.close && <em> so close!</em>}
              </li>
            ))}
            {!guesses.length && <li className="empty">{iDraw ? 'Their guesses show up here.' : 'Type what you think it is.'}</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
