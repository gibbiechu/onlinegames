import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Peer } from 'peerjs';

/*
  How the room works
  ------------------
  - The host registers on the free PeerJS signalling server with id PREFIX + roomCode.
  - The guest connects to that id. After that everything is peer-to-peer (WebRTC):
      * one data connection  -> all game messages  { t: 'type', d: payload }
      * one media call       -> camera / mic        (metadata.kind = 'cam')
      * optional media call  -> screen share        (metadata.kind = 'screen')
  - Rooms are 2 people. A third person gets a "room is full" message.
*/

const PREFIX = 'closer-room-v1-';
const RoomCtx = createContext(null);

export const useRoom = () => useContext(RoomCtx);

/** Subscribe to one message type while the component is mounted. */
export function useRoomEvent(type, handler) {
  const { on } = useRoom();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => on(type, (d) => ref.current(d)), [on, type]);
}

export function makeRoomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

function iceServers() {
  const list = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];
  const url = import.meta.env.VITE_TURN_URL;
  if (url) {
    list.push({
      urls: url.split(',').map((u) => u.trim()),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    });
  }
  return list;
}

async function getMedia(callType) {
  if (callType === 'none' || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: callType === 'video' ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false,
    });
  } catch (e) {
    console.warn('getUserMedia failed', e);
    return null;
  }
}

const CALL_OPTS = { constraints: { offerToReceiveAudio: true, offerToReceiveVideo: true } };

export function RoomProvider({ children }) {
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const camCallRef = useRef(null);
  const screenCallRef = useRef(null);
  const localStreamRef = useRef(null);
  const localScreenRef = useRef(null);
  const listenersRef = useRef(new Map());
  const meRef = useRef(null);
  const isHostRef = useRef(false);
  const joinTimerRef = useRef(null);
  const noticeTimerRef = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | starting | waiting | connecting | connected | ended | error
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [me, setMe] = useState(null);
  const [partner, setPartner] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [localScreen, setLocalScreen] = useState(null);
  const [remoteScreen, setRemoteScreen] = useState(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [partnerMedia, setPartnerMedia] = useState({ mic: true, cam: true });
  const [activity, setActivity] = useState(null);

  // ---------- message bus ----------
  const dispatch = useCallback((type, data) => {
    const set = listenersRef.current.get(type);
    if (set) set.forEach((fn) => fn(data));
  }, []);

  const on = useCallback((type, fn) => {
    const map = listenersRef.current;
    if (!map.has(type)) map.set(type, new Set());
    map.get(type).add(fn);
    return () => map.get(type)?.delete(fn);
  }, []);

  const send = useCallback((t, d) => {
    const c = connRef.current;
    if (c && c.open) {
      try {
        c.send({ t, d });
      } catch (e) {
        console.warn('send failed', e);
      }
    }
  }, []);

  const flash = useCallback((msg) => {
    setNotice(msg);
    clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(''), 4500);
  }, []);

  // ---------- media calls ----------
  const attachCamCall = useCallback((call) => {
    camCallRef.current?.close?.();
    camCallRef.current = call;
    call.on('stream', (s) => setRemoteStream(s));
    call.on('close', () => {
      if (camCallRef.current === call) setRemoteStream(null);
    });
    call.on('error', (e) => console.warn('cam call error', e));
  }, []);

  const callPartner = useCallback(() => {
    const peer = peerRef.current;
    const conn = connRef.current;
    const stream = localStreamRef.current;
    if (!peer || !conn || !stream) return;
    const call = peer.call(conn.peer, stream, { ...CALL_OPTS, metadata: { kind: 'cam' } });
    if (call) attachCamCall(call);
  }, [attachCamCall]);

  const resetPartner = useCallback(() => {
    camCallRef.current?.close?.();
    camCallRef.current = null;
    screenCallRef.current?.close?.();
    screenCallRef.current = null;
    connRef.current = null;
    setPartner(null);
    setRemoteStream(null);
    setRemoteScreen(null);
    setPartnerMedia({ mic: true, cam: true });
    setActivity(null);
  }, []);

  // ---------- data connection ----------
  const attachConn = useCallback(
    (conn) => {
      connRef.current = conn;

      conn.on('open', () => {
        clearTimeout(joinTimerRef.current);
        setStatus('connected');
        setError('');
        conn.send({ t: 'sys:hello', d: { ...meRef.current, hasMedia: !!localStreamRef.current } });
        // Guest starts the call. If the guest has no camera/mic, the host calls instead (see sys:hello).
        if (!isHostRef.current && localStreamRef.current) callPartner();
      });

      conn.on('data', (msg) => {
        if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
        const { t, d } = msg;
        if (t === 'sys:hello') {
          setPartner({ name: d.name, avatar: d.avatar, callType: d.callType });
          if (isHostRef.current && !d.hasMedia && localStreamRef.current) callPartner();
        } else if (t === 'sys:media') {
          setPartnerMedia(d);
        } else if (t === 'sys:activity') {
          setActivity(d.id);
        } else if (t === 'sys:full') {
          setError('That room already has two people in it. Ask for a new code.');
          setStatus('error');
        } else if (t === 'sys:screen' && !d.on) {
          setRemoteScreen(null);
        }
        dispatch(t, d);
      });

      conn.on('close', () => {
        if (connRef.current !== conn) return;
        resetPartner();
        if (isHostRef.current) {
          setStatus('waiting');
          flash('Your partner left the room. The code still works if they want to rejoin.');
        } else {
          setStatus('ended');
        }
      });

      conn.on('error', (e) => console.warn('data conn error', e));
    },
    [callPartner, dispatch, flash, resetPartner]
  );

  // ---------- start / leave ----------
  const leave = useCallback(() => {
    clearTimeout(joinTimerRef.current);
    localScreenRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localScreenRef.current = null;
    localStreamRef.current = null;
    try {
      connRef.current?.close();
    } catch {}
    resetPartner();
    peerRef.current?.destroy();
    peerRef.current = null;
    setLocalStream(null);
    setLocalScreen(null);
    setStatus('idle');
    setRoomCode('');
    setError('');
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
  }, [resetPartner]);

  const start = useCallback(
    async ({ mode, code, name, avatar, callType }) => {
      setError('');
      setStatus('starting');
      const profile = { name: name.trim() || 'Someone', avatar, callType };
      meRef.current = profile;
      setMe(profile);
      const host = mode === 'host';
      isHostRef.current = host;
      setIsHost(host);

      const stream = await getMedia(callType);
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMic(true);
      setCam(callType === 'video');
      if (callType !== 'none' && !stream) {
        flash('Camera or microphone is blocked, so you joined without a call. Allow access in your browser settings and rejoin to call.');
      }

      const roomId = (code || makeRoomCode()).toUpperCase();
      const opts = { debug: 1, config: { iceServers: iceServers() } };
      const peer = host ? new Peer(PREFIX + roomId, opts) : new Peer(opts);
      peerRef.current = peer;

      peer.on('open', () => {
        setRoomCode(roomId);
        const url = new URL(window.location.href);
        url.searchParams.set('room', roomId);
        window.history.replaceState({}, '', url);
        if (host) {
          setStatus('waiting');
        } else {
          setStatus('connecting');
          const conn = peer.connect(PREFIX + roomId, { reliable: true });
          attachConn(conn);
          joinTimerRef.current = setTimeout(() => {
            if (!connRef.current?.open) {
              setError(
                "Couldn't reach your partner. Their network may block direct connections — try another Wi-Fi or mobile data, or add a TURN server (see README)."
              );
              setStatus('error');
            }
          }, 20000);
        }
      });

      peer.on('connection', (conn) => {
        if (!host) return;
        if (connRef.current && connRef.current.open) {
          conn.on('open', () => {
            conn.send({ t: 'sys:full', d: {} });
            setTimeout(() => conn.close(), 500);
          });
          return;
        }
        resetPartner();
        attachConn(conn);
      });

      peer.on('call', (call) => {
        const kind = call.metadata?.kind;
        if (kind === 'screen') {
          screenCallRef.current?.close?.();
          screenCallRef.current = call;
          call.answer();
          call.on('stream', (s) => setRemoteScreen(s));
          call.on('close', () => setRemoteScreen(null));
        } else {
          call.answer(localStreamRef.current || undefined);
          attachCamCall(call);
        }
      });

      peer.on('disconnected', () => {
        // Lost the signalling server; existing peer-to-peer links keep working.
        if (peerRef.current === peer && !peer.destroyed) {
          setTimeout(() => !peer.destroyed && peer.reconnect(), 1500);
        }
      });

      peer.on('error', (err) => {
        console.warn('peer error', err.type, err);
        const messages = {
          'unavailable-id': 'That room code is already in use. Create a room again to get a new code.',
          'peer-unavailable': "No room with that code. Check the code, or ask your partner to create the room first.",
          network: "Can't reach the connection server. Check your internet and try again.",
          'server-error': "Can't reach the connection server. Try again in a minute.",
          'socket-error': "Can't reach the connection server. Try again in a minute.",
          'browser-incompatible': 'This browser does not support video calls. Use Chrome, Safari, Edge or Firefox.',
        };
        if (messages[err.type]) {
          if (err.type === 'network' && connRef.current?.open) return; // already connected, ignore blips
          setError(messages[err.type]);
          setStatus('error');
        }
      });
    },
    [attachConn, attachCamCall, flash, resetPartner]
  );

  useEffect(() => () => peerRef.current?.destroy(), []);

  // ---------- controls ----------
  const toggleMic = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    setMic((m) => {
      const next = !m;
      s.getAudioTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  const toggleCam = useCallback(() => {
    const s = localStreamRef.current;
    if (!s || !s.getVideoTracks().length) return;
    setCam((c) => {
      const next = !c;
      s.getVideoTracks().forEach((t) => (t.enabled = next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (status === 'connected') send('sys:media', { mic, cam });
  }, [mic, cam, status, send]);

  const chooseActivity = useCallback(
    (id) => {
      setActivity(id);
      send('sys:activity', { id });
    },
    [send]
  );

  const stopScreenShare = useCallback(() => {
    localScreenRef.current?.getTracks().forEach((t) => t.stop());
    localScreenRef.current = null;
    setLocalScreen(null);
    screenCallRef.current?.close?.();
    screenCallRef.current = null;
    send('sys:screen', { on: false });
  }, [send]);

  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen sharing works on desktop Chrome, Edge, Firefox and Safari. Phones and tablets can watch but not share.');
    }
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } },
      audio: true,
    });
    localScreenRef.current = stream;
    setLocalScreen(stream);
    stream.getVideoTracks()[0]?.addEventListener('ended', stopScreenShare);
    const conn = connRef.current;
    if (peerRef.current && conn) {
      screenCallRef.current = peerRef.current.call(conn.peer, stream, { metadata: { kind: 'screen' } });
    }
    send('sys:screen', { on: true });
  }, [send, stopScreenShare]);

  const value = useMemo(
    () => ({
      status,
      error,
      notice,
      flash,
      roomCode,
      isHost,
      me,
      partner,
      connected: status === 'connected' && !!partner,
      localStream,
      remoteStream,
      localScreen,
      remoteScreen,
      mic,
      cam,
      partnerMedia,
      activity,
      start,
      leave,
      send,
      on,
      toggleMic,
      toggleCam,
      chooseActivity,
      startScreenShare,
      stopScreenShare,
    }),
    [status, error, notice, flash, roomCode, isHost, me, partner, localStream, remoteStream, localScreen, remoteScreen, mic, cam, partnerMedia, activity, start, leave, send, on, toggleMic, toggleCam, chooseActivity, startScreenShare, stopScreenShare]
  );

  return <RoomCtx.Provider value={value}>{children}</RoomCtx.Provider>;
}
