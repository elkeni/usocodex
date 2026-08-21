import React from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import Library from '../library';
import Feed from '../feed/feed';
import Sidebar from '../../components/sidebar';
import ArtistDetail from '../artist/artistDetail';
import AlbumDetail from '../album/albumDetail';

import Search from '../search/search';
import Profile from '../profile';
import Playlist from '../playlist/playlist';
import { FaUserCircle } from 'react-icons/fa';
import { AuthService } from '../../services/authService';
import { useUser } from '../../context/userContext';
import './home.css';
import Import from '../import/import';
import DebugPlayground from '../debug/debugPlayground';
import AnimatedPage from '../../components/shared/AnimatedPage';

// =============================================================================
// HOME COMPONENT
// Ahora es solo el layout principal (navbar + sidebar + contenido)
// El PlayerProvider y MiniPlayer están a nivel global en App.js
// =============================================================================
export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();

  const isProfilePage = location.pathname === '/profile';

  const handleSignOut = async () => {
    await AuthService.logout();
    navigate('/login');
  };

  const userAvatar = user?.photoURL || null;

  return (
    <div className="home-container">


      {/* Glass Navbar */}
      <nav className="glass-navbar">
        <div className="nav-logo" onClick={() => navigate('/feed')} style={{ cursor: 'pointer' }}>
          <span className="nav-logo-icon"></span>
          PARADISQUO
        </div>

        <div
          className={`nav-profile ${isProfilePage ? 'active' : ''}`}
          onClick={() => navigate('/profile')}
          title="Mi Perfil"
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
          {/* ============================================================= */}
          {/* TAB NAVIGATION - KEEP ALIVE (HOVER BEHAVIOR)                 */}
          {/* Screens stay mounted but hidden to preserve state & scroll    */}
          {/* ============================================================= */}

          {/* ============================================================= */}
          {/* TAB NAVIGATION - ANIMATED LAYOUT                             */}
          {/* ============================================================= */}

          {/* FEED TAB */}
          <AnimatedPage isActive={location.pathname === '/' || location.pathname === '/feed'}>
            <Feed />
          </AnimatedPage>

          {/* SEARCH TAB */}
          <AnimatedPage isActive={location.pathname === '/search'}>
            <Search />
          </AnimatedPage>

          {/* LIBRARY TAB */}
          <AnimatedPage isActive={location.pathname === '/library' || location.pathname === '/favorites'}>
            <Library />
          </AnimatedPage>

          {/* DETAIL VIEWS & OTHER ROUTES */}
          <AnimatedPage
            isActive={!['/', '/feed', '/search', '/library', '/favorites'].includes(location.pathname)}
            className="detail-view-container"
          >
            {/* Animación interna para cambios de ruta dentro de este contenedor (ej: Playlist -> Artist) */}
            {/* Nota: Usamos AnimatePresence mode="wait" para transiciones limpias entre detalles */}
            <Routes location={location}>
              {/* Dummy routes for tabs to preventing matching errors if any */}
              <Route path="/" element={null} />
              <Route path="/feed" element={null} />
              <Route path="/search" element={null} />
              <Route path="/library" element={null} />
              <Route path="/favorites" element={null} />

              {/* Full views */}
              <Route path="/profile" element={<Profile />} />
              <Route path="/playlist/:playlistId" element={<Playlist />} />
              <Route path="/artist/:name" element={<ArtistDetail />} />
              <Route path="/album/:artist/:name" element={<AlbumDetail />} />
              <Route path="/import/*" element={<Import />} />
              <Route path="/debug" element={<DebugPlayground />} />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/feed" replace />} />
            </Routes>
          </AnimatedPage>
        </div>
      </div>

      {/* ============================================================= */}
      {/* NOTA: MiniPlayer ahora está en App.js como componente global */}
      {/* Esto evita problemas de z-index y posicionamiento heredados  */}
      {/* ============================================================= */}
    </div>
  );
}
