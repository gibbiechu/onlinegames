import { useRoom } from './room/RoomContext.jsx';
import Lobby from './components/Lobby.jsx';
import Room from './components/Room.jsx';

export default function App() {
  const { status } = useRoom();
  const inRoom = ['waiting', 'connecting', 'connected', 'ended'].includes(status);
  return inRoom ? <Room /> : <Lobby />;
}
