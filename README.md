# Closer 💌

Video call someone far away, then play games together in the same room.
Built with Vite + React + PeerJS (WebRTC). No backend, no database, no API keys.

## Games
- 💣 **Hot potato bomb** – say something in the category, pass the bomb, secret fuse, forfeits
- 🤠 **Quickdraw duel** – wait for DRAW, fastest reaction wins (lag-proof timing)
- 📸 **Photo booth** – both cameras snap together on silly prompts, download a photo strip
- 🧠 **Mind meld** – type words at the same time until your brains match
- 📡 **Same wavelength** – one gives a clue, the other finds the secret spot on a dial
- ⏱️ **Inner clock** – count seconds in your head, closest wins
- 🧩 **Photo puzzle** – upload a photo, pick 9–100 pieces, solve together or race
- 🍿 **Movie night** – one person shares a tab, the other watches with the call floating on top
- 🏎️ **Sweetheart Speedway** – 4 tracks, 4 cars, 12 drivers, live multiplayer racing
- 🍻 **Truth or dare** – sweet / spicy / wild cards, Never Have I Ever, optional drinking rules
- 🎨 **Draw & guess** – one draws, the other guesses, swap every round
- 🤔 **Would you rather** – answer in secret, then reveal
- 🔴 **Connect four**

## Run locally
```bash
npm install
npm run dev
```
Open the link in two browser windows (or two devices on the same network) to test.
Camera/mic only work on `localhost` or HTTPS.

## Deploy to Vercel
1. Push this folder to a GitHub repo.
2. In Vercel: **Add New → Project →** import the repo.
3. Vercel detects Vite automatically (build: `npm run build`, output: `dist`). Click **Deploy**.

Or with the CLI: `npm i -g vercel && vercel`.

## How it works
- The person who creates a room registers on the free public PeerJS signalling server
  with an id made from the room code. The other person connects to that id.
- After that, everything is peer-to-peer: video/audio, screen share, and every game move
  travel directly between the two browsers. Nothing is recorded or stored on a server.
- Rooms hold 2 people.

Key files:
| File | What it does |
|---|---|
| `src/room/RoomContext.jsx` | Calls, screen share, messaging (`send(type, data)` / `useRoomEvent(type, fn)`) |
| `src/components/CallWidget.jsx` | Draggable / resizable / hideable call window |
| `src/games/registry.js` | List of games on the menu |
| `src/data/party.js` | Bomb categories, forfeits, photo booth prompts, wavelength spectrums |
| `src/data/decks.js` | All truth/dare cards, Would-you-rather questions, drawing words — edit freely |
| `src/games/racing/tracks.js` | Track shapes — add your own |

## Add a new game
1. Create `src/games/MyGame.jsx`.
2. Use `const { send, isHost, me, partner } = useRoom()` and `useRoomEvent('mygame:move', fn)` to sync.
3. Add an entry to `src/games/registry.js`. Done — it appears on the menu for both players.

## If calls don't connect
Most home Wi-Fi works with the built-in STUN servers. Some strict networks (certain mobile
carriers, campus or office Wi-Fi) block direct connections. Fix it by adding a TURN server:
copy `.env.example` to `.env` (or add the same variables in Vercel → Settings → Environment
Variables) and fill in credentials from a TURN provider such as Metered, Twilio or Cloudflare.

## Known limits
- Netflix, Disney+ and other DRM apps usually show a black screen when shared. YouTube,
  free sites and local video files opened in a browser tab work.
- Phones and tablets can watch a shared screen but can't share their own.
- The public PeerJS server is free and shared. For a bigger launch, self-host
  [peerjs-server](https://github.com/peers/peerjs-server) and point `new Peer(...)` at it.
