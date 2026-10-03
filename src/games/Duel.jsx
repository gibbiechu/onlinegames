import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';
import { sfx } from './sfx.js';

// Reaction time is measured on each person's own screen, from the moment THEIR screen shows "DRAW",
// so a laggy connection doesn't decide the winner.
const FIRST_TO = 3;
const MISS = 9999;

export default function Duel() {
  const { send, isHost, me, partner } = useRoom();
  const [phase, setPhase] = useState('lobby'); // lobby | steady | draw | result | match
  const [readyMe, setReadyMe] = useState(false);
  const [readyThem, setReadyThem] = useState(false);
  const [round, setRound] = useState(0);
  const [myShot, setMyShot] = useState(null);
  const [theirShot, setTheirShot] = useState(null);
  const [score, setScore] = useState({ me: 0, them: 0 });
  const [outcome, setOutcome] = useState(null); // 'me' | 'them' | 'tie'

  const drawAt = useRef(0);
  const timers = useRef([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const roundRef = useRef(round);
  roundRef.current = round;
  const myShotRef = useRef(myShot);
  myShotRef.current = myShot;

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const startRound = useCallback((delay, r) => {
    clearTimers();
    setRound(r);
    setMyShot(null);
    setTheirShot(null);
    setOutcome(null);
    setReadyMe(false);
    setReadyThem(false);
    setPhase('steady');
    for (let t = 0; t < delay - 300; t += 800) timers.current.push(setTimeout(sfx.tick, t));
    timers.current.push(
      setTimeout(() => {
        drawAt.current = performance.now();
        setPhase('draw');
        sfx.go();
        timers.current.push(
          setTimeout(() => {
            if (myShotRef.current == null) fire(MISS);
          }, 3000)
        );
      }, delay)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fire = (value) => {
    setMyShot(value);
    myShotRef.current = value;
    send('duel:shot', { v: value, r: roundRef.current });
  };

  const shoot = () => {
    sfx.unlock();
    if (myShotRef.current != null) return;
    if (phaseRef.current === 'steady') {
      clearTimers();
      sfx.lose();
      fire('foul');
    } else if (phaseRef.current === 'draw') {
      sfx.bang();
      fire(Math.round(performance.now() - drawAt.current));
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && ['steady', 'draw'].includes(phaseRef.current)) {
        e.preventDefault();
        shoot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- ready / start ----
  const ready = () => {
    sfx.unlock();
    setReadyMe(true);
    send('duel:ready', {});
  };
  useRoomEvent('duel:ready', () => setReadyThem(true));

  useEffect(() => {
    if (!isHost || !readyMe || !readyThem) return;
    const d = { delay: 1800 + Math.round(Math.random() * 4200), r: roundRef.current + 1 };
    send('duel:start', d);
    startRound(d.delay, d.r);
  }, [isHost, readyMe, readyThem, send, startRound]);

  useRoomEvent('duel:start', (d) => startRound(d.delay, d.r));
  useRoomEvent('duel:shot', (d) => {
    if (d.r === roundRef.current) setTheirShot(d.v);
  });
  useRoomEvent('duel:reset', () => {
    setScore({ me: 0, them: 0 });
    setPhase('lobby');
  });

  // ---- decide ----
  useEffect(() => {
    if (myShot == null || theirShot == null || outcome) return;
    let o;
    if (myShot === 'foul' && theirShot === 'foul') o = 'tie';
    else if (myShot === 'foul') o = 'them';
    else if (theirShot === 'foul') o = 'me';
    else if (myShot === theirShot) o = 'tie';
    else o = myShot < theirShot ? 'me' : 'them';
    clearTimers();
    setOutcome(o);
    const next = { me: score.me + (o === 'me' ? 1 : 0), them: score.them + (o === 'them' ? 1 : 0) };
    setScore(next);
    if (next.me >= FIRST_TO || next.them >= FIRST_TO) {
      setPhase('match');
      (next.me >= FIRST_TO ? sfx.win : sfx.lose)();
    } else {
      setPhase('result');
    }
  }, [myShot, theirShot, outcome, score]);

  const label = (v) => (v === 'foul' ? 'shot too early' : v === MISS ? 'froze' : v == null ? '…' : `${v} ms`);

  const restart = () => {
    send('duel:reset', {});
    setScore({ me: 0, them: 0 });
    setPhase('lobby');
  };

  const meDown = outcome === 'them';
  const themDown = outcome === 'me';
  const live = phase === 'steady' || phase === 'draw';

  let center;
  if (phase === 'lobby') center = <p className="duel-call">High noon. First to {FIRST_TO} wins.</p>;
  else if (phase === 'steady') center = <p className="duel-call">{myShot === 'foul' ? 'Too early! 🙈' : 'Steady…'}</p>;
  else if (phase === 'draw') center = <p className="duel-call draw">{myShot != null && myShot !== MISS ? label(myShot) : 'DRAW!'}</p>;
  else
    center = (
      <div className="duel-result">
        <p className="duel-call">
          {phase === 'match'
            ? score.me > score.them
              ? 'You’re the fastest in town 🤠'
              : `${partner?.name} rules this town 🤠`
            : outcome === 'tie'
              ? 'Dead even!'
              : outcome === 'me'
                ? 'You got them! 💥'
                : 'You got got 💀'}
        </p>
        <p className="duel-times">
          You {label(myShot)} vs {partner?.name} {label(theirShot)}
        </p>
      </div>
    );

  return (
    <div className="duel">
      <div className="duel-score">
        <span>
          {me?.avatar} You <strong>{score.me}</strong>
        </span>
        <span>
          <strong>{score.them}</strong> {partner?.name} {partner?.avatar}
        </span>
      </div>

      <div
        className={'duel-arena' + (phase === 'draw' ? ' flash' : '') + (live ? ' live' : '')}
        onPointerDown={live ? shoot : undefined}
        role={live ? 'button' : undefined}
        aria-label={live ? 'Shoot' : undefined}
      >
        <span className={'gunslinger left' + (meDown ? ' down' : '')}>{me?.avatar}</span>
        <div className="duel-center">{center}</div>
        <span className={'gunslinger right' + (themDown ? ' down' : '')}>{partner?.avatar}</span>
        <div className="tumbleweed" aria-hidden="true">
          🌵
        </div>
      </div>

      <div className="duel-foot">
        {(phase === 'lobby' || phase === 'result') &&
          (readyMe ? (
            <p className="hint">Waiting for {partner?.name} to put a hand on the holster…</p>
          ) : (
            <button className="btn primary" onClick={ready}>
              {phase === 'lobby' ? 'I’m ready' : 'Next round'}
            </button>
          ))}
        {phase === 'lobby' && readyThem && !readyMe && <p className="hint">{partner?.name} is ready.</p>}
        {phase === 'match' && (
          <button className="btn primary" onClick={restart}>
            Rematch
          </button>
        )}
        {live && <p className="hint">Tap the arena or press Space the moment it says DRAW. Shoot early and you lose the round.</p>}
      </div>
    </div>
  );
}
