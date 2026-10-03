import { useEffect, useRef, useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';
import { WYR } from '../data/decks.js';

export default function WouldYouRather() {
  const { send, isHost, partner, me } = useRoom();
  const [q, setQ] = useState(null);
  const [mine, setMine] = useState(null);
  const [theirs, setTheirs] = useState(null);
  const [stats, setStats] = useState({ same: 0, total: 0 });
  const used = useRef(new Set());
  const qRef = useRef(q);
  qRef.current = q;

  const newQuestion = () => {
    if (used.current.size >= WYR.length) used.current.clear();
    let i;
    do i = Math.floor(Math.random() * WYR.length);
    while (used.current.has(i));
    return i;
  };

  const show = (i) => {
    used.current.add(i);
    setQ(i);
    setMine(null);
    setTheirs(null);
  };

  useEffect(() => {
    if (isHost) {
      const i = newQuestion();
      show(i);
      send('wyr:q', { i });
    } else {
      send('wyr:hello', {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRoomEvent('wyr:hello', () => {
    if (isHost && qRef.current != null) send('wyr:q', { i: qRef.current });
  });
  useRoomEvent('wyr:q', (d) => show(d.i));
  useRoomEvent('wyr:vote', (d) => setTheirs(d.v));

  const both = mine != null && theirs != null;
  const counted = useRef(-1);
  useEffect(() => {
    if (both && counted.current !== q) {
      counted.current = q;
      setStats((s) => ({ same: s.same + (mine === theirs ? 1 : 0), total: s.total + 1 }));
    }
  }, [both, mine, theirs, q]);

  const vote = (v) => {
    if (mine != null) return;
    setMine(v);
    send('wyr:vote', { v });
  };

  const next = () => {
    const i = newQuestion();
    show(i);
    send('wyr:q', { i });
  };

  if (q == null) return <div className="panel center-panel">Shuffling questions…</div>;
  const [a, b] = WYR[q];

  return (
    <div className="wyr">
      <p className="wyr-stats">
        You matched on {stats.same} of {stats.total}
      </p>
      <h2 className="wyr-q">Would you rather…</h2>
      <div className="wyr-options">
        {[a, b].map((text, v) => (
          <button key={v} className={'wyr-option opt' + v + (mine === v ? ' mine' : '') + (mine != null && mine !== v ? ' dim' : '')} onClick={() => vote(v)} disabled={mine != null}>
            <span className="wyr-text">{text}</span>
            {both && (
              <span className="wyr-who">
                {mine === v && <span title="You">{me?.avatar}</span>}
                {theirs === v && <span title={partner?.name}>{partner?.avatar}</span>}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="wyr-foot">
        {mine == null && <p className="hint">{theirs != null ? `${partner?.name} has answered. Your pick?` : 'Pick one. Answers stay hidden until you both choose.'}</p>}
        {mine != null && !both && <p className="hint">Waiting for {partner?.name}…</p>}
        {both && (
          <>
            <h3>{mine === theirs ? 'Same answer 💞' : 'Opposites attract 🙃'}</h3>
            <p className="hint">Now explain yourselves.</p>
            <button className="btn primary" onClick={next}>
              Next question
            </button>
          </>
        )}
      </div>
    </div>
  );
}
