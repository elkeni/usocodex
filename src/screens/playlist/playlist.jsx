import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { usePlayer } from '../../context/playerContext';
import { useUser } from '../../context/userContext';
import {
    FaPlay,
    FaRandom,
    FaHeart,
    FaRegHeart,
    FaEllipsisH,
    FaArrowLeft,
    FaMusic,
    FaGlobe,
    FaCheck,
    FaPlus,
    FaEdit,
    FaTrash,
    FaTimes,
    FaSearch,
    FaSave,
    FaLock,
    FaShare,
    FaFlag,
    FaUser,
    FaListAlt,
    FaExclamationTriangle
} from 'react-icons/fa';
import './playlist.css';

import { playlistGetInfo, searchGlobal, artistGetTopTracks, getRelatedArtists } from '../../services/unifiedService';
import { getGenrePlaylist, isGenrePlaylistId } from '../../services/genrePlaylistService';

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60';

export default function Playlist() {
    const { playlistId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { playTrack } = usePlayer();
    const {
        isPlaylistSaved,
        toggleSavePlaylist,
        user,
        playlists,
        removeTrackFromPlaylist,
        updatePlaylist,
        addTrackToPlaylist,
        deletePlaylist
    } = useUser();

    const controlsRef = useRef(null);
    const [isScrolled, setIsScrolled] = useState(false);

    const [playlist, setPlaylist] = useState(null);
    const [tracks, setTracks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [playlistColor, setPlaylistColor] = useState('29, 185, 84');
    const [, setIsVirtual] = useState(false);
    const [isNative, setIsNative] = useState(false);
    const [, setIsGenre] = useState(false);

    // Estados de edición
    const [isEditMode, setIsEditMode] = useState(false);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [isPublic, setIsPublic] = useState(false);

    // Estados para agregar canciones
    const [showAddTrack, setShowAddTrack] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchTimeoutRef = useRef(null);

    // Estados para menús y modales
    // Removed showPlaylistMenu as requested (bottom sticky menu button removed)
    const [showTrackMenu, setShowTrackMenu] = useState(null); // trackId del track seleccionado
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showDeleteTrackConfirm, setShowDeleteTrackConfirm] = useState(null);
    const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(null); // track a añadir
    const [notification, setNotification] = useState(null);
    const [recommendedTracks, setRecommendedTracks] = useState([]);
    const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);

    const trackMenuRef = useRef(null);
    const topMenuRef = useRef(null);
    const [showTopMenu, setShowTopMenu] = useState(false);

    // Cerrar menús al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (topMenuRef.current && !topMenuRef.current.contains(event.target)) {
                setShowTopMenu(false);
            }
            if (trackMenuRef.current && !trackMenuRef.current.contains(event.target)) {
                setShowTrackMenu(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Mostrar notificación
    const showNotification = useCallback((message, type = 'success') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 3000);
    }, []);

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
        if (!imageUrl) return;

        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = imageUrl;

        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 10;
                canvas.height = 10;
                ctx.drawImage(img, 0, 0, 10, 10);

                const imageData = ctx.getImageData(0, 0, 10, 10).data;
                let r = 0, g = 0, b = 0, count = 0;

                for (let i = 0; i < imageData.length; i += 4) {
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

                    const boost = 1.3;
                    r = Math.min(255, Math.round(r * boost));
                    g = Math.min(255, Math.round(g * boost));
                    b = Math.min(255, Math.round(b * boost));

                    setPlaylistColor(`${r}, ${g}, ${b}`);
                }
            } catch (err) {
                console.warn('[Playlist] Error extrayendo color:', err);
            }
        };
    }, []);

    // Generar imagen de cover para playlists nativas sin imagen
    const generateCoverFromTracks = useCallback((trackList) => {
        if (!trackList || trackList.length === 0) return null;

        const tracksWithImages = trackList.filter(t => t.image);
        if (tracksWithImages.length >= 4) {
            return {
                type: 'mosaic',
                images: tracksWithImages.slice(0, 4).map(t => t.image)
            };
        } else if (tracksWithImages.length > 0) {
            return tracksWithImages[0].image;
        }
        return null;
    }, []);

    // Cargar datos de la playlist
    useEffect(() => {
        const loadPlaylistData = async () => {
            setIsLoading(true);

            try {
                // 1. PRIORIDAD: Datos pasados por router state (Feed/Library)
                // Esto arregla el bug de "0 canciones" en mixes generados al vuelo
                if (location.state?.playlist || location.state?.virtualPlaylist) {
                    const pData = location.state.playlist || location.state.virtualPlaylist;
                    console.log('[Playlist] 🚀 Loading from Router State:', pData);

                    setPlaylist({
                        id: pData.id,
                        name: pData.title || pData.name,
                        title: pData.title || pData.name,
                        description: pData.description || 'Mix generado para ti',
                        image: pData.image,
                        creator: pData.creator || 'ParadisQuo AI',
                        isNative: pData.isNative
                    });

                    // Normalizar tracks
                    const formattedTracks = (pData.tracks || []).map((t, index) => ({
                        ...t,
                        id: t.id || `track-${index}`,
                        name: t.name || t.title,
                        title: t.name || t.title,
                        image: t.image || pData.image || ''
                    }));

                    setTracks(formattedTracks);

                    // Detectar tipo real
                    const isGenerated = pData.id.startsWith('feed-') || pData.id.startsWith('lib-');
                    setIsVirtual(isGenerated);
                    setIsNative(pData.isNative && !isGenerated); // Native = usuario creó, Virtual = sistema creó
                    setIsGenre(false);

                    if (pData.image) extractColor(pData.image);

                    setIsLoading(false);
                    return;
                }

                // 2. Buscar en playlists del usuario (nativas guardadas)
                const nativePlaylist = playlists.find(p => p.id === playlistId);

                if (nativePlaylist) {
                    setPlaylist({
                        ...nativePlaylist,
                        name: nativePlaylist.name || nativePlaylist.title,
                        title: nativePlaylist.name || nativePlaylist.title,
                        creator: user?.displayName || 'Tú'
                    });

                    const formattedTracks = (nativePlaylist.tracks || []).map((t, index) => ({
                        ...t,
                        id: t.id || `track-${index}`,
                        name: t.name || t.title,
                        title: t.name || t.title
                    }));

                    setTracks(formattedTracks);
                    setIsVirtual(false);
                    setIsNative(true);
                    setEditTitle(nativePlaylist.name || nativePlaylist.title || '');
                    setEditDescription(nativePlaylist.description || '');
                    setIsPublic(nativePlaylist.isPublic || false);

                    const coverImage = nativePlaylist.image || generateCoverFromTracks(formattedTracks);
                    if (typeof coverImage === 'string') {
                        extractColor(coverImage);
                    } else if (nativePlaylist.cover?.colors) {
                        const [r, g, b] = nativePlaylist.cover.colors;
                        setPlaylistColor(`${r}, ${g}, ${b}`);
                    }

                    setIsLoading(false);
                    return;
                }

                // 3. Verificar si es playlist de género
                if (isGenrePlaylistId(playlistId)) {
                    const genreData = await getGenrePlaylist(playlistId);

                    if (genreData) {
                        setPlaylist({
                            id: genreData.id,
                            name: genreData.name,
                            title: genreData.name,
                            description: genreData.description,
                            image: genreData.image,
                            creator: 'ParadisQuo',
                            likes: genreData.likes || 0,
                            followers: genreData.followers || 0
                        });

                        const formattedTracks = (genreData.tracks || []).map((t, index) => ({
                            ...t,
                            id: t.id || `track-${index}`,
                            name: t.name || t.title,
                            title: t.name || t.title,
                            image: t.image || genreData.image
                        }));

                        setTracks(formattedTracks);
                        setIsVirtual(false);
                        setIsNative(false);
                        setIsGenre(true);
                        if (genreData.image) extractColor(genreData.image);

                        setIsLoading(false);
                        return;
                    }
                }

                // 4. Buscar en API externa (Deezer) - SOLO si no es un ID generado
                // Evitamos llamar a Deezer si es un ID de feed (feed-daily-...)
                if (!playlistId.startsWith('feed-') && !playlistId.startsWith('lib-')) {
                    const externalData = await playlistGetInfo({ id: playlistId });

                    if (externalData) {
                        setPlaylist({
                            id: externalData.id,
                            name: externalData.name,
                            title: externalData.name,
                            description: externalData.description || `Por ${externalData.creator}`,
                            image: externalData.image,
                            creator: externalData.creator
                        });

                        const formattedTracks = (externalData.tracks || []).map((t, index) => ({
                            ...t,
                            id: t.id || `track-${index}`,
                            name: t.name || t.title,
                            title: t.name || t.title,
                            image: t.image || t.album?.cover_xl || externalData.image
                        }));

                        setTracks(formattedTracks);
                        setIsVirtual(false);
                        setIsNative(false);
                        setIsGenre(false);
                        if (externalData.image) extractColor(externalData.image);
                    }
                } else {
                    // Caso perdido: Es ID generado pero no vino state
                    // Podríamos intentar regenerarlo o mostrar error específico
                    console.warn('Playlist generada sin datos en state:', playlistId);
                }

            } catch (error) {
                console.error('[Playlist] Error cargando:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadPlaylistData();
    }, [playlistId, location.state, extractColor, playlists, user, generateCoverFromTracks]);

    // Handlers de reproducción
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

    // Guardar playlist en biblioteca (solo para externas)
    const handleSavePlaylist = useCallback(() => {
        if (!playlist) return;

        const playlistToSave = {
            id: playlist.id || playlistId,
            title: playlist.name || playlist.title,
            name: playlist.name || playlist.title,
            picture_xl: playlist.image,
            image: playlist.image,
            creator: playlist.creator,
            nb_tracks: tracks.length
        };

        toggleSavePlaylist(playlistToSave);
        showNotification(
            isPlaylistSaved(playlist.id || playlistId)
                ? 'Playlist eliminada de tu biblioteca'
                : 'Playlist guardada en tu biblioteca'
        );
    }, [playlist, playlistId, tracks, toggleSavePlaylist, showNotification, isPlaylistSaved]);

    // Handlers de edición (solo para playlists nativas)
    const handleEnterEditMode = useCallback(() => {
        if (!isNative) return;
        setIsEditMode(true);
        setEditTitle(playlist?.name || playlist?.title || '');
        setEditDescription(playlist?.description || '');
    }, [isNative, playlist]);

    const handleSaveEdit = useCallback(async () => {
        if (!isNative || !playlistId) return;

        await updatePlaylist(playlistId, {
            name: editTitle.trim(),
            title: editTitle.trim(),
            description: editDescription.trim(),
            isPublic: isPublic
        });

        setPlaylist(prev => ({
            ...prev,
            name: editTitle.trim(),
            title: editTitle.trim(),
            description: editDescription.trim(),
            isPublic: isPublic
        }));

        setIsEditMode(false);
        showNotification('Playlist actualizada');
    }, [isNative, playlistId, editTitle, editDescription, isPublic, updatePlaylist, showNotification]);

    const handleCancelEdit = useCallback(() => {
        setIsEditMode(false);
        setEditTitle(playlist?.name || playlist?.title || '');
        setEditDescription(playlist?.description || '');
        setIsPublic(playlist?.isPublic || false);
    }, [playlist]);

    // Cambiar privacidad desde menú
    const handleTogglePrivacy = useCallback(async () => {
        if (!isNative || !playlistId) return;

        const newIsPublic = !isPublic;
        await updatePlaylist(playlistId, { isPublic: newIsPublic });
        setIsPublic(newIsPublic);
        setPlaylist(prev => ({ ...prev, isPublic: newIsPublic }));
        showNotification(newIsPublic ? 'Playlist ahora es pública' : 'Playlist ahora es privada');
    }, [isNative, playlistId, isPublic, updatePlaylist, showNotification]);

    // Eliminar playlist
    const handleDeletePlaylist = useCallback(async () => {
        if (!isNative || !playlistId) return;

        try {
            await deletePlaylist(playlistId);
            showNotification('Playlist eliminada');
            navigate('/library');
        } catch (error) {
            console.error('Error eliminando playlist:', error);
            showNotification('Error al eliminar playlist', 'error');
        }
    }, [isNative, playlistId, deletePlaylist, navigate, showNotification]);

    // Compartir playlist
    const handleShare = useCallback(() => {
        const url = window.location.href;
        if (navigator.share) {
            navigator.share({
                title: playlist?.name || 'Playlist',
                text: `Escucha ${playlist?.name} en ParadisQuo`,
                url: url
            });
        } else {
            navigator.clipboard.writeText(url);
            showNotification('Enlace copiado al portapapeles');
        }
    }, [playlist, showNotification]);

    // Quitar canción de playlist con confirmación
    const handleRemoveTrack = useCallback(async (trackId) => {
        if (!isNative || !playlistId) return;

        await removeTrackFromPlaylist(playlistId, trackId);
        setTracks(prev => prev.filter(t => t.id !== trackId));
        setShowDeleteTrackConfirm(null);
        setShowTrackMenu(null);
        showNotification('Canción eliminada de la playlist');
    }, [isNative, playlistId, removeTrackFromPlaylist, showNotification]);

    // Navegar a artista
    const handleViewArtist = useCallback((track) => {
        const artistName = typeof track.artist === 'object' ? track.artist.name : track.artist;
        if (artistName) {
            navigate(`/artist/${encodeURIComponent(artistName)}`);
        }
        setShowTrackMenu(null);
    }, [navigate]);

    // Añadir a otra playlist
    const handleAddToOtherPlaylist = useCallback(async (targetPlaylistId, track) => {
        try {
            await addTrackToPlaylist(targetPlaylistId, track);
            showNotification('Canción añadida a la playlist');
        } catch (error) {
            console.error('Error añadiendo a playlist:', error);
            showNotification('Error al añadir canción', 'error');
        }
        setShowAddToPlaylistModal(null);
        setShowTrackMenu(null);
    }, [addTrackToPlaylist, showNotification]);

    // Buscar canciones para agregar
    const handleSearch = useCallback(async (query) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const results = await searchGlobal(query, 'track', 15);
            setSearchResults(results || []);
        } catch (error) {
            console.error('[Playlist] Error buscando:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, []);

    // Debounce de búsqueda
    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        if (searchQuery.trim()) {
            searchTimeoutRef.current = setTimeout(() => {
                handleSearch(searchQuery);
            }, 400);
        } else {
            setSearchResults([]);
        }

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [searchQuery, handleSearch]);

    // Agregar canción a playlist
    const handleAddTrack = useCallback(async (track) => {
        if (!isNative || !playlistId) return;

        await addTrackToPlaylist(playlistId, track);

        const newTrack = {
            id: track.id || `track-${Date.now()}`,
            name: track.name || track.title,
            title: track.name || track.title,
            artist: typeof track.artist === 'object' ? track.artist.name : track.artist,
            album: track.album || '',
            duration: track.duration || 0,
            image: track.image || ''
        };

        setTracks(prev => [...prev, newTrack]);
        setSearchQuery('');
        setSearchResults([]);
        setShowAddTrack(false);
        showNotification('Canción añadida');
    }, [isNative, playlistId, addTrackToPlaylist, showNotification]);

    // Generar recomendaciones basadas en la playlist
    const fetchRecommendations = useCallback(async () => {
        if (!tracks || tracks.length === 0) return;

        setIsLoadingRecommendations(true);
        try {
            // 1. Obtener artistas únicos de la playlist (max 5)
            const artists = [...new Set(tracks.map(t => typeof t.artist === 'object' ? t.artist.name : t.artist))]
                .filter(a => a && a !== 'Desconocido')
                .sort(() => 0.5 - Math.random())
                .slice(0, 5);

            if (artists.length === 0) {
                // Fallback: buscar canciones pop si no hay artistas
                const results = await searchGlobal("pop hits", 'track', 20);
                setRecommendedTracks(results || []);
                setIsLoadingRecommendations(false);
                return;
            }

            // 2. Obtener recomendaciones
            let pool = [];

            // Estrategia A: Hits de artistas similares
            for (const artist of artists.slice(0, 2)) {
                try {
                    const related = await getRelatedArtists(artist, 3);
                    if (related && related.length > 0) {
                        for (const rel of related) {
                            const top = await artistGetTopTracks({ artist: rel.id, limit: 5 });
                            if (top?.toptracks?.track) {
                                pool = [...pool, ...top.toptracks.track];
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Error fetching related for', artist, e);
                }
            }

            // Estrategia B: Top tracks de los propios artistas (si faltan)
            if (pool.length < 10) {
                for (const artist of artists) {
                    const top = await artistGetTopTracks({ artist, limit: 5 });
                    if (top?.toptracks?.track) {
                        pool = [...pool, ...top.toptracks.track];
                    }
                }
            }

            // 3. Filtrar duplicados y canciones ya en la playlist
            const currentIds = new Set(tracks.map(t => t.id));
            const currentNames = new Set(tracks.map(t => (t.name || t.title).toLowerCase()));

            const unique = pool.filter(t => {
                const idMatch = currentIds.has(t.id);
                const nameMatch = currentNames.has((t.name || t.title).toLowerCase());
                return !idMatch && !nameMatch;
            });

            // 4. Mezclar y guardar
            setRecommendedTracks(unique.sort(() => 0.5 - Math.random()).slice(0, 20));

        } catch (error) {
            console.error('Error generando recomendaciones:', error);
        } finally {
            setIsLoadingRecommendations(false);
        }
    }, [tracks]);

    // Abrir modal y cargar recomendaciones
    const handleOpenAddModal = useCallback(() => {
        setShowAddTrack(true);
        if (tracks.length > 0) {
            fetchRecommendations();
        }
    }, [tracks, fetchRecommendations]);

    // Verificar si un track ya está en la playlist
    const isTrackInPlaylist = useCallback((track) => {
        const trackName = (track.name || track.title || '').toLowerCase();
        const trackArtist = (typeof track.artist === 'object' ? track.artist.name : track.artist || '').toLowerCase();

        return tracks.some(t => {
            const existingName = (t.name || t.title || '').toLowerCase();
            const existingArtist = (typeof t.artist === 'object' ? t.artist.name : t.artist || '').toLowerCase();
            return existingName === trackName && existingArtist === trackArtist;
        });
    }, [tracks]);

    // Utilidades
    const formatDuration = (seconds) => {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${String(secs).padStart(2, '0')} `;
    };

    const getTotalDuration = () => {
        const total = tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
        const hours = Math.floor(total / 3600);
        const mins = Math.floor((total % 3600) / 60);
        if (hours > 0) return `${hours} hr ${mins} min`;
        return `${mins} min`;
    };

    const getArtistName = (track) => {
        if (typeof track.artist === 'object') return track.artist.name || track.artist['#text'];
        return track.artist || 'Artista desconocido';
    };

    // Obtener imagen de playlist
    const getPlaylistImage = useMemo(() => {
        if (playlist?.image) return playlist.image;

        const generatedCover = generateCoverFromTracks(tracks);
        if (typeof generatedCover === 'string') return generatedCover;
        if (generatedCover?.type === 'mosaic' && generatedCover.images?.[0]) {
            return generatedCover.images[0];
        }

        return DEFAULT_IMAGE;
    }, [playlist, tracks, generateCoverFromTracks]);

    // Helper para renderizar el menú (evitar duplicación)
    const renderDropdownMenu = (closeMenuFn) => (
        <div className="playlist-dropdown-menu">
            {isNative ? (
                <>
                    <button className="dropdown-item" onClick={() => { handleEnterEditMode(); closeMenuFn(); }}>
                        <FaEdit />
                        <span>Editar playlist</span>
                    </button>
                    <button className="dropdown-item" onClick={() => { handleOpenAddModal(); closeMenuFn(); }}>
                        <FaPlus />
                        <span>Añadir canciones</span>
                    </button>
                    <button className="dropdown-item" onClick={() => { handleTogglePrivacy(); closeMenuFn(); }}>
                        {isPublic ? <FaLock /> : <FaGlobe />}
                        <span>{isPublic ? 'Hacer privada' : 'Hacer pública'}</span>
                    </button>
                    <button className="dropdown-item" onClick={() => { handleShare(); closeMenuFn(); }}>
                        <FaShare />
                        <span>Compartir</span>
                    </button>
                    <div className="dropdown-divider"></div>
                    <button className="dropdown-item danger" onClick={() => { setShowDeleteConfirm(true); closeMenuFn(); }}>
                        <FaTrash />
                        <span>Eliminar playlist</span>
                    </button>
                </>
            ) : (
                <>
                    <button className="dropdown-item" onClick={() => { handleSavePlaylist(); closeMenuFn(); }}>
                        {isPlaylistSaved(playlist.id || playlistId) ? <FaHeart /> : <FaRegHeart />}
                        <span>{isPlaylistSaved(playlist.id || playlistId) ? 'Quitar de biblioteca' : 'Guardar en biblioteca'}</span>
                    </button>
                    <button className="dropdown-item" onClick={() => { handleShare(); closeMenuFn(); }}>
                        <FaShare />
                        <span>Compartir</span>
                    </button>
                    <div className="dropdown-divider"></div>
                    <button className="dropdown-item">
                        <FaFlag />
                        <span>Reportar</span>
                    </button>
                </>
            )}
        </div>
    );

    // Loading State con Skeleton
    if (isLoading) {
        return (
            <div className="playlist-page">
                <div className="playlist-bg-layer">
                    <div className="playlist-bg-overlay" />
                </div>
                <div className="playlist-content">
                    <div className="playlist-hero">
                        <div className="playlist-back-btn skeleton-btn"></div>
                        <div className="playlist-hero-content">
                            <div className="playlist-cover-wrapper">
                                <div className="playlist-cover skeleton-cover"></div>
                            </div>
                            <div className="playlist-info">
                                <div className="skeleton-text skeleton-type"></div>
                                <div className="skeleton-text skeleton-title"></div>
                                <div className="skeleton-text skeleton-desc"></div>
                                <div className="skeleton-text skeleton-meta"></div>
                            </div>
                        </div>
                    </div>
                    <div className="playlist-controls-wrapper">
                        <div className="playlist-controls skeleton-controls">
                            <div className="skeleton-fab"></div>
                            <div className="skeleton-btn-secondary"></div>
                            <div className="skeleton-btn-secondary"></div>
                        </div>
                    </div>
                    <div className="playlist-tracks-section">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="track-row skeleton-track" style={{ animationDelay: `${i * 0.05} s` }}>
                                <div className="skeleton-number"></div>
                                <div className="skeleton-track-info">
                                    <div className="skeleton-artwork"></div>
                                    <div className="skeleton-track-text">
                                        <div className="skeleton-text skeleton-track-name"></div>
                                        <div className="skeleton-text skeleton-track-artist"></div>
                                    </div>
                                </div>
                                <div className="skeleton-text skeleton-duration"></div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Error State
    if (!playlist) {
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
            {/* Notification Toast */}
            {notification && (
                <div className={`playlist-notification ${notification.type}`}>
                    {notification.type === 'success' ? <FaCheck /> : <FaExclamationTriangle />}
                    <span>{notification.message}</span>
                </div>
            )}

            {/* Fondo inmersivo */}
            <div className="playlist-bg-layer">
                <div
                    className="playlist-bg-image"
                    style={{ backgroundImage: `url(${getPlaylistImage})` }}
                />
                <div className="playlist-bg-overlay" />
            </div>

            <div className="playlist-content">
                {/* Hero Section */}
                <div className="playlist-hero">
                    <div className="playlist-top-bar">
                        <button className="playlist-back-btn" onClick={() => navigate(-1)}>
                            <FaArrowLeft size={14} />
                            <span>Volver</span>
                        </button>

                        <div className="playlist-menu-container" ref={topMenuRef}>
                            <button
                                className={`playlist-btn-icon ${showTopMenu ? 'active' : ''}`}
                                onClick={() => setShowTopMenu(!showTopMenu)}
                                style={{ background: 'rgba(255,255,255,0.1)', border: 'none' }}
                            >
                                <FaEllipsisH size={18} />
                            </button>
                            {showTopMenu && renderDropdownMenu(() => setShowTopMenu(false))}
                        </div>
                    </div>

                    <div className="playlist-hero-content">
                        {/* Cover Art */}
                        <div className="playlist-cover-wrapper">
                            <div className="playlist-cover">
                                {getPlaylistImage && getPlaylistImage !== DEFAULT_IMAGE ? (
                                    <img
                                        src={getPlaylistImage}
                                        alt={playlist.name || playlist.title}
                                        onError={(e) => { e.target.src = DEFAULT_IMAGE; }}
                                    />
                                ) : (
                                    <div className="playlist-cover-fallback" style={{
                                        background: `linear-gradient(135deg, rgb(${playlistColor}), rgba(${playlistColor}, 0.5))`
                                    }}>
                                        <FaMusic size={60} />
                                    </div>
                                )}
                            </div>

                        </div>

                        {/* Playlist Info */}
                        <div className="playlist-info">

                            {isEditMode ? (
                                <div className="playlist-edit-form">
                                    <input
                                        type="text"
                                        className="playlist-edit-title"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        placeholder="Nombre de la playlist"
                                        autoFocus
                                    />
                                    <textarea
                                        className="playlist-edit-description"
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        placeholder="Descripción (opcional)"
                                        rows={2}
                                    />

                                    {/* Toggle de privacidad en modo edición */}
                                    <div className="playlist-privacy-toggle">
                                        <label className="privacy-toggle-label">
                                            <span className="privacy-toggle-text">
                                                {isPublic ? <FaGlobe /> : <FaLock />}
                                                {isPublic ? 'Playlist pública' : 'Playlist privada'}
                                            </span>
                                            <div className="privacy-switch">
                                                <input
                                                    type="checkbox"
                                                    checked={isPublic}
                                                    onChange={() => setIsPublic(!isPublic)}
                                                />
                                                <span className="privacy-switch-slider"></span>
                                            </div>
                                        </label>
                                        <p className="privacy-toggle-hint">
                                            {isPublic
                                                ? 'Otros usuarios pueden ver esta playlist en la sección Social'
                                                : 'Solo tú puedes ver esta playlist'}
                                        </p>
                                    </div>

                                    <div className="playlist-edit-actions">
                                        <button className="edit-btn save" onClick={handleSaveEdit}>
                                            <FaSave size={12} />
                                            <span>Guardar</span>
                                        </button>
                                        <button className="edit-btn cancel" onClick={handleCancelEdit}>
                                            <FaTimes size={12} />
                                            <span>Cancelar</span>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <h1 className="playlist-title">{playlist.name || playlist.title}</h1>
                                    {playlist.description && (
                                        <p className="playlist-description">{playlist.description}</p>
                                    )}

                                </>
                            )}

                            <div className="playlist-meta">
                                <div className="playlist-creator">

                                    <span>{playlist.creator || (isNative ? 'Tú' : 'ParadisQuo')}</span>
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
                        <div className="playlist-controls-left">
                            <button
                                className="playlist-btn-primary"
                                onClick={handlePlayAll}
                                disabled={tracks.length === 0}
                                style={{
                                    backgroundColor: `rgb(${playlistColor})`,
                                    borderColor: `rgb(${playlistColor})`
                                }}
                                title="Reproducir"
                            >
                                <FaPlay size={14} />
                                <span>Reproducir</span>
                            </button>

                            <button
                                className="playlist-btn-secondary"
                                onClick={handleShuffle}
                                disabled={tracks.length === 0}
                                title="Reproducción aleatoria"
                            >
                                <FaRandom size={14} />
                                <span>Aleatorio</span>
                            </button>

                            {/* Guardar solo para playlists externas */}
                            {!isNative && (
                                <button
                                    className={`playlist-btn-icon ${isPlaylistSaved(playlist.id || playlistId) ? 'liked' : ''}`}
                                    onClick={handleSavePlaylist}
                                    title={isPlaylistSaved(playlist.id || playlistId) ? 'Quitar de biblioteca' : 'Guardar en biblioteca'}
                                >
                                    {isPlaylistSaved(playlist.id || playlistId) ? <FaHeart size={18} /> : <FaRegHeart size={18} />}
                                </button>
                            )}
                        </div>

                        <div className="controls-spacer" />
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
                            <p>
                                {isNative
                                    ? 'Añade canciones para empezar a escuchar'
                                    : 'Esta playlist aún no tiene canciones'
                                }
                            </p>
                            {isNative && (
                                <button
                                    className="empty-action-btn"
                                    onClick={() => setShowAddTrack(true)}
                                >
                                    <FaPlus />
                                    Añadir canciones
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Header (desktop) */}


                            {/* Track List */}
                            <div className="tracks-list">
                                {tracks.map((track, index) => (
                                    <div
                                        key={`${track.id || 'unknown'}-${index}`}
                                        className={`track-row ${isNative ? 'editable' : ''}`}
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
                                                {track.image ? (
                                                    <img
                                                        src={track.image}
                                                        alt={track.name || track.title}
                                                        onError={(e) => { e.target.src = DEFAULT_IMAGE; }}
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
                                                <div className="track-name" title={track.name || track.title}>
                                                    {track.name || track.title}
                                                </div>
                                                <div className="track-artist">
                                                    {getArtistName(track)}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Album */}
                                        <div className="track-album-cell">
                                            {(typeof track.album === 'object' ? (track.album.title || track.album.name) : track.album) || 'Single'}
                                        </div>

                                        {/* Duration */}
                                        <div className="track-duration-cell">
                                            {formatDuration(track.duration)}
                                        </div>

                                        {/* Menú de opciones del track */}
                                        <div className="track-actions-cell">
                                            <div className="track-menu-container" ref={showTrackMenu === track.id ? trackMenuRef : null}>
                                                <button
                                                    className="track-menu-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowTrackMenu(showTrackMenu === track.id ? null : track.id);
                                                    }}
                                                >
                                                    <FaEllipsisH size={14} />
                                                </button>

                                                {showTrackMenu === track.id && (
                                                    <div className="track-dropdown-menu">
                                                        <button
                                                            className="dropdown-item"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setShowAddToPlaylistModal(track);
                                                            }}
                                                        >
                                                            <FaListAlt />
                                                            <span>Añadir a otra playlist</span>
                                                        </button>
                                                        <button
                                                            className="dropdown-item"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleViewArtist(track);
                                                            }}
                                                        >
                                                            <FaUser />
                                                            <span>Ver artista</span>
                                                        </button>
                                                        {isNative && (
                                                            <>
                                                                <div className="dropdown-divider"></div>
                                                                <button
                                                                    className="dropdown-item danger"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setShowDeleteTrackConfirm(track);
                                                                    }}
                                                                >
                                                                    <FaTrash />
                                                                    <span>Quitar de playlist</span>
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modal para añadir canciones */}
            {showAddTrack && (
                <div className="add-track-modal-overlay" onClick={() => setShowAddTrack(false)}>
                    <div className="add-track-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="add-track-header">
                            <h3>Añadir canciones</h3>
                            <button className="add-track-close" onClick={() => setShowAddTrack(false)}>
                                <FaTimes />
                            </button>
                        </div>

                        <div className="add-track-search">
                            <FaSearch className="search-icon" />
                            <input
                                type="text"
                                placeholder="Buscar canciones..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                            {searchQuery && (
                                <button
                                    className="search-clear"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSearchResults([]);
                                    }}
                                >
                                    <FaTimes />
                                </button>
                            )}
                        </div>

                        <div className="add-track-results">
                            {isSearching ? (
                                <div className="add-track-loading">
                                    <div className="loading-spinner-small" />
                                    <span>Buscando...</span>
                                </div>
                            ) : searchResults.length > 0 ? (
                                searchResults.map((track, index) => {
                                    const alreadyAdded = isTrackInPlaylist(track);
                                    return (
                                        <div
                                            key={`search-${track.id || 'unknown'}-${index}`}
                                            className={`add-track-item ${alreadyAdded ? 'added' : ''}`}
                                            onClick={() => !alreadyAdded && handleAddTrack(track)}
                                        >
                                            <div className="add-track-artwork">
                                                {track.image ? (
                                                    <img src={track.image} alt={track.name} />
                                                ) : (
                                                    <div className="add-track-artwork-fallback">
                                                        <FaMusic />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="add-track-info">
                                                <span className="add-track-name">{track.name || track.title}</span>
                                                <span className="add-track-artist">{getArtistName(track)}</span>
                                            </div>
                                            <div className="add-track-action">
                                                {alreadyAdded ? (
                                                    <FaCheck className="added-icon" />
                                                ) : (
                                                    <FaPlus className="add-icon" />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            ) : searchQuery.trim() ? (
                                <div className="add-track-empty">
                                    <FaMusic />
                                    <span>No se encontraron resultados</span>
                                </div>
                            ) : (
                                <div className="add-track-empty">
                                    <FaSearch />
                                    <span>Busca canciones para añadir</span>
                                </div>
                            )}

                            {/* Sección de Recomendaciones (solo si no hay búsqueda) */}
                            {!searchQuery && (
                                <div className="add-track-recommendations">
                                    <div className="recommendations-header">
                                        <h4>Recomendadas para ti</h4>
                                        <button className="refresh-btn" onClick={fetchRecommendations} disabled={isLoadingRecommendations}>
                                            <FaRandom className={isLoadingRecommendations ? 'spinning' : ''} />
                                        </button>
                                    </div>

                                    {isLoadingRecommendations ? (
                                        <div className="add-track-loading">
                                            <div className="loading-spinner-small" />
                                            <span>Buscando joyas...</span>
                                        </div>
                                    ) : recommendedTracks.length > 0 ? (
                                        <div className="recommendations-list">
                                            {recommendedTracks.map((track, index) => (
                                                <div
                                                    key={`rec-${track.id || 'unknown'}-${index}`}
                                                    className="add-track-item"
                                                    onClick={() => handleAddTrack(track)}
                                                >
                                                    <div className="add-track-artwork">
                                                        {track.image ? (
                                                            <img src={track.image} alt={track.name} />
                                                        ) : (
                                                            <div className="add-track-artwork-fallback">
                                                                <FaMusic />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="add-track-info">
                                                        <span className="add-track-name">{track.name || track.title}</span>
                                                        <span className="add-track-artist">{getArtistName(track)}</span>
                                                    </div>
                                                    <div className="add-track-action">
                                                        <FaPlus className="add-icon" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="recommendations-empty">
                                            <p>No pudimos generar recomendaciones en este momento.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de confirmación para eliminar playlist */}
            {showDeleteConfirm && (
                <div className="confirm-modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
                    <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-modal-icon danger">
                            <FaExclamationTriangle />
                        </div>
                        <h3>¿Eliminar playlist?</h3>
                        <p>Esta acción no se puede deshacer. Se eliminará "{playlist.name || playlist.title}" permanentemente.</p>
                        <div className="confirm-modal-actions">
                            <button className="confirm-btn cancel" onClick={() => setShowDeleteConfirm(false)}>
                                Cancelar
                            </button>
                            <button className="confirm-btn danger" onClick={handleDeletePlaylist}>
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de confirmación para eliminar canción */}
            {showDeleteTrackConfirm && (
                <div className="confirm-modal-overlay" onClick={() => setShowDeleteTrackConfirm(null)}>
                    <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="confirm-modal-icon warning">
                            <FaTrash />
                        </div>
                        <h3>¿Quitar canción?</h3>
                        <p>Se eliminará "{showDeleteTrackConfirm.name || showDeleteTrackConfirm.title}" de esta playlist.</p>
                        <div className="confirm-modal-actions">
                            <button className="confirm-btn cancel" onClick={() => setShowDeleteTrackConfirm(null)}>
                                Cancelar
                            </button>
                            <button className="confirm-btn danger" onClick={() => handleRemoveTrack(showDeleteTrackConfirm.id)}>
                                Quitar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal para añadir a otra playlist */}
            {showAddToPlaylistModal && (
                <div className="confirm-modal-overlay" onClick={() => setShowAddToPlaylistModal(null)}>
                    <div className="add-to-playlist-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="add-to-playlist-header">
                            <h3>Añadir a playlist</h3>
                            <button className="add-track-close" onClick={() => setShowAddToPlaylistModal(null)}>
                                <FaTimes />
                            </button>
                        </div>
                        <div className="add-to-playlist-track">
                            <div className="add-track-artwork">
                                {showAddToPlaylistModal.image ? (
                                    <img src={showAddToPlaylistModal.image} alt="" />
                                ) : (
                                    <div className="add-track-artwork-fallback">
                                        <FaMusic />
                                    </div>
                                )}
                            </div>
                            <div className="add-track-info">
                                <span className="add-track-name">{showAddToPlaylistModal.name || showAddToPlaylistModal.title}</span>
                                <span className="add-track-artist">{getArtistName(showAddToPlaylistModal)}</span>
                            </div>
                        </div>
                        <div className="add-to-playlist-list">
                            {playlists.filter(p => p.id !== playlistId).length > 0 ? (
                                playlists
                                    .filter(p => p.id !== playlistId)
                                    .map(p => (
                                        <button
                                            key={p.id}
                                            className="add-to-playlist-item"
                                            onClick={() => handleAddToOtherPlaylist(p.id, showAddToPlaylistModal)}
                                        >
                                            <div className="add-to-playlist-icon">
                                                <FaListAlt />
                                            </div>
                                            <div className="add-to-playlist-info">
                                                <span className="add-to-playlist-name">{p.name}</span>
                                                <span className="add-to-playlist-count">{p.tracks?.length || 0} canciones</span>
                                            </div>
                                            <FaPlus className="add-to-playlist-action" />
                                        </button>
                                    ))
                            ) : (
                                <div className="add-track-empty">
                                    <FaListAlt />
                                    <span>No tienes otras playlists</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
