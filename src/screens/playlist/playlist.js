import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { usePlayer } from '../../context/playerContext';
import { 
    FaPlay, 
    FaRandom, 
    FaHeart, 
    FaRegHeart,
    FaEllipsisH, 
    FaClock, 
    FaArrowLeft, 
    FaMusic,
    FaCompactDisc,
    FaGlobe
} from 'react-icons/fa';
import './playlist.css';

import { playlistGetInfo } from '../../services/unifiedService';

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60';

export default function Playlist() {
    const { playlistId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { playTrack } = usePlayer();
    
    const controlsRef = useRef(null);
    const [isScrolled, setIsScrolled] = useState(false);

    const [playlist, setPlaylist] = useState(null);
    const [tracks, setTracks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLiked, setIsLiked] = useState(false);
    const [playlistColor, setPlaylistColor] = useState('29, 185, 84');
    const [isVirtual, setIsVirtual] = useState(false);

    // Detectar scroll para sticky controls
    useEffect(() => {
        const handleScroll = () => {
            if (controlsRef.current) {
                const rect = controlsRef.current.getBoundingClientRect();
                setIsScrolled(rect.top <= 0);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Extraer color dominante de la imagen
    const extractColor = useCallback((imageUrl) => {
        if (! imageUrl) return;
        
        const img = new Image();
        img. crossOrigin = "Anonymous";
        img.src = imageUrl;
        
        img.onload = () => {
            try {
                const canvas = document. createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 10;
                canvas.height = 10;
                ctx.drawImage(img, 0, 0, 10, 10);
                
                const imageData = ctx.getImageData(0, 0, 10, 10). data;
                let r = 0, g = 0, b = 0, count = 0;
                
                for (let i = 0; i < imageData.length; i += 4) {
                    // Filtrar píxeles muy oscuros o muy claros
                    const brightness = (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3;
                    if (brightness > 30 && brightness < 220) {
                        r += imageData[i];
                        g += imageData[i + 1];
                        b += imageData[i + 2];
                        count++;
                    }
                }
                
                if (count > 0) {
                    r = Math.round(r / count);
                    g = Math.round(g / count);
                    b = Math.round(b / count);
                    
                    // Aumentar saturación
                    const max = Math.max(r, g, b);
                    const boost = 1.3;
                    r = Math. min(255, Math.round(r * boost));
                    g = Math.min(255, Math.round(g * boost));
                    b = Math.min(255, Math.round(b * boost));
                    
                    setPlaylistColor(`${r}, ${g}, ${b}`);
                }
            } catch (err) {
                console.warn('[Playlist] Error extrayendo color:', err);
            }
        };
    }, []);

    // Cargar datos de la playlist
    useEffect(() => {
        const loadPlaylistData = async () => {
            setIsLoading(true);
            
            try {
                // 1. Verificar si es una Playlist Virtual (desde Feed)
                if (location.state?.virtualPlaylist) {
                    const vp = location.state.virtualPlaylist;
                    
                    setPlaylist({
                        id: vp. id,
                        name: vp.name,
                        description: vp.description || 'Selección especial curada para ti',
                        image: vp.image,
                        creator: vp.artist || 'ParadisQuo'
                    });
                    
                    setTracks(vp.tracks || []);
                    setIsVirtual(true);
                    
                    if (vp.image) extractColor(vp.image);
                    
                    setIsLoading(false);
                    return;
                }

                // 2. Buscar en Local Storage (playlists del usuario)
                const localPlaylists = JSON.parse(localStorage.getItem('user_playlists')) || [];
                const localFound = localPlaylists.find(p => p.id === playlistId);

                if (localFound) {
                    setPlaylist(localFound);
                    setTracks(localFound.tracks || []);
                    setIsVirtual(false);
                    if (localFound.image) extractColor(localFound.image);
                    setIsLoading(false);
                    return;
                }

                // 3. Buscar en API externa (Deezer)
                console.log('[Playlist] Buscando playlist externa:', playlistId);
                const externalData = await playlistGetInfo({ id: playlistId });

                if (externalData) {
                    setPlaylist({
                        id: externalData.id,
                        name: externalData.name,
                        description: externalData.description || `Por ${externalData.creator}`,
                        image: externalData.image,
                        creator: externalData.creator
                    });

                    const formattedTracks = (externalData.tracks || []). map((t, index) => ({
                        ... t,
                        image: t.image || t.album?. cover_xl || externalData.image,
                        _index: index
                    }));

                    setTracks(formattedTracks);
                    setIsVirtual(false);
                    if (externalData. image) extractColor(externalData.image);
                } else {
                    console.error('[Playlist] No encontrada');
                }

            } catch (error) {
                console.error('[Playlist] Error cargando:', error);
            } finally {
                setIsLoading(false);
            }
        };

        if (playlistId) {
            loadPlaylistData();
        }
    }, [playlistId, location.state, extractColor]);

    // Handlers
    const handlePlayAll = useCallback(() => {
        if (tracks.length > 0) {
            playTrack(tracks[0], tracks);
        }
    }, [tracks, playTrack]);

    const handlePlayTrack = useCallback((track) => {
        playTrack(track, tracks);
    }, [tracks, playTrack]);

    const handleShuffle = useCallback(() => {
        if (tracks.length > 0) {
            const shuffled = [...tracks].sort(() => Math.random() - 0.5);
            playTrack(shuffled[0], shuffled);
        }
    }, [tracks, playTrack]);

    const handleLike = useCallback(() => {
        setIsLiked(prev => ! prev);
    }, []);

    // Utilidades
    const formatDuration = (seconds) => {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${String(secs).padStart(2, '0')}`;
    };

    const getTotalDuration = () => {
        const total = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
        const hours = Math.floor(total / 3600);
        const mins = Math.floor((total % 3600) / 60);
        if (hours > 0) return `${hours} hr ${mins} min`;
        return `${mins} min`;
    };

    const getArtistName = (track) => {
        if (typeof track.artist === 'object') return track.artist.name;
        return track.artist || 'Artista desconocido';
    };

    // Loading State
    if (isLoading) {
        return (
            <div className="playlist-page">
                <div className="playlist-bg-layer">
                    <div className="playlist-bg-overlay" />
                </div>
                <div className="playlist-loading-state">
                    <div className="loading-spinner-large" />
                    <p>Cargando playlist...</p>
                </div>
            </div>
        );
    }

    // Error State
    if (! playlist) {
        return (
            <div className="playlist-page">
                <div className="playlist-bg-layer">
                    <div className="playlist-bg-overlay" />
                </div>
                <div className="playlist-error-state">
                    <FaMusic size={64} style={{ opacity: 0.2, marginBottom: 20 }} />
                    <h3>Playlist no encontrada</h3>
                    <p>Esta playlist no existe o fue eliminada</p>
                    <button className="playlist-error-btn" onClick={() => navigate('/feed')}>
                        Ir al Feed
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="playlist-page">
            {/* Fondo inmersivo con imagen blur */}
            <div className="playlist-bg-layer">
                <div 
                    className="playlist-bg-image"
                    style={{ 
                        backgroundImage: `url(${playlist.image || DEFAULT_IMAGE})` 
                    }}
                />
                <div className="playlist-bg-overlay" />
            </div>

            <div className="playlist-content">
                {/* Hero Section */}
                <div className="playlist-hero">
                    <button className="playlist-back-btn" onClick={() => navigate(-1)}>
                        <FaArrowLeft size={14} />
                        <span>Volver</span>
                    </button>

                    <div className="playlist-hero-content">
                        {/* Cover Art */}
                        <div className="playlist-cover-wrapper">
                            <div className="playlist-cover">
                                {playlist.image ? (
                                    <img 
                                        src={playlist.image} 
                                        alt={playlist.name}
                                        onError={(e) => { e.target.src = DEFAULT_IMAGE; }}
                                    />
                                ) : (
                                    <div className="playlist-cover-fallback">
                                        <FaMusic size={60} />
                                    </div>
                                )}
                            </div>
                            
                            {/* Badge para playlists virtuales/curadas */}
                            {isVirtual && (
                                <div className="playlist-badge">
                                    ✨ MIX PARADISQUO
                                </div>
                            )}
                        </div>

                        {/* Playlist Info */}
                        <div className="playlist-info">
                            <div className="playlist-type">
                                <div className="playlist-type-icon">
                                    {isVirtual ? <FaCompactDisc size={10} /> : <FaGlobe size={10} />}
                                </div>
                                <span>{isVirtual ? 'Mix Curado' : 'Playlist'}</span>
                            </div>
                            
                            <h1 className="playlist-title">{playlist.name}</h1>
                            
                            {playlist.description && (
                                <p className="playlist-description">{playlist.description}</p>
                            )}
                            
                            <div className="playlist-meta">
                                <div className="playlist-creator">
                                    <div className="playlist-creator-avatar">
                                        {playlist.creator?. charAt(0)?.toUpperCase() || 'P'}
                                    </div>
                                    <span>{playlist.creator || 'ParadisQuo'}</span>
                                </div>
                                <div className="playlist-meta-dot" />
                                <span>{tracks.length} canciones</span>
                                {tracks.length > 0 && (
                                    <>
                                        <div className="playlist-meta-dot" />
                                        <span>{getTotalDuration()}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sticky Controls */}
                <div className="playlist-controls-wrapper" ref={controlsRef}>
                    <div className={`playlist-controls ${isScrolled ? 'scrolled' : ''}`}>
                        <button 
                            className="playlist-play-fab"
                            onClick={handlePlayAll}
                            disabled={tracks.length === 0}
                            style={{ 
                                background: `rgb(${playlistColor})`,
                                boxShadow: `0 8px 25px rgba(${playlistColor}, 0.4)`
                            }}
                        >
                            <FaPlay size={20} />
                        </button>

                        <button 
                            className="playlist-btn-secondary"
                            onClick={handleShuffle}
                            disabled={tracks.length === 0}
                        >
                            <FaRandom size={14} />
                            <span>Aleatorio</span>
                        </button>

                        <button 
                            className={`playlist-btn-icon ${isLiked ? 'liked' : ''}`}
                            onClick={handleLike}
                        >
                            {isLiked ? <FaHeart size={18} /> : <FaRegHeart size={18} />}
                        </button>

                        <button className="playlist-btn-icon">
                            <FaEllipsisH size={18} />
                        </button>

                        <div className="controls-spacer" />

                        <span className="playlist-track-count">
                            {tracks.length} canciones
                        </span>
                    </div>
                </div>

                {/* Tracks Section */}
                <div className="playlist-tracks-section">
                    {tracks.length === 0 ? (
                        <div className="playlist-empty-state">
                            <div className="empty-icon-wrapper">
                                <FaMusic size={48} />
                            </div>
                            <h3>Playlist vacía</h3>
                            <p>Esta playlist aún no tiene canciones</p>
                        </div>
                    ) : (
                        <>
                            {/* Header (desktop) */}
                            <div className="tracks-header">
                                <div>#</div>
                                <div>Título</div>
                                <div>Álbum</div>
                                <div style={{ textAlign: 'right' }}>
                                    <FaClock size={14} />
                                </div>
                            </div>

                            {/* Track List */}
                            <div className="tracks-list">
                                {tracks.map((track, index) => (
                                    <div
                                        key={track.id || index}
                                        className="track-row"
                                        onClick={() => handlePlayTrack(track)}
                                        style={{ animationDelay: `${Math.min(index * 0.03, 0.5)}s` }}
                                    >
                                        {/* Number */}
                                        <div className="track-number-cell">
                                            <span className="track-index">{index + 1}</span>
                                            <div className="track-play-btn">
                                                <FaPlay size={12} />
                                            </div>
                                        </div>

                                        {/* Track Info */}
                                        <div className="track-info-cell">
                                            <div className="track-artwork">
                                                {track. image ? (
                                                    <img 
                                                        src={track.image} 
                                                        alt={track. name}
                                                        onError={(e) => { e. target.src = DEFAULT_IMAGE; }}
                                                    />
                                                ) : (
                                                    <div className="track-artwork-fallback">
                                                        <FaMusic size={14} />
                                                    </div>
                                                )}
                                                <div className="track-artwork-overlay">
                                                    <FaPlay size={14} />
                                                </div>
                                            </div>
                                            
                                            <div className="track-text">
                                                <div className="track-name" title={track.name}>
                                                    {track.name}
                                                </div>
                                                <div className="track-artist">
                                                    {getArtistName(track)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Album */}
                                        <div className="track-album-cell">
                                            {track.album || 'Single'}
                                        </div>

                                        {/* Duration */}
                                        <div className="track-duration-cell">
                                            {formatDuration(track.duration)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}