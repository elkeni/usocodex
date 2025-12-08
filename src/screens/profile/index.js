import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    FaTimes,
    FaUserAstronaut,
    FaSignOutAlt,
    FaHeadphones,
    FaChartPie,
    FaCog,
    FaVolumeUp,
    FaPalette,
    FaShieldAlt,
    FaHeart,
    FaList
} from 'react-icons/fa';

import './profile.css';
import { usePlayer } from '../../context/playerContext';
import { useUser } from '../../context/userContext';
import { AuthService } from '../../services/authService';

const Profile = () => {
    const navigate = useNavigate();
    const { volume, setVolume } = usePlayer();
    const { user, favorites, playlists, loading:  userLoading } = useUser();

    const [activeTab, setActiveTab] = useState('overview');
    const [theme, setTheme] = useState(() => localStorage.getItem('paradox_theme') || 'dark');
    const [incognito, setIncognito] = useState(() => localStorage.getItem('paradox_incognito') === 'true');

    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
        return () => document.body.removeAttribute('data-theme');
    }, [theme]);

    // Handlers
    const handleClose = () => navigate(-1);

    const handleVolumeChange = (e) => {
        setVolume(parseFloat(e.target.value) / 100);
    };

    const handleThemeChange = (newTheme) => {
        setTheme(newTheme);
        localStorage.setItem('paradox_theme', newTheme);
    };

    const handleIncognitoChange = () => {
        const newState = !incognito;
        setIncognito(newState);
        localStorage.setItem('paradox_incognito', String(newState));
    };

    const handleSignOut = async () => {
        const userName = user?.displayName || user?.email || 'tu cuenta';
        if (window.confirm(`¿Cerrar sesión de ${userName}?`)) {
            try {
                await AuthService.logout();
                navigate('/login');
            } catch (error) {
                console.error('Error al cerrar sesión:', error);
            }
        }
    };

    // Helpers
    const formatNumber = (num) => new Intl.NumberFormat('es-ES').format(num || 0);

    const getJoinYear = () => {
        if (user?.metadata?.creationTime) {
            return new Date(user.metadata.creationTime).getFullYear();
        }
        return new Date().getFullYear();
    };

    const getUserInitial = () => {
        if (user?.displayName) return user.displayName.charAt(0).toUpperCase();
        if (user?.email) return user.email.charAt(0).toUpperCase();
        return '?';
    };

    // Loading state
    if (userLoading) {
        return createPortal(
            <div className="profile-wrapper">
                <div className="profile-loading">
                    <div className="loading-spinner" />
                    <span>Cargando perfil...</span>
                </div>
            </div>,
            document.body
        );
    }

    return createPortal(
        <div className="profile-wrapper">
            {/* Header */}
            <header className="profile-header">
                <h1 className="profile-header-title">Perfil</h1>
                <button className="profile-close-btn" onClick={handleClose} aria-label="Cerrar">
                    <FaTimes />
                </button>
            </header>

            {/* Content */}
            <div className="profile-content">
                {/* Sidebar / User Card */}
                <aside className="profile-sidebar">
                    <div className="profile-user-card">
                        <div className="profile-avatar">
                            {user?.photoURL ?(
                                <img src={user.photoURL} alt="Avatar" />
                            ) : (
                                <span className="profile-avatar-initial">{getUserInitial()}</span>
                            )}
                            {! incognito && <span className="profile-online-dot" />}
                        </div>
                        
                        <div className="profile-user-info">
                            <h2 className="profile-user-name">
                                {user?.displayName || 'Usuario'}
                            </h2>
                            <p className="profile-user-email">{user?.email}</p>
                        </div>
                    </div>

                    <div className="profile-stats">
                        <div className="profile-stat">
                            <span className="profile-stat-value">{formatNumber(favorites?.length || 0)}</span>
                            <span className="profile-stat-label">Favoritos</span>
                        </div>
                        <div className="profile-stat">
                            <span className="profile-stat-value">{formatNumber(playlists?.length || 0)}</span>
                            <span className="profile-stat-label">Playlists</span>
                        </div>
                        <div className="profile-stat">
                            <span className="profile-stat-value">{getJoinYear()}</span>
                            <span className="profile-stat-label">Miembro</span>
                        </div>
                    </div>

                    <button className="profile-logout-btn" onClick={handleSignOut}>
                        <FaSignOutAlt />
                        <span>Cerrar sesión</span>
                    </button>
                </aside>

                {/* Main Area */}
                <main className="profile-main">
                    {/* Tabs */}
                    <nav className="profile-tabs">
                        <button
                            className={`profile-tab ${activeTab === 'overview' ?'active' :  ''}`}
                            onClick={() => setActiveTab('overview')}
                        >
                            <FaHeadphones />
                            <span>Resumen</span>
                        </button>
                        <button
                            className={`profile-tab ${activeTab === 'stats' ?'active' : ''}`}
                            onClick={() => setActiveTab('stats')}
                        >
                            <FaChartPie />
                            <span>Actividad</span>
                        </button>
                        <button
                            className={`profile-tab ${activeTab === 'settings' ?'active' : ''}`}
                            onClick={() => setActiveTab('settings')}
                        >
                            <FaCog />
                            <span>Ajustes</span>
                        </button>
                    </nav>

                    {/* Tab Content */}
                    <div className="profile-tab-content">
                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <section className="profile-section">
                                <h3 className="profile-section-title">Favoritos recientes</h3>
                                
                                {favorites && favorites.length > 0 ? (
                                    <div className="profile-favorites-list">
                                        {[...favorites].reverse().slice(0, 10).map((track, index) => (
                                            <div key={track.id || index} className="profile-favorite-item">
                                                <span className="profile-favorite-index">{index + 1}</span>
                                                <div className="profile-favorite-info">
                                                    <span className="profile-favorite-name">{track.name}</span>
                                                    <span className="profile-favorite-artist">{track.artist}</span>
                                                </div>
                                                <FaHeart className="profile-favorite-icon" />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="profile-empty">
                                        <FaHeadphones className="profile-empty-icon" />
                                        <p>No tienes canciones favoritas aún</p>
                                        <button 
                                            className="profile-empty-btn"
                                            onClick={() => navigate('/feed')}
                                        >
                                            Explorar música
                                        </button>
                                    </div>
                                )}
                            </section>
                        )}

                        {/* Stats Tab */}
                        {activeTab === 'stats' && (
                            <section className="profile-section">
                                <h3 className="profile-section-title">Tu colección</h3>
                                
                                <div className="profile-stats-list">
                                    <div className="profile-stats-item">
                                        <div className="profile-stats-item-info">
                                            <FaHeart />
                                            <span>Canciones favoritas</span>
                                        </div>
                                        <span className="profile-stats-item-value">
                                            {favorites?.length || 0}
                                        </span>
                                    </div>
                                    
                                    <div className="profile-stats-item">
                                        <div className="profile-stats-item-info">
                                            <FaList />
                                            <span>Playlists creadas</span>
                                        </div>
                                        <span className="profile-stats-item-value">
                                            {playlists?.length || 0}
                                        </span>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* Settings Tab */}
                        {activeTab === 'settings' && (
                            <section className="profile-section">
                                <h3 className="profile-section-title">Configuración</h3>
                                
                                <div className="profile-settings-list">
                                    {/* Volume */}
                                    <div className="profile-setting">
                                        <div className="profile-setting-header">
                                            <div className="profile-setting-icon">
                                                <FaVolumeUp />
                                            </div>
                                            <div className="profile-setting-info">
                                                <h4>Volumen</h4>
                                            </div>
                                            <span className="profile-setting-value">
                                                {Math.round(volume * 100)}%
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={Math.round(volume * 100)}
                                            onChange={handleVolumeChange}
                                            className="profile-range"
                                        />
                                    </div>

                                    {/* Theme */}
                                    <div className="profile-setting">
                                        <div className="profile-setting-header">
                                            <div className="profile-setting-icon">
                                                <FaPalette />
                                            </div>
                                            <div className="profile-setting-info">
                                                <h4>Tema</h4>
                                            </div>
                                        </div>
                                        <div className="profile-theme-options">
                                            <button
                                                className={`profile-theme-btn ${theme === 'dark' ?'active' : ''}`}
                                                onClick={() => handleThemeChange('dark')}
                                            >
                                                Oscuro
                                            </button>
                                            <button
                                                className={`profile-theme-btn ${theme === 'light' ?'active' :  ''}`}
                                                onClick={() => handleThemeChange('light')}
                                            >
                                                Claro
                                            </button>
                                        </div>
                                    </div>

                                    {/* Incognito */}
                                    <div className="profile-setting">
                                        <div className="profile-setting-header">
                                            <div className="profile-setting-icon">
                                                <FaShieldAlt />
                                            </div>
                                            <div className="profile-setting-info">
                                                <h4>Sesión privada</h4>
                                            </div>
                                            <label className="profile-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={incognito}
                                                    onChange={handleIncognitoChange}
                                                />
                                                <span className="profile-switch-slider" />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}
                    </div>
                </main>
            </div>
        </div>,
        document.body
    );
};

export default Profile;