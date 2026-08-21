import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
// React Icons
// React Icons
import {
    FaPlus, FaPlay, FaMusic, FaCompactDisc, FaTimes, FaTrash,
    FaHeart, FaUser, FaListAlt, FaArrowLeft, FaRandom, FaEllipsisH,
    FaChevronRight, FaSortAmountDown, FaSortAlphaDown
} from 'react-icons/fa';
import { MdLibraryMusic } from "react-icons/md";
import { usePlayer } from '../../context/playerContext';
import { useUser } from '../../context/userContext';
import { useFeedback } from '../../context/feedbackContext';

// ⭐ Sistema de caché en memoria para persistencia entre navegaciones
import screenStateCache, { useScrollPersistence } from '../../services/screenStateCache';

import './library.css';
import './library-modal.css';
import './library-modal.css';
import Card from '../../components/shared/Card';
import { libraryGenerator } from '../../services/libraryGenerator';

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60';

// =============================================================================
// COMPONENTE PRINCIPAL: BIBLIOTECA UNIFICADA
// =============================================================================
export default function Library() {
    const { playTrack } = usePlayer();
    const { notify, confirm } = useFeedback();
    const navigate = useNavigate();
    const containerRef = useRef(null);

    const {
        playlists,
        favorites,
        savedArtists,
        savedAlbums,
        savedPlaylists,
        createPlaylist,
        deletePlaylist,
        toggleFavorite,
        loading,
        user
    } = useUser();

    // ⭐ Persistencia de scroll entre navegaciones
    useScrollPersistence('library', containerRef);

    // Estado de UI - Con caché en memoria para persistir activeSection
    const [activeSection, setActiveSectionInternal] = useState(() => {
        // Restaurar sección activa del caché si existe
        return screenStateCache.get('library', 'activeSection') || null;
    });

    // Wrapper para setActiveSection que también actualiza el caché
    const setActiveSection = useCallback((section) => {
        setActiveSectionInternal(section);
        screenStateCache.set('library', 'activeSection', section);
    }, []);

    // Estado para ordenamiento
    const [sortOrder, setSortOrder] = useState('added-desc'); // added-desc, added-asc, alpha-asc, alpha-desc
    const [showSortMenu, setShowSortMenu] = useState(false);

    // Lógica de ordenamiento
    const sortedFavorites = useMemo(() => {
        if (!favorites) return [];
        const items = [...favorites];

        switch (sortOrder) {
            case 'added-desc': // Recientes al principio (asumiendo favorites viene Oldest->Newest)
                return items.reverse();
            case 'added-asc': // Antiguas al principio
                return items;
            case 'alpha-asc': // A-Z
                return items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            case 'alpha-desc': // Z-A
                return items.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            default:
                return items.reverse();
        }
    }, [favorites, sortOrder]);

    // Lógica de ordenamiento Artistas
    const [artistSortOrder, setArtistSortOrder] = useState('added-desc');

    const sortedArtists = useMemo(() => {
        if (!savedArtists) return [];
        const items = [...savedArtists];

        switch (artistSortOrder) {
            case 'added-desc': return items.reverse(); // Asumiendo oldest -> newest
            case 'added-asc': return items;
            case 'alpha-asc': return items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            case 'alpha-desc': return items.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
            default: return items.reverse();
        }
    }, [savedArtists, artistSortOrder]);

    // Lógica de ordenamiento Álbumes
    const [albumSortOrder, setAlbumSortOrder] = useState('added-desc');

    const sortedAlbums = useMemo(() => {
        if (!savedAlbums) return [];
        const items = [...savedAlbums];

        switch (albumSortOrder) {
            case 'added-desc': return items.reverse(); // Asumiendo oldest -> newest
            case 'added-asc': return items;
            case 'alpha-asc': return items.sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));
            case 'alpha-desc': return items.sort((a, b) => (b.title || b.name || '').localeCompare(a.title || a.name || ''));
            default: return items.reverse();
        }
    }, [savedAlbums, albumSortOrder]);

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newPlaylistName, setNewPlaylistName] = useState('');
    const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [displayedSongsLimit, setDisplayedSongsLimit] = useState(150);

    // Reset infinite scroll when changing sections
    useEffect(() => {
        if (activeSection === 'songs') {
            setDisplayedSongsLimit(150);
        }
    }, [activeSection]);

    // Scroll detection & Infinite Scroll
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;

            // Infinite Scroll Logic (only for 'songs' section)
            if (activeSection === 'songs') {
                // If we are close to bottom (500px buffer)
                if (scrollHeight - scrollTop - clientHeight < 500) {
                    setDisplayedSongsLimit(prev => prev + 150); // Load next batch
                }
            }
        };

        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [activeSection]);

    // Handler para crear playlist (Manual o Mágica)
    const handleCreatePlaylist = useCallback(async () => {
        if (!newPlaylistName.trim()) return;
        setIsCreating(true);

        try {
            let result;

            if (activeSection === 'magic') {
                // --- MODO MÁGICO ---
                console.log('[Library] Generando playlist mágica para:', newPlaylistName);

                // 1. Generar playlist usando el servicio inteligente
                const generated = await libraryGenerator.generate(newPlaylistName.trim(), {
                    user,
                    favorites,
                    listeningHistory: [], // TODO: Pasar historial real si está disponible
                });

                if (!generated || !generated.tracks || generated.tracks.length === 0) {
                    notify('No encontramos canciones para ese ambiente. Prueba con otra descripción.', { type: 'warning' });
                    setIsCreating(false);
                    return;
                }

                // 2. Guardar en Firebase (aprovechando que createPlaylist soporta objetos completos)
                result = await createPlaylist(generated);

            } else {
                // --- MODO MANUAL ---
                result = await createPlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
            }

            // Finalizar
            setShowCreateModal(false);
            setNewPlaylistName('');
            setNewPlaylistDesc('');
            // Resetear tab si estaba en magic para la próxima vez
            if (activeSection === 'magic') setActiveSection(null);

            if (result?.id) {
                navigate(`/playlist/${result.id}`);
            }
        } catch (error) {
            console.error('Error creating playlist:', error);
            notify(error.message || 'No se pudo crear la playlist.', { type: 'error' });
        } finally {
            setIsCreating(false);
        }
    }, [newPlaylistName, newPlaylistDesc, createPlaylist, navigate, activeSection, user, favorites, setActiveSection, notify]);

    // Cerrar modal y limpiar
    const onCloseModal = useCallback(() => {
        setShowCreateModal(false);
        setNewPlaylistName('');
        setNewPlaylistDesc('');
    }, []);

    const handleDeletePlaylist = async (playlistId, e) => {
        e.stopPropagation();
        const accepted = await confirm({
            title: 'Eliminar playlist',
            message: 'Esta playlist se eliminará de tu biblioteca. Esta acción no se puede deshacer.',
            confirmLabel: 'Eliminar',
            tone: 'danger',
        });
        if (accepted) {
            try {
                await deletePlaylist(playlistId);
                notify('Playlist eliminada.', { type: 'success' });
            } catch (error) {
                console.error('Error deleting playlist:', error);
                notify('No se pudo eliminar la playlist.', { type: 'error' });
            }
        }
    };

    const handlePlaySongs = () => {
        if (sortedFavorites && sortedFavorites.length > 0) {
            // [FIX] Usar sortedFavorites como Source of Truth y pasar contexto
            playTrack(
                sortedFavorites[0],
                sortedFavorites,
                { id: 'library-songs', type: 'library', name: 'Canciones' }
            );
        }
    };

    const handleShuffleSongs = () => {
        if (sortedFavorites && sortedFavorites.length > 0) {
            // [FIX] Iniciar shuffle real con el orden actual
            const randomIndex = Math.floor(Math.random() * sortedFavorites.length);
            playTrack(
                sortedFavorites[randomIndex],
                sortedFavorites,
                { id: 'library-songs', type: 'library', name: 'Canciones' },
                true // forceShuffle
            );
        }
    };

    // Helper para obtener imagen
    const getImageUrl = (item) => {
        let finalImage = DEFAULT_IMAGE;

        if (!item) finalImage = DEFAULT_IMAGE;
        else if (typeof item.image === 'string' && item.image) finalImage = item.image;
        else if (item.picture_medium) finalImage = item.picture_medium;
        else if (item.picture_xl) finalImage = item.picture_xl;
        else if (Array.isArray(item.image)) {
            const best = item.image.find(i => i.size === 'medium') ||
                item.image.find(i => i.size === 'large') ||
                item.image.find(i => i.size === 'extralarge') ||
                item.image[item.image.length - 1];
            if (best?.['#text']) finalImage = best['#text'];
        }

        // ⚡ TURBO FIX: Resize on the fly
        if (typeof finalImage === 'string' && finalImage.includes('dzcdn.net')) {
            return finalImage.replace(/\/\d+x\d+(-000000-80-0-0\.jpg)/, '/250x250$1')
                .replace(/\/\d+x\d+(\.jpg)/, '/250x250$1');
        }
        return finalImage;
    };

    // ==========================================================================
    // VISTA PRINCIPAL: Hub estilo Apple Music
    // ==========================================================================
    const renderMainHub = () => {
        const totalPlaylists = playlists.length + savedPlaylists.length;

        return (
            <>
                {/* Hero Header */}
                <section className="library-hero-section">
                    <div className="library-hero-icon">
                        <MdLibraryMusic />
                    </div>
                    <div className="library-hero-text">
                        <span className="library-hero-label">TU BIBLIOTECA</span>
                        <p className="library-hero-stats">
                            {favorites.length} canciones • {totalPlaylists} playlists • {savedAlbums.length} álbumes
                        </p>
                    </div>
                </section>

                {/* CTA de Importación para nuevos usuarios */}
                {favorites.length === 0 && playlists.length === 0 && savedAlbums.length === 0 && savedArtists.length === 0 && (
                    <section className="library-import-cta">
                        <div className="import-cta-content">
                            <div className="import-cta-icon">
                                <FaMusic />
                            </div>
                            <h3>¿Ya tienes música en otra plataforma?</h3>
                            <p>Importa tu biblioteca de Spotify o YouTube en segundos</p>
                            <button
                                className="import-cta-btn"
                                onClick={() => navigate('/import')}
                            >
                                <FaMusic />
                                Importar mi música
                            </button>
                        </div>
                    </section>
                )}

                {/* Main Access Buttons - Estilo Apple Music */}
                <section className="library-main-buttons">
                    {/* Canciones (anteriormente Favorites) */}
                    <button
                        className="library-main-btn"
                        onClick={() => setActiveSection('songs')}
                    >
                        <div className="main-btn-icon songs">
                            <FaHeart />
                        </div>
                        <div className="main-btn-content">
                            <span className="main-btn-title">Canciones</span>
                            <span className="main-btn-count">{favorites.length}</span>
                        </div>
                        <FaChevronRight className="main-btn-arrow" />
                    </button>

                    {/* Playlists */}
                    <button
                        className="library-main-btn"
                        onClick={() => setActiveSection('playlists')}
                    >
                        <div className="main-btn-icon playlists">
                            <FaListAlt />
                        </div>
                        <div className="main-btn-content">
                            <span className="main-btn-title">Playlists</span>
                            <span className="main-btn-count">{totalPlaylists}</span>
                        </div>
                        <FaChevronRight className="main-btn-arrow" />
                    </button>

                    {/* Álbumes */}
                    <button
                        className="library-main-btn"
                        onClick={() => setActiveSection('albums')}
                    >
                        <div className="main-btn-icon albums">
                            <FaCompactDisc />
                        </div>
                        <div className="main-btn-content">
                            <span className="main-btn-title">Álbumes</span>
                            <span className="main-btn-count">{savedAlbums.length}</span>
                        </div>
                        <FaChevronRight className="main-btn-arrow" />
                    </button>

                    {/* Artistas */}
                    <button
                        className="library-main-btn"
                        onClick={() => setActiveSection('artists')}
                    >
                        <div className="main-btn-icon artists">
                            <FaUser />
                        </div>
                        <div className="main-btn-content">
                            <span className="main-btn-title">Artistas</span>
                            <span className="main-btn-count">{savedArtists.length}</span>
                        </div>
                        <FaChevronRight className="main-btn-arrow" />
                    </button>

                </section>

                {/* Quick Preview - Añadidas Recientemente */}
                {favorites.length > 0 && (
                    <section className="library-recent-section">
                        <div className="section-header">
                            <h2>Añadido Recientemente</h2>
                            <button
                                className="see-all-btn"
                                onClick={() => setActiveSection('songs')}
                            >
                                Ver todo
                            </button>
                        </div>
                        <div className="recent-songs-grid">
                            {[...favorites].reverse().slice(0, 6).map((song, i) => (
                                <div key={`recent-${i}`} className="recent-song-wrapper">
                                    <Card
                                        item={song}
                                        variant="vertical"
                                        onClick={() => playTrack(song, sortedFavorites, { id: 'library-recent', type: 'library' })}
                                        onPlay={() => playTrack(song, sortedFavorites, { id: 'library-recent', type: 'library' })}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Quick Preview - Playlists */}
                {(playlists.length > 0 || savedPlaylists.length > 0) && (
                    <section className="library-recent-section">
                        <div className="section-header">
                            <h2>Tus Playlists</h2>
                            <button
                                className="see-all-btn"
                                onClick={() => setActiveSection('playlists')}
                            >
                                Ver todo
                            </button>
                        </div>
                        <div className="recent-songs-grid">
                            {[...playlists, ...savedPlaylists].slice(0, 6).map((pl, i) => (
                                <div key={`pl-${pl.id || i}`} className="recent-song-wrapper">
                                    <Card
                                        item={pl}
                                        variant="vertical"
                                        onClick={() => navigate(`/playlist/${pl.id}`)}
                                        subtitle={`${pl.tracks?.length || 0} canciones`}
                                    />
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </>
        );
    };

    // ==========================================================================
    // VISTA: Canciones (Contenido de Favorites integrado)
    // ==========================================================================
    const renderSongsSection = () => (
        <div className="library-subsection">
            {/* Header con acciones */}
            <div className="subsection-hero songs-hero">
                <div className="subsection-hero-art">
                    <FaHeart />
                </div>
                <div className="subsection-hero-info">
                    <span className="subsection-label">TU COLECCIÓN</span>
                    <h1 className="subsection-title">Canciones</h1>
                    <p className="subsection-meta">
                        {user?.displayName || 'Usuario'} • {favorites.length} canciones guardadas
                    </p>
                </div>
            </div>

            {/* Action Buttons & Sort */}
            <div className="subsection-actions" style={{ position: 'relative' }}>
                <button
                    className="subsection-action-btn primary"
                    onClick={handlePlaySongs}
                    disabled={favorites.length === 0}
                >
                    <FaPlay />
                    <span>Repr.</span>
                </button>
                <button
                    className="subsection-action-btn secondary"
                    onClick={handleShuffleSongs}
                    disabled={favorites.length === 0}
                >
                    <FaRandom />
                    <span>Aleatorio</span>
                </button>
                <button
                    className="subsection-action-btn secondary"
                    onClick={() => setShowSortMenu(!showSortMenu)}
                    disabled={favorites.length === 0}
                    style={{ maxWidth: '60px', padding: '0' }}
                >
                    {sortOrder.includes('alpha') ? <FaSortAlphaDown /> : <FaSortAmountDown />}
                </button>

                {/* Sort Menu Dropdown */}
                {showSortMenu && (
                    <div className="library-sort-menu">
                        <button type="button" className="sort-option" onClick={() => { setSortOrder('added-desc'); setShowSortMenu(false); }}>
                            <span>Recientes primero</span>
                            {sortOrder === 'added-desc' && <div className="sort-check" />}
                        </button>
                        <button type="button" className="sort-option" onClick={() => { setSortOrder('added-asc'); setShowSortMenu(false); }}>
                            <span>Antiguas primero</span>
                            {sortOrder === 'added-asc' && <div className="sort-check" />}
                        </button>
                        <button type="button" className="sort-option" onClick={() => { setSortOrder('alpha-asc'); setShowSortMenu(false); }}>
                            <span>Alfabético (A-Z)</span>
                            {sortOrder === 'alpha-asc' && <div className="sort-check" />}
                        </button>
                        <button type="button" className="sort-option" onClick={() => { setSortOrder('alpha-desc'); setShowSortMenu(false); }}>
                            <span>Alfabético (Z-A)</span>
                            {sortOrder === 'alpha-desc' && <div className="sort-check" />}
                        </button>
                    </div>
                )}
            </div>

            {/* Songs List */}
            {favorites.length === 0 ? (
                <div className="library-empty-state">
                    <FaHeart size={48} />
                    <h3>No tienes canciones guardadas</h3>
                    <p>Dale ❤️ a las canciones mientras escuchas para guardarlas aquí.</p>
                    <button className="empty-action-btn" onClick={() => navigate('/feed')}>
                        Explorar Música
                    </button>
                </div>
            ) : (
                <div className="songs-list">
                    {sortedFavorites.slice(0, displayedSongsLimit).map((track, index) => (
                        <div
                            key={`${track.name}-${index}`}
                            className="song-list-item"
                            onClick={() => playTrack(track, sortedFavorites, { id: 'library-songs', type: 'library' })}
                        >
                            <span className="song-index">{index + 1}</span>

                            <div className="song-cover">
                                {track.image ? (
                                    <img src={getImageUrl(track)} alt={track.name} />
                                ) : (
                                    <div className="song-cover-fallback">
                                        <FaMusic />
                                    </div>
                                )}
                                <div className="song-play-overlay">
                                    <FaPlay />
                                </div>
                            </div>

                            <div className="song-info">
                                <span className="song-title">{track.name}</span>
                                <span className="song-artist">
                                    {track.album || 'Single'} • {typeof track.artist === 'object' ? track.artist.name : track.artist}
                                </span>
                            </div>

                            <button
                                className="song-like-btn liked"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(track);
                                }}
                            >
                                <FaHeart />
                            </button>



                            <button
                                className="song-menu-btn"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <FaEllipsisH />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // ==========================================================================
    // VISTA: Playlists
    // ==========================================================================
    const renderPlaylistsSection = () => {
        const allPlaylists = [
            ...playlists.map(p => ({ ...p, isUserCreated: true })),
            ...savedPlaylists.map(p => ({ ...p, isUserCreated: false }))
        ];

        return (
            <div className="library-subsection">
                <div className="subsection-hero playlists-hero">
                    <div className="subsection-hero-art">
                        <FaListAlt />
                    </div>
                    <div className="subsection-hero-info">
                        <span className="subsection-label">TU COLECCIÓN</span>
                        <h1 className="subsection-title">Playlists</h1>
                        <p className="subsection-meta">
                            {user?.displayName || 'Usuario'} • {allPlaylists.length} playlists
                        </p>
                    </div>
                </div>

                <div className="subsection-actions">
                    <button
                        className="subsection-action-btn primary"
                        onClick={() => setShowCreateModal(true)}
                    >
                        <FaPlus />
                        <span>Crear Playlist</span>
                    </button>
                </div>

                <div className="library-grid">
                    {allPlaylists.map((pl) => (
                        <div
                            key={pl.id}
                            className="library-card"
                            onClick={() => navigate(`/playlist/${pl.id}`)}
                        >
                            <div className="library-card-img">
                                {pl.image ? (
                                    <img src={getImageUrl(pl)} alt={pl.name} loading="lazy" />
                                ) : (
                                    <div className="library-card-fallback">
                                        <FaMusic />
                                    </div>
                                )}
                                {!pl.isUserCreated && (
                                    <span className="card-badge">Guardada</span>
                                )}
                                <button
                                    className="card-play-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (pl.tracks?.length > 0) {
                                            playTrack(pl.tracks[0], pl.tracks);
                                        }
                                    }}
                                >
                                    <FaPlay />
                                </button>
                                {pl.isUserCreated && (
                                    <button
                                        className="card-delete-btn"
                                        onClick={(e) => handleDeletePlaylist(pl.id, e)}
                                    >
                                        <FaTrash />
                                    </button>
                                )}
                            </div>
                            <div className="library-card-info">
                                <span className="library-card-title">{pl.name}</span>
                                <span className="library-card-sub">
                                    {pl.isUserCreated
                                        ? `${pl.tracks?.length || 0} canciones`
                                        : `Por ${pl.creator || 'Deezer'}`
                                    }
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {allPlaylists.length === 0 && (
                    <div className="library-empty-state">
                        <FaListAlt size={48} />
                        <h3>No tienes playlists</h3>
                        <p>Crea tu primera playlist o guarda playlists de Deezer.</p>
                        <button className="empty-action-btn" onClick={() => setShowCreateModal(true)}>
                            Crear Playlist
                        </button>
                    </div>
                )}
            </div>
        );
    };

    // ==========================================================================
    // VISTA: Álbumes
    // ==========================================================================
    const renderAlbumsSection = () => (
        <div className="library-subsection">
            <div className="subsection-hero albums-hero">
                <div className="subsection-hero-art">
                    <FaCompactDisc />
                </div>
                <div className="subsection-hero-info">
                    <span className="subsection-label">TU COLECCIÓN</span>
                    <h1 className="subsection-title">Álbumes</h1>
                    <p className="subsection-meta">
                        {user?.displayName || 'Usuario'} • {savedAlbums.length} álbumes guardados
                    </p>
                </div>
            </div>

            {/* Sort for Albums */}
            <div className="subsection-actions" style={{ justifyContent: 'flex-end', paddingBottom: '16px' }}>
                <div style={{ position: 'relative' }}>
                    <button
                        className="subsection-action-btn secondary"
                        onClick={() => setShowSortMenu(!showSortMenu)}
                        disabled={savedAlbums.length === 0}
                        style={{ maxWidth: '60px', padding: '0' }}
                    >
                        {albumSortOrder.includes('alpha') ? <FaSortAlphaDown /> : <FaSortAmountDown />}
                    </button>
                    {showSortMenu && (
                        <div className="library-sort-menu">
                            <button type="button" className="sort-option" onClick={() => { setAlbumSortOrder('added-desc'); setShowSortMenu(false); }}>
                                <span>Recientes primero</span>
                                {albumSortOrder === 'added-desc' && <div className="sort-check" />}
                            </button>
                            <button type="button" className="sort-option" onClick={() => { setAlbumSortOrder('added-asc'); setShowSortMenu(false); }}>
                                <span>Antiguas primero</span>
                                {albumSortOrder === 'added-asc' && <div className="sort-check" />}
                            </button>
                            <button type="button" className="sort-option" onClick={() => { setAlbumSortOrder('alpha-asc'); setShowSortMenu(false); }}>
                                <span>Alfabético (A-Z)</span>
                                {albumSortOrder === 'alpha-asc' && <div className="sort-check" />}
                            </button>
                            <button type="button" className="sort-option" onClick={() => { setAlbumSortOrder('alpha-desc'); setShowSortMenu(false); }}>
                                <span>Alfabético (Z-A)</span>
                                {albumSortOrder === 'alpha-desc' && <div className="sort-check" />}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {savedAlbums.length === 0 ? (
                <div className="library-empty-state">
                    <FaCompactDisc size={48} />
                    <h3>No tienes álbumes guardados</h3>
                    <p>Guarda álbumes desde la página del artista para verlos aquí.</p>
                    <button className="empty-action-btn" onClick={() => navigate('/feed')}>
                        Explorar Música
                    </button>
                </div>
            ) : (
                <div className="library-grid">
                    {sortedAlbums.map((album, i) => (
                        <div key={`album-${i}`} className="library-card-wrapper">
                            <Card
                                item={album}
                                variant="vertical"
                                onClick={() => navigate(`/album/${encodeURIComponent(album.artist)}/${encodeURIComponent(album.name)}`)}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // ==========================================================================
    // VISTA: Artistas
    // ==========================================================================
    const renderArtistsSection = () => (
        <div className="library-subsection">
            <div className="subsection-hero artists-hero">
                <div className="subsection-hero-art">
                    <FaUser />
                </div>
                <div className="subsection-hero-info">
                    <span className="subsection-label">TU COLECCIÓN</span>
                    <h1 className="subsection-title">Artistas</h1>
                    <p className="subsection-meta">
                        {user?.displayName || 'Usuario'} • {savedArtists.length} artistas guardados
                    </p>
                </div>
            </div>

            {/* Sort for Artists */}
            <div className="subsection-actions" style={{ justifyContent: 'flex-end', paddingBottom: '16px' }}>
                <div style={{ position: 'relative' }}>
                    <button
                        className="subsection-action-btn secondary"
                        onClick={() => setShowSortMenu(!showSortMenu)}
                        disabled={savedArtists.length === 0}
                        style={{ maxWidth: '60px', padding: '0' }}
                    >
                        {artistSortOrder.includes('alpha') ? <FaSortAlphaDown /> : <FaSortAmountDown />}
                    </button>
                    {showSortMenu && (
                        <div className="library-sort-menu">
                            <button type="button" className="sort-option" onClick={() => { setArtistSortOrder('added-desc'); setShowSortMenu(false); }}>
                                <span>Recientes primero</span>
                                {artistSortOrder === 'added-desc' && <div className="sort-check" />}
                            </button>
                            <button type="button" className="sort-option" onClick={() => { setArtistSortOrder('added-asc'); setShowSortMenu(false); }}>
                                <span>Antiguas primero</span>
                                {artistSortOrder === 'added-asc' && <div className="sort-check" />}
                            </button>
                            <button type="button" className="sort-option" onClick={() => { setArtistSortOrder('alpha-asc'); setShowSortMenu(false); }}>
                                <span>Alfabético (A-Z)</span>
                                {artistSortOrder === 'alpha-asc' && <div className="sort-check" />}
                            </button>
                            <button type="button" className="sort-option" onClick={() => { setArtistSortOrder('alpha-desc'); setShowSortMenu(false); }}>
                                <span>Alfabético (Z-A)</span>
                                {artistSortOrder === 'alpha-desc' && <div className="sort-check" />}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {savedArtists.length === 0 ? (
                <div className="library-empty-state">
                    <FaUser size={48} />
                    <h3>No sigues a ningún artista</h3>
                    <p>Sigue artistas desde su página para verlos aquí.</p>
                    <button className="empty-action-btn" onClick={() => navigate('/feed')}>
                        Explorar Música
                    </button>
                </div>
            ) : (
                <div className="library-grid artists-grid">
                    {sortedArtists.map((artist, i) => (
                        <div key={`artist-${i}`} className="library-card-wrapper">
                            <Card
                                item={artist}
                                variant="circle"
                                onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    // ==========================================================================
    // LOADING & AUTH STATES
    // ==========================================================================
    if (loading) return (
        <div className="library-page loading">
            <div className="library-spinner"></div>
        </div>
    );

    if (!user) return (
        <div className="library-page unauthenticated">
            <div className="unauth-content">
                <div className="unauth-icon">
                    <MdLibraryMusic />
                </div>
                <h2>Inicia sesión</h2>
                <p>Necesitas una cuenta para acceder a tu biblioteca.</p>
                <button className="unauth-login-btn" onClick={() => navigate('/login')}>
                    Ir al Login
                </button>
            </div>
        </div>
    );

    // ==========================================================================
    // RENDER PRINCIPAL
    // ==========================================================================



    return (
        <div className="library-page" ref={containerRef}>
            {/* Floating Back Navigation */}
            {activeSection && (
                <button
                    className="library-floating-back"
                    onClick={() => setActiveSection(null)}
                    aria-label="Volver"
                >
                    <FaArrowLeft />
                </button>
            )}

            {/* Main Content without Animations */}
            <main className="library-content">
                {!activeSection && renderMainHub()}
                {activeSection === 'songs' && renderSongsSection()}
                {activeSection === 'playlists' && renderPlaylistsSection()}
                {activeSection === 'albums' && renderAlbumsSection()}
                {activeSection === 'artists' && renderArtistsSection()}
            </main>

            {/* Create Playlist Modal - Mejorado con Tabs Manual / Mágica */}
            {showCreateModal && createPortal(
                <div className="modal-overlay" onClick={onCloseModal}>
                    <div className="modal-content vibe-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Nueva Playlist</h2>
                            <button className="modal-close" onClick={onCloseModal}>
                                <FaTimes />
                            </button>
                        </div>

                        {/* TABS SELECTOR */}
                        <div className="modal-tabs">
                            <button
                                className={`modal-tab ${!isCreating && activeSection !== 'magic' ? 'active' : ''}`}
                                onClick={() => setActiveSection(null)}
                            >
                                Manual
                            </button>
                            <button
                                className={`modal-tab ${activeSection === 'magic' ? 'active' : ''}`}
                                onClick={() => setActiveSection('magic')}
                            >
                                ✨ Mágica
                            </button>
                        </div>

                        <div className="modal-body">
                            {activeSection !== 'magic' ? (
                                /* --- MODO MANUAL --- */
                                <>
                                    <div className="modal-field">
                                        <label>Nombre</label>
                                        <input
                                            type="text"
                                            placeholder="Ej. Para Codear"
                                            value={newPlaylistName}
                                            onChange={(e) => setNewPlaylistName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                                            autoFocus
                                        />
                                    </div>
                                    <div className="modal-field">
                                        <label>Descripción (Opcional)</label>
                                        <textarea
                                            placeholder="¿De qué trata esta playlist?"
                                            value={newPlaylistDesc}
                                            onChange={(e) => setNewPlaylistDesc(e.target.value)}
                                            rows={3}
                                        />
                                    </div>
                                </>
                            ) : (
                                /* --- MODO MÁGICO --- */
                                <div className="magic-mode-content">
                                    <div className="modal-field">
                                        <label>¿Qué quieres escuchar?</label>
                                        <input
                                            type="text"
                                            placeholder="Ej. 'Música relajante para estudiar' o 'Rock'"
                                            value={newPlaylistName}
                                            onChange={(e) => setNewPlaylistName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                                            autoFocus
                                        />
                                        <p className="field-hint">
                                            Escribe un género o un "vibe" y crearemos una playlist única para ti basada en tus gustos.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button className="modal-btn cancel" onClick={onCloseModal}>
                                Cancelar
                            </button>
                            <button
                                className="modal-btn create"
                                onClick={handleCreatePlaylist}
                                disabled={!newPlaylistName.trim() || isCreating}
                            >
                                {isCreating ? 'Creando...' : (activeSection === 'magic' ? '✨ Generar' : 'Crear')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
