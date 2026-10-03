import { useState } from 'react';
import { useRoom } from '../room/RoomContext.jsx';

export const AVATARS = ['🐻', '🐰', '🦊', '🐱', '🐶', '🐼', '🐸', '🐧', '🦄', '🐥', '🐨', '🐯', '🌻', '🍓', '🌙', '👽'];

const CALL_TYPES = [
  { id: 'video', label: 'Video call', icon: '📹' },
  { id: 'audio', label: 'Voice only', icon: '🎙️' },
  { id: 'none', label: 'Just games', icon: '🎲' },
];

const load = (k, d) => {
  try {
    return localStorage.getItem(k) || d;
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

export default function Lobby() {
  const { start, status, error } = useRoom();
  const linkCode = new URLSearchParams(window.location.search).get('room') || '';
  const [name, setName] = useState(() => load('closer:name', ''));
  const [avatar, setAvatar] = useState(() => load('closer:avatar', AVATARS[Math.floor(Math.random() * AVATARS.length)]));
  const [callType, setCallType] = useState(() => load('closer:call', 'video'));
  const [code, setCode] = useState(linkCode.toUpperCase());
  const busy = status === 'starting';

  const go = (mode) => {
    if (!name.trim()) {
      document.getElementById('from-name')?.focus();
      return;
    }
    save('closer:name', name.trim());
    save('closer:avatar', avatar);
    save('closer:call', callType);
    start({ mode, code: mode === 'join' ? code : '', name, avatar, callType });
  };

  return (
    <main className="lobby">
      <div className="postcard" role="form" aria-label="Start a room">
        <section className="postcard-left">
          <h1 className="brand">Closer</h1>
          <p className="lede">
            Video call someone far away, then play games together in the same room — puzzles from your photos, racing,
            truth or dare, movie nights and more.
          </p>
          <p className="handnote">No sign-up. One of you creates a room, the other joins with the code.</p>
        </section>

        <section className="postcard-right">
          <div className="stamp-row">
            <div className="stamp big" aria-hidden="true">
              <span>{avatar}</span>
            </div>
            <div className="postmarks" role="radiogroup" aria-label="How do you want to call?">
              {CALL_TYPES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={callType === c.id}
                  className={'postmark' + (callType === c.id ? ' on' : '')}
                  onClick={() => setCallType(c.id)}
                >
                  <span aria-hidden="true">{c.icon}</span> {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="avatar-pick" role="radiogroup" aria-label="Pick your stamp">
            {AVATARS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={avatar === a}
                aria-label={'Avatar ' + a}
                className={'mini-stamp' + (avatar === a ? ' on' : '')}
                onClick={() => setAvatar(a)}
              >
                {a}
              </button>
            ))}
          </div>

          <label className="address-line">
            <span>From</span>
            <input
              id="from-name"
              value={name}
              maxLength={20}
              placeholder="your name"
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
            />
          </label>

          <div className="lobby-actions">
            <button className="btn primary" disabled={busy} onClick={() => go('host')}>
              {busy ? 'Opening…' : 'Create a room'}
            </button>
            <div className="join-row">
              <input
                className="code-input"
                value={code}
                maxLength={6}
                placeholder="CODE"
                aria-label="Room code"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && go('join')}
              />
              <button className="btn" disabled={busy || code.length !== 6} onClick={() => go('join')}>
                Join room
              </button>
            </div>
          </div>

          {!name.trim() && <p className="hint">Write your name on the “From” line first.</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
      <p className="footnote">Works best in Chrome, Edge or Safari. Calls are peer-to-peer — nothing is recorded.</p>
    </main>
  );
}
