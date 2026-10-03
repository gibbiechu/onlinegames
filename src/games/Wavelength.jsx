import { useEffect, useRef, useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';
import { SPECTRUMS } from '../data/party.js';
import { sfx } from './sfx.js';

const CX = 200;
const CY = 200;
const R = 170;
const ang = (v) => Math.PI - (v / 100) * Math.PI; // 0 = left, 100 = right
const pt = (v, r = R) => [CX + Math.cos(ang(v)) * r, CY - Math.sin(ang(v)) * r];

function wedge(from, to) {
  const a = Math.max(0, from);
  const b = Math.min(100, to);
  const [x1, y1] = pt(a);
  const [x2, y2] = pt(b);
  return `M${CX},${CY} L${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2} Z`;
}

const points = (d) => (d <= 4 ? 4 : d <= 9 ? 3 : d <= 14 ? 2 : 0);

export default function Wavelength() {
  const { send, isHost, partner } = useRoom();
  const [round, setRound] = useState(null); // { r, s, target }
  const [clue, setClue] = useState('');
  const [clueDraft, setClueDraft] = useState('');
  const [dial, setDial] = useState(50);
  const [locked, setLocked] = useState(null);
  const [score, setScore] = useState({ pts: 0, rounds: 0 });
  const roundRef = useRef(round);
  roundRef.current = round;
  const lastSend = useRef(0);

  const iPsychic = round ? (round.r % 2 === 0) === isHost : false;

  const show = (d) => {
    setRound(d);
    setClue('');
    setClueDraft('');
    setDial(50);
    setLocked(null);
  };

  const newRound = (r) => {
    const d = { r, s: Math.floor(Math.random() * SPECTRUMS.length), target: 6 + Math.floor(Math.random() * 89) };
    send('wave:round', d);
    show(d);
  };

  useEffect(() => {
    if (isHost) newRound(0);
    else send('wave:hello', {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRoomEvent('wave:hello', () => isHost && roundRef.current && send('wave:round', roundRef.current));
  useRoomEvent('wave:round', show);
  useRoomEvent('wave:clue', (d) => {
    setClue(d.text);
    sfx.ding();
  });
  useRoomEvent('wave:dial', (d) => setDial(d.v));
  useRoomEvent('wave:lock', (d) => reveal(d.v));

  const reveal = (v) => {
    setDial(v);
    setLocked(v);
    const p = points(Math.abs(v - roundRef.current.target));
    setScore((s) => ({ pts: s.pts + p, rounds: s.rounds + 1 }));
    p >= 3 ? sfx.win() : p > 0 ? sfx.ding() : sfx.lose();
  };

  const sendClue = (e) => {
    e.preventDefault();
    const t = clueDraft.trim();
    if (!t) return;
    sfx.unlock();
    setClue(t);
    send('wave:clue', { text: t });
  };

  const move = (v) => {
    setDial(v);
    const now = performance.now();
    if (now - lastSend.current > 50) {
      lastSend.current = now;
      send('wave:dial', { v });
    }
  };

  const lock = () => {
    send('wave:lock', { v: dial });
    reveal(dial);
  };

  if (!round) return <div className="panel center-panel">Tuning in…</div>;
  const [leftWord, rightWord] = SPECTRUMS[round.s];
  const showTarget = iPsychic || locked != null;
  const t = round.target;
  const [nx, ny] = pt(dial, R - 12);

  return (
    <div className="wave">
      <div className="wave-top">
        <span className="pill">{iPsychic ? '🔮 You give the clue' : `🎯 You guess, ${partner?.name} gives the clue`}</span>
        <span className="pill">
          Team score {score.pts} in {score.rounds} {score.rounds === 1 ? 'round' : 'rounds'}
        </span>
      </div>

      <div className="wave-dial">
        <svg viewBox="0 0 400 230" role="img" aria-label={`Dial from ${leftWord} to ${rightWord}, needle at ${dial}`}>
          <path d={wedge(0, 100)} fill="var(--ink-3)" />
          {showTarget && (
            <>
              <path d={wedge(t - 14.5, t + 14.5)} fill="#3e6be0" />
              <path d={wedge(t - 9.5, t + 9.5)} fill="#ff8a3d" />
              <path d={wedge(t - 4.5, t + 4.5)} fill="#f5c24b" />
              <text x={pt(t, R - 22)[0]} y={pt(t, R - 22)[1]} className="wave-4">
                4
              </text>
            </>
          )}
          {!showTarget && <path d={wedge(0, 100)} fill="url(#fog)" />}
          <defs>
            <linearGradient id="fog" x1="0" x2="1">
              <stop offset="0" stopColor="#e8434c" stopOpacity=".25" />
              <stop offset="1" stopColor="#3e6be0" stopOpacity=".25" />
            </linearGradient>
          </defs>
          <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="#e8434c" strokeWidth="7" strokeLinecap="round" />
          <circle cx={CX} cy={CY} r="16" fill="#fbf3e4" />
        </svg>
        <div className="wave-ends">
          <span>← {leftWord}</span>
          <span>{rightWord} →</span>
        </div>
      </div>

      <div className="wave-controls">
        {clue ? (
          <p className="wave-clue">
            Clue: <strong>“{clue}”</strong>
          </p>
        ) : iPsychic ? (
          <form className="meld-form" onSubmit={sendClue}>
            <input
              value={clueDraft}
              onChange={(e) => setClueDraft(e.target.value)}
              maxLength={40}
              placeholder={`Something that sits right there between ${leftWord.toLowerCase()} and ${rightWord.toLowerCase()}`}
              aria-label="Your clue"
            />
            <button className="btn primary">Send clue</button>
          </form>
        ) : (
          <p className="hint">{partner?.name} is thinking of a clue…</p>
        )}

        {!iPsychic && clue && locked == null && (
          <>
            <input type="range" min="0" max="100" value={dial} onChange={(e) => move(Number(e.target.value))} className="wave-range" aria-label="Move the dial" />
            <button className="btn primary" onClick={lock}>
              Lock it in
            </button>
            <p className="hint">Talk it out on the call. {partner?.name} sees your needle move.</p>
          </>
        )}
        {iPsychic && clue && locked == null && <p className="hint">Watch them move the needle… no hints! 🤐</p>}

        {locked != null && (
          <div className="wave-result">
            <h3>
              {points(Math.abs(locked - t)) === 4
                ? 'Bullseye! Same wavelength 💞 +4'
                : points(Math.abs(locked - t)) > 0
                  ? `Close! +${points(Math.abs(locked - t))}`
                  : 'Not even the same radio station 📻'}
            </h3>
            <button className="btn primary" onClick={() => newRound(round.r + 1)}>
              Next round (swap roles)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
