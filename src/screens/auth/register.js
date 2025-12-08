import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowRight } from 'react-icons/fa';
import { AuthService } from '../../services/authService';
import './login.css';

export default function Register() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({ username: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(''); // Nuevo estado para feedback positivo
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
        setError('');
    };

    const validateEmail = (email) => {
        return /\S+@\S+\.\S+/.test(email);
    };

    const handleRegister = async (e) => {
        e.preventDefault();

        // 1. Validaciones previas
        if (!formData.username || !formData.email || !formData.password) {
            setError('Todos los campos son obligatorios');
            return;
        }
        if (!validateEmail(formData.email)) {
            setError('Por favor ingresa un correo electrónico válido');
            return;
        }
        if (formData.password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            await AuthService.register(formData.username, formData.email, formData.password);

            // 2. Feedback de éxito
            setSuccess('¡Cuenta creada con éxito! Redirigiendo al login...');

            // 3. Redirección al Login después de 2 segundos
            setTimeout(() => {
                navigate('/login');
            }, 2000);

        } catch (err) {
            setError(err.message || 'Error al registrarse. Intenta con otro correo.');
        } finally {
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
                <div className="subtitle">JOIN THE EXPERIENCE</div>
                <h1 className="title">CREAR CUENTA</h1>

                <form className="auth-form" onSubmit={handleRegister}>
                    {/* Mensajes de error y éxito */}
                    {error && <div className="auth-error" style={{ color: '#ff4d4d', marginBottom: '10px' }}>{error}</div>}
                    {success && <div className="auth-success" style={{ color: '#00ff88', marginBottom: '10px', fontWeight: 'bold' }}>{success}</div>}

                    <div className="glass-input-group">
                        <input
                            type="text"
                            name="username"
                            placeholder="Nombre de usuario"
                            className="glass-input"
                            value={formData.username}
                            onChange={handleChange}
                            disabled={isLoading || success} // Deshabilitar inputs si está cargando o ya tuvo éxito
                        />
                    </div>

                    <div className="glass-input-group">
                        <input
                            type="email"
                            name="email"
                            placeholder="Correo electrónico"
                            className="glass-input"
                            value={formData.email}
                            onChange={handleChange}
                            disabled={isLoading || success}
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
                            disabled={isLoading || success}
                        />
                    </div>

                    <button className="login-capsule" type="submit" disabled={isLoading || success}>
                        <span className="login-text">
                            {isLoading ? 'CREANDO...' : success ? '¡LISTO!' : 'REGISTRARSE'}
                        </span>
                        <div className="icon-circle">
                            {isLoading ? <div className="loading-spinner"></div> : <FaArrowRight color="white" size={14} />}
                        </div>
                    </button>
                </form>

                <span className="auth-switch" onClick={() => !isLoading && navigate('/login')}>
                    ¿Ya tienes cuenta? Inicia sesión
                </span>
            </main>
        </div>
    );
}