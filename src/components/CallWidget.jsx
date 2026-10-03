import { useEffect, useRef, useState } from 'react';
import { useRoom } from '../room/RoomContext.jsx';

export function StreamVideo({ stream, muted = true, mirror = false, className = '', onPlayBlocked }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream || null;
    if (stream) v.play?.().catch(() => onPlayBlocked?.());
  }, [stream, onPlayBlocked]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className + (mirror ? ' mirror' : '')} />;
}

function RemoteAudio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.srcObject = stream || null;
    if (stream) a.play().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function CallWidget() {
  const { localStream, remoteStream, partner, me, mic, cam, toggleMic, toggleCam, partnerMedia } = useRoom();
  const [mode, setMode] = useState('open'); // open | mini | hidden
  const [width, setWidth] = useState(() => (window.innerWidth < 640 ? 140 : 280));
  const [pos, setPos] = useState(null);
  const drag = useRef(null);
  const boxRef = useRef(null);

  const remoteHasVideo = !!remoteStream?.getVideoTracks().length && partnerMedia.cam !== false;
  const localHasVideo = !!localStream?.getVideoTracks().length && cam;

  const hasCall = !!(localStream || remoteStream);

  // Start bottom-right (mid-right on phones) and keep the widget inside the viewport,
  // including when the video loads and the widget grows.
  useEffect(() => {
    if (!hasCall || mode === 'hidden') return;
    const fit = () => {
      const el = boxRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const phone = window.innerWidth < 640;
      setPos((p) => {
        const base = p || { x: window.innerWidth - w - 12, y: phone ? window.innerHeight * 0.36 : window.innerHeight - h - 16 };
        const next = {
          x: clamp(base.x, 8, Math.max(8, window.innerWidth - w - 8)),
          y: clamp(base.y, 8, Math.max(8, window.innerHeight - h - 8)),
        };
        return p && p.x === next.x && p.y === next.y ? p : next;
      });
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (boxRef.current) ro.observe(boxRef.current);
    window.addEventListener('resize', fit);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [hasCall, mode]);

  if (!localStream && !remoteStream) return <RemoteAudio stream={null} />;

  const onDown = (e) => {
    if (e.target.closest('button')) return;
    const kind = e.target.closest('.resize-handle') ? 'resize' : 'move';
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind, sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y, w: width, moved: false };
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.kind === 'move') {
      const el = boxRef.current;
      setPos({
        x: clamp(d.x + dx, 8, window.innerWidth - el.offsetWidth - 8),
        y: clamp(d.y + dy, 8, window.innerHeight - el.offsetHeight - 8),
      });
    } else {
      setWidth(clamp(d.w + dx, 150, Math.min(720, window.innerWidth - 24)));
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && mode === 'mini') setMode('open');
  };

  const partnerFace = (
    <div className="face-fallback">
      <span>{partner?.avatar || '…'}</span>
      {partner && !partnerMedia.mic && <small>muted</small>}
    </div>
  );

  return (
    <>
      <RemoteAudio stream={remoteStream} />

      {mode === 'hidden' ? (
        <button className="call-pill" onClick={() => setMode('open')}>
          <span aria-hidden="true">📞</span> Show call
        </button>
      ) : (
        <div
          ref={boxRef}
          className={'call-widget ' + mode}
          style={pos ? { left: pos.x, top: pos.y, width: mode === 'open' ? width : undefined } : { visibility: 'hidden', left: 0, top: 0, width }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          aria-label="Video call"
        >
          <div className="call-screen">
            {remoteStream && remoteHasVideo ? <StreamVideo stream={remoteStream} className="remote-video" /> : partnerFace}
            {mode === 'open' && localStream && (
              <div className="self-view">
                {localHasVideo ? (
                  <StreamVideo stream={localStream} mirror className="local-video" />
                ) : (
                  <div className="face-fallback small">
                    <span>{me?.avatar}</span>
                  </div>
                )}
              </div>
            )}
            {mode === 'open' && partner && <span className="call-name">{partner.name}</span>}
          </div>

          {mode === 'open' && (
            <div className="call-controls">
              {localStream && (
                <button className={'round' + (mic ? '' : ' off')} onClick={toggleMic} aria-label={mic ? 'Mute microphone' : 'Unmute microphone'}>
                  {mic ? '🎙️' : '🔇'}
                </button>
              )}
              {localStream?.getVideoTracks().length > 0 && (
                <button className={'round' + (cam ? '' : ' off')} onClick={toggleCam} aria-label={cam ? 'Turn camera off' : 'Turn camera on'}>
                  {cam ? '📷' : '🚫'}
                </button>
              )}
              <button className="round" onClick={() => setMode('mini')} aria-label="Shrink call">
                ▾
              </button>
              <button className="round" onClick={() => setMode('hidden')} aria-label="Hide call (audio keeps playing)">
                ✕
              </button>
              <span className="resize-handle" aria-hidden="true" title="Drag to resize" />
            </div>
          )}
        </div>
      )}
    </>
  );
}
