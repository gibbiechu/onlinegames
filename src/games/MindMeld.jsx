import { useEffect, useRef, useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';
import { sfx } from './sfx.js';

const norm = (w) => {
  let s = (w || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (s.length > 3 && s.endsWith('s')) s = s.slice(0, -1);
  return s;
};

export default function MindMeld() {
  const { send, me, partner } = useRoom();
  const [rounds, setRounds] = useState([{ me: null, them: null }]);
  const [input, setInput] = useState('');
  const [won, setWon] = useState(false);
  const [best, setBest] = useState(null);
  const inputRef = useRef(null);

  const r = rounds.length - 1;
  const cur = rounds[r];
  const prev = r > 0 ? rounds[r - 1] : null;

  const update = (idx, patch) =>
    setRounds((list) => {
      const next = list.slice();
      while (next.length <= idx) next.push({ me: null, them: null });
      next[idx] = { ...next[idx], ...patch };
      return next;
    });

  useEffect(() => {
    if (cur.me == null || cur.them == null || won) return;
    if (norm(cur.me) === norm(cur.them)) {
      setWon(true);
      sfx.win();
      setBest((b) => (b == null ? r + 1 : Math.min(b, r + 1)));
    } else {
      sfx.whoosh();
      const t = setTimeout(() => setRounds((list) => (list.length === r + 1 ? [...list, { me: null, them: null }] : list)), 900);
      return () => clearTimeout(t);
    }
  }, [cur.me, cur.them, r, won]);

  useEffect(() => {
    if (cur.me == null) inputRef.current?.focus();
  }, [r, cur.me]);

  const submit = (e) => {
    e.preventDefault();
    const w = input.trim();
    if (!w || cur.me != null) return;
    sfx.unlock();
    sfx.beep();
    update(r, { me: w });
    send('meld:word', { r, w });
    setInput('');
  };

  useRoomEvent('meld:word', (d) => update(d.r, { them: d.w }));

  const reset = (fromNet) => {
    if (!fromNet) send('meld:reset', {});
    setRounds([{ me: null, them: null }]);
    setWon(false);
    setInput('');
  };
  useRoomEvent('meld:reset', () => reset(true));

  const bothIn = cur.me != null && cur.them != null;

  return (
    <div className="meld">
      <p className="meld-rules">
        Both type a word at the same time. If they’re different, you each try to find ONE word that connects the last two.
        Keep going until your brains sync up.
      </p>

      <ol className="meld-chain">
        {rounds.map((rd, i) =>
          rd.me != null && rd.them != null ? (
            <li key={i} className={norm(rd.me) === norm(rd.them) ? 'match' : ''}>
              <span className="meld-n">{i + 1}</span>
              <span className="meld-word">
                {me?.avatar} {rd.me}
              </span>
              <span className="meld-plus">{norm(rd.me) === norm(rd.them) ? '=' : '+'}</span>
              <span className="meld-word">
                {partner?.avatar} {rd.them}
              </span>
            </li>
          ) : null
        )}
      </ol>

      {won ? (
        <div className="meld-win">
          <h2>🧠⚡🧠 Mind meld in {r + 1} {r === 0 ? 'round' : 'rounds'}!</h2>
          <p>You both said “{cur.me}”.</p>
          {best != null && <p className="hint">Your best: {best} rounds</p>}
          <button className="btn primary" onClick={() => reset(false)}>
            Play again
          </button>
        </div>
      ) : (
        <div className="meld-play">
          <h2 className="meld-prompt">
            {prev ? (
              <>
                What links <em>{prev.me}</em> and <em>{prev.them}</em>?
              </>
            ) : (
              'Say any word. Anything at all.'
            )}
          </h2>
          {cur.me == null ? (
            <form onSubmit={submit} className="meld-form">
              <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} maxLength={30} placeholder="one word" aria-label="Your word" autoComplete="off" />
              <button className="btn primary">Lock in 🔒</button>
            </form>
          ) : bothIn ? (
            <p className="hint">Revealing…</p>
          ) : (
            <p className="hint">
              You locked in “{cur.me}”. Waiting for {partner?.name}…
            </p>
          )}
          {cur.them != null && cur.me == null && <p className="meld-locked">{partner?.name} has locked in 🔒</p>}
          {r >= 7 && (
            <button className="btn ghost small" onClick={() => reset(false)}>
              Give up and start over
            </button>
          )}
        </div>
      )}
    </div>
  );
}
