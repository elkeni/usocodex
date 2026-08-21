import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Home from './screens/home/index.js';
import Login from './screens/auth/login.js';
import Register from './screens/auth/register.js';
import Callback from './screens/auth/callback.js';
import Onboarding from './screens/auth/onboarding.js';
import { ProtectedRoute } from './screens/auth/ProtectedRoute';
import { PlayerProvider } from './context/playerContext';
import Player from './components/player/Player';
import { useAppShutdown } from './services/screenStateCache';
import './screens/home/home.css';

// =============================================================================
// APP LAYOUT WRAPPER
// Componente interno que maneja la lógica de mostrar/ocultar el MiniPlayer
// =============================================================================
function AppLayout() {
  const location = useLocation();

  // ⭐ Asegurar que el caché se guarde antes de cerrar la app
  useAppShutdown();

  // Páginas donde NO queremos mostrar el MiniPlayer
  const isPlayerPage = location.pathname === '/player';
  const isProfilePage = location.pathname === '/profile';
  const isAuthPage = ['/login', '/register', '/callback', '/onboarding'].includes(location.pathname);

  // Solo mostramos el MiniPlayer cuando NO estamos en auth, player o profile
  const showMiniPlayer = !isAuthPage && !isPlayerPage && !isProfilePage;

  return (
    <>
      {/* RUTAS DE LA APLICACIÓN */}
      <Routes>
        {/* === RUTAS PÚBLICAS === */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/callback" element={<Callback />} />

        {/* === ONBOARDING (Semi-protegido - requiere auth pero no onboarding) === */}
        <Route path="/onboarding" element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        } />

        {/* === RUTAS PRIVADAS === */}
        <Route path="/*" element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        } />
      </Routes>

      {/* ================================================================== */}
      {/* MINIPLAYER GLOBAL - Fuera del flujo de páginas                    */}
      {/* Se posiciona respecto al viewport, no al contenedor de las rutas  */}
      {/* ================================================================== */}
      {showMiniPlayer && <Player />}
    </>
  );
}

// =============================================================================
// APP COMPONENT
// PlayerProvider envuelve toda la aplicación para estado global del reproductor
// =============================================================================
export default function App() {
  return (
    <PlayerProvider>
      <Router>
        <AppLayout />
      </Router>
    </PlayerProvider>
  );
}