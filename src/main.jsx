import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { RoomProvider } from './room/RoomContext.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <RoomProvider>
    <App />
  </RoomProvider>
);
