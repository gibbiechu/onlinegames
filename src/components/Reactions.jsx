import { useCallback, useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';

const EMOJI = ['❤️', '😂', '😘', '😮', '🔥', '🥺'];
let nextId = 1;

export default function Reactions() {
  const { send } = useRoom();
  const [bursts, setBursts] = useState([]);
  const [open, setOpen] = useState(false);

  const pop = useCallback((emoji, mine) => {
    const id = nextId++;
    const left = (mine ? 8 : 55) + Math.random() * 35;
    setBursts((b) => [...b.slice(-20), { id, emoji, left }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 2600);
  }, []);

  useRoomEvent('sys:react', (d) => pop(d.e, false));

  const react = (e) => {
    pop(e, true);
    send('sys:react', { e });
  };

  return (
    <>
      <div className="reaction-layer" aria-hidden="true">
        {bursts.map((b) => (
          <span key={b.id} className="burst" style={{ left: b.left + '%' }}>
            {b.emoji}
          </span>
        ))}
      </div>
      <div className={'reaction-bar' + (open ? ' open' : '')}>
        <button className="round" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Send a reaction">
          {open ? '×' : '💗'}
        </button>
        {open &&
          EMOJI.map((e) => (
            <button key={e} className="round" onClick={() => react(e)} aria-label={'Send ' + e}>
              {e}
            </button>
          ))}
      </div>
    </>
  );
}
