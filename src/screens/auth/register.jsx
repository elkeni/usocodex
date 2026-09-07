import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaCheck, FaEye, FaEyeSlash, FaTimes } from 'react-icons/fa';
import { AuthService } from '../../services/authService';
import AuthLayout from './AuthLayout';
import './login.css';

const DISPOSABLE_EMAIL_DOMAINS = ['tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'guerrillamail.org', '10minutemail.com', 'mailinator.com', 'throwaway.email', 'fakeinbox.com', 'trashmail.com', 'yopmail.com', 'getnada.com', 'tempail.com', 'mohmal.com', 'dispostable.com', 'mailnesia.com', 'tempmailaddress.com', 'burnermail.io', 'maildrop.cc', 'harakirimail.com', 'temp-mail.io', 'emailondeck.com', 'getairmail.com', 'mvrht.net', 'mintemail.com', 'sharklasers.com', 'spamgourmet.com', 'spamex.com', 'trashmail.net', 'tmpmail.org'];
const validateEmail = (email) => {
  const expression = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!expression.test(email)) return { valid: false, message: 'El formato del correo no es válido.' };
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain?.includes('.')) return { valid: false, message: 'El correo debe incluir una extensión, como .com.' };
  if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) return { valid: false, message: 'Usa un correo personal; no aceptamos correos temporales.' };
  return { valid: true, message: '' };
};

export default function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [isLoading, setIsLoading] = useState(false); const [showPasswords, setShowPasswords] = useState(false);
  const emailWarning = formData.email.includes('@') && formData.email.length > 5 ? validateEmail(formData.email).message : '';
  const passwordsDiffer = Boolean(formData.confirmPassword) && formData.password !== formData.confirmPassword;
  const handleChange = ({ target: { name, value } }) => { setFormData((current) => ({ ...current, [name]: value })); setError(''); };
  const handleRegister = async (event) => {
    event.preventDefault();
    if (Object.values(formData).some((value) => !value)) return setError('Completa los cuatro campos para crear tu cuenta.');
    if (formData.username.length < 3 || formData.username.length > 20 || !/^[a-zA-Z0-9_]+$/.test(formData.username)) return setError('El usuario debe tener 3 a 20 caracteres: letras, números o _.');
    const emailValidation = validateEmail(formData.email);
    if (!emailValidation.valid) return setError(emailValidation.message);
    if (formData.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.');
    if (passwordsDiffer) return setError('Las contraseñas no coinciden.');
    setIsLoading(true); setError('');
    try { await AuthService.register(formData.username.trim(), formData.email.trim(), formData.password); setSuccess('¡Cuenta creada! Preparando tu experiencia…'); window.setTimeout(() => navigate('/onboarding'), 1500); }
    catch (err) { const messages = { 'auth/email-already-in-use': 'Este correo ya está registrado. ¿Ya tienes cuenta?', 'auth/invalid-email': 'El formato del correo no es válido.', 'auth/weak-password': 'La contraseña es muy débil.' }; setError(messages[err.code] || err.message || 'No pudimos crear la cuenta. Inténtalo nuevamente.'); }
    finally { setIsLoading(false); }
  };
  const passwordField = (id, name, label, hint) => <div className="auth-field"><label htmlFor={id}>{label}</label><div className="auth-password-input"><input id={id} type={showPasswords ? 'text' : 'password'} name={name} placeholder={hint} value={formData[name]} onChange={handleChange} disabled={isLoading || Boolean(success)} autoComplete="new-password" aria-invalid={name === 'confirmPassword' && passwordsDiffer} aria-describedby={`${id}-hint`} /><button type="button" onClick={() => setShowPasswords((visible) => !visible)} aria-label={showPasswords ? 'Ocultar contraseñas' : 'Mostrar contraseñas'} disabled={isLoading || Boolean(success)}>{showPasswords ? <FaEyeSlash /> : <FaEye />}</button></div><span id={`${id}-hint`} className={name === 'confirmPassword' && passwordsDiffer ? 'auth-hint auth-hint--error' : 'auth-hint'}>{name === 'confirmPassword' && passwordsDiffer ? 'Las contraseñas no coinciden.' : hint}</span></div>;
  return (
    <AuthLayout mode="register" eyebrow="Registro" title="Crea tu cuenta" footer={<button type="button" className="auth-switch" onClick={() => navigate('/login')} disabled={isLoading || Boolean(success)}>¿Ya tienes cuenta? <strong>Inicia sesión</strong></button>}>
      <form className="auth-form" onSubmit={handleRegister} noValidate>
        {error && <div id="register-error" className="auth-message auth-message--error" role="alert"><FaTimes aria-hidden="true" />{error}</div>}{success && <div className="auth-message auth-message--success" role="status"><FaCheck aria-hidden="true" />{success}</div>}
        <div className="auth-field"><label htmlFor="register-username">Nombre de usuario</label><input id="register-username" type="text" name="username" placeholder="Cómo quieres que te llamemos" value={formData.username} onChange={handleChange} disabled={isLoading || Boolean(success)} maxLength={20} autoComplete="username" aria-describedby="username-hint" /><span id="username-hint" className="auth-hint">De 3 a 20 caracteres. Usa letras, números o _.</span></div>
        <div className="auth-field"><label htmlFor="register-email">Correo electrónico</label><input id="register-email" type="email" name="email" placeholder="nombre@correo.com" value={formData.email} onChange={handleChange} disabled={isLoading || Boolean(success)} autoComplete="email" aria-invalid={Boolean(emailWarning)} aria-describedby={emailWarning ? 'register-email-hint' : undefined} />{emailWarning && <span id="register-email-hint" className="auth-hint auth-hint--error">{emailWarning}</span>}</div>
        {passwordField('register-password', 'password', 'Contraseña', 'Mínimo 6 caracteres')}{passwordField('register-confirm-password', 'confirmPassword', 'Confirma tu contraseña', 'Escríbela nuevamente')}
        <button className="auth-submit" type="submit" disabled={isLoading || Boolean(success)}><span>{isLoading ? 'Creando cuenta…' : success ? 'Cuenta creada' : 'Crear cuenta'}</span><FaArrowRight aria-hidden="true" /></button>
      </form>
    </AuthLayout>
  );
}
