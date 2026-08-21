import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './screens/auth/ProtectedRoute';

const Login = lazy(() => import('./screens/auth/login.jsx'));
const Register = lazy(() => import('./screens/auth/register.jsx'));
const Onboarding = lazy(() => import('./screens/auth/onboarding.jsx'));
const PrivateApp = lazy(() => import('./PrivateApp.jsx'));

// =============================================================================
// APP LAYOUT WRAPPER
// Componente interno que maneja la lógica de mostrar/ocultar el MiniPlayer
// =============================================================================
function LoadingScreen() {
  return (
    <div className="app-loading" role="status" aria-live="polite">
      <span className="app-loading__spinner" aria-hidden="true" />
      <span>Cargando ParadisQuo…</span>
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/onboarding" element={
          <ProtectedRoute allowIncomplete>
            <Onboarding />
          </ProtectedRoute>
        } />
        <Route path="/*" element={
          <ProtectedRoute>
            <PrivateApp />
          </ProtectedRoute>
        } />
      </Routes>
    </Suspense>
  );
}

// =============================================================================
// APP COMPONENT
// PlayerProvider envuelve toda la aplicación para estado global del reproductor
// =============================================================================
export default function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  );
}
