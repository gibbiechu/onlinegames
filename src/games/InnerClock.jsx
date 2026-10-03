import { useEffect, useRef, useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';
import { sfx } from './sfx.js';

export default function InnerClock() {
  const { send, me, partner } = useRoom();
  const [phase, setPhase] = useState('lobby'); // lobby | running | reveal
  const [target, setTarget] = useState(10);
  const [mine, setMine] = useState(null);
  const [theirs, setTheirs] = useState(null);
  const [score, setScore] = useState({ me: 0, them: 0, synced: 0 });
  const startAt = useRef(0);
  const idRef = useRef(0);
  const counted = useRef(0);

  const begin = (d) => {
    sfx.unlock();
    idRef.current = d.id;
    setTarget(d.target);
    setMine(null);
    setTheirs(null);
    setPhase('running');
    startAt.current = performance.now();
    sfx.go();
  };

  const start = () => {
    const d = { id: Date.now(), target: 5 + Math.floor(Math.random() * 11) };
    send('clock:start', d);
    begin(d);
  };

  const stop = () => {
    if (phase !== 'running' || mine != null) return;
    const t = (performance.now() - startAt.current) / 1000;
    setMine(t);
    sfx.beep();
    send('clock:stop', { id: idRef.current, t });
  };

  useRoomEvent('clock:start', begin);
  useRoomEvent('clock:stop', (d) => d.id === idRef.current && setTheirs(d.t));

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && phase === 'running') {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (mine == null || theirs == null || counted.current === idRef.current) return;
    counted.current = idRef.current;
    const em = Math.abs(mine - target);
    const et = Math.abs(theirs - target);
    const synced = Math.abs(mine - theirs) < 0.3;
    setScore((s) => ({
      me: s.me + (em < et ? 1 : 0),
      them: s.them + (et < em ? 1 : 0),
      synced: s.synced + (synced ? 1 : 0),
    }));
    setPhase('reveal');
    synced ? sfx.win() : em < et ? sfx.ding() : sfx.lose();
  }, [mine, theirs, target]);

  const em = mine != null ? Math.abs(mine - target) : null;
  const et = theirs != null ? Math.abs(theirs - target) : null;
  const max = Math.max(target * 1.6, mine || 0, theirs || 0) + 1;
  const pos = (t) => `${Math.min(100, (t / max) * 100)}%`;

  return (
    <div className="clock">
      <div className="clock-score">
        <span>
          {me?.avatar} You <strong>{score.me}</strong>
        </span>
        <span>
          💞 In sync <strong>{score.synced}</strong>
        </span>
        <span>
          {partner?.avatar} {partner?.name} <strong>{score.them}</strong>
        </span>
      </div>

      {phase === 'lobby' && (
        <div className="panel center-panel">
          <span className="clock-face" aria-hidden="true">
            ⏱️
          </span>
          <h2>Inner clock</h2>
          <p>You both get a secret number of seconds. No timer on screen. Hit stop when you think it’s up.</p>
          <p className="hint">Closest wins the round. Stop within 0.3 s of each other and you’re officially in sync.</p>
          <button className="btn primary" onClick={start}>
            Start
          </button>
        </div>
      )}

      {phase === 'running' && (
        <button className="clock-run" onClick={stop} disabled={mine != null}>
          <span className="clock-target">{target}</span>
          <span className="clock-sub">seconds</span>
          <span className="clock-hint">
            {mine == null ? 'Count in your head… tap or press Space to stop' : `Stopped. Waiting for ${partner?.name}…`}
          </span>
        </button>
      )}

      {phase === 'reveal' && (
        <div className="panel clock-reveal">
          <h2>
            {Math.abs(mine - theirs) < 0.3
              ? 'Perfectly in sync 💞'
              : em < et
                ? 'Your inner clock wins ⏱️'
                : em > et
                  ? `${partner?.name}’s inner clock wins`
                  : 'Exactly tied!'}
          </h2>
          <div className="timeline">
            <span className="tl-target" style={{ left: pos(target) }}>
              <b>{target}s</b>
            </span>
            <span className="tl-mark me" style={{ left: pos(mine) }} title="You">
              {me?.avatar}
            </span>
            <span className="tl-mark them" style={{ left: pos(theirs) }} title={partner?.name}>
              {partner?.avatar}
            </span>
          </div>
          <p>
            You stopped at <strong>{mine.toFixed(2)}s</strong> ({em.toFixed(2)} off). {partner?.name} stopped at{' '}
            <strong>{theirs.toFixed(2)}s</strong> ({et.toFixed(2)} off).
          </p>
          <button className="btn primary" onClick={start}>
            Again
          </button>
        </div>
      )}
    </div>
  );
}
