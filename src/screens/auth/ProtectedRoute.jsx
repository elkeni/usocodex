// src/components/auth/ProtectedRoute.js
import { Navigate } from 'react-router-dom';
import { useUser } from '../../context/userContext';

export const ProtectedRoute = ({ children, allowIncomplete = false }) => {
    const { user, loading, onboardingCompleted } = useUser();

    // 1. Si Firebase está pensando, mostramos una pantalla de carga (Spinner)
    if (loading) {
        return (
            <div style={{
                height: '100vh',
                width: '100vw',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#000',
                color: 'white'
            }}>
                <div className="loading-spinner"></div> {/* Usa tu clase CSS de spinner existente */}
            </div>
        );
    }

    // 2. Si terminó de cargar y NO hay usuario, mandamos al Login
    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (!allowIncomplete && !onboardingCompleted) {
        return <Navigate to="/onboarding" replace />;
    }

    // 3. Si hay usuario, mostramos la página protegida (Feed, Library, etc.)
    return children;
};
