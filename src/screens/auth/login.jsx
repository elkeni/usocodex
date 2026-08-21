import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaTimes } from 'react-icons/fa';
// HiSparkles removed - not used
import { AuthService } from '../../services/authService';
import './login.css';

export default function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Validación básica de email
  const validateEmail = (email) => {
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return emailRegex.test(email);
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    // Validaciones
    if (!formData.email || !formData.password) {
      setError('Por favor completa todos los campos');
      return;
    }

    if (!validateEmail(formData.email)) {
      setError('Por favor ingresa un correo electrónico válido');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await AuthService.login(formData.email, formData.password);
      navigate('/feed');

    } catch (err) {
      console.error(err);

      // Mensajes de error más amigables
      let errorMessage = 'Error al iniciar sesión. Verifica tus credenciales.';

      if (err.code === 'auth/user-not-found') {
        errorMessage = 'No existe una cuenta con este correo electrónico';
      } else if (err.code === 'auth/wrong-password') {
        errorMessage = 'La contraseña es incorrecta';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'El formato del correo no es válido';
      } else if (err.code === 'auth/user-disabled') {
        errorMessage = 'Esta cuenta ha sido deshabilitada';
      } else if (err.code === 'auth/too-many-requests') {
        errorMessage = 'Demasiados intentos fallidos. Intenta más tarde.';
      } else if (err.code === 'auth/invalid-credential') {
        errorMessage = 'Credenciales inválidas. Verifica tu correo y contraseña.';
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="video-background">
        <video autoPlay loop muted playsInline>
          <source src="https://cdn.pixabay.com/video/2025/03/30/268620_large.mp4" type="video/mp4" />
        </video>
        <div className="overlay"></div>
      </div>

      <nav className="navbar">
        <div className="logo">
          <span className="logo-icon"></span>
          PARADISQUO
        </div>
      </nav>

      <main className="hero-content">
        {/* Welcome Badge */}
        <div className="welcome-badge">
          <span>Tu música, tu estilo</span>
        </div>

        <div className="subtitle">BIENVENIDO DE VUELTA</div>
        <h1 className="title">Inicia sesión</h1>

        {/* Welcome Description */}
        <p className="welcome-description">
          Accede a tu biblioteca, playlists personalizadas y descubre nueva música
          adaptada a tus gustos.
        </p>

        <form className="auth-form" onSubmit={handleLogin}>
          {error && (
            <div id="login-error" className="auth-error" role="alert" aria-live="assertive">
              <FaTimes className="error-icon" />
              {error}
            </div>
          )}

          <div className="glass-input-group">
            <label className="glass-input-label" htmlFor="login-email">Correo electrónico</label>
            <input
              id="login-email"
              type="email"
              name="email"
              placeholder="Correo electrónico"
              className="glass-input"
              value={formData.email}
              onChange={handleChange}
              disabled={isLoading}
              autoComplete="email"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
              required
            />
          </div>

          <div className="glass-input-group">
            <label className="glass-input-label" htmlFor="login-password">Contraseña</label>
            <input
              id="login-password"
              type="password"
              name="password"
              placeholder="Contraseña"
              className="glass-input"
              value={formData.password}
              onChange={handleChange}
              disabled={isLoading}
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'login-error' : undefined}
              required
            />
          </div>

          <button className="login-capsule" type="submit" disabled={isLoading}>
            <span className="login-text">
              {isLoading ? 'ACCEDIENDO...' : 'INICIAR SESIÓN'}
            </span>
            <div className="icon-circle">
              {isLoading ? <div className="loading-spinner"></div> : <FaArrowRight color="white" size={14} />}
            </div>
          </button>
        </form>

        {/* Features Section */}


        <button type="button" className="auth-switch" onClick={() => !isLoading && navigate('/register')} disabled={isLoading}>
          ¿No tienes cuenta? <strong>Regístrate aquí</strong>
        </button>
      </main>
    </div>
  );
}
