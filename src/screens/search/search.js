import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    FaSearch, 
    FaPlay, 
    FaCompactDisc, 
    FaUser, 
    FaMusic, 
    FaListAlt, 
    FaTimes,
    FaMicrophone
} from 'react-icons/fa';
import './search.css';

import { usePlayer } from '../../context/playerContext';
import {
    trackSearch,
    artistSearch,
    albumSearch,
    playlistSearch,
    fetchAudioUrl
} from '../../services/unifiedService';

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60';

// =============================================================================
// UTILIDADES
// =============================================================================

const getImageUrl = (item) => {
    if (! item) return null;
    if (item.image && typeof item.image === 'string') return item.image;
    if (item.cover_xl) return item.cover_xl;
    if (item.picture_xl) return item.picture_xl;
    if (Array.isArray(item.image)) {
        const best = item.image.find(i => i.size === 'extralarge') ||
            item.image.find(i => i.size === 'large') ||
            item.image[item.image.length - 1];
        if (best?.['#text'] && ! best['#text'].includes('2a96cbd8')) {
            return best['#text'];
        }
    }
    return null;
};

const formatDuration = (seconds) => {
    if (! seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
};

/**
 * Limpia el nombre del artista para búsqueda
 * Compatible con youtube-search.js
 */
const cleanArtistForSearch = (artist) => {
    if (!artist) return '';
    return artist
        .replace(/\s*&\s*/g, ' ')      // "Ca7riel & Paco" -> "Ca7riel Paco"
        .replace(/\s+and\s+/gi, ' ')   // "Ca7riel and Paco" -> "Ca7riel Paco"
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Limpia el título para búsqueda
 */
const cleanTitleForSearch = (title) => {
    if (!title) return '';
    return title
        .replace(/\s*\(feat\..*?\)/gi, '')   // Quitar (feat....)
        .replace(/\s*\(ft\..*?\)/gi, '')     // Quitar (ft....)
        .replace(/\s*\[.*?\]/g, '')          // Quitar [...]
        .replace(/\s+/g, ' ')
        .trim();
};

// =============================================================================
// COMPONENTES
// =============================================================================

// Hero Result Card
const HeroResultCard = ({ item, type, onPlay, navigate, isLoading }) => {
    const img = getImageUrl(item);
    const isTrack = type === 'track';
    const isArtist = type === 'artist';

    const handleClick = () => {
        if (isTrack) onPlay(item);
        else if (isArtist) navigate(`/artist/${encodeURIComponent(item.name)}`);
        else if (type === 'album') navigate(`/album/${encodeURIComponent(item.artist)}/${encodeURIComponent(item.name)}`);
        else if (type === 'playlist') navigate(`/playlist/${item.id}`);
    };

    const getTypeLabel = () => {
        switch (type) {
            case 'track': return 'Canción';
            case 'artist': return 'Artista';
            case 'album': return 'Álbum';
            case 'playlist': return 'Playlist';
            default: return 'Resultado';
        }
    };

    return (
        <div className="hero-result" onClick={handleClick}>
            <div className={`hero-cover ${isArtist ?'circle' : 'square'}`}>
                {img ?(
                    <img src={img} alt={item.name} onError={(e) => { e.target.src = DEFAULT_IMAGE; }} />
                ) : (
                    <div className="hero-cover-fallback">
                        <FaMusic size={50} />
                    </div>
                )}
                
                {isTrack && (
                    <div className="hero-play-overlay">
                        <button className="hero-play-btn" onClick={(e) => { e.stopPropagation(); onPlay(item); }}>
                            {isLoading ?(
                                <div className="track-loading-spinner" />
                            ) : (
                                <FaPlay size={24} />
                            )}
                        </button>
                    </div>
                )}
            </div>

            <div className="hero-info">
                <div className="hero-badge">
                    <span>✨ Mejor Resultado</span>
                </div>
                <h2 className="hero-title">{item.name}</h2>
                <p className="hero-subtitle">
                    <span className="hero-type-badge">{getTypeLabel()}</span>
                    {item.artist && <span>• {item.artist}</span>}
                    {type === 'playlist' && <span>• Por {item.creator || 'Usuario'}</span>}
                </p>
            </div>
        </div>
    );
};

// Track Row
const TrackRow = ({ track, isLoading, onPlay }) => {
    const img = getImageUrl(track);

    return (
        <div className="track-row" onClick={() => onPlay(track)}>
            <div className="track-artwork">
                {img ?(
                    <img src={img} alt={track.name} onError={(e) => { e.target.src = DEFAULT_IMAGE; }} />
                ) : (
                    <div className="track-artwork-fallback">
                        <FaMusic size={18} />
                    </div>
                )}
                <div className="track-play-overlay">
                    {isLoading ?(
                        <div className="track-loading-spinner" />
                    ) : (
                        <FaPlay className="track-play-icon" />
                    )}
                </div>
            </div>

            <div className="track-info">
                <div className="track-name">{track.name}</div>
                <div className="track-artist">{track.artist}</div>
            </div>

            <div className="track-duration">
                {formatDuration(track.duration)}
            </div>
        </div>
    );
};

// Standard Card (Artists/Albums/Playlists)
const StandardCard = ({ item, type, onClick }) => {
    const img = getImageUrl(item);
    const isArtist = type === 'artist';

    const getIcon = () => {
        switch (type) {
            case 'artist': return <FaUser />;
            case 'album': return <FaCompactDisc />;
            case 'playlist': return <FaListAlt />;
            default: return <FaMusic />;
        }
    };

    const getSubtitle = () => {
        if (type === 'playlist') return `Por ${item.creator || 'Usuario'}`;
        if (type === 'artist') return 'Artista';
        return item.artist || 'Álbum';
    };

    return (
        <div className="search-card" onClick={onClick}>
            <div className={`card-cover ${isArtist ?'circle' : 'square'}`}>
                {img ?(
                    <img src={img} alt={item.name} loading="lazy" onError={(e) => { e.target.src = DEFAULT_IMAGE; }} />
                ) : (
                    <div className="card-cover-fallback">
                        {getIcon()}
                    </div>
                )}
                <div className="card-play-overlay">
                    <FaPlay size={18} />
                </div>
            </div>
            <div className="card-info">
                <div className="card-title" title={item.name}>{item.name}</div>
                <div className="card-subtitle">{getSubtitle()}</div>
            </div>
        </div>
    );
};

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export default function Search() {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [results, setResults] = useState({ tracks: [], artists: [], albums: [], playlists: [] });
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [playingTrackId, setPlayingTrackId] = useState(null);
    const [isScrolled, setIsScrolled] = useState(false);
    
    const headerRef = useRef(null);
    const { playTrack } = usePlayer();
    const navigate = useNavigate();

    // Detectar scroll para header sticky
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Limpieza de resultados
    const cleanResults = useCallback((items) => {
        if (!Array.isArray(items)) return [];
        return items.filter(item => item && item.name && item.name.trim() !== '');
    }, []);

    // Búsqueda
    const performSearch = useCallback(async (searchQuery) => {
        if (! searchQuery.trim()) return;

        setIsLoading(true);
        setHasSearched(true);

        try {
            const limit = 10;
            const promises = {
                tracks: (filter === 'all' || filter === 'track') ?trackSearch({ track: searchQuery, limit: 15 }) : Promise.resolve(null),
                artists: (filter === 'all' || filter === 'artist') ?artistSearch({ artist: searchQuery, limit }) : Promise.resolve(null),
                albums: (filter === 'all' || filter === 'album') ?albumSearch({ album: searchQuery, limit }) : Promise.resolve(null),
                playlists: (filter === 'all' || filter === 'playlist') ?playlistSearch({ query: searchQuery, limit }) : Promise.resolve(null)
            };

            const [trackRes, artistRes, albumRes, playlistRes] = await Promise.all([
                promises.tracks, promises.artists, promises.albums, promises.playlists
            ]);

            setResults({
                tracks: cleanResults(trackRes?.results?.trackmatches?.track),
                artists: cleanResults(artistRes?.results?.artistmatches?.artist),
                albums: cleanResults(albumRes?.results?.albummatches?.album),
                playlists: cleanResults(playlistRes?.results?.playlistmatches?.playlist)
            });

        } catch (error) {
            console.error("[Search] Error:", error);
        } finally {
            setIsLoading(false);
        }
    }, [filter, cleanResults]);

    // Debounce de búsqueda
    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.trim()) {
                performSearch(query);
            } else {
                setResults({ tracks: [], artists: [], albums: [], playlists: [] });
                setHasSearched(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [query, performSearch]);

    // Mejor resultado
    const bestMatch = useMemo(() => {
        if (filter !== 'all' || ! hasSearched) return null;
        if (! results.tracks.length && !results.artists.length) return null;

        const qLower = query.toLowerCase();

        // Coincidencia exacta de artista
        const exactArtist = results.artists.find(a => a.name.toLowerCase() === qLower);
        if (exactArtist) return { item: exactArtist, type: 'artist' };

        // Coincidencia exacta de canción
        const exactTrack = results.tracks.find(t => t.name.toLowerCase() === qLower);
        if (exactTrack) return { item: exactTrack, type: 'track' };

        // Fallback
        if (results.tracks.length > 0) return { item: results.tracks[0], type: 'track' };
        if (results.artists.length > 0) return { item: results.artists[0], type: 'artist' };

        return null;
    }, [results, query, hasSearched, filter]);

    // ⭐ Reproducir track - MEJORADO para compatibilidad con youtube-search.js
    const handlePlayTrack = useCallback(async (track) => {
        if (playingTrackId) return;
        
        const trackId = track.id || track.name;
        setPlayingTrackId(trackId);

        try {
            // Limpiar artista y título para mejor compatibilidad con youtube-search.js
            const artistClean = cleanArtistForSearch(track.artist);
            const titleClean = cleanTitleForSearch(track.name);
            
            console.log(`[Search] 🎵 Reproduciendo: "${artistClean} - ${titleClean}"`);
            
            let audioUrl = track.preview;
            
            // Si no hay preview de Deezer, buscar en youtube-search
            if (!audioUrl) {
                console.log(`[Search] 🔍 Buscando audio en backend...`);
                // Pasar el artista original (con caracteres como "7" en Ca7riel)
                audioUrl = await fetchAudioUrl(track.artist, track.name, track.duration);
            }

            if (audioUrl) {
                console.log(`[Search] ✅ Audio encontrado`);
                
                // Crear cola de reproducción con todos los tracks de la búsqueda
                const searchQueue = results.tracks.map(t => ({
                    id: t.id,
                    name: t.name,
                    artist: t.artist,
                    image: getImageUrl(t) || DEFAULT_IMAGE,
                    duration: t.duration || 0,
                    url: t.preview, // Preview de Deezer si existe
                    album: t.album || 'Resultados de Búsqueda'
                }));

                playTrack({
                    id: track.id,
                    name: track.name,
                    artist: track.artist,
                    image: getImageUrl(track) || DEFAULT_IMAGE,
                    url: audioUrl,
                    album: track.album || 'Resultados de Búsqueda',
                    duration: track.duration || 0
                }, searchQueue);
            } else {
                console.warn(`[Search] ❌ No se encontró audio para: "${track.artist} - ${track.name}"`);
                // Opcional: mostrar notificación al usuario
            }
        } catch (e) {
            console.error("[Search] Error reproduciendo:", e);
        } finally {
            setPlayingTrackId(null);
        }
    }, [playingTrackId, results.tracks, playTrack]);

    // Limpiar búsqueda
    const clearSearch = useCallback(() => {
        setQuery('');
        setResults({ tracks: [], artists: [], albums: [], playlists: [] });
        setHasSearched(false);
    }, []);

    // Verificar si hay resultados
    const hasResults = Object.values(results).some(arr => arr.length > 0);

    // Filtros
    const filters = [
        { id: 'all', label: 'Todo', icon: null },
        { id: 'track', label: 'Canciones', icon: FaMusic },
        { id: 'artist', label: 'Artistas', icon: FaMicrophone },
        { id: 'album', label: 'Álbumes', icon: FaCompactDisc },
        { id: 'playlist', label: 'Playlists', icon: FaListAlt }
    ];

    return (
        <div className="search-page">
            {/* Sticky Header */}
            <header className={`search-header ${isScrolled ?'scrolled' : ''}`} ref={headerRef}>
                {/* Glow Capsule Input */}
                <div className="search-input-container">
                    <div className="search-capsule">
                        <input
                            type="text"
                            className="search-capsule-input"
                            placeholder="¿Qué quieres escuchar?"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            autoFocus
                        />
                        <FaSearch className="search-icon" />
                        <button 
                            className={`search-clear-btn ${query ?'visible' : ''}`}
                            onClick={clearSearch}
                        >
                            <FaTimes size={12} />
                        </button>
                    </div>
                </div>

                {/* Glass Pills Filters */}
                <div className="search-filters">
                    {filters.map(f => (
                        <button
                            key={f.id}
                            className={`filter-glass-pill ${filter === f.id ?'active' : ''}`}
                            onClick={() => setFilter(f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </header>

            {/* Content Area */}
            <main className="search-content">
                {/* Loading State */}
                {isLoading && (
                    <div className="search-loading">
                        <div className="loading-spinner-large" />
                        <p>Buscando...</p>
                    </div>
                )}

                {/* Empty State (No Search Yet) */}
                {!isLoading && !hasSearched && (
                    <div className="search-empty-state">
                        <div className="empty-icon-wrapper">
                            <FaSearch size={48} />
                        </div>
                        <h3>Explora ParadisQuo</h3>
                        <p>Busca tus artistas, canciones, álbumes o playlists favoritos</p>
                    </div>
                )}

                {/* Results */}
                {! isLoading && hasSearched && (
                    <div className="results-wrapper">
                        
                        {/* Hero Result */}
                        {bestMatch && filter === 'all' && (
                            <HeroResultCard
                                item={bestMatch.item}
                                type={bestMatch.type}
                                onPlay={handlePlayTrack}
                                navigate={navigate}
                                isLoading={playingTrackId === (bestMatch.item.id || bestMatch.item.name)}
                            />
                        )}

                        {/* Tracks Section */}
                        {(filter === 'all' || filter === 'track') && results.tracks.length > 0 && (
                            <section className="result-section">
                                <div className="section-header">
                                    <h3 className="section-title">
                                        <div className="section-title-icon">
                                            <FaMusic />
                                        </div>
                                        Canciones
                                    </h3>
                                    {filter === 'all' && results.tracks.length > 4 && (
                                        <button className="section-see-all" onClick={() => setFilter('track')}>
                                            Ver todo
                                        </button>
                                    )}
                                </div>
                                <div className="tracks-list">
                                    {results.tracks.slice(0, filter === 'all' ?5 : 50).map((track, i) => (
                                        <TrackRow
                                            key={track.id || i}
                                            track={track}
                                            isLoading={playingTrackId === (track.id || track.name)}
                                            onPlay={handlePlayTrack}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Artists Section */}
                        {(filter === 'all' || filter === 'artist') && results.artists.length > 0 && (
                            <section className="result-section">
                                <div className="section-header">
                                    <h3 className="section-title">
                                        <div className="section-title-icon">
                                            <FaMicrophone />
                                        </div>
                                        Artistas
                                    </h3>
                                    {filter === 'all' && results.artists.length > 5 && (
                                        <button className="section-see-all" onClick={() => setFilter('artist')}>
                                            Ver todo
                                        </button>
                                    )}
                                </div>
                                <div className="cards-grid">
                                    {results.artists.slice(0, filter === 'all' ?6 : 20).map((artist, i) => (
                                        <StandardCard
                                            key={i}
                                            item={artist}
                                            type="artist"
                                            onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Albums Section */}
                        {(filter === 'all' || filter === 'album') && results.albums.length > 0 && (
                            <section className="result-section">
                                <div className="section-header">
                                    <h3 className="section-title">
                                        <div className="section-title-icon">
                                            <FaCompactDisc />
                                        </div>
                                        Álbumes
                                    </h3>
                                    {filter === 'all' && results.albums.length > 5 && (
                                        <button className="section-see-all" onClick={() => setFilter('album')}>
                                            Ver todo
                                        </button>
                                    )}
                                </div>
                                <div className="cards-grid">
                                    {results.albums.slice(0, filter === 'all' ?6 : 20).map((album, i) => (
                                        <StandardCard
                                            key={i}
                                            item={album}
                                            type="album"
                                            onClick={() => navigate(`/album/${encodeURIComponent(album.artist)}/${encodeURIComponent(album.name)}`)}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Playlists Section */}
                        {(filter === 'all' || filter === 'playlist') && results.playlists.length > 0 && (
                            <section className="result-section">
                                <div className="section-header">
                                    <h3 className="section-title">
                                        <div className="section-title-icon">
                                            <FaListAlt />
                                        </div>
                                        Playlists
                                    </h3>
                                    {filter === 'all' && results.playlists.length > 5 && (
                                        <button className="section-see-all" onClick={() => setFilter('playlist')}>
                                            Ver todo
                                        </button>
                                    )}
                                </div>
                                <div className="cards-grid">
                                    {results.playlists.slice(0, filter === 'all' ?6 : 20).map((playlist, i) => (
                                        <StandardCard
                                            key={i}
                                            item={playlist}
                                            type="playlist"
                                            onClick={() => navigate(`/playlist/${playlist.id}`)}
                                        />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* No Results */}
                        {hasSearched && !hasResults && (
                            <div className="no-results">
                                <h3>No encontramos resultados para "{query}"</h3>
                                <p>Intenta con otra búsqueda o verifica la ortografía</p>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}