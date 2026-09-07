import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaPlay, FaChevronRight, FaEllipsisH, FaArrowLeft, FaCheck, FaPlus, FaRandom, FaBroadcastTower } from 'react-icons/fa';

import { usePlayerActions } from '../../context/playerContext';
import { useUser } from '../../context/userContext';
import { useFeedback } from '../../context/feedbackContext';
import TrackArtistsModal from '../../components/player/TrackArtistsModal';
import { getTrackArtists, getArtistPath } from '../../services/artistIdentity';
import PageState from '../../components/shared/PageState';
import { getAlbumPath } from '../../services/albumNavigation';
import { getArtworkImageProps, getBestArtworkUrl } from '../../services/imageQuality';
import {
    getArtistInfo,
    getArtistAlbums,
    artistGetTopTracks,
    fetchAudioUrl
} from '../../services/unifiedService';
import { buildRadioQueue, getRadioTrackKey, selectArtistRadioSeed } from '../../services/radioService';
import { groupDiscography } from '../../services/discography';

import '../../shared/globalStyles.css';
import './artistDetail.css';

// --- HELPERS ---

const getBestImage = (imageSource) => {
    return getBestArtworkUrl(imageSource) || null;
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

const DiscographyGroup = ({ title, releases, onSelect }) => {
    if (!releases.length) return null;

    return (
        <section className="discography-group" aria-label={title}>
            <div className="discography-group-heading">
                <h2 className="section-title-apple">{title}</h2>
                <span className="discography-count">{releases.length}</span>
            </div>
            <div className="discography-grid">
                {releases.map((release, index) => {
                    const artwork = getBestArtworkUrl(release);
                    if (!artwork) return null;
                    const year = release.releaseDate ? new Date(release.releaseDate).getFullYear() : null;
                    const trackCount = Number(release.trackCount || release.nb_tracks || 0);

                    return (
                        <button
                            type="button"
                            key={release.id || `${release.name}-${index}`}
                            className="album-card-apple"
                            onClick={() => onSelect(release)}
                        >
                            <span className="album-cover-apple">
                                <img {...getArtworkImageProps(release, { size: 500, sizes: '(max-width: 768px) 42vw, 180px' })} alt={release.name} loading="lazy" />
                            </span>
                            <span className="album-title-apple">{release.name}</span>
                            <span className="album-type-apple">
                                {[year, trackCount ? `${trackCount} canciones` : null].filter(Boolean).join(' · ')}
                            </span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
};

// --- COMPONENTE PRINCIPAL ---

export default function ArtistDetail() {
    const { name } = useParams();
    const navigate = useNavigate();
    const { playTrack, appendToQueue } = usePlayerActions();
    const { isArtistSaved, toggleSaveArtist } = useUser();
    const { notify } = useFeedback();
    const containerRef = useRef(null);
    const artistRadioRequestRef = useRef(0);
    const artistRadioSeedHistoryRef = useRef(new Map());

    const [collaborators, setCollaborators] = useState([]);
    const [artistInfo, setArtistInfo] = useState(null);
    const [topAlbums, setTopAlbums] = useState([]);
    const [topTracks, setTopTracks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [retryKey, setRetryKey] = useState(0);
    const [playingTrackId, setPlayingTrackId] = useState(null);
    const [isScrolled, setIsScrolled] = useState(false);
    const [isStartingRadio, setIsStartingRadio] = useState(false);

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
            setCollaborators([]);
            setArtistInfo(null);
            setTopTracks([]);
            setTopAlbums([]);
            const safeName = name;

            try {
                // Resolver la identidad una sola vez. Tracks y álbumes deben usar
                // exactamente el mismo ID, nunca tres búsquedas independientes.
                const resolvedArtist = await getArtistInfo(safeName);
                if (!resolvedArtist) {
                    const credits = getTrackArtists(safeName);
                    if (credits.length > 1) setCollaborators(credits);
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
        artistRadioRequestRef.current += 1;
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
            }, { bypassNegativeCache: true });
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
                    explicit: t.explicit ?? t.explicit_lyrics ?? t.isExplicit,
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
                    urlExpiresAt: resolution.audio?.expiresAt,
                    explicit: track.explicit ?? track.explicit_lyrics ?? track.isExplicit,
                    urlQualityMode: resolvedUrl ? resolution.audio?.qualityMode : null,
                    audioQuality: resolvedUrl ? resolution.audio?.quality : null,
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

    const handlePlayArtistRadio = useCallback(async () => {
        const artistName = artistInfo?.name || name;
        if (!artistName || isStartingRadio) return;

        const requestId = ++artistRadioRequestRef.current;
        setIsStartingRadio(true);

        try {
            // Pedir más temas que los diez mostrados evita que la estación siempre
            // arranque con el mismo éxito popular del artista.
            const seedResponse = await artistGetTopTracks({
                artist: artistInfo?.id || artistName,
                limit: 25,
            }).catch(() => null);
            if (requestId !== artistRadioRequestRef.current) return;

            const historyKey = artistName.toLocaleLowerCase('es');
            const recentSeeds = artistRadioSeedHistoryRef.current.get(historyKey) || [];
            const seedTrack = selectArtistRadioSeed(
                seedResponse?.toptracks?.track?.length ? seedResponse.toptracks.track : topTracks,
                { recentKeys: recentSeeds },
            );

            if (!seedTrack) {
                notify('No encontramos canciones disponibles para esta radio.', { type: 'error' });
                return;
            }

            const seedKey = getRadioTrackKey(seedTrack);
            artistRadioSeedHistoryRef.current.set(
                historyKey,
                [seedKey, ...recentSeeds.filter((key) => key !== seedKey)].slice(0, 24),
            );

            // La reproducción empieza antes de buscar artistas relacionados.
            const queueSessionId = playTrack(seedTrack, [seedTrack], {
                id: `artist-radio-${artistInfo?.id || artistName}`,
                type: 'radio',
                name: `Radio de ${artistName}`,
                autoExtend: true,
                seedTrack,
                stationArtist: artistName,
            });
            setIsStartingRadio(false);
            notify(`Radio de ${artistName} iniciada. Completando la estación...`);

            try {
                const additionalTracks = await buildRadioQueue({
                    seedTrack,
                    artistName,
                    contextTracks: [],
                    existingQueue: [seedTrack],
                    targetSize: 31,
                    includeSeed: false,
                });
                if (requestId !== artistRadioRequestRef.current) return;

                appendToQueue(additionalTracks, {
                    sessionId: queueSessionId,
                    silent: true,
                    maxSize: 200,
                });
            } catch (error) {
                console.warn('[ArtistDetail] No se pudo ampliar la radio:', error?.message);
                if (requestId === artistRadioRequestRef.current) {
                    notify(`Radio de ${artistName} iniciada con la música disponible.`, { type: 'warning' });
                }
            }
        } finally {
            if (requestId === artistRadioRequestRef.current) setIsStartingRadio(false);
        }
    }, [artistInfo, name, isStartingRadio, topTracks, playTrack, appendToQueue, notify]);

    // --- RENDERIZADO ---

    if (loading) return <PageState variant="loading" title="Cargando artista" />;

    if (collaborators.length > 1) return <TrackArtistsModal artists={collaborators}
        onClose={() => navigate('/feed', { replace: true })}
        onSelect={artist => navigate(getArtistPath(artist), { replace: true })} />;

    if (!artistInfo) return <PageState variant="error" title="Artista no encontrado" message={loadError} actionLabel="Reintentar" onAction={() => setRetryKey(key => key + 1)} secondaryLabel="Volver" onSecondary={() => navigate(-1)} />;

    const latestAlbum = topAlbums[0];
    // El último lanzamiento ya tiene una tarjeta propia; el resto se presenta
    // separado por formato y conserva el orden por fecha de la consulta.
    const discography = groupDiscography(topAlbums.slice(1));

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
                    {...getArtworkImageProps(artistInfo, { fallback: DEFAULT_IMAGE, size: 1000, sizes: '100vw' })}
                    alt={artistInfo.name}
                    className="artist-hero-image"
                    fetchPriority="high"
                    onError={(e) => { e.currentTarget.srcset = ''; e.currentTarget.src = DEFAULT_IMAGE; }}
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

                        {/* Radio: mezcla canciones del artista y artistas relacionados. */}
                        <button
                            className="artist-action-btn radio-btn"
                            onClick={handlePlayArtistRadio}
                            disabled={topTracks.length === 0 || isStartingRadio}
                            aria-label={`Reproducir radio de ${artistInfo.name}`}
                        >
                            <FaBroadcastTower size={15} />
                            <span>{isStartingRadio ? 'Creando radio…' : 'Radio'}</span>
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
                                    {...getArtworkImageProps(latestAlbum, { fallback: DEFAULT_IMAGE, size: 500, sizes: '128px' })}
                                    alt={latestAlbum.name}
                                    loading="lazy"
                                    onError={(e) => { e.currentTarget.srcset = ''; e.currentTarget.src = DEFAULT_IMAGE; }}
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
                                            <img {...getArtworkImageProps({ image_xl: img }, { fallback: DEFAULT_IMAGE, size: 250, maxSize: 500, sizes: '48px' })} alt="" loading="lazy" onError={(e) => { e.currentTarget.srcset = ''; e.currentTarget.src = DEFAULT_IMAGE; }} />
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
                    <section className="discography-section" aria-label="Discografía">
                        <div className="section-header-row discography-header">
                            <h2 className="section-title-apple">Discografía</h2>
                        </div>
                        <DiscographyGroup title="Álbumes" releases={discography.album} onSelect={(release) => navigate(getAlbumPath(release, artistInfo.name))} />
                        <DiscographyGroup title="EPs" releases={discography.ep} onSelect={(release) => navigate(getAlbumPath(release, artistInfo.name))} />
                        <DiscographyGroup title="Singles" releases={discography.single} onSelect={(release) => navigate(getAlbumPath(release, artistInfo.name))} />
                    </section>
                )}

            </main>
        </div>
    );
}
