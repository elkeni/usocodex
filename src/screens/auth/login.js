import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight } from 'react-icons/fa';
import { AuthService } from '../../services/authService';
import './login.css';

export default function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault(); // 1. Evita que la página se recargue sola

    // 2. Validaciones básicas
    if (!formData.email || !formData.password) {
      setError('Por favor completa todos los campos');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // 3. Intento de login con Firebase
      await AuthService.login(formData.email, formData.password);

      // 4. SI ES EXITOSO: Navegar al feed sin recargar
      // Nota: No ponemos setIsLoading(false) aquí para evitar parpadeos visuales mientras cambia la página
      navigate('/feed');

    } catch (err) {
      // 5. SI HAY ERROR: Mostrar mensaje y detener carga
      console.error(err);
      // Intentamos obtener un mensaje amigable, si no, uno genérico
      const msg = err.message || 'Error al iniciar sesión. Verifica tus credenciales.';
      setError(msg);
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
        <div className="subtitle">ACCESS YOUR SOUNDSCAPE</div>
        <h1 className="title">BIENVENIDO</h1>

        <form className="auth-form" onSubmit={handleLogin}>
          {error && <div className="auth-error" style={{ color: '#ff4d4d', marginBottom: '10px' }}>{error}</div>}

          <div className="glass-input-group">
            <input
              type="email"
              name="email"
              placeholder="Correo electrónico"
              className="glass-input"
              value={formData.email}
              onChange={handleChange}
              disabled={isLoading}
            />
          </div>

          <div className="glass-input-group">
            <input
              type="password"
              name="password"
              placeholder="Contraseña"
              className="glass-input"
              value={formData.password}
              onChange={handleChange}
              disabled={isLoading}
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

        <span className="auth-switch" onClick={() => !isLoading && navigate('/register')}>
          ¿No tienes cuenta? Regístrate aquí
        </span>
      </main>
    </div>
  );
}