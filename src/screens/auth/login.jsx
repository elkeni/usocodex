import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaEye, FaEyeSlash, FaTimes } from 'react-icons/fa';
import { AuthService } from '../../services/authService';
import AuthLayout from './AuthLayout';
import './login.css';

const validateEmail = (email) => /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(email);

export default function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const handleChange = ({ target: { name, value } }) => { setFormData((current) => ({ ...current, [name]: value })); setError(''); };

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!formData.email || !formData.password) return setError('Completa tu correo y contraseña para continuar.');
    if (!validateEmail(formData.email)) return setError('Por favor ingresa un correo electrónico válido.');
    setIsLoading(true); setError('');
    try {
      await AuthService.login(formData.email.trim(), formData.password);
      navigate('/feed');
    } catch (err) {
      const messages = { 'auth/user-not-found': 'No existe una cuenta con este correo electrónico.', 'auth/wrong-password': 'La contraseña es incorrecta.', 'auth/invalid-email': 'El formato del correo no es válido.', 'auth/user-disabled': 'Esta cuenta ha sido deshabilitada.', 'auth/too-many-requests': 'Demasiados intentos fallidos. Intenta más tarde.', 'auth/invalid-credential': 'Credenciales inválidas. Verifica tu correo y contraseña.' };
      setError(messages[err.code] || err.message || 'No pudimos iniciar sesión. Inténtalo nuevamente.');
    } finally { setIsLoading(false); }
  };

  return (
    <AuthLayout mode="login" eyebrow="Acceso" title="Inicia sesión" footer={<button type="button" className="auth-switch" onClick={() => navigate('/register')} disabled={isLoading}>¿Aún no tienes cuenta? <strong>Regístrate aquí</strong></button>}>
      <form className="auth-form" onSubmit={handleLogin} noValidate>
        {error && <div id="login-error" className="auth-message auth-message--error" role="alert"><FaTimes aria-hidden="true" />{error}</div>}
        <div className="auth-field"><label htmlFor="login-email">Correo electrónico</label><input id="login-email" type="email" name="email" placeholder="nombre@correo.com" value={formData.email} onChange={handleChange} disabled={isLoading} autoComplete="email" aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} /></div>
        <div className="auth-field"><label htmlFor="login-password">Contraseña</label><div className="auth-password-input"><input id="login-password" type={showPassword ? 'text' : 'password'} name="password" placeholder="Tu contraseña" value={formData.password} onChange={handleChange} disabled={isLoading} autoComplete="current-password" aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} disabled={isLoading}>{showPassword ? <FaEyeSlash /> : <FaEye />}</button></div></div>
        <button type="button" className="auth-recovery-link" onClick={() => navigate('/recover-password')} disabled={isLoading}>¿Olvidaste tu contraseña?</button>
        <button className="auth-submit" type="submit" disabled={isLoading}><span>{isLoading ? 'Accediendo…' : 'Iniciar sesión'}</span><FaArrowRight aria-hidden="true" /></button>
      </form>
    </AuthLayout>
  );
}
