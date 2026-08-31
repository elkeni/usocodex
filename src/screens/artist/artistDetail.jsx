import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaPlay, FaChevronRight, FaEllipsisH, FaArrowLeft, FaCheck, FaPlus, FaRandom } from 'react-icons/fa';

import { usePlayer } from '../../context/playerContext';
import { useUser } from '../../context/userContext';
import PageState from '../../components/shared/PageState';
import { getAlbumPath } from '../../services/albumNavigation';
import {
    getArtistInfo,
    getArtistAlbums,
    artistGetTopTracks,
    fetchAudioUrl
} from '../../services/unifiedService';

import '../../shared/globalStyles.css';
import './artistDetail.css';

// --- HELPERS ---

const getBestImage = (imageSource) => {
    if (!imageSource) return null;
    if (typeof imageSource === 'string') return imageSource;
    if (Array.isArray(imageSource)) {
        const imgObj = imageSource.find(img => img.size === 'extralarge') ||
            imageSource.find(img => img.size === 'large') ||
            imageSource.find(img => img.size === 'mega') ||
            imageSource[imageSource.length - 1];
        return imgObj ? imgObj['#text'] : null;
    }
    return null;
};

// formatTime is defined but used only in JSX comments currently
// Keeping declaration for potential future use

const formatCompactNumber = (num) => {
    if (!num) return '';
    return new Intl.NumberFormat('en-US', {
        notation: "compact",
        compactDisplay: "short"
    }).format(num);
};

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60';

// --- COMPONENTE PRINCIPAL ---

export default function ArtistDetail() {
    const { name } = useParams();
    const navigate = useNavigate();
    const { playTrack } = usePlayer();
    const { isArtistSaved, toggleSaveArtist } = useUser();
    const containerRef = useRef(null);

    const [artistInfo, setArtistInfo] = useState(null);
    const [topAlbums, setTopAlbums] = useState([]);
    const [topTracks, setTopTracks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [retryKey, setRetryKey] = useState(0);
    const [playingTrackId, setPlayingTrackId] = useState(null);
    const [isScrolled, setIsScrolled] = useState(false);

    // Detectar scroll para el header sticky
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            setIsScrolled(container.scrollTop > 300);
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setLoadError(null);
            setArtistInfo(null);
            setTopTracks([]);
            setTopAlbums([]);
            const safeName = decodeURIComponent(name);

            try {
                // Resolver la identidad una sola vez. Tracks y álbumes deben usar
                // exactamente el mismo ID, nunca tres búsquedas independientes.
                const resolvedArtist = await getArtistInfo(safeName);
                if (!resolvedArtist) {
                    setArtistInfo(null);
                    setLoadError('No encontramos una coincidencia exacta para este artista.');
                    return;
                }
                setArtistInfo(resolvedArtist);

                const [tracksRes, albumsRes] = await Promise.allSettled([
                    artistGetTopTracks({ artist: resolvedArtist.id, limit: 10 }),
                    getArtistAlbums(resolvedArtist.id, 50)
                ]);

                // Top Tracks: Sin cambios, ya funciona correctamente
                if (tracksRes.status === 'fulfilled' && tracksRes.value?.toptracks?.track) {
                    setTopTracks(tracksRes.value.toptracks.track);
                }

                // ⭐ Álbumes: Ahora son los álbumes REALES del artista
                // Incluye recordType para diferenciar album/ep/single
                if (albumsRes.status === 'fulfilled' && albumsRes.value) {
                    // Filtrar solo álbumes con imagen y ordenar por fecha
                    const validAlbums = albumsRes.value
                        .filter(alb => alb.image)
                        .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
                    setTopAlbums(validAlbums);
                }

                const hasUsefulData = resolvedArtist || tracksRes.value?.toptracks?.track?.length || albumsRes.value?.length;
                if (!hasUsefulData) setLoadError('No encontramos información disponible para este artista.');

            } catch (e) {
                console.error("[ArtistDetail] Error cargando perfil del artista:", e);
                setArtistInfo(null);
                setLoadError('No pudimos cargar el artista. Revisa tu conexión e inténtalo otra vez.');
            } finally {
                setLoading(false);
            }
        };

        if (name) fetchData();
    }, [name, retryKey]);

    // ⭐ Función para reproducir una canción
    const handlePlayTrack = useCallback(async (track, forceShuffle = false) => {
        if (playingTrackId) return;

        const trackId = track.id || track.name;
        setPlayingTrackId(trackId);

        try {
            const trackImg = getBestImage(track.image) || getBestImage(artistInfo?.image) || DEFAULT_IMAGE;
            const trackArtist = track.artist?.name || track.artist || artistInfo?.name || name;
            const trackName = track.name;
            const trackDuration = track.duration ? parseInt(track.duration) : 0;

            const resolution = await fetchAudioUrl({
                ...track,
                artist: trackArtist,
                artistId: track.artistId || artistInfo?.id,
                duration: trackDuration,
            });
            const resolvedUrl = resolution.status === 'ok' ? resolution.audio?.url : null;
            const audioUrl = resolvedUrl || track.preview || null;

            if (audioUrl) {
                const artistQueue = topTracks.map(t => ({
                    id: t.id || t.name,
                    name: t.name,
                    artist: t.artist?.name || t.artist || artistInfo?.name || name,
                    artistId: t.artistId || artistInfo?.id || null,
                    image: getBestImage(t.image) || getBestImage(artistInfo?.image) || DEFAULT_IMAGE,
                    duration: t.duration ? parseInt(t.duration) : 0,
                    preview: t.preview,
                    album: t.album || 'Top Hits'
                }));

                playTrack({
                    id: trackId,
                    name: trackName,
                    artist: trackArtist,
                    artistId: track.artistId || artistInfo?.id || null,
                    image: trackImg,
                    duration: trackDuration,
                    url: audioUrl,
                    urlSource: resolvedUrl ? 'resolved' : 'preview',
                    urlResolvedAt: resolvedUrl ? Date.now() : null,
                    album: track.album || 'Top Hits'
                }, artistQueue, {
                    id: `artist-${artistInfo?.id || name}`,
                    type: 'artist',
                    name: artistInfo?.name || name,
                    autoExtend: false,
                }, forceShuffle);
            }
        } catch (e) {
            console.error("[ArtistDetail] Error reproduciendo:", e);
        } finally {
            setPlayingTrackId(null);
        }
    }, [playingTrackId, topTracks, artistInfo, name, playTrack]);

    const handlePlayArtist = useCallback(() => {
        if (topTracks.length > 0) {
            handlePlayTrack(topTracks[0]);
        }
    }, [topTracks, handlePlayTrack]);

    // --- RENDERIZADO ---

    if (loading) return <PageState variant="loading" title="Cargando artista" />;

    if (!artistInfo) return <PageState variant="error" title="Artista no encontrado" message={loadError} actionLabel="Reintentar" onAction={() => setRetryKey(key => key + 1)} secondaryLabel="Volver" onSecondary={() => navigate(-1)} />;

    const heroImage = getBestImage(artistInfo.image) || DEFAULT_IMAGE;
    const latestAlbum = topAlbums[0];

    return (
        <div className="artist-detail-apple" ref={containerRef}>
            {/* Sticky Header - Aparece al hacer scroll */}
            <header className={`artist-sticky-header ${isScrolled ? 'visible' : ''}`}>
                <button className="header-back-btn" onClick={() => navigate(-1)}>
                    <FaArrowLeft />
                </button>
                <span className="header-artist-name">{artistInfo.name}</span>
                <div className="header-actions">
                    <button
                        className={`header-action-btn ${isArtistSaved(artistInfo.name) ? 'saved' : ''}`}
                        onClick={() => toggleSaveArtist(artistInfo)}
                        title={isArtistSaved(artistInfo.name) ? 'Dejar de seguir' : 'Seguir artista'}
                    >
                        {isArtistSaved(artistInfo.name) ? <FaCheck /> : <FaPlus />}
                    </button>
                    <button className="header-action-btn"><FaEllipsisH /></button>
                </div>
            </header>

            {/* Floating Action Buttons (over hero) */}
            <div className="artist-nav-overlay">
                <button className="nav-btn-circle" onClick={() => navigate(-1)}>
                    <FaArrowLeft size={18} />
                </button>
                <div className="nav-right-actions">
                    <button
                        className={`nav-btn-circle follow-btn ${isArtistSaved(artistInfo.name) ? 'saved' : ''}`}
                        onClick={() => toggleSaveArtist(artistInfo)}
                        title={isArtistSaved(artistInfo.name) ? 'Dejar de seguir' : 'Seguir artista'}
                    >
                        {isArtistSaved(artistInfo.name) ? <FaCheck size={18} /> : <FaPlus size={18} />}
                    </button>
                    <button className="nav-btn-circle"><FaEllipsisH size={18} /></button>
                </div>
            </div>

            {/* 1. HERO SECTION - Imagen Inmersiva */}
            <section className="artist-hero-immersive">
                <img
                    src={heroImage}
                    alt={artistInfo.name}
                    className="artist-hero-image"
                    onError={(e) => { e.target.src = DEFAULT_IMAGE; }}
                />
                <div className="artist-hero-content">
                    <h1 className="artist-hero-name">{artistInfo.name}</h1>

                    {/* ✅ NUEVA: Barra de Acciones Prominente */}
                    <div className="artist-action-bar">
                        {/* Botón Play Principal */}
                        <button
                            className="artist-action-btn primary play-btn"
                            onClick={handlePlayArtist}
                            disabled={topTracks.length === 0}
                        >
                            <FaPlay size={16} />
                            <span>Reproducir</span>
                        </button>

                        {/* Botón Shuffle */}
                        <button
                            className="artist-action-btn secondary shuffle-btn"
                            onClick={() => {
                                if (topTracks.length > 0) {
                                    const randomTrack = topTracks[Math.floor(Math.random() * topTracks.length)];
                                    handlePlayTrack(randomTrack, true);
                                }
                            }}
                            disabled={topTracks.length === 0}
                        >
                            <FaRandom size={14} />
                        </button>

                        {/* Botón Añadir a Biblioteca */}
                        <button
                            className={`artist-action-btn secondary library-btn ${isArtistSaved(artistInfo.name) ? 'saved' : ''}`}
                            onClick={() => toggleSaveArtist(artistInfo)}
                            title={isArtistSaved(artistInfo.name) ? 'En tu biblioteca' : 'Añadir a biblioteca'}
                        >
                            {isArtistSaved(artistInfo.name) ? <FaCheck size={14} /> : <FaPlus size={14} />}
                        </button>
                    </div>
                </div>
            </section>

            {/* 2. CONTENIDO PRINCIPAL */}
            <main className="artist-main-content">

                {/* Latest Release */}
                {latestAlbum && (
                    <section className="latest-release-section">
                        <div
                            className="latest-release-card"
                            onClick={() => navigate(getAlbumPath(latestAlbum, artistInfo.name))}
                        >
                            <div className="latest-release-cover">
                                <img
                                    src={latestAlbum.image || DEFAULT_IMAGE}
                                    alt={latestAlbum.name}
                                    onError={(e) => { e.target.src = DEFAULT_IMAGE; }}
                                />
                            </div>
                            <div className="latest-release-info">
                                <span className="release-date">ÚLTIMO LANZAMIENTO</span>
                                <h3 className="release-title">{latestAlbum.name}</h3>
                                <span className="release-tracks">
                                    {latestAlbum.type || 'Álbum'}
                                    {latestAlbum.releaseDate && ` · ${new Date(latestAlbum.releaseDate).getFullYear()}`}
                                </span>
                            </div>
                        </div>
                    </section>
                )}

                {/* Top Canciones */}
                {topTracks.length > 0 && (
                    <section className="top-tracks-section">
                        <div className="section-header-row">
                            <h2 className="section-title-apple">Top canciones</h2>
                            <FaChevronRight className="section-chevron" />
                        </div>

                        <div className="tracks-list-apple">
                            {topTracks.map((track, idx) => {
                                const img = getBestImage(track.image) || getBestImage(artistInfo.image) || DEFAULT_IMAGE;
                                const isPlaying = playingTrackId === (track.id || track.name);

                                return (
                                    <div
                                        key={track.id || idx}
                                        className={`track-item-apple ${isPlaying ? 'loading' : ''}`}
                                        onClick={() => handlePlayTrack(track)}
                                    >
                                        <span className="track-number">{idx + 1}</span>
                                        <div className="track-cover-small">
                                            <img src={img} alt="" onError={(e) => e.target.src = DEFAULT_IMAGE} />
                                            {isPlaying && <div className="track-spinner-overlay"><div className="spinner-small" /></div>}
                                        </div>
                                        <div className="track-details">
                                            <span className="track-title-apple">{track.name}</span>
                                            <span className="track-album-apple">
                                                {track.album || artistInfo.name} · {formatCompactNumber(track.playcount || track.listeners)}
                                            </span>
                                        </div>
                                        <button
                                            className="track-menu-btn-apple"
                                            onClick={(e) => { e.stopPropagation(); }}
                                        >
                                            <FaEllipsisH size={16} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Discografía */}
                {topAlbums.length > 1 && (
                    <section className="discography-section">
                        <div className="section-header-row">
                            <h2 className="section-title-apple">Discografía</h2>
                            <FaChevronRight className="section-chevron" />
                        </div>

                        <div className="albums-scroll-row">
                            {topAlbums.slice(1).map((album, i) => {
                                const albSrc = album.image;
                                if (!albSrc) return null;
                                return (
                                    <div
                                        key={album.id || i}
                                        className="album-card-apple"
                                        onClick={() => navigate(getAlbumPath(album, artistInfo.name))}
                                    >
                                        <div className="album-cover-apple">
                                            <img src={albSrc} alt={album.name} loading="lazy" />
                                        </div>
                                        <span className="album-title-apple">{album.name}</span>
                                        <span className="album-type-apple">
                                            {album.type || 'Álbum'}
                                            {album.releaseDate && ` · ${new Date(album.releaseDate).getFullYear()}`}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

            </main>
        </div>
    );
}
