import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaCheck, FaEnvelope, FaTimes } from 'react-icons/fa';
import { AuthService } from '../../services/authService';
import AuthLayout from './AuthLayout';
import './login.css';

const validateEmail = (email) => /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(email);

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return setError('Ingresa el correo de tu cuenta.');
    if (!validateEmail(normalizedEmail)) return setError('Ingresa un correo electrónico válido.');

    setError('');
    setIsLoading(true);
    try {
      await AuthService.requestPasswordReset(normalizedEmail);
      setSent(true);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        setSent(true);
      } else {
        setError(err.message || 'No pudimos enviar el enlace. Inténtalo nuevamente.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout mode="reset" eyebrow="Recuperar contraseña" title="Restablece tu contraseña" footer={<button type="button" className="auth-switch" onClick={() => navigate('/login')} disabled={isLoading}><FaArrowLeft aria-hidden="true" /> Volver a <strong>Iniciar sesión</strong></button>}>
      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {error && <div id="reset-error" className="auth-message auth-message--error" role="alert"><FaTimes aria-hidden="true" />{error}</div>}
        {sent && <div className="auth-message auth-message--success" role="status"><FaCheck aria-hidden="true" /><span>Si el correo corresponde a una cuenta, recibirás un enlace para restablecer tu contraseña.</span></div>}
        <div className="auth-field">
          <label htmlFor="reset-email">Correo electrónico</label>
          <div className="auth-email-input">
            <FaEnvelope aria-hidden="true" />
            <input id="reset-email" type="email" name="email" placeholder="nombre@correo.com" value={email} onChange={({ target }) => { setEmail(target.value); setError(''); }} disabled={isLoading || sent} autoComplete="email" aria-invalid={Boolean(error)} aria-describedby={error ? 'reset-error' : undefined} />
          </div>
        </div>
        <button className="auth-submit" type="submit" disabled={isLoading || sent}><span>{isLoading ? 'Enviando enlace…' : sent ? 'Enlace enviado' : 'Enviar enlace'}</span><FaEnvelope aria-hidden="true" /></button>
      </form>
    </AuthLayout>
  );
}
