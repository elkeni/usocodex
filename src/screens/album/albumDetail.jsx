import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    getAlbumDetails,
    getArtistAlbums,
    fetchAudioUrl
} from '../../services/unifiedService';
import '../../shared/globalStyles.css';
import './albumDetail.css';
import { FaPlay, FaRandom, FaEllipsisH, FaCompactDisc, FaArrowLeft, FaPlus, FaCheck } from 'react-icons/fa';
import { usePlayer } from '../../context/playerContext';
import { useUser } from '../../context/userContext';

// getBestImage removed - images now come as strings from API

const formatTime = (seconds) => {
    if (!seconds) return '--:--';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60';

// Hook para extraer color dominante de una imagen
const useColorExtractor = (imageUrl) => {
    const [dominantColor, setDominantColor] = useState('rgb(40, 40, 40)');

    useEffect(() => {
        if (!imageUrl) return;

        const img = new Image();
        img.crossOrigin = 'Anonymous';

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 50;
                canvas.height = 50;
                ctx.drawImage(img, 0, 0, 50, 50);

                const imageData = ctx.getImageData(0, 0, 50, 50).data;
                let r = 0, g = 0, b = 0, count = 0;

                // Muestrear píxeles (cada 20 píxeles para velocidad)
                for (let i = 0; i < imageData.length; i += 80) {
                    // Ignorar píxeles muy oscuros o muy claros
                    const pr = imageData[i];
                    const pg = imageData[i + 1];
                    const pb = imageData[i + 2];
                    const brightness = (pr + pg + pb) / 3;

                    if (brightness > 30 && brightness < 220) {
                        r += pr;
                        g += pg;
                        b += pb;
                        count++;
                    }
                }

                if (count > 0) {
                    r = Math.round(r / count);
                    g = Math.round(g / count);
                    b = Math.round(b / count);

                    // Hacer el color más saturado y menos brillante para uso en UI
                    const factor = 0.8;
                    r = Math.round(r * factor);
                    g = Math.round(g * factor);
                    b = Math.round(b * factor);

                    setDominantColor(`rgb(${r}, ${g}, ${b})`);
                }
            } catch (e) {
                console.log('[ColorExtractor] Error:', e);
            }
        };

        img.onerror = () => {
            setDominantColor('rgb(40, 40, 40)');
        };

        img.src = imageUrl;
    }, [imageUrl]);

    return dominantColor;
};

export default function AlbumDetail() {
    const { artist, name } = useParams();
    const navigate = useNavigate();
    const { playTrack } = usePlayer();
    const { isAlbumSaved, toggleSaveAlbum } = useUser();
    const containerRef = useRef(null);

    const [albumInfo, setAlbumInfo] = useState(null);
    const [relatedAlbums, setRelatedAlbums] = useState([]);
    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [playingTrackId, setPlayingTrackId] = useState(null);
    const [isScrolled, setIsScrolled] = useState(false);

    // La imagen ahora viene directamente como string desde getAlbumDetails
    const heroImg = albumInfo?.image || DEFAULT_IMAGE;
    const albumColor = useColorExtractor(heroImg);

    // Scroll detection
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            setIsScrolled(container.scrollTop > 200);
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const safeName = decodeURIComponent(name);
            const safeArtist = decodeURIComponent(artist);

            try {
                // ⭐ CAMBIO CRÍTICO: Usar getAlbumDetails para obtener datos EXACTOS
                // Esta función:
                // 1. Busca el álbum exacto del artista correcto
                // 2. Obtiene el tracklist COMPLETO con orden correcto (track_position)
                // 3. Incluye metadata precisa (tipo, fecha, duración, explicit, etc.)
                const albumData = await getAlbumDetails(safeName, safeArtist);

                if (albumData) {
                    setAlbumInfo(albumData);
                    // Los tracks ya vienen ordenados por track_position
                    setTracks(albumData.tracks || []);

                    // Cargar más álbumes del artista
                    if (albumData.artistId) {
                        try {
                            const otherAlbums = await getArtistAlbums(albumData.artistId, 10);
                            // Filtrar el álbum actual
                            const filtered = otherAlbums.filter(a => a.id !== albumData.id && a.name !== albumData.name);
                            setRelatedAlbums(filtered);
                        } catch (err) {
                            console.warn("Failed to load related albums", err);
                        }
                    }
                } else {
                    console.warn(`[AlbumDetail] No se encontró el álbum "${safeName}" de "${safeArtist}"`);
                }
            } catch (e) {
                console.error("[AlbumDetail] Error cargando álbum:", e);
            } finally {
                setLoading(false);
            }
        };

        if (artist && name) fetchData();
    }, [artist, name]);

    const handlePlayTrack = useCallback(async (track) => {
        if (playingTrackId) return;

        const trackId = track.id || track.name;
        setPlayingTrackId(trackId);

        try {
            // Las imágenes ahora vienen directamente como strings
            const albumImg = albumInfo?.image || DEFAULT_IMAGE;
            const trackImg = track.image || albumImg;
            const trackArtist = track.artist || albumInfo?.artist || artist;
            const trackName = track.name;
            const trackDuration = track.duration ? parseInt(track.duration) : 0;

            // Intentar usar preview de Deezer primero, luego fetchAudioUrl
            let audioUrl = track.preview;
            if (!audioUrl) {
                audioUrl = await fetchAudioUrl(trackArtist, trackName, trackDuration);
            }

            if (audioUrl) {
                // Crear cola con todos los tracks del álbum
                const fullQueue = tracks.map(t => ({
                    id: t.id || t.name,
                    name: t.name,
                    artist: t.artist || albumInfo?.artist || artist,
                    image: t.image || albumImg,
                    duration: t.duration ? parseInt(t.duration) : 0,
                    url: t.preview,
                    album: albumInfo?.name || name
                }));

                playTrack({
                    id: trackId,
                    name: trackName,
                    artist: trackArtist,
                    image: trackImg,
                    duration: trackDuration,
                    url: audioUrl,
                    album: albumInfo?.name || name
                }, fullQueue);
            }
        } catch (e) {
            console.error("[AlbumDetail] Error reproduciendo:", e);
        } finally {
            setPlayingTrackId(null);
        }
    }, [playingTrackId, tracks, albumInfo, artist, name, playTrack]);

    const handlePlayAlbum = useCallback(() => {
        if (tracks.length > 0) {
            handlePlayTrack(tracks[0]);
        }
    }, [tracks, handlePlayTrack]);

    const handleShuffle = useCallback(() => {
        if (tracks.length > 0) {
            const shuffled = [...tracks].sort(() => Math.random() - 0.5);
            handlePlayTrack(shuffled[0]);
        }
    }, [tracks, handlePlayTrack]);

    // --- RENDER ---

    if (loading) return (
        <div className="album-page-apple loading">
            <div className="album-spinner"></div>
        </div>
    );

    if (!albumInfo) return (
        <div className="album-page-apple error">
            <p>Álbum no encontrado</p>
            <button onClick={() => navigate(-1)}>Volver</button>
        </div>
    );

    // CSS Variables para color adaptativo
    const dynamicStyles = {
        '--album-color': albumColor,
        '--album-color-light': albumColor.replace('rgb', 'rgba').replace(')', ', 0.3)'),
        '--album-color-dark': albumColor.replace('rgb', 'rgba').replace(')', ', 0.15)')
    };

    return (
        <div className="album-page-apple" ref={containerRef} style={dynamicStyles}>
            {/* Sticky Header */}
            <header className={`album-sticky-header ${isScrolled ? 'visible' : ''}`}>
                <button className="header-back-btn" onClick={() => navigate(-1)}>
                    <FaArrowLeft size={18} />
                </button>
                <span className="header-title">{albumInfo.name}</span>
                <div className="header-actions">
                    <button
                        className={`header-action-btn ${isAlbumSaved(albumInfo.name, albumInfo.artist) ? 'saved' : ''}`}
                        onClick={() => toggleSaveAlbum(albumInfo)}
                        title={isAlbumSaved(albumInfo.name, albumInfo.artist) ? 'Quitar de biblioteca' : 'Guardar en biblioteca'}
                    >
                        {isAlbumSaved(albumInfo.name, albumInfo.artist) ? <FaCheck size={18} /> : <FaPlus size={18} />}
                    </button>
                    <button className="header-action-btn"><FaEllipsisH size={18} /></button>
                </div>
            </header>

            {/* Navigation Overlay */}
            <div className="album-nav-overlay">
                <button className="nav-btn-circle" onClick={() => navigate(-1)}>
                    <FaArrowLeft size={18} />
                </button>
                <div className="nav-right-actions">
                    <button
                        className={`nav-btn-circle save-btn ${isAlbumSaved(albumInfo.name, albumInfo.artist) ? 'saved' : ''}`}
                        onClick={() => toggleSaveAlbum(albumInfo)}
                        title={isAlbumSaved(albumInfo.name, albumInfo.artist) ? 'Quitar de biblioteca' : 'Guardar en biblioteca'}
                    >
                        {isAlbumSaved(albumInfo.name, albumInfo.artist) ? <FaCheck size={18} /> : <FaPlus size={18} />}
                    </button>
                    <button className="nav-btn-circle"><FaEllipsisH size={18} /></button>
                </div>
            </div>

            {/* Hero Section with Adaptive Color */}
            <section className="album-hero-adaptive">
                <div className="album-hero-gradient"></div>

                <div className="album-cover-container">
                    {heroImg ? (
                        <img src={heroImg} alt={albumInfo.name} className="album-cover-image" />
                    ) : (
                        <div className="album-cover-fallback">
                            <FaCompactDisc size={60} />
                        </div>
                    )}
                </div>

                <div className="album-info-section">
                    <h1 className="album-title-apple">{albumInfo.name}</h1>
                    <p className="album-artist-apple" onClick={() => navigate(`/artist/${encodeURIComponent(albumInfo.artist)}`)}>
                        {albumInfo.artist}
                    </p>
                    <p className="album-meta-apple">
                        {albumInfo.type || 'Álbum'}
                        {albumInfo.releaseDate && ` · ${new Date(albumInfo.releaseDate).getFullYear()}`}
                        {albumInfo.trackCount && ` · ${albumInfo.trackCount} canciones`}
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="album-action-buttons">
                    <button
                        className="album-action-btn play"
                        onClick={handlePlayAlbum}
                        disabled={tracks.length === 0}
                    >
                        <FaPlay size={16} />
                        <span>Reproducir</span>
                    </button>
                    <button
                        className="album-action-btn shuffle"
                        onClick={handleShuffle}
                        disabled={tracks.length === 0}
                    >
                        <FaRandom size={16} />
                        <span>Aleatorio</span>
                    </button>
                </div>
            </section>

            {/* Tracklist */}
            <main className="album-main-content">
                <div className="album-tracklist">
                    {tracks.length === 0 ? (
                        <div className="album-empty-state">
                            <p>No se encontraron canciones disponibles para este álbum.</p>
                        </div>
                    ) : (
                        tracks.map((track) => {
                            const isPlaying = playingTrackId === (track.id || track.name);
                            // ⭐ CAMBIO: Usar flag explicit REAL de Deezer
                            const isExplicit = track.explicit === true;

                            return (
                                <div
                                    key={track.id || track.trackNumber}
                                    className={`album-track-item ${isPlaying ? 'loading' : ''}`}
                                    onClick={() => handlePlayTrack(track)}
                                >
                                    <span className="track-number">
                                        {isPlaying ? (
                                            <div className="track-spinner"></div>
                                        ) : (
                                            // ⭐ CAMBIO: Usar trackNumber real del álbum
                                            track.trackNumber || tracks.indexOf(track) + 1
                                        )}
                                    </span>

                                    <div className="track-info">
                                        <span className="track-name">
                                            {track.name}
                                            {isExplicit && <span className="explicit-badge">E</span>}
                                        </span>
                                        {/* Mostrar duración si está disponible */}
                                        {track.duration && (
                                            <span className="track-duration">{formatTime(track.duration)}</span>
                                        )}
                                    </div>

                                    <button
                                        className="track-menu-btn"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <FaEllipsisH size={16} />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="album-footer">
                    <p className="album-date">
                        {albumInfo.releaseDate
                            ? new Date(albumInfo.releaseDate).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })
                            : ''}
                    </p>
                    <p className="album-tracks-count">
                        {albumInfo.trackCount || tracks.length} canciones
                        {albumInfo.duration && `, ${Math.floor(albumInfo.duration / 60)} minutos`}
                    </p>
                    <p className="album-copyright">
                        {albumInfo.label ? `℗ ${albumInfo.label}` : `© ${albumInfo.artist}`}
                    </p>
                </div>

                {/* MORE FROM ARTIST */}
                {relatedAlbums.length > 0 && (
                    <div className="album-more-section">
                        <h3 className="album-more-title">Más de {albumInfo.artist}</h3>
                        <div className="album-more-grid">
                            {relatedAlbums.map(album => (
                                <div
                                    key={album.id}
                                    className="album-more-card"
                                    onClick={() => {
                                        navigate(`/album/${encodeURIComponent(album.artist)}/${encodeURIComponent(album.name)}`);
                                        window.scrollTo(0, 0);
                                    }}
                                >
                                    <div className="album-more-img">
                                        <img src={album.image} alt={album.name} loading="lazy" />
                                    </div>
                                    <div className="album-more-info">
                                        <div className="album-more-name">{album.name}</div>
                                        <div className="album-more-year">
                                            {album.releaseDate ? new Date(album.releaseDate).getFullYear() : ''} • {album.type || 'Álbum'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
