import { lazy } from 'react';

// Add a new game: create the component, then add one entry here.
export const GAMES = [
  {
    id: 'puzzle',
    title: 'Photo puzzle',
    emoji: '🧩',
    blurb: 'Turn one of your photos into a puzzle. Solve it together or race to finish first.',
    tag: 'Co-op or race',
    Component: lazy(() => import('./Puzzle.jsx')),
  },
  {
    id: 'movie',
    title: 'Movie night',
    emoji: '🍿',
    blurb: 'One of you shares a tab or window and you watch together. The call floats on top.',
    tag: 'Watch together',
    Component: lazy(() => import('./MovieNight.jsx')),
  },
  {
    id: 'racing',
    title: 'Sweetheart Speedway',
    emoji: '🏎️',
    blurb: 'Pick a track, a car and a driver, then race each other for three laps.',
    tag: 'Race',
    Component: lazy(() => import('./racing/Racing.jsx')),
  },
  {
    id: 'tod',
    title: 'Truth or dare',
    emoji: '🍻',
    blurb: 'Sweet, spicy or wild cards, plus Never Have I Ever. Turn on drinking rules if you dare.',
    tag: 'Party',
    Component: lazy(() => import('./TruthOrDare.jsx')),
  },
  {
    id: 'draw',
    title: 'Draw & guess',
    emoji: '🎨',
    blurb: 'One draws, the other guesses before the timer runs out. Swap every round.',
    tag: 'Co-op',
    Component: lazy(() => import('./DrawGuess.jsx')),
  },
  {
    id: 'wyr',
    title: 'Would you rather',
    emoji: '🤔',
    blurb: 'Both answer in secret, then reveal. See how often you think alike.',
    tag: 'Chat',
    Component: lazy(() => import('./WouldYouRather.jsx')),
  },
  {
    id: 'c4',
    title: 'Connect four',
    emoji: '🔴',
    blurb: 'Drop discs, get four in a row. Quick rounds, best for settling arguments.',
    tag: 'Versus',
    Component: lazy(() => import('./ConnectFour.jsx')),
  },
];
