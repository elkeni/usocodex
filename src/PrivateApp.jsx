import { useLocation } from 'react-router-dom';
import Home from './screens/home/index.jsx';
import { PlayerProvider } from './context/playerContext';
import Player from './components/player/Player';
import { useAppShutdown } from './services/screenStateCache';
import './screens/home/home.css';

function PrivateContent() {
  const location = useLocation();

  useAppShutdown();

  const hideMiniPlayer = location.pathname === '/player' || location.pathname === '/profile';

  return (
    <>
      <Home />
      {!hideMiniPlayer && <Player />}
    </>
  );
}

export default function PrivateApp() {
  return (
    <PlayerProvider>
      <PrivateContent />
    </PlayerProvider>
  );
}
