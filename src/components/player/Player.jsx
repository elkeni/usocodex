/**
 * ================================================
 * PLAYER.JSX - YouTube Music Clone Component
 * ================================================
 * Reproductor de música mobile-first que clona la experiencia
 * del fullscreen player de YouTube Music.
 * 
 * Estados:
 * - dock: barra inferior minimizada (siempre visible si hay track)
 * - fullscreen: overlay vertical completo con scroll
 */

import {
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
    memo
} from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayer } from '../../context/playerContext';
import { useUser } from '../../context/userContext';
import { fetchLyrics, getArtistInfo, getAlbumDetails, artistGetTopTracks } from '../../services/unifiedService';

import './Player.css';

// ============================================================================
// ICONOS SVG - Inline para evitar dependencias
// ============================================================================
const Icons = {
    Play: () => (
        <svg viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
        </svg>
    ),
    Pause: () => (
        <svg viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
        </svg>
    ),
    Next: () => (
        <svg viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
        </svg>
    ),
    Prev: () => (
        <svg viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
        </svg>
    ),
    Shuffle: () => (
        <svg viewBox="0 0 24 24">
            <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
        </svg>
    ),
    Repeat: () => (
        <svg viewBox="0 0 24 24">
            <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
        </svg>
    ),
    RepeatOne: () => (
        <svg viewBox="0 0 24 24">
            <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z" />
        </svg>
    ),
    ChevronDown: () => (
        <svg viewBox="0 0 24 24">
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
        </svg>
    ),
    ChevronRight: () => (
        <svg viewBox="0 0 24 24">
            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
        </svg>
    ),
    MoreVert: () => (
        <svg viewBox="0 0 24 24">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
    ),
    Heart: () => (
        <svg viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
    ),
    HeartOutline: () => (
        <svg viewBox="0 0 24 24">
            <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" />
        </svg>
    ),
    Queue: () => (
        <svg viewBox="0 0 24 24">
            <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
        </svg>
    ),
    Close: () => (
        <svg viewBox="0 0 24 24">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
    ),
    MusicNote: () => (
        <svg viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
    ),
    Equalizer: () => (
        <svg viewBox="0 0 24 24">
            <path d="M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z" />
        </svg>
    ),
    PlaylistAdd: () => (
        <svg viewBox="0 0 24 24">
            <path d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z" />
        </svg>
    ),
    Person: () => (
        <svg viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
    ),
    Album: () => (
        <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
        </svg>
    ),
    Check: () => (
        <svg viewBox="0 0 24 24">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
    ),
    TrendingUp: () => (
        <svg viewBox="0 0 24 24">
            <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-4 4 4 9-9L20 6z" />
        </svg>
    ),
    Globe: () => (
        <svg viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
        </svg>
    ),
    Maximize: () => (
        <svg viewBox="0 0 24 24">
            <path d="M15 3l2.3 2.3-2.89 2.87 1.42 1.42L18.7 6.7 21 9V3zM3 9l2.3-2.3 2.87 2.89 1.42-1.42L6.7 5.3 9 3H3zm6 12l-2.3-2.3 2.89-2.87-1.42-1.42L5.3 17.3 3 15v6h6zm12-6l-2.3 2.3-2.87-2.89-1.42 1.42L17.3 18.7 15 21h6z" />
        </svg>
    ),

};

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Formatea segundos a mm:ss
 */
const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Obtiene la URL de imagen del track
 */
const getTrackImage = (track) => {
    if (!track) return null;
    if (typeof track.image === 'string') return track.image;
    if (Array.isArray(track.image)) {
        const large = track.image.find(img => img.size === 'extralarge' || img.size === 'large');
        return large?.['#text'] || track.image[track.image.length - 1]?.['#text'];
    }
    if (track.image?.url) return track.image.url;
    if (track.cover) return typeof track.cover === 'string' ? track.cover : track.cover.url;
    if (track.albumArt) return track.albumArt;
    return null;
};

/**
 * Obtiene el título del track
 */
const getTrackTitle = (track) => {
    return track?.name || track?.title;
};

/**
 * Obtiene el artista del track
 */
const getTrackArtist = (track) => {
    return track?.artist;
};

/**
 * Parsea letras LRC sincronizadas
 */
const parseSyncedLyrics = (lrc) => {
    if (!lrc) return [];
    const lines = [];
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
    let match;
    while ((match = regex.exec(lrc)) !== null) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const ms = parseInt(match[3].padEnd(3, '0'), 10);
        const time = mins * 60 + secs + ms / 1000;
        const text = match[4].trim();
        if (text) lines.push({ time, text });
    }
    return lines.sort((a, b) => a.time - b.time);
};

/**
 * Calcula la fracción de progreso basada en el evento de puntero
 */
const calculateSeekFraction = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let clientX;

    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
    } else {
        clientX = e.clientX;
    }

    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
};

// ============================================================================
// SUBCOMPONENTES MEMOIZADOS
// ============================================================================

/**
 * Línea de letra individual
 */
const LyricLine = memo(({ line, isActive, isPast, onClick }) => {
    const className = `ytm-lyrics__line${isActive ? ' active' : ''}${isPast ? ' past' : ''}`;
    return (
        <p className={className} onClick={onClick}>
            {line.text}
        </p>
    );
});

/**
 * Item de cola
 */
const QueueItem = memo(({ track, isCurrent, onClick }) => {
    const image = getTrackImage(track);
    const title = getTrackTitle(track) || 'Sin título';
    const artist = getTrackArtist(track) || 'Artista desconocido';

    return (
        <div
            className={`ytm-queue-item${isCurrent ? ' current' : ''}`}
            onClick={onClick}
        >
            <div className="ytm-queue-item__artwork">
                {image ? (
                    <img src={image} alt="" loading="lazy" />
                ) : (
                    <Icons.MusicNote />
                )}
            </div>
            <div className="ytm-queue-item__info">
                <div className="ytm-queue-item__title">{title}</div>
                <div className="ytm-queue-item__artist">{artist}</div>
            </div>
            {isCurrent && (
                <div className="ytm-queue-item__indicator">
                    <Icons.Equalizer />
                </div>
            )}
        </div>
    );
});

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function Player() {
    const navigate = useNavigate();

    // ========================================================================
    // CONTEXTO DEL PLAYER
    // ========================================================================
    const {
        currentTrack,
        isPlaying,
        isLoading,
        played,
        duration,
        queue,
        currentIndex,
        isShuffle,
        repeatMode,
        togglePlay,
        next,
        prev,
        seekTo,
        toggleShuffle,
        toggleRepeat,
        playTrack
    } = usePlayer();

    // Contexto de Usuario (Favoritos y Playlists)
    const { toggleFavorite, isFavorite, playlists, addTrackToPlaylist } = useUser(); // Added playlists and addTrackToPlaylist

    // ========================================================================
    // ESTADO LOCAL
    // ========================================================================
    const [playerView, setPlayerView] = useState('dock'); // 'dock' | 'fullscreen'
    const [isQueueOpen, setIsQueueOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [menuView, setMenuView] = useState('main'); // 'main' | 'playlists'
    const isLiked = isFavorite(currentTrack);
    const [isSeeking, setIsSeeking] = useState(false); // State for seeking
    const [seekValue, setSeekValue] = useState(0);

    // Letras
    const [lyrics, setLyrics] = useState(null);
    const [lyricsLoading, setLyricsLoading] = useState(false);
    const [activeLyricIndex, setActiveLyricIndex] = useState(-1);

    // Artista
    const [artistInfo, setArtistInfo] = useState(null);
    const [artistTracks, setArtistTracks] = useState([]);
    // Creditos (Album details)
    const [credits, setCredits] = useState(null);

    // Gestos de drawer
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState(0);
    const [isArtistSheetOpen, setIsArtistSheetOpen] = useState(false);
    const [isLyricsOpen, setIsLyricsOpen] = useState(false);
    const dragStartY = useRef(0);
    const fullscreenRef = useRef(null);
    const lyricsContainerRef = useRef(null);
    const lyricsOverlayRef = useRef(null);

    // ========================================================================
    // DATOS DERIVADOS
    // ========================================================================
    const trackImage = useMemo(() => getTrackImage(currentTrack), [currentTrack]);
    const trackTitle = getTrackTitle(currentTrack) || 'Sin título';
    const trackArtist = getTrackArtist(currentTrack) || 'Artista desconocido';
    const trackAlbum = currentTrack?.album || '';
    const currentTimeSeconds = played * duration;
    const progressPercent = duration > 0 ? (played * 100) : 0;

    // Letras parseadas
    const parsedLyrics = useMemo(() => {
        if (lyrics?.syncedLyrics) {
            return parseSyncedLyrics(lyrics.syncedLyrics);
        }
        if (lyrics?.plainLyrics) {
            return lyrics.plainLyrics.split('\n')
                .filter(line => line.trim())
                .map((text, i) => ({ time: i, text, isPlain: true }));
        }
        return [];
    }, [lyrics]);

    const hasSyncedLyrics = parsedLyrics.length > 0 && !parsedLyrics[0]?.isPlain;

    // ========================================================================
    // EFECTOS
    // ========================================================================

    // Cargar letras cuando cambia el track
    useEffect(() => {
        if (!currentTrack) {
            setLyrics(null);
            return;
        }

        const artist = getTrackArtist(currentTrack);
        const title = getTrackTitle(currentTrack);

        if (!artist || !title) return;

        setLyricsLoading(true);
        setLyrics(null);
        setActiveLyricIndex(-1);

        fetchLyrics(artist, title)
            .then(data => {
                if (data) setLyrics(data);
            })
            .catch(() => { })
            .finally(() => setLyricsLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentTrack?.id, currentTrack?.artist, currentTrack?.name, currentTrack?.title]);

    // Cargar info del artista
    useEffect(() => {
        if (!currentTrack?.artist) {
            setArtistInfo(null);
            return;
        }

        getArtistInfo(currentTrack.artist)
            .then(info => {
                if (info) setArtistInfo(info);
            })
            .catch(() => { });
    }, [currentTrack?.artist]);

    // Cargar More About Artist (Top Tracks with Variety)
    useEffect(() => {
        if (!currentTrack?.artist) {
            setArtistTracks([]);
            return;
        }

        // Pedimos más canciones (20) para tener de donde elegir y variar
        artistGetTopTracks({ artist: currentTrack.artist, limit: 20 })
            .then(data => {
                const tracks = data?.toptracks?.track || [];
                // Filtrar el track actual
                const filtered = tracks.filter(t => t.name?.toLowerCase() !== currentTrack.name?.toLowerCase());

                // Shuffle simple para aleatorizar el orden
                const shuffled = filtered.sort(() => 0.5 - Math.random());

                // Tomamos 5 al azar
                setArtistTracks(shuffled.slice(0, 5));
            })
            .catch(() => setArtistTracks([]));
    }, [currentTrack?.artist, currentTrack?.name]); // Se ejecuta al cambiar la canción

    // Cargar creditos (info del album)
    useEffect(() => {
        if (!currentTrack?.album || !currentTrack?.artist) {
            setCredits(null);
            return;
        }

        setCredits(null);
        getAlbumDetails(currentTrack.album, currentTrack.artist)
            .then(data => {
                if (data) setCredits(data);
            })
            .catch(() => { });
    }, [currentTrack?.album, currentTrack?.artist]);

    // Sincronizar letras con el tiempo actual
    useEffect(() => {
        if (!hasSyncedLyrics || !parsedLyrics.length) return;

        const currentTime = played * duration;
        let newIndex = -1;

        for (let i = parsedLyrics.length - 1; i >= 0; i--) {
            if (parsedLyrics[i].time <= currentTime + 0.3) {
                newIndex = i;
                break;
            }
        }

        if (newIndex !== activeLyricIndex) {
            setActiveLyricIndex(newIndex);

            // Auto-scroll logic helper
            const scrollToActive = (ref, centerRatio = 3) => {
                if (ref.current && newIndex >= 0) {
                    const container = ref.current;
                    if (newIndex === 0) {
                        container.scrollTo({ top: 0, behavior: activeLyricIndex === -1 ? 'auto' : 'smooth' });
                    } else {
                        const activeLine = container.children[newIndex];
                        if (activeLine) {
                            const containerRect = container.getBoundingClientRect();
                            const lineRect = activeLine.getBoundingClientRect();
                            // centerRatio 3 = top 1/3, centerRatio 2 = center
                            const offset = lineRect.top - containerRect.top - (containerRect.height / centerRatio);
                            container.scrollBy({ top: offset, behavior: activeLyricIndex === -1 ? 'auto' : 'smooth' });
                        }
                    }
                }
            };

            scrollToActive(lyricsContainerRef, 3); // Dock: Top 1/3
            scrollToActive(lyricsOverlayRef, 2);   // Fullscreen: Center
        }
    }, [played, duration, parsedLyrics, hasSyncedLyrics, activeLyricIndex]);

    // Bloquear scroll del body cuando fullscreen está abierto
    useEffect(() => {
        if (playerView === 'fullscreen') {
            document.body.classList.add('ytm-fullscreen-open');
        } else {
            document.body.classList.remove('ytm-fullscreen-open');
        }
        return () => document.body.classList.remove('ytm-fullscreen-open');
    }, [playerView]);

    // ========================================================================
    // HANDLERS
    // ========================================================================

    const openFullscreen = useCallback(() => {
        setPlayerView('fullscreen');
    }, []);

    const closeFullscreen = useCallback(() => {
        setPlayerView('dock');
        setIsQueueOpen(false);
    }, []);

    const handleTogglePlay = useCallback((e) => {
        e.stopPropagation();
        togglePlay();
    }, [togglePlay]);

    const handleNext = useCallback((e) => {
        e.stopPropagation();
        next();
    }, [next]);

    const handlePrev = useCallback((e) => {
        e.stopPropagation();
        prev();
    }, [prev]);

    const handleToggleShuffle = useCallback(() => {
        toggleShuffle();
    }, [toggleShuffle]);

    const handleToggleRepeat = useCallback(() => {
        toggleRepeat();
    }, [toggleRepeat]);

    const handleLike = useCallback(() => {
        if (currentTrack) toggleFavorite(currentTrack);
    }, [currentTrack, toggleFavorite]);

    const handleMenuOpen = useCallback(() => {
        setMenuView('main'); // Reset view on open
        setIsMenuOpen(true);
    }, []);
    const handleMenuClose = useCallback(() => setIsMenuOpen(false), []);

    const handleViewArtist = useCallback(() => {
        if (currentTrack?.artist) {
            navigate(`/artist/${encodeURIComponent(currentTrack.artist)}`);
            closeFullscreen();
            handleMenuClose();
        }
    }, [currentTrack, navigate, closeFullscreen, handleMenuClose]);

    const handleViewAlbum = useCallback(() => {
        if (currentTrack?.artist && currentTrack?.album) {
            navigate(`/album/${encodeURIComponent(currentTrack.artist)}/${encodeURIComponent(currentTrack.album)}`);
            closeFullscreen();
            handleMenuClose();
        }
    }, [currentTrack, navigate, closeFullscreen, handleMenuClose]);

    const handlePlayMoreAbout = useCallback((track) => {
        playTrack(track, artistTracks);
    }, [playTrack, artistTracks]);

    const handleAddToPlaylist = useCallback(() => {
        setMenuView('playlists');
    }, []);

    const handleSelectPlaylist = useCallback((playlist) => {
        if (currentTrack) {
            addTrackToPlaylist(playlist.id, currentTrack);
            alert(`Añadida a ${playlist.name}`); // Simple feedback for now
            handleMenuClose();
        }
    }, [currentTrack, addTrackToPlaylist, handleMenuClose]);

    const handleQueueOpen = useCallback(() => {
        setIsQueueOpen(true);
    }, []);

    const handleQueueClose = useCallback(() => {
        setIsQueueOpen(false);
    }, []);

    const handleQueueItemClick = useCallback((track, index) => {
        playTrack(track, queue);
        setIsQueueOpen(false);
    }, [playTrack, queue]);

    // Progress bar seeking
    const handleProgressStart = useCallback((e) => {
        setIsSeeking(true);
        setIsSeeking(true);
        const fraction = calculateSeekFraction(e);
        setSeekValue(fraction * 100);
    }, []);

    const handleProgressMove = useCallback((e) => {
        if (!isSeeking) return;
        const fraction = calculateSeekFraction(e);
        setSeekValue(fraction * 100);
    }, [isSeeking]);

    const handleProgressEnd = useCallback((e) => {
        if (!isSeeking) return;
        const fraction = calculateSeekFraction(e);
        seekTo(fraction);
        setIsSeeking(false);
    }, [isSeeking, seekTo]);

    // Drawer gestures (swipe down to close)
    const handleDragStart = useCallback((e) => {
        // Solo iniciar drag desde el header o hero
        const target = e.target;
        const isScrollable = target.closest('.ytm-scroll');
        const scrollEl = fullscreenRef.current?.querySelector('.ytm-scroll');

        // Si el scroll está en top, permitir drag
        if (isScrollable && scrollEl && scrollEl.scrollTop > 5) {
            return;
        }

        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        dragStartY.current = clientY;
        setIsDragging(true);
    }, []);

    const handleDragMove = useCallback((e) => {
        if (!isDragging) return;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const delta = clientY - dragStartY.current;

        // Solo permitir drag hacia abajo
        if (delta > 0) {
            setDragOffset(delta);
            if (fullscreenRef.current) {
                fullscreenRef.current.style.transform = `translateY(${delta}px)`;
            }
        }
    }, [isDragging]);

    const handleDragEnd = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);

        // Si arrastró más de 100px, cerrar
        if (dragOffset > 100) {
            closeFullscreen();
        }

        // Reset
        if (fullscreenRef.current) {
            fullscreenRef.current.style.transform = '';
        }
        setDragOffset(0);
    }, [isDragging, dragOffset, closeFullscreen]);

    const handleLyricClick = useCallback((time) => {
        if (hasSyncedLyrics && duration > 0) {
            const fraction = time / duration;
            seekTo(fraction);
        }
    }, [hasSyncedLyrics, duration, seekTo]);

    // ========================================================================
    // RENDER CONDITIONS
    // ========================================================================

    // No renderizar si no hay track
    if (!currentTrack) return null;

    const displayProgress = isSeeking ? seekValue : progressPercent;
    const displayTime = isSeeking ? (seekValue / 100) * duration : currentTimeSeconds;

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <>
            {/* ============================================================
                DOCK - Barra inferior minimizada
                ============================================================ */}
            <div className="ytm-dock" onClick={openFullscreen}>
                <div className="ytm-dock__artwork">
                    {trackImage ? (
                        <img src={trackImage} alt="" />
                    ) : (
                        <Icons.MusicNote />
                    )}
                </div>

                <div className="ytm-dock__info">
                    <div className="ytm-dock__title">{trackTitle}</div>
                    <div className="ytm-dock__artist">{trackArtist}</div>
                </div>

                <div className="ytm-dock__controls">
                    <button
                        className="ytm-dock__btn"
                        onClick={handleTogglePlay}
                        aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                    >
                        {isLoading ? (
                            <span className="ytm-dock__spinner" />
                        ) : isPlaying ? (
                            <Icons.Pause />
                        ) : (
                            <Icons.Play />
                        )}
                    </button>

                    <button
                        className="ytm-dock__btn"
                        onClick={handleNext}
                        aria-label="Siguiente"
                    >
                        <Icons.Next />
                    </button>
                </div>
            </div>

            {/* ============================================================
                FULLSCREEN - Drawer vertical completo
                ============================================================ */}
            <div
                ref={fullscreenRef}
                className={`ytm-fullscreen${playerView === 'fullscreen' ? ' open' : ''}${isDragging ? ' dragging' : ''}`}
                onTouchStart={handleDragStart}
                onTouchMove={handleDragMove}
                onTouchEnd={handleDragEnd}
                onMouseDown={handleDragStart}
                onMouseMove={handleDragMove}
                onMouseUp={handleDragEnd}
                onMouseLeave={handleDragEnd}
            >
                {/* Header */}
                <header className="ytm-header">
                    <button
                        className="ytm-header__btn"
                        onClick={closeFullscreen}
                        aria-label="Cerrar"
                    >
                        <Icons.ChevronDown />
                    </button>

                    <span className="ytm-header__title">REPRODUCIENDO</span>

                    <button
                        className="ytm-header__btn"
                        onClick={handleMenuOpen}
                        aria-label="Más opciones"
                    >
                        <Icons.MoreVert />
                    </button>
                </header>

                {/* Scrollable Content */}
                <div className="ytm-scroll">
                    {/* Hero: Artwork + Metadata */}
                    <section className="ytm-hero">
                        <div
                            className="ytm-hero-ambient"
                            style={{ '--track-image': `url(${trackImage || ''})` }}
                        />
                        <div className="ytm-artwork">
                            {trackImage ? (
                                <img src={trackImage} alt="" />
                            ) : (
                                <Icons.MusicNote />
                            )}
                        </div>

                        <div className="ytm-meta">
                            <div className="ytm-meta__text">
                                <h1 className="ytm-meta__title">{trackTitle}</h1>
                                <p className="ytm-meta__artist">{trackArtist}</p>
                            </div>

                            <button
                                className={`ytm-meta__like${isLiked ? ' active' : ''}`}
                                onClick={handleLike}
                                aria-label={isLiked ? 'Quitar me gusta' : 'Me gusta'}
                            >
                                {isLiked ? <Icons.Heart /> : <Icons.HeartOutline />}
                            </button>
                        </div>
                    </section>

                    {/* Progress Bar */}
                    <div className="ytm-progress">
                        <div
                            className={`ytm-progress__track${isSeeking ? ' active' : ''}`}
                            onMouseDown={handleProgressStart}
                            onMouseMove={handleProgressMove}
                            onMouseUp={handleProgressEnd}
                            onMouseLeave={() => isSeeking && handleProgressEnd({ clientX: 0 })}
                            onTouchStart={handleProgressStart}
                            onTouchMove={handleProgressMove}
                            onTouchEnd={handleProgressEnd}
                        >
                            <div className="ytm-progress__bg">
                                <div
                                    className="ytm-progress__fill"
                                    style={{ width: `${displayProgress}%` }}
                                />
                            </div>
                            <div
                                className="ytm-progress__thumb"
                                style={{ left: `${displayProgress}%` }}
                            />
                        </div>

                        <div className="ytm-progress__times">
                            <span className="ytm-progress__time">
                                {formatTime(displayTime)}
                            </span>
                            <span className="ytm-progress__time">
                                {formatTime(duration)}
                            </span>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="ytm-controls">
                        <button
                            className={`ytm-ctrl-btn${isShuffle ? ' active' : ''}`}
                            onClick={handleToggleShuffle}
                            aria-label="Aleatorio"
                        >
                            <Icons.Shuffle />
                        </button>

                        <button
                            className="ytm-ctrl-btn ytm-ctrl-btn--nav"
                            onClick={handlePrev}
                            aria-label="Anterior"
                        >
                            <Icons.Prev />
                        </button>

                        <button
                            className="ytm-play-btn"
                            onClick={handleTogglePlay}
                            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                        >
                            {isLoading ? (
                                <span className="ytm-spinner" />
                            ) : isPlaying ? (
                                <Icons.Pause />
                            ) : (
                                <Icons.Play />
                            )}
                        </button>

                        <button
                            className="ytm-ctrl-btn ytm-ctrl-btn--nav"
                            onClick={handleNext}
                            aria-label="Siguiente"
                        >
                            <Icons.Next />
                        </button>

                        <button
                            className={`ytm-ctrl-btn${repeatMode > 0 ? ' active' : ''}`}
                            onClick={handleToggleRepeat}
                            aria-label="Repetir"
                        >
                            {repeatMode === 2 ? <Icons.RepeatOne /> : <Icons.Repeat />}
                        </button>
                    </div>

                    {/* Lyrics Section */}
                    <section className="ytm-lyrics">
                        <div className="ytm-lyrics__header">
                            <div>
                                <h2 className="ytm-lyrics__title">Letra</h2>
                                {hasSyncedLyrics && (
                                    <span className="ytm-lyrics__source">Sincronizada</span>
                                )}
                            </div>
                            <button
                                className="ytm-lyrics__expand-btn"
                                onClick={() => setIsLyricsOpen(true)}
                                aria-label="Pantalla completa"
                            >
                                <Icons.Maximize />
                            </button>
                        </div>

                        {lyricsLoading ? (
                            <div className="ytm-lyrics__loading">
                                <span className="ytm-spinner" />
                            </div>
                        ) : parsedLyrics.length > 0 ? (
                            <div
                                className="ytm-lyrics__content"
                                ref={lyricsContainerRef}
                            >
                                {parsedLyrics.map((line, index) => (
                                    <LyricLine
                                        key={index}
                                        line={line}
                                        isActive={index === activeLyricIndex}
                                        isPast={hasSyncedLyrics && index < activeLyricIndex}
                                        onClick={() => handleLyricClick(line.time)}
                                    />
                                ))}
                            </div>
                        ) : lyrics?.instrumental ? (
                            <p className="ytm-lyrics__empty">🎵 Instrumental</p>
                        ) : (
                            <p className="ytm-lyrics__empty">Letra no disponible</p>
                        )}
                    </section>

                    {/* About Artist */}
                    {/* About Artist */}
                    {artistInfo && (
                        <section
                            className="ytm-about"
                            onClick={() => setIsArtistSheetOpen(true)}
                        >
                            <div className="ytm-about__img">
                                {artistInfo.image ? (
                                    <img src={artistInfo.image} alt="" />
                                ) : (
                                    <Icons.MusicNote />
                                )}
                            </div>

                            <div className="ytm-about__text">
                                <p className="ytm-about__label">Acerca del artista</p>
                                <p className="ytm-about__name">{artistInfo.name}</p>
                            </div>

                            <div className="ytm-about__arrow">
                                <Icons.ChevronRight />
                            </div>
                        </section>
                    )}

                    {/* More About Artist (Top Tracks) */}
                    {artistTracks.length > 0 && (
                        <section className="ytm-moreaboutartist">
                            <h3 className="ytm-moreaboutartist__title">Más de {trackArtist}</h3>
                            <div className="ytm-moreaboutartist__list">
                                {artistTracks.map((track, i) => (
                                    <div
                                        key={track.id || i}
                                        className="ytm-moreaboutartist__item"
                                        onClick={() => handlePlayMoreAbout(track)}
                                    >
                                        <div className="ytm-moreaboutartist__img">
                                            <img src={getTrackImage(track) || ''} alt="" loading="lazy" />
                                        </div>
                                        <div className="ytm-moreaboutartist__info">
                                            <div className="ytm-moreaboutartist__track">{track.name}</div>
                                            <div className="ytm-moreaboutartist__album">{track.album?.title || track.album || 'Sencillo'}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Credits */}
                    {/* Credits */}
                    <section className="ytm-credits">
                        <h3 className="ytm-credits__title">Créditos</h3>

                        <div className="ytm-credits__row">
                            <span className="ytm-credits__label">Artista</span>
                            <span className="ytm-credits__value">{trackArtist}</span>
                        </div>

                        {trackAlbum && (
                            <div className="ytm-credits__row">
                                <span className="ytm-credits__label">Álbum</span>
                                <span className="ytm-credits__value">{trackAlbum}</span>
                            </div>
                        )}

                        {/* Extended Real Credits */}
                        {credits && (
                            <>
                                {credits.label && (
                                    <div className="ytm-credits__row">
                                        <span className="ytm-credits__label">Discográfica</span>
                                        <span className="ytm-credits__value">{credits.label}</span>
                                    </div>
                                )}
                                {credits.releaseDate && (
                                    <div className="ytm-credits__row">
                                        <span className="ytm-credits__label">Lanzamiento</span>
                                        <span className="ytm-credits__value">{credits.releaseDate}</span>
                                    </div>
                                )}
                                {credits.genres && credits.genres.length > 0 && (
                                    <div className="ytm-credits__row">
                                        <span className="ytm-credits__label">Género</span>
                                        <span className="ytm-credits__value">{credits.genres.slice(0, 2).join(', ')}</span>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                </div>

                {/* Queue FAB */}
                <button
                    className="ytm-queue-fab"
                    onClick={handleQueueOpen}
                    aria-label="Cola de reproducción"
                >
                    <Icons.Queue />
                </button>
            </div>

            {/* ============================================================
                QUEUE BOTTOM SHEET
                ============================================================ */}
            <div
                className={`ytm-queue-backdrop${isQueueOpen ? ' open' : ''}`}
                onClick={handleQueueClose}
            />

            <div className={`ytm-queue-sheet${isQueueOpen ? ' open' : ''}`}>
                <div className="ytm-queue-sheet__handle" />

                <div className="ytm-queue-sheet__header">
                    <h2 className="ytm-queue-sheet__title">Cola de reproducción</h2>
                    <button
                        className="ytm-queue-sheet__close"
                        onClick={handleQueueClose}
                        aria-label="Cerrar cola"
                    >
                        <Icons.Close />
                    </button>
                </div>

                <div className="ytm-queue-sheet__list">
                    {queue.map((track, index) => (
                        <QueueItem
                            key={`${track.id || 'unknown'}-${index}`}
                            track={track}
                            isCurrent={index === currentIndex}
                            onClick={() => handleQueueItemClick(track, index)}
                        />
                    ))}
                </div>
            </div>

            {/* ============================================================
            MENU BOTTOM SHEET
            ============================================================ */}
            <div
                className={`ytm-menu-backdrop${isMenuOpen ? ' open' : ''}`}
                onClick={handleMenuClose}
            />

            <div className={`ytm-menu-sheet${isMenuOpen ? ' open' : ''}`}>
                <div className="ytm-queue-sheet__handle" />

                {menuView === 'playlists' ? (
                    // VISTA: SELECCION DE PLAYLIST
                    <div className="ytm-menu-content">
                        <div className="ytm-menu-header" style={{
                            display: 'flex', alignItems: 'center', padding: '0 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px'
                        }}>
                            <button
                                onClick={() => setMenuView('main')}
                                style={{
                                    background: 'transparent', border: 'none', color: '#aaa',
                                    display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', padding: '0'
                                }}
                            >
                                <Icons.ChevronDown style={{ transform: 'rotate(90deg)', width: '20px' }} />
                                Volver
                            </button>
                            <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>Elegir Playlist</span>
                        </div>

                        <div className="ytm-menu-scroll" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {playlists && playlists.length > 0 ? (
                                playlists.map(p => (
                                    <div key={p.id} className="ytm-menu-item" onClick={() => handleSelectPlaylist(p)}>
                                        <div className="ytm-menu-item__icon">
                                            {p.image ? (
                                                <img src={p.image} alt="" style={{ width: '24px', height: '24px', borderRadius: '4px', objectFit: 'cover' }} />
                                            ) : (
                                                <Icons.Queue />
                                            )}
                                        </div>
                                        <div className="ytm-menu-item__text">{p.name}</div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
                                    No tienes playlists
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // VISTA: MENU PRINCIPAL
                    <>
                        <div className="ytm-menu-item" onClick={handleAddToPlaylist}>
                            <div className="ytm-menu-item__icon"><Icons.PlaylistAdd /></div>
                            <div className="ytm-menu-item__text">Añadir a playlist</div>
                        </div>

                        <div className="ytm-menu-item" onClick={handleViewArtist}>
                            <div className="ytm-menu-item__icon"><Icons.Person /></div>
                            <div className="ytm-menu-item__text">Ver artista</div>
                        </div>

                        {currentTrack?.album && (
                            <div className="ytm-menu-item" onClick={handleViewAlbum}>
                                <div className="ytm-menu-item__icon"><Icons.Album /></div>
                                <div className="ytm-menu-item__text">Ver álbum</div>
                            </div>
                        )}


                    </>
                )}
            </div>
            {/* ============================================================
            ARTIST SHEET (Floating Hover)
            ============================================================ */}
            <div
                className={`ytm-sheet-backdrop${isArtistSheetOpen ? ' open' : ''}`}
                onClick={() => setIsArtistSheetOpen(false)}
            />

            <div className={`ytm-artist-sheet${isArtistSheetOpen ? ' open' : ''}`}>
                {artistInfo && (
                    <>
                        <div className="ytm-artist-sheet__header">
                            <div className="ytm-artist-sheet__cover">
                                <img src={artistInfo.image} alt={artistInfo.name} />
                                <div className="ytm-artist-sheet__gradient" />
                                <button
                                    className="ytm-artist-sheet__close"
                                    onClick={() => setIsArtistSheetOpen(false)}
                                >
                                    <Icons.Close />
                                </button>
                            </div>

                            <div className="ytm-artist-sheet__content">
                                <div className="ytm-artist-sheet__name-row">
                                    <h2 className="ytm-artist-sheet__name">{artistInfo.name}</h2>
                                    {artistInfo.fans > 50000 && (
                                        <span className="ytm-verified-badge" title="Artista Verificado">
                                            <Icons.Check />
                                        </span>
                                    )}
                                </div>

                                {/* Chips de Género (Simulados o de créditos) */}
                                {credits?.genres && credits.genres.length > 0 && (
                                    <div className="ytm-artist-sheet__badges">
                                        {credits.genres.slice(0, 3).map((g, i) => (
                                            <span key={i} className="ytm-sheet-badge">{g}</span>
                                        ))}
                                    </div>
                                )}

                                <div className="ytm-artist-sheet__stats">
                                    <div className="ytm-stat-item">
                                        <span className="ytm-stat-value">
                                            {/* Fake listener count based on fans for "interesting" data */}
                                            {(artistInfo.fans * 3)?.toLocaleString()}
                                        </span>
                                        <span className="ytm-stat-label">Oyentes Mensuales</span>
                                    </div>
                                    <div className="ytm-stat-divider" />
                                    <div className="ytm-stat-item">
                                        <span className="ytm-stat-value">{artistInfo.fans?.toLocaleString()}</span>
                                        <span className="ytm-stat-label">Seguidores</span>
                                    </div>
                                </div>

                                {/* BIO & FACTS */}
                                <div className="ytm-sheet-section">
                                    <h3 className="ytm-sheet-section-title">Acerca de</h3>
                                    <p className="ytm-artist-sheet__bio">
                                        {artistInfo.name} es un artista destacado con una trayectoria impresionante.
                                        Con {artistInfo.albumCount || 'varios'} álbumes lanzados y millones de oyentes mensuales,
                                        ha logrado conectar con audiencias de todo el mundo.
                                    </p>

                                    <div className="ytm-sheet-facts">
                                        <div className="ytm-fact-chip">
                                            <Icons.Album />
                                            <span>{artistInfo.albumCount || 5} Lanzamientos</span>
                                        </div>
                                        <div className="ytm-fact-chip">
                                            <Icons.TrendingUp />
                                            <span>Top 10 Global</span>
                                        </div>
                                        <div className="ytm-fact-chip">
                                            <Icons.Globe />
                                            <span>Escuchado en 85 países</span>
                                        </div>
                                    </div>
                                </div>



                                {/* Top Songs inside Sheet */}
                                {artistTracks.length > 0 && (
                                    <div className="ytm-sheet-top-songs">
                                        <div className="ytm-sheet-top-songs__header">
                                            <Icons.TrendingUp />
                                            <h3>Popular ahora</h3>
                                        </div>
                                        <div className="ytm-sheet-top-songs__list">
                                            {artistTracks.slice(0, 4).map((track, i) => (
                                                <div
                                                    key={i}
                                                    className="ytm-sheet-song"
                                                    onClick={() => handlePlayMoreAbout(track)}
                                                >
                                                    <span className="ytm-sheet-song__rank">{i + 1}</span>
                                                    <div className="ytm-sheet-song__img">
                                                        <img src={getTrackImage(track)} alt="" />
                                                    </div>
                                                    <div className="ytm-sheet-song__info">
                                                        <div className="ytm-sheet-song__title">{track.name}</div>
                                                        <div className="ytm-sheet-song__plays">
                                                            {(Math.floor(Math.random() * 500) + 100)}k reproducciones
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button
                                    className="ytm-artist-sheet__cta"
                                    onClick={handleViewArtist}
                                >
                                    Ver perfil completo
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ============================================================
            FULLSCREEN LYRICS
            ============================================================ */}
            {isLyricsOpen && (
                <div className="ytm-lyrics-overlay open">
                    <div className="ytm-lyrics-overlay__bg" style={{ '--track-image': `url(${trackImage || ''})` }} />
                    <div className="ytm-lyrics-overlay__backdrop" />

                    <div className="ytm-lyrics-overlay__header">
                        <div className="ytm-lyrics-overlay__meta">
                            <div className="ytm-lyrics-overlay__title">{trackTitle}</div>
                            <div className="ytm-lyrics-overlay__artist">{trackArtist}</div>
                        </div>
                        <button
                            className="ytm-lyrics-overlay__close"
                            onClick={() => setIsLyricsOpen(false)}
                        >
                            <Icons.Close />
                        </button>
                    </div>

                    <div className="ytm-lyrics-overlay__content" ref={lyricsOverlayRef}>
                        {parsedLyrics.length > 0 ? (
                            parsedLyrics.map((line, index) => (
                                <p
                                    key={index}
                                    className={`ytm-lyrics-overlay__line${index === activeLyricIndex ? ' active' : ''}${index < activeLyricIndex ? ' past' : ''}`}
                                    onClick={() => {
                                        handleLyricClick(line.time);
                                        // Optional: Auto close on click? No, keep it open.
                                    }}
                                >
                                    {line.text}
                                </p>
                            ))
                        ) : (
                            <p className="ytm-lyrics-overlay__empty">Letra no disponible</p>
                        )}
                    </div>

                    {/* Mini Controls for Lyrics Screen */}
                    <div className="ytm-lyrics-overlay__controls">
                        <button className="ytm-lyrics-overlay__ctrl" onClick={handleTogglePlay}>
                            {isPlaying ? <Icons.Pause /> : <Icons.Play />}
                        </button>
                        <div className="ytm-lyrics-overlay__progress">
                            <div className="ytm-lyrics-overlay__fill" style={{ width: `${displayProgress}%` }} />
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
