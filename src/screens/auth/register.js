import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight, FaCheck, FaTimes, FaMusic, FaHeadphones, FaHeart } from 'react-icons/fa';
// HiSparkles removed - not used
import { AuthService } from '../../services/authService';
import './login.css';

// Lista de dominios de email temporales/desechables más comunes
const DISPOSABLE_EMAIL_DOMAINS = [
    'tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'guerrillamail.org',
    '10minutemail.com', 'mailinator.com', 'throwaway.email', 'fakeinbox.com',
    'trashmail.com', 'yopmail.com', 'getnada.com', 'tempail.com', 'mohmal.com',
    'dispostable.com', 'mailnesia.com', 'tempmailaddress.com', 'burnermail.io',
    'maildrop.cc', 'harakirimail.com', 'temp-mail.io', 'emailondeck.com',
    'getairmail.com', 'mvrht.net', 'mintemail.com', 'sharklasers.com',
    'spamgourmet.com', 'spamex.com', 'trashmail.net', 'tmpmail.org'
];

export default function Register() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ username: '', email: '', password: '', confirmPassword: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
    const [emailWarning, setEmailWarning] = useState('');

    // Validación avanzada de email
    const validateEmail = (email) => {
        // Regex más robusto para validar formato de email
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

        if (!emailRegex.test(email)) {
            return { valid: false, message: 'El formato del correo no es válido' };
        }

        const domain = email.split('@')[1]?.toLowerCase();

        if (!domain) {
            return { valid: false, message: 'El correo debe incluir un dominio' };
        }

        // Verificar si es un dominio desechable
        if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
            return { valid: false, message: 'No se permiten correos temporales. Usa tu correo personal.' };
        }

        // Verificar longitud mínima del dominio
        if (domain.length < 4) {
            return { valid: false, message: 'El dominio del correo no es válido' };
        }

        // Verificar que tenga al menos un punto en el dominio
        if (!domain.includes('.')) {
            return { valid: false, message: 'El dominio debe incluir una extensión (.com, .net, etc.)' };
        }

        return { valid: true, message: '' };
    };

    // Análisis de fortaleza de contraseña
    const passwordAnalysis = useMemo(() => {
        const password = formData.password;
        const requirements = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /[0-9]/.test(password),
            special: /[!@#$%^&*(),.?":{}|<>_\-+=[\]\\;'`~]/.test(password)
        };

        const metRequirements = Object.values(requirements).filter(Boolean).length;
        const strength = metRequirements === 5 ? 'strong' : metRequirements >= 3 ? 'medium' : 'weak';
        const percentage = (metRequirements / 5) * 100;

        return { requirements, strength, percentage, metRequirements };
    }, [formData.password]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
        setError('');

        // Validación de email en tiempo real
        if (name === 'email' && value.includes('@')) {
            const emailCheck = validateEmail(value);
            if (!emailCheck.valid && value.length > 5) {
                setEmailWarning(emailCheck.message);
            } else {
                setEmailWarning('');
            }
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        // 1. Validar campos obligatorios
        if (!formData.username || !formData.email || !formData.password) {
            setError('Todos los campos son obligatorios');
            return;
        }

        // 2. Validar nombre de usuario
        if (formData.username.length < 3) {
            setError('El nombre de usuario debe tener al menos 3 caracteres');
            return;
        }

        if (formData.username.length > 20) {
            setError('El nombre de usuario no puede exceder 20 caracteres');
            return;
        }

        if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
            setError('El nombre de usuario solo puede contener letras, números y guiones bajos');
            return;
        }

        // 3. Validar email
        const emailValidation = validateEmail(formData.email);
        if (!emailValidation.valid) {
            setError(emailValidation.message);
            return;
        }

        // 4. Validar fortaleza de contraseña (Simplificado)
        if (formData.password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        // 5. Validar confirmación de contraseña (si existe el campo)
        if (formData.confirmPassword && formData.password !== formData.confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            await AuthService.register(formData.username, formData.email, formData.password);

            setSuccess('¡Cuenta creada! Preparando tu experiencia...');

            // Redirigir al onboarding para que el usuario elija sus artistas favoritos
            setTimeout(() => {
                navigate('/onboarding');
            }, 1500);

        } catch (err) {
            // Mensajes de error más amigables
            let errorMessage = 'Error al registrarse. Intenta de nuevo.';

            if (err.code === 'auth/email-already-in-use') {
                errorMessage = 'Este correo ya está registrado. ¿Ya tienes cuenta?';
            } else if (err.code === 'auth/invalid-email') {
                errorMessage = 'El formato del correo no es válido';
            } else if (err.code === 'auth/weak-password') {
                errorMessage = 'La contraseña es muy débil';
            } else if (err.message) {
                errorMessage = err.message;
            }

            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const getStrengthColor = () => {
        switch (passwordAnalysis.strength) {
            case 'strong': return '#00ff88';
            case 'medium': return '#ffa500';
            default: return '#ff4b4b';
        }
    };

    const getStrengthLabel = () => {
        switch (passwordAnalysis.strength) {
            case 'strong': return 'Contraseña fuerte';
            case 'medium': return 'Contraseña media';
            default: return 'Contraseña débil';
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

            <main className="hero-content register-view">
                {/* Welcome Section */}
                <div className="welcome-section">
                    <div className="welcome-badge">
                        <span>Únete a miles de amantes de la música</span>
                    </div>
                    <div className="subtitle">COMIENZA TU VIAJE MUSICAL</div>
                    <h1 className="title">Crea tu cuenta</h1>
                    <p className="welcome-description">
                        Descubre un universo de música sin límites. Playlists personalizadas,
                        millones de canciones y una experiencia diseñada para ti.
                    </p>
                </div>

                <form className="auth-form" onSubmit={handleRegister}>
                    {/* Mensajes de error y éxito */}
                    {error && (
                        <div className="auth-error">
                            <FaTimes className="error-icon" />
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="auth-success">
                            <FaCheck className="success-icon" />
                            {success}
                        </div>
                    )}

                    {/* Username Input */}
                    <div className="glass-input-group">
                        <input
                            type="text"
                            name="username"
                            placeholder="Nombre de usuario"
                            className="glass-input"
                            value={formData.username}
                            onChange={handleChange}
                            disabled={isLoading || success}
                            maxLength={20}
                            autoComplete="username"
                        />
                        <span className="input-hint">3-20 caracteres, solo letras, números y _</span>
                    </div>

                    {/* Email Input */}
                    <div className="glass-input-group">
                        <input
                            type="email"
                            name="email"
                            placeholder="Correo electrónico"
                            className={`glass-input ${emailWarning ? 'input-warning' : ''}`}
                            value={formData.email}
                            onChange={handleChange}
                            disabled={isLoading || success}
                            autoComplete="email"
                        />
                        {emailWarning && (
                            <span className="input-warning-text">{emailWarning}</span>
                        )}
                    </div>

                    {/* Password Input (Simple) */}
                    <div className="glass-input-group">
                        <input
                            type="password"
                            name="password"
                            placeholder="Contraseña"
                            className="glass-input"
                            value={formData.password}
                            onChange={handleChange}
                            disabled={isLoading || success}
                            autoComplete="new-password"
                        />
                        <span className="input-hint">Mínimo 6 caracteres</span>
                    </div>

                    <button className="login-capsule" type="submit" disabled={isLoading || success}>
                        <span className="login-text">
                            {isLoading ? 'CREANDO...' : success ? '¡LISTO!' : 'CREAR CUENTA'}
                        </span>
                        <div className="icon-circle">
                            {isLoading ? <div className="loading-spinner"></div> : <FaArrowRight color="white" size={14} />}
                        </div>
                    </button>
                </form>

                {/* Features Section */}
                <div className="features-section">
                    <div className="feature-item">
                        <FaMusic className="feature-icon" />
                        <span>Millones de canciones</span>
                    </div>
                    <div className="feature-item">
                        <FaHeadphones className="feature-icon" />
                        <span>Calidad premium</span>
                    </div>
                    <div className="feature-item">
                        <FaHeart className="feature-icon" />
                        <span>Playlists personalizadas</span>
                    </div>
                </div>

                <span className="auth-switch" onClick={() => !isLoading && navigate('/login')}>
                    ¿Ya tienes cuenta? <strong>Inicia sesión</strong>
                </span>
            </main>
        </div>
    );
}