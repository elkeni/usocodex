import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './login.css';

export default function Callback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState('Procesando tu sesión...');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const processCallback = async () => {
      try {
        // Obtener parámetros de la URL (si es Last.fm)
        const token = searchParams.get('token');
        const username = searchParams.get('username');
        const sessionId = searchParams.get('session');

        // Validar si hay error en el callback
        if (searchParams.get('error')) {
          setError('Cancelaste la autenticación. Por favor, intenta de nuevo.');
          setIsProcessing(false);
          setTimeout(() => navigate('/login'), 3000);
          return;
        }

        // Si hay token, procesarlo con Last.fm
        if (token) {
          setStatus('Validando con Last.fm...');

          try {
            // Aquí iría la llamada a tu backend para validar el token con Last.fm
            const response = await fetch('/api/auth/lastfm-callback', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ token })
            });

            if (!response.ok) {
              throw new Error('Error al validar con Last.fm');
            }

            const data = await response.json();

            setStatus('¡Sesión iniciada correctamente!');
            localStorage.setItem('lastfm_session', data.session || 'user_session');
            localStorage.setItem('lastfm_username', data.username || username || 'User');
            localStorage.setItem('lastfm_token', token);

            setTimeout(() => {
              window.location.href = '/feed';
            }, 1500);

          } catch (err) {
            console.error('Error de Last.fm:', err);
            setError('Error al conectar con Last.fm. Intenta de nuevo.');
            setIsProcessing(false);
            setTimeout(() => navigate('/login'), 3000);
          }

        } else if (sessionId) {
          // Si hay sessionId (login directo)
          setStatus('Configurando tu sesión...');

          localStorage.setItem('lastfm_session', sessionId);
          localStorage.setItem('lastfm_username', username || 'User');

          setTimeout(() => {
            setStatus('¡Bienvenido!');
            setTimeout(() => {
              window.location.href = '/feed';
            }, 500);
          }, 800);

        } else {
          // Guest login (sin parámetros)
          setStatus('Iniciando sesión de invitado...');

          setTimeout(() => {
            localStorage.setItem('lastfm_session', 'guest_session');
            localStorage.setItem('lastfm_username', 'Guest User');

            setStatus('¡Bienvenido!');
            setTimeout(() => {
              window.location.href = '/feed';
            }, 500);
          }, 1000);
        }

      } catch (err) {
        console.error('Error en callback:', err);
        setError('Ocurrió un error procesando tu solicitud');
        setIsProcessing(false);
      }
    };

    processCallback();

  }, [navigate, searchParams]);

  return (
    <div className="login-container">
      {/* Video Background */}
      <div className="video-background">
        <video autoPlay muted loop playsInline>
          <source src="/path/to/your/video.mp4" type="video/mp4" />
        </video>
        <div className="overlay"></div>
      </div>

      {/* Navbar */}
      <nav className="navbar">
        <div className="logo">
          <div className="logo-icon"></div>
          <span>ParadisQuo</span>
        </div>
      </nav>

      {/* Content */}
      <div className="hero-content">
        {error ? (
          <>
            <div className="subtitle">Oops</div>
            <h1 className="title" style={{ color: '#ff4b4b' }}>Error</h1>
            <div className="auth-error" style={{ maxWidth: '400px', marginTop: '2rem' }} role="alert">
              {error}
            </div>
            <p style={{
              color: 'rgba(255, 255, 255, 0.6)',
              marginTop: '1rem',
              textAlign: 'center'
            }}>
              Serás redirigido al login en unos segundos...
            </p>
          </>
        ) : (
          <>
            <div className="subtitle">Por favor, espera</div>
            <h1 className="title">{status}</h1>

            {isProcessing && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                marginTop: '3rem'
              }}>
                <div className="loading-spinner"></div>
                <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                  Conectando...
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <footer style={{
        padding: '2rem',
        textAlign: 'center',
        color: 'rgba(255, 255, 255, 0.5)',
        fontSize: '0.85rem',
        zIndex: 10
      }}>
        <p>© 2025 ParadisQuo • Tu música, tu estilo</p>
      </footer>
    </div>
  );
}