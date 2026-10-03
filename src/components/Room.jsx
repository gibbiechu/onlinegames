import { Suspense, useState } from 'react';
import { useRoom } from '../room/RoomContext.jsx';
import { GAMES } from '../games/registry.js';
import CallWidget from './CallWidget.jsx';
import Reactions from './Reactions.jsx';

export default function Room() {
  const room = useRoom();
  const { roomCode, status, partner, me, activity, chooseActivity, leave, notice, connected } = room;
  const [copied, setCopied] = useState(false);
  const game = GAMES.find((g) => g.id === activity);
  const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

  const copyLink = async () => {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ title: 'Join me on Closer', text: `Room code ${roomCode}`, url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  return (
    <div className={'room' + (activity === 'movie' ? ' theater' : '')}>
      <header className="topbar">
        <button className="brand small" onClick={() => connected && chooseActivity(null)} aria-label="Back to games">
          Closer
        </button>
        <div className="pair">
          <span className="who">
            {me?.avatar} {me?.name}
          </span>
          <span className="amp" aria-hidden="true">
            &
          </span>
          <span className={'who' + (partner ? '' : ' faded')}>
            {partner ? `${partner.avatar} ${partner.name}` : 'waiting…'}
          </span>
        </div>
        <div className="topbar-right">
          <button className="code-chip" onClick={copyLink} title="Copy invite link">
            {copied ? 'Link copied' : roomCode}
          </button>
          <button className="btn ghost" onClick={leave}>
            Leave
          </button>
        </div>
      </header>

      <main className="stage">
        {status === 'ended' ? (
          <div className="panel center-panel">
            <h2>The room closed</h2>
            <p>Your partner left or their connection dropped.</p>
            <button className="btn primary" onClick={leave}>
              Back to start
            </button>
          </div>
        ) : !connected ? (
          <div className="panel center-panel waiting">
            <div className="stamp big floaty" aria-hidden="true">
              <span>💌</span>
            </div>
            <h2>{status === 'connecting' ? 'Connecting…' : 'Send this code to your person'}</h2>
            <div className="big-code" aria-label={'Room code ' + roomCode.split('').join(' ')}>
              {roomCode.split('').map((c, i) => (
                <span key={i}>{c}</span>
              ))}
            </div>
            <button className="btn primary" onClick={copyLink}>
              {copied ? 'Link copied' : 'Copy invite link'}
            </button>
            <p className="hint">They open the link, write their name and tap Join. Games unlock once they’re in.</p>
          </div>
        ) : game ? (
          <section className="game-shell" aria-label={game.title}>
            <div className="game-head">
              <button className="btn ghost" onClick={() => chooseActivity(null)}>
                ← All games
              </button>
              <h2>
                <span aria-hidden="true">{game.emoji}</span> {game.title}
              </h2>
            </div>
            <Suspense fallback={<div className="panel center-panel">Loading…</div>}>
              <game.Component key={game.id} />
            </Suspense>
          </section>
        ) : (
          <section className="hub">
            <h2 className="hub-title">What do you two feel like?</h2>
            <p className="hub-sub">Whoever picks first brings the other along.</p>
            <div className="stamp-grid">
              {GAMES.map((g) => (
                <button key={g.id} className="game-stamp" onClick={() => chooseActivity(g.id)}>
                  {g.isNew && <span className="new-sticker">New</span>}
                  <span className="game-emoji" aria-hidden="true">
                    {g.emoji}
                  </span>
                  <span className="game-title">{g.title}</span>
                  <span className="game-blurb">{g.blurb}</span>
                  <span className="game-tag">{g.tag}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <CallWidget />
      {connected && <Reactions />}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
