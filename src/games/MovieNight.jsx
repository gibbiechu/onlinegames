import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoom } from '../room/RoomContext.jsx';
import { StreamVideo } from '../components/CallWidget.jsx';

export default function MovieNight() {
  const { localScreen, remoteScreen, startScreenShare, stopScreenShare, partner } = useRoom();
  const [err, setErr] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [isFull, setIsFull] = useState(!!document.fullscreenElement);
  const playerRef = useRef(null);

  useEffect(() => {
    const f = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  const share = async () => {
    setErr('');
    try {
      await startScreenShare();
    } catch (e) {
      if (e?.name !== 'NotAllowedError') setErr(e.message || 'Screen sharing did not start.');
    }
  };

  const toggleFull = () => {
    // Fullscreen the whole app so the floating call stays visible on top of the movie.
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const onBlocked = useCallback(() => setBlocked(true), []);
  const unblock = () => {
    playerRef.current?.querySelector('video')?.play().then(() => setBlocked(false));
  };

  if (remoteScreen) {
    return (
      <div className="movie-stage" ref={playerRef}>
        <StreamVideo stream={remoteScreen} muted={false} className="movie-video" onPlayBlocked={onBlocked} />
        {blocked && (
          <button className="btn primary play-over" onClick={unblock}>
            ▶ Tap to start watching
          </button>
        )}
        <div className="movie-bar">
          <span>{partner?.name} is sharing</span>
          <button className="btn ghost small" onClick={toggleFull}>
            {isFull ? 'Exit full screen' : 'Full screen'}
          </button>
        </div>
      </div>
    );
  }

  if (localScreen) {
    return (
      <div className="movie-stage">
        <StreamVideo stream={localScreen} className="movie-video dim" />
        <div className="movie-bar">
          <span>You’re sharing. {partner?.name} sees this.</span>
          <button className="btn ghost small" onClick={toggleFull}>
            {isFull ? 'Exit full screen' : 'Full screen'}
          </button>
          <button className="btn primary small" onClick={stopScreenShare}>
            Stop sharing
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel movie-intro">
      <div className="ticket">
        <span className="ticket-emoji" aria-hidden="true">
          🎟️
        </span>
        <div>
          <h3>Admit two</h3>
          <p>One of you shares a browser tab with the movie playing. The other watches here, with the call floating on top.</p>
        </div>
      </div>
      <button className="btn primary wide" onClick={share}>
        Share my screen
      </button>
      {err && <p className="error">{err}</p>}
      <ul className="tips">
        <li>Pick a <strong>Chrome tab</strong> and switch on “Share tab audio” so they can hear it.</li>
        <li>Netflix, Disney+ and other paid apps often show a black screen when shared. YouTube, free sites and video files opened in a tab work well.</li>
        <li>Share a different tab than this one, or you’ll get an endless mirror.</li>
        <li>Phones can watch but most can’t share their screen.</li>
        <li>Shrink or hide the call with the buttons on the call window. Use the 💗 button to send reactions.</li>
      </ul>
    </div>
  );
}
