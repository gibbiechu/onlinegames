import { useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';

const ROWS = 6;
const COLS = 7;
const empty = () => Array(ROWS * COLS).fill(null);

function winner(b) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const p = b[r * COLS + c];
      if (!p) continue;
      for (const [dr, dc] of dirs) {
        const cells = [];
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr * COLS + cc] !== p) break;
          cells.push(rr * COLS + cc);
        }
        if (cells.length === 4) return { p, cells };
      }
    }
  return b.every(Boolean) ? { p: 'draw', cells: [] } : null;
}

export default function ConnectFour() {
  const { send, isHost, partner, me } = useRoom();
  const [board, setBoard] = useState(empty);
  const [game, setGame] = useState(0);
  const [turn, setTurn] = useState('host');
  const [score, setScore] = useState({ host: 0, guest: 0 });
  const [hover, setHover] = useState(null);

  const myRole = isHost ? 'host' : 'guest';
  const result = winner(board);
  const myTurn = !result && turn === myRole;

  const drop = (col, role) => {
    if (winner(board)) return;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!board[r * COLS + col]) {
        const n = board.slice();
        n[r * COLS + col] = role;
        setBoard(n);
        const w = winner(n);
        if (w && w.p !== 'draw') setScore((s) => ({ ...s, [w.p]: s[w.p] + 1 }));
        return;
      }
    }
  };

  const play = (col) => {
    if (!myTurn || board[col]) return;
    send('c4:move', { col });
    drop(col, myRole);
    setTurn(myRole === 'host' ? 'guest' : 'host');
  };
  useRoomEvent('c4:move', (d) => {
    const them = myRole === 'host' ? 'guest' : 'host';
    drop(d.col, them);
    setTurn(myRole);
  });

  const reset = (fromNet) => {
    if (!fromNet) send('c4:reset', {});
    const g = game + 1;
    setGame(g);
    setBoard(empty());
    setTurn(g % 2 === 0 ? 'host' : 'guest');
  };
  useRoomEvent('c4:reset', () => reset(true));

  const label = (role) => (role === myRole ? 'You' : partner?.name);
  let status;
  if (result?.p === 'draw') status = 'Board full. It’s a draw.';
  else if (result) status = result.p === myRole ? 'Four in a row. You win! 🏆' : `${partner?.name} wins this one.`;
  else status = myTurn ? 'Your move' : `${partner?.name} is thinking…`;

  return (
    <div className="c4">
      <div className="c4-score">
        <span className="disc-label host">
          {myRole === 'host' ? me?.avatar : partner?.avatar} {label('host')} <strong>{score.host}</strong>
        </span>
        <span className="disc-label guest">
          {myRole === 'guest' ? me?.avatar : partner?.avatar} {label('guest')} <strong>{score.guest}</strong>
        </span>
      </div>
      <p className="c4-status" aria-live="polite">
        {status}
      </p>
      <div className="c4-board" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: COLS }, (_, c) => (
          <button
            key={c}
            className={'c4-col' + (myTurn && hover === c ? ' hover' : '')}
            onClick={() => play(c)}
            onMouseEnter={() => setHover(c)}
            disabled={!myTurn || !!board[c]}
            aria-label={`Drop in column ${c + 1}`}
          >
            {Array.from({ length: ROWS }, (_, r) => {
              const i = r * COLS + c;
              const p = board[i];
              return <span key={r} className={'cell' + (p ? ' ' + p : '') + (result?.cells.includes(i) ? ' win' : '')} />;
            })}
          </button>
        ))}
      </div>
      {result && (
        <button className="btn primary" onClick={() => reset(false)}>
          Play again
        </button>
      )}
    </div>
  );
}
