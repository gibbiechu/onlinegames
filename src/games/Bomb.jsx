import { useEffect, useRef, useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';
import { BOMB_CATEGORIES, FORFEITS } from '../data/party.js';
import { sfx } from './sfx.js';

const pick = (list) => list[Math.floor(Math.random() * list.length)];

export default function Bomb() {
  const { send, isHost, me, partner } = useRoom();
  const myRole = isHost ? 'host' : 'guest';
  const otherRole = isHost ? 'guest' : 'host';

  const [phase, setPhase] = useState('lobby'); // lobby | live | boom
  const [category, setCategory] = useState('');
  const [holder, setHolder] = useState(null);
  const [passes, setPasses] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [boom, setBoom] = useState(null); // { loser, forfeit }
  const [booms, setBooms] = useState({ host: 0, guest: 0 });
  const [, setNow] = useState(0);

  const holderRef = useRef(holder);
  holderRef.current = holder;
  const fuse = useRef(null);
  const startedAt = useRef(0);
  const nextStarter = useRef('host');

  // ---- ticking that speeds up over time (it never reveals the fuse length) ----
  useEffect(() => {
    if (phase !== 'live') return;
    let t;
    const loop = () => {
      sfx.tick();
      const elapsed = (performance.now() - startedAt.current) / 1000;
      t = setTimeout(loop, Math.max(110, 650 - elapsed * 14));
    };
    loop();
    const re = setInterval(() => setNow(Date.now()), 200);
    return () => {
      clearTimeout(t);
      clearInterval(re);
    };
  }, [phase]);

  useEffect(() => () => clearTimeout(fuse.current), []);

  const begin = (d) => {
    sfx.unlock();
    setCategory(d.cat);
    setHolder(d.holder);
    holderRef.current = d.holder;
    setPasses(0);
    setBoom(null);
    setLockedUntil(Date.now() + 1200);
    startedAt.current = performance.now();
    setPhase('live');
    sfx.whoosh();
  };

  const explode = (d) => {
    clearTimeout(fuse.current);
    setBoom(d);
    setPhase('boom');
    setBooms((b) => ({ ...b, [d.loser]: b[d.loser] + 1 }));
    sfx.boom();
  };

  // host owns the fuse
  const hostStart = () => {
    const d = { cat: pick(BOMB_CATEGORIES), holder: nextStarter.current };
    nextStarter.current = nextStarter.current === 'host' ? 'guest' : 'host';
    send('bomb:start', d);
    begin(d);
    clearTimeout(fuse.current);
    fuse.current = setTimeout(() => {
      const b = { loser: holderRef.current, forfeit: pick(FORFEITS) };
      send('bomb:boom', b);
      explode(b);
    }, 15000 + Math.random() * 30000);
  };

  const requestStart = () => {
    sfx.unlock();
    if (isHost) hostStart();
    else send('bomb:req', {});
  };

  useRoomEvent('bomb:req', () => isHost && phase !== 'live' && hostStart());
  useRoomEvent('bomb:start', begin);
  useRoomEvent('bomb:boom', explode);
  useRoomEvent('bomb:pass', () => {
    setHolder(myRole);
    holderRef.current = myRole;
    setPasses((p) => p + 1);
    setLockedUntil(Date.now() + 900);
    sfx.whoosh();
  });

  const pass = () => {
    if (holder !== myRole || Date.now() < lockedUntil) return;
    setHolder(otherRole);
    holderRef.current = otherRole;
    setPasses((p) => p + 1);
    send('bomb:pass', {});
    sfx.whoosh();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && phase === 'live') {
        e.preventDefault();
        pass();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const iHold = phase === 'live' && holder === myRole;
  const locked = Date.now() < lockedUntil;

  return (
    <div className={'bomb' + (phase === 'boom' ? ' shake' : '')}>
      <div className="bomb-score">
        <span>
          {me?.avatar} You blew up <strong>{booms[myRole]}</strong>×
        </span>
        <span>
          {partner?.avatar} {partner?.name} blew up <strong>{booms[otherRole]}</strong>×
        </span>
      </div>

      <div className={'bomb-stage' + (iHold ? ' hot' : '')}>
        {phase === 'lobby' && (
          <div className="bomb-intro">
            <span className="bomb-big" aria-hidden="true">
              💣
            </span>
            <h2>Hot potato</h2>
            <p>
              You get a category. Whoever holds the bomb says an answer out loud, then passes it. The fuse is secret.
              Whoever’s holding it when it blows does the forfeit.
            </p>
            <button className="btn primary" onClick={requestStart}>
              Light the fuse
            </button>
          </div>
        )}

        {phase === 'live' && (
          <>
            <p className="bomb-cat-label">Category</p>
            <h2 className="bomb-cat">{category}</h2>
            <span className={'bomb-big wobble' + (iHold ? ' mine' : ' theirs')} aria-hidden="true">
              💣
            </span>
            <p className="bomb-who" aria-live="assertive">
              {iHold ? 'YOU have the bomb! Say an answer and pass it!' : `${partner?.name} has the bomb…`}
            </p>
            {iHold && (
              <button className="btn primary bomb-pass" onClick={pass} disabled={locked}>
                {locked ? 'Think…' : 'Said it! Pass ➜'}
              </button>
            )}
            <p className="hint">{passes} {passes === 1 ? 'pass' : 'passes'} so far. Space bar passes too.</p>
          </>
        )}

        {phase === 'boom' && boom && (
          <div className="bomb-intro">
            <span className="bomb-big boom" aria-hidden="true">
              💥
            </span>
            <h2>{boom.loser === myRole ? 'BOOM! It blew up on you' : `BOOM! ${partner?.name} was holding it`}</h2>
            <div className="forfeit">
              <span>Forfeit for {boom.loser === myRole ? 'you' : partner?.name}</span>
              <strong>{boom.forfeit}</strong>
            </div>
            <button className="btn primary" onClick={requestStart}>
              Next bomb
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
