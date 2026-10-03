import { useEffect, useRef, useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';
import { DARES, DRINKING_DARES, NEVER, TRUTHS } from '../data/decks.js';

const LEVELS = [
  { id: 'sweet', label: 'Sweet', icon: '💕' },
  { id: 'spicy', label: 'Spicy', icon: '🌶️' },
  { id: 'wild', label: 'Wild', icon: '🔥' },
];
const KIND_LABEL = { truth: 'Truth', dare: 'Dare', never: 'You both answer' };

const blankTally = () => ({ host: { done: 0, drinks: 0 }, guest: { done: 0, drinks: 0 } });

export default function TruthOrDare() {
  const { send, isHost, me, partner } = useRoom();
  const [level, setLevel] = useState('sweet');
  const [drinking, setDrinking] = useState(false);
  const [turn, setTurn] = useState(0);
  const [card, setCard] = useState(null);
  const [answers, setAnswers] = useState({});
  const [tally, setTally] = useState(blankTally);
  const [last, setLast] = useState('');
  const used = useRef(new Set());

  const myRole = isHost ? 'host' : 'guest';
  const turnRole = turn % 2 === 0 ? 'host' : 'guest';
  const myTurn = myRole === turnRole;
  const nameOf = (role) => (role === myRole ? 'You' : partner?.name || 'Partner');
  const settingsRef = useRef({ level, drinking });
  settingsRef.current = { level, drinking };

  useEffect(() => {
    if (!isHost) send('tod:hello', {});
  }, [isHost, send]);
  useRoomEvent('tod:hello', () => isHost && send('tod:settings', settingsRef.current));
  useRoomEvent('tod:settings', (d) => {
    setLevel(d.level);
    setDrinking(d.drinking);
  });

  const changeSettings = (next) => {
    const s = { ...settingsRef.current, ...next };
    setLevel(s.level);
    setDrinking(s.drinking);
    send('tod:settings', s);
  };

  const draw = (kind) => {
    let pool;
    if (kind === 'truth') pool = TRUTHS[level];
    else if (kind === 'dare') pool = drinking ? [...DARES[level], ...DRINKING_DARES] : DARES[level];
    else pool = NEVER;
    let fresh = pool.filter((t) => !used.current.has(t));
    if (!fresh.length) {
      pool.forEach((t) => used.current.delete(t));
      fresh = pool;
    }
    const text = fresh[Math.floor(Math.random() * fresh.length)];
    used.current.add(text);
    const c = { kind, text, turn };
    send('tod:card', c);
    showCard(c);
  };

  const showCard = (c) => {
    used.current.add(c.text);
    setCard(c);
    setAnswers({});
    setLast('');
  };
  useRoomEvent('tod:card', showCard);

  const finishTurn = (res, role) => {
    setTally((t) => {
      const n = { host: { ...t.host }, guest: { ...t.guest } };
      if (res === 'done') n[role].done += 1;
      else n[role].drinks += 1;
      return n;
    });
    setLast(
      res === 'done'
        ? `${nameOf(role)} did it ✅`
        : drinking
          ? `${nameOf(role)} chickened out and drinks 🍺`
          : `${nameOf(role)} passed 🙈`
    );
    setCard(null);
    setTurn((x) => x + 1);
  };

  const resolve = (res) => {
    send('tod:result', { res });
    finishTurn(res, myRole);
  };
  useRoomEvent('tod:result', (d) => finishTurn(d.res, myRole === 'host' ? 'guest' : 'host'));

  // ---- never have I ever ----
  const answerNever = (have) => {
    setAnswers((a) => ({ ...a, [myRole]: have }));
    send('tod:never', { have });
  };
  useRoomEvent('tod:never', (d) => setAnswers((a) => ({ ...a, [myRole === 'host' ? 'guest' : 'host']: d.have })));

  const bothAnswered = answers.host !== undefined && answers.guest !== undefined;
  const nextAfterNever = (fromNet) => {
    if (!fromNet) send('tod:next', {});
    if (drinking) {
      setTally((t) => ({
        host: { ...t.host, drinks: t.host.drinks + (answers.host ? 1 : 0) },
        guest: { ...t.guest, drinks: t.guest.drinks + (answers.guest ? 1 : 0) },
      }));
    }
    setCard(null);
    setLast('');
    setTurn((x) => x + 1);
  };
  useRoomEvent('tod:next', () => nextAfterNever(true));

  return (
    <div className="tod">
      <div className="panel tod-settings">
        <div className="chips" role="radiogroup" aria-label="Card level">
          {LEVELS.map((l) => (
            <button key={l.id} role="radio" aria-checked={level === l.id} className={'chip' + (level === l.id ? ' on' : '')} onClick={() => changeSettings({ level: l.id })}>
              {l.icon} {l.label}
            </button>
          ))}
        </div>
        <label className="switch">
          <input type="checkbox" checked={drinking} onChange={(e) => changeSettings({ drinking: e.target.checked })} />
          <span>Drinking rules 🍻</span>
        </label>
      </div>

      <div className="tod-table">
        {!card ? (
          <div className="panel center-panel">
            {last && <p className="last-result">{last}</p>}
            <h2>{myTurn ? 'Your turn. Pick one:' : `${partner?.name}’s turn`}</h2>
            {myTurn ? (
              <div className="tod-picks">
                <button className="pick-card truth" onClick={() => draw('truth')}>
                  <span aria-hidden="true">🗣️</span>Truth
                </button>
                <button className="pick-card dare" onClick={() => draw('dare')}>
                  <span aria-hidden="true">⚡</span>Dare
                </button>
                <button className="pick-card never" onClick={() => draw('never')}>
                  <span aria-hidden="true">🙊</span>Never have I ever
                </button>
              </div>
            ) : (
              <p className="hint">Waiting for them to choose truth, dare or never have I ever…</p>
            )}
          </div>
        ) : (
          <div className={'big-card ' + card.kind}>
            <span className="card-kind">
              {KIND_LABEL[card.kind]}
              {card.kind !== 'never' && ` for ${turnRole === myRole ? 'you' : partner?.name}`}
            </span>
            <p className="card-text">{card.text}</p>

            {card.kind === 'never' ? (
              answers[myRole] === undefined ? (
                <div className="row">
                  <button className="btn primary" onClick={() => answerNever(true)}>
                    I have {drinking ? '🍺' : '🙋'}
                  </button>
                  <button className="btn" onClick={() => answerNever(false)}>
                    I never 😇
                  </button>
                </div>
              ) : !bothAnswered ? (
                <p className="hint">Waiting for {partner?.name} to answer…</p>
              ) : (
                <div className="reveal">
                  <p>
                    {me?.avatar} You: <strong>{answers[myRole] ? 'have' : 'never'}</strong>
                  </p>
                  <p>
                    {partner?.avatar} {partner?.name}: <strong>{answers[myRole === 'host' ? 'guest' : 'host'] ? 'have' : 'never'}</strong>
                  </p>
                  {drinking && (answers.host || answers.guest) && <p className="hint">Whoever has, drinks 🍻</p>}
                  <button className="btn primary" onClick={() => nextAfterNever(false)}>
                    Next card
                  </button>
                </div>
              )
            ) : turnRole === myRole ? (
              <div className="row">
                <button className="btn primary" onClick={() => resolve('done')}>
                  Did it ✅
                </button>
                <button className="btn" onClick={() => resolve('skip')}>
                  {drinking ? 'Drink instead 🍺' : 'Pass 🙈'}
                </button>
              </div>
            ) : (
              <p className="hint">Watch {partner?.name} do it, then they’ll tap done.</p>
            )}
          </div>
        )}
      </div>

      <div className="tally">
        {['host', 'guest'].map((r) => (
          <div key={r} className="tally-card">
            <strong>
              {r === myRole ? `${me?.avatar} You` : `${partner?.avatar} ${partner?.name}`}
            </strong>
            <span>{tally[r].done} done</span>
            <span>
              {tally[r].drinks} {drinking ? (tally[r].drinks === 1 ? 'drink' : 'drinks') : tally[r].drinks === 1 ? 'pass' : 'passes'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
