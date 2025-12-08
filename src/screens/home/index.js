import React from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'; // Quitamos BrowserRouter
import Library from '../library';
import Feed from '../feed/feed';
import Player from '../player/player';
import Favorites from '../favorites/favorites';
import Sidebar from '../../components/sidebar';
import ArtistDetail from '../artist/artistDetail';
import AlbumDetail from '../album/albumDetail';
import Radio from '../radio/radio';
import MiniPlayer from '../../components/miniPlayer/miniPlayer';
import RightSidebar from '../../components/widgets/widgets';
import { PlayerProvider } from '../../context/playerContext';
import Search from '../search/search';
import Profile from '../profile';
import Playlist from '../playlist/playlist';
import { FaUserCircle } from 'react-icons/fa';
import { AuthService } from '../../services/authService'; // Para logout
import { useUser } from '../../context/userContext'; // Para datos del usuario
import './home.css';
import GenreDetail from '../genre/genreDetail';

function HomeContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser(); // Usamos el contexto para obtener datos del usuario

  // Determinamos en qué página estamos para optimizar la UI
  const isPlayerPage = location.pathname === '/player';
  const isProfilePage = location.pathname === '/profile';

  // Manejo de Sign Out usando Firebase
  const handleSignOut = async () => {
    await AuthService.logout();
    navigate('/login');
  };

  // Avatar del usuario (si Firebase tiene fotoURL o usar un placeholder)
  const userAvatar = user?.photoURL || null;

  return (
    <div className="home-container">
      {/* Background Video Layer */}
      <div className="video-background">
        <div className="overlay"></div>
      </div>

      {/* Glass Navbar */}
      <nav className="glass-navbar">
        <div className="nav-logo" onClick={() => navigate('/feed')} style={{ cursor: 'pointer' }}>
          <span className="nav-logo-icon"></span>
          PARADISQUO
        </div>

        <div
          className="nav-profile"
          onClick={() => navigate('/profile')}
          title="Mi Perfil"
          style={{
            border: isProfilePage ? '2px solid var(--accent-glow)' : '1px solid var(--glass-border)',
            boxShadow: isProfilePage ? '0 0 15px var(--accent-glow)' : 'none'
          }}
        >
          {userAvatar ? (
            <img
              src={userAvatar}
              alt="Profile"
              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <FaUserCircle color="white" size={24} />
          )}
        </div>
      </nav>

      {/* Content Wrapper (Sidebar + Main Content) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative', zIndex: 10 }}>
        <Sidebar onSignOut={handleSignOut} />

        <div className="main-content">
          <Routes>
            {/* Rutas Internas de la App */}
            <Route path="/" element={<Feed />} />
            <Route path="/feed" element={<Feed />} />
            <Route path="/genre/:genreName" element={<GenreDetail />} />
            <Route path="/search" element={<Search />} />
            <Route path="/radio" element={<Radio />} />
            <Route path="/player" element={<Player />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/library" element={<Library />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/playlist/:playlistId" element={<Playlist />} />
            <Route path="/artist/:name" element={<ArtistDetail />} />
            <Route path="/album/:artist/:name" element={<AlbumDetail />} />

            {/* Ruta por defecto dentro de Home */}
            <Route path="*" element={<Feed />} />
          </Routes>
        </div>

        {/* Right Sidebar (Widgets) */}
        {!isPlayerPage && !isProfilePage && <RightSidebar />}
      </div>

      {/* MiniPlayer */}
      {!isPlayerPage && !isProfilePage && <MiniPlayer />}
    </div>
  );
}

// Home solo provee el PlayerContext, ya NO el Router
export default function Home() {
  return (
    <PlayerProvider>
      <HomeContent />
    </PlayerProvider>
  );
}