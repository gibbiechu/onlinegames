import { useEffect, useRef, useState } from 'react';
import { useRoom, useRoomEvent } from '../room/RoomContext.jsx';
import { BOOTH_PROMPTS } from '../data/party.js';
import { sfx } from './sfx.js';

const SHOTS = 4;
const STEP = 6500; // ms per shot: read prompt, then 3-2-1
const W = 360;
const H = 270;

function loadImg(src) {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

export default function PhotoBooth() {
  const { send, localStream, isHost, me, partner } = useRoom();
  const [phase, setPhase] = useState('lobby'); // lobby | shoot | done
  const [prompts, setPrompts] = useState([]);
  const [step, setStep] = useState({ i: 0, count: null });
  const [flash, setFlash] = useState(false);
  const [mine, setMine] = useState([]);
  const [theirs, setTheirs] = useState([]);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef(null);
  const sessionRef = useRef(0);
  const timers = useRef([]);
  const hasCam = !!localStream?.getVideoTracks().length;

  useEffect(() => {
    const v = videoRef.current;
    if (v && localStream) {
      v.srcObject = localStream;
      v.play().catch(() => {});
    }
  }, [localStream, phase]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const capture = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    const v = videoRef.current;
    if (v && v.videoWidth) {
      const scale = Math.max(W / v.videoWidth, H / v.videoHeight);
      const dw = v.videoWidth * scale;
      const dh = v.videoHeight * scale;
      x.translate(W, 0);
      x.scale(-1, 1);
      x.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
    } else {
      x.fillStyle = '#30377a';
      x.fillRect(0, 0, W, H);
      x.font = '140px serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(me?.avatar || '🙂', W / 2, H / 2);
    }
    return c.toDataURL('image/jpeg', 0.75);
  };

  const run = (d) => {
    sfx.unlock();
    timers.current.forEach(clearTimeout);
    timers.current = [];
    sessionRef.current = d.id;
    setPrompts(d.prompts.map((i) => BOOTH_PROMPTS[i]));
    setMine([]);
    setTheirs([]);
    setPhase('shoot');
    for (let i = 0; i < SHOTS; i++) {
      const base = i * STEP;
      timers.current.push(setTimeout(() => setStep({ i, count: null }), base));
      [3, 2, 1].forEach((n, k) =>
        timers.current.push(
          setTimeout(() => {
            setStep({ i, count: n });
            sfx.beep();
          }, base + 2800 + k * 1000)
        )
      );
      timers.current.push(
        setTimeout(() => {
          const img = capture();
          sfx.shutter();
          setFlash(true);
          setTimeout(() => setFlash(false), 180);
          setMine((m) => {
            const n = m.slice();
            n[i] = img;
            return n;
          });
          send('booth:shot', { id: d.id, i, img });
        }, base + 5800)
      );
    }
    timers.current.push(setTimeout(() => setPhase('done'), SHOTS * STEP));
  };

  const start = () => {
    const pool = BOOTH_PROMPTS.map((_, i) => i).sort(() => Math.random() - 0.5);
    const d = { id: Date.now(), prompts: pool.slice(0, SHOTS) };
    send('booth:start', d);
    run(d);
  };

  useRoomEvent('booth:start', run);
  useRoomEvent('booth:shot', (d) => {
    if (d.id !== sessionRef.current) return;
    setTheirs((t) => {
      const n = t.slice();
      n[d.i] = d.img;
      return n;
    });
  });

  // host's photo on the left in both people's strips
  const left = isHost ? mine : theirs;
  const right = isHost ? theirs : mine;
  const leftName = isHost ? me?.name : partner?.name;
  const rightName = isHost ? partner?.name : me?.name;
  const complete = mine.filter(Boolean).length === SHOTS && theirs.filter(Boolean).length === SHOTS;

  const download = async () => {
    setBusy(true);
    const pad = 24;
    const cw = W * 2 + pad * 3 + 24;
    const rowH = H + 54;
    const ch = 120 + SHOTS * rowH + 70;
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const x = c.getContext('2d');
    // airmail border
    for (let k = -ch; k < cw + ch; k += 44) {
      [['#e8434c', 0, 14], ['#fbf3e4', 14, 22], ['#3e6be0', 22, 36], ['#fbf3e4', 36, 44]].forEach(([col, a, b]) => {
        x.fillStyle = col;
        x.beginPath();
        x.moveTo(k + a, 0);
        x.lineTo(k + b, 0);
        x.lineTo(k + b - ch, ch);
        x.lineTo(k + a - ch, ch);
        x.fill();
      });
    }
    x.fillStyle = '#fbf3e4';
    x.fillRect(12, 12, cw - 24, ch - 24);
    x.fillStyle = '#1d2140';
    x.textAlign = 'center';
    x.font = '800 44px "Bricolage Grotesque", sans-serif';
    x.fillText('Closer', cw / 2, 70);
    x.font = '600 20px "Bricolage Grotesque", sans-serif';
    x.fillText(`${leftName} & ${rightName}`, cw / 2, 100);
    for (let i = 0; i < SHOTS; i++) {
      const y = 120 + i * rowH;
      const [a, b] = await Promise.all([loadImg(left[i]), loadImg(right[i])]);
      if (a) x.drawImage(a, pad + 12, y, W, H);
      if (b) x.drawImage(b, pad * 2 + 12 + W, y, W, H);
      x.fillStyle = '#4b4a5e';
      x.font = '600 18px "Bricolage Grotesque", sans-serif';
      x.fillText(prompts[i] || '', cw / 2, y + H + 30);
    }
    x.font = '700 30px Caveat, cursive';
    x.fillStyle = '#3e6be0';
    x.fillText(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), cw / 2, ch - 34);
    const a = document.createElement('a');
    a.download = 'closer-photo-strip.png';
    a.href = c.toDataURL('image/png');
    a.click();
    setBusy(false);
  };

  return (
    <div className="booth">
      {phase === 'lobby' && (
        <div className="panel center-panel">
          <span className="booth-icon" aria-hidden="true">
            📸
          </span>
          <h2>Long-distance photo booth</h2>
          <p>
            4 shots, 4 silly prompts. You both pose at the same time and get a photo strip of the two of you side by side to
            keep.
          </p>
          {!hasCam && <p className="hint">Your camera is off, so your shots will show your avatar instead.</p>}
          <button className="btn primary" onClick={start}>
            Start the booth
          </button>
        </div>
      )}

      {phase === 'shoot' && (
        <div className="booth-live">
          <div className="booth-prompt">
            <span>
              Shot {step.i + 1} of {SHOTS}
            </span>
            <h2>{prompts[step.i]}</h2>
          </div>
          <div className="booth-mirror">
            {hasCam ? <video ref={videoRef} muted playsInline autoPlay className="mirror" /> : <div className="booth-avatar">{me?.avatar}</div>}
            {step.count && <span className="booth-count">{step.count}</span>}
            {flash && <span className="booth-flash" />}
          </div>
          <p className="hint">Pose together — {partner?.name} is snapping at the same moment.</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="booth-done">
          <div className="strip">
            {Array.from({ length: SHOTS }, (_, i) => (
              <figure key={i} className="strip-row">
                <div className="strip-pics">
                  {[left[i], right[i]].map((src, k) =>
                    src ? <img key={k} src={src} alt={`${k ? rightName : leftName}: ${prompts[i]}`} /> : <div key={k} className="developing">developing…</div>
                  )}
                </div>
                <figcaption>{prompts[i]}</figcaption>
              </figure>
            ))}
          </div>
          <div className="row center-row">
            <button className="btn primary" onClick={download} disabled={!complete || busy}>
              {complete ? 'Download strip' : 'Waiting for their photos…'}
            </button>
            <button className="btn" onClick={start}>
              New strip
            </button>
          </div>
        </div>
      )}
      {/* keeps a camera feed alive for capturing even when the preview isn't shown */}
      {phase !== 'shoot' && hasCam && <video ref={videoRef} muted playsInline autoPlay className="sr-video" />}
    </div>
  );
}
