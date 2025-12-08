import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FaPlay, FaPause, FaStepForward, FaStepBackward, FaRandom, FaRedo,
    FaEllipsisH, FaHeart, FaPlus, FaUser, FaCompactDisc,
    FaTimes, FaChevronDown, FaList, FaMicrophoneAlt, FaGuitar, FaVolumeUp, FaVolumeMute,
    FaTrash, FaGripLines
} from 'react-icons/fa';
import { usePlayer } from '../../context/playerContext';
import { fetchLyrics } from '../../services/unifiedService';
import './miniPlayer.css';

export default function MiniPlayer() {
    const {
        currentTrack,
        isPlaying,
        togglePlay,
        next,
        prev,
        played,
        duration,
        isLoading,
        seekTo,
        queue,
        volume,
        setVolume,
        // Nuevas funciones del contexto para la cola
        removeFromQueue,
        reorderQueue,
        playTrack
    } = usePlayer();

    const navigate = useNavigate();

    // --- ESTADOS ---
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [dominantColor, setDominantColor] = useState('#1db954');
    const [viewMode, setViewMode] = useState('art'); // 'art', 'lyrics', 'queue'
    const [isDesktop, setIsDesktop] = useState(window.innerWidth > 1024);

    // UI States
    const [showMenu, setShowMenu] = useState(false);
    const [showPlaylistModal, setShowPlaylistModal] = useState(false);

    // Data States
    const [userPlaylists, setUserPlaylists] = useState([]);
    const [isFavorite, setIsFavorite] = useState(false);

    // Lyrics States
    const [lyricsData, setLyricsData] = useState(null);
    const [isLyricsLoading, setIsLyricsLoading] = useState(false);
    const [currentLyricIndex, setCurrentLyricIndex] = useState(-1);

    // Queue Drag & Drop States
    const [dragItemIndex, setDragItemIndex] = useState(null);
    const [dragOverItemIndex, setDragOverItemIndex] = useState(null);

    // Refs
    const menuRef = useRef(null);
    const lyricsContainerRef = useRef(null);
    const activeLyricRef = useRef(null);

    // --- EFFECT: DETECTOR DE DISPOSITIVO ---
    useEffect(() => {
        const handleResize = () => setIsDesktop(window.innerWidth > 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- EFFECT: CERRAR MENÚ AL CLICKEAR FUERA ---
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // --- EFFECT: ATAJOS DE TECLADO ---
    useEffect(() => {
        if (!isFullScreen) return;
        const handleKeyDown = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                togglePlay();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullScreen, togglePlay]);

    // --- HELPERS ---
    const getArtistName = useCallback(() => {
        if (!currentTrack) return 'Artista Desconocido';
        return typeof currentTrack.artist === 'object'
            ? (currentTrack.artist['#text'] || currentTrack.artist.name)
            : currentTrack.artist;
    }, [currentTrack]);

    const getTrackImage = useCallback((track = currentTrack) => {
        const PLACEHOLDER = "https://cdn-icons-png.flaticon.com/512/461/461238.png";
        if (!track?.image) return PLACEHOLDER;
        if (typeof track.image === 'string' && track.image.length > 5) return track.image;
        if (Array.isArray(track.image)) {
            return track.image.find(i => i.size === 'extralarge')?.['#text'] ||
                track.image[track.image.length - 1]?.['#text'] ||
                PLACEHOLDER;
        }
        return PLACEHOLDER;
    }, [currentTrack]);

    const imageSrc = currentTrack ? getTrackImage() : null;

    // --- LYRICS LOGIC ---
    const parseLRC = (lrcString) => {
        if (!lrcString) return [];
        const lines = lrcString.split('\n');
        const result = [];
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
        for (const line of lines) {
            const match = timeRegex.exec(line);
            if (match) {
                const min = parseInt(match[1], 10);
                const sec = parseInt(match[2], 10);
                const ms = parseFloat("0." + match[3]) * 1000;
                result.push({ time: min * 60 + sec + (ms / 1000), text: line.replace(timeRegex, '').trim() });
            }
        }
        return result;
    };

    useEffect(() => {
        if (!currentTrack) return;
        let isMounted = true;
        const loadLyrics = async () => {
            setIsLyricsLoading(true);
            setLyricsData(null);
            setCurrentLyricIndex(-1);
            try {
                const artist = getArtistName();
                const title = currentTrack.name || currentTrack.title;
                const data = await fetchLyrics(artist, title);
                if (isMounted) {
                    if (data) setLyricsData({ synced: data.syncedLyrics ? parseLRC(data.syncedLyrics) : null, plain: data.plainLyrics, instrumental: data.instrumental });
                    else setLyricsData({ plain: "No encontramos la letra.", synced: null });
                }
            } catch (error) { if (isMounted) setLyricsData({ plain: "Error.", synced: null }); }
            finally { if (isMounted) setIsLyricsLoading(false); }
        };
        loadLyrics();
        return () => { isMounted = false; };
    }, [currentTrack, getArtistName]);

    useEffect(() => {
        if (viewMode !== 'lyrics' || !lyricsData?.synced) return;
        const currentTime = played * duration;
        const lyrics = lyricsData.synced;
        let activeIndex = -1;
        for (let i = 0; i < lyrics.length; i++) {
            if (currentTime >= lyrics[i].time) activeIndex = i;
            else break;
        }
        if (activeIndex !== currentLyricIndex) {
            setCurrentLyricIndex(activeIndex);
            if (activeLyricRef.current) activeLyricRef.current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
    }, [played, duration, viewMode, lyricsData, currentLyricIndex]);

    // --- COLOR EXTRACTION ---
    useEffect(() => {
        if (!imageSrc || imageSrc.includes('placeholder')) return;
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = imageSrc;
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 1; canvas.height = 1;
                canvas.getContext('2d').drawImage(img, 0, 0, 1, 1);
                const [r, g, b] = canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
                setDominantColor(`rgb(${r}, ${g}, ${b})`);
            } catch (e) { }
        };
    }, [imageSrc]);

    // --- DRAG AND DROP HANDLERS ---
    const handleSort = () => {
        if (dragItemIndex !== null && dragOverItemIndex !== null) {
            reorderQueue(dragItemIndex, dragOverItemIndex);
        }
        setDragItemIndex(null);
        setDragOverItemIndex(null);
    };

    // --- HANDLERS ---
    const stopProp = (e) => e.stopPropagation();
    const handleSeek = (e) => {
        stopProp(e);
        if (isLoading || !duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        seekTo(x / rect.width);
    };
    const handleVolumeChange = (e) => setVolume(parseFloat(e.target.value));
    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds)) return '0:00';
        const min = Math.floor(seconds / 60);
        const sec = Math.floor(seconds % 60);
        return `${min}:${sec < 10 ? '0' : ''}${sec}`;
    };

    // --- RENDERERS ---

    const renderLyrics = () => {
        if (isLyricsLoading) return <div className="state-message"><div className="spinner-small" /><p>Buscando letra...</p></div>;
        if (lyricsData?.instrumental) return <div className="state-message"><FaGuitar size={50} /><h3>Instrumental</h3></div>;
        if (lyricsData?.synced) {
            return (
                <div className="lyrics-container synced" ref={lyricsContainerRef}>
                    {lyricsData.synced.map((line, i) => (
                        <p key={i} ref={i === currentLyricIndex ? activeLyricRef : null} className={`lyric-line ${i === currentLyricIndex ? 'active' : ''}`} onClick={() => seekTo(line.time / duration)}>{line.text}</p>
                    ))}
                    <div className="lyrics-spacer" />
                </div>
            );
        }
        return <div className="lyrics-container plain"><p>{lyricsData?.plain || "Letra no disponible."}</p></div>;
    };

    // --- RENDER QUEUE (IMPLEMENTACIÓN COMPLETA) ---
    const renderQueue = () => {
        const displayQueue = (queue && queue.length > 0) ? queue : [currentTrack];

        return (
            <div className="queue-container">
                <h3>Cola de Reproducción</h3>
                <div className="queue-list">
                    {displayQueue.map((track, i) => {
                        const isCurrent = track.name === currentTrack.name;

                        return (
                            <div
                                key={i}
                                className={`queue-item ${isCurrent ? 'playing' : ''} ${dragOverItemIndex === i ? 'drag-over' : ''}`}
                                draggable={!isCurrent}
                                onDragStart={() => setDragItemIndex(i)}
                                onDragEnter={() => setDragOverItemIndex(i)}
                                onDragEnd={handleSort}
                                onDragOver={(e) => e.preventDefault()}
                            >
                                {/* Drag Handle */}
                                <div className="q-drag-handle">
                                    {!isCurrent && <FaGripLines />}
                                    {isCurrent && <div className="equalizer-icon-static">Now</div>}
                                </div>

                                <img src={getTrackImage(track)} alt="" className="q-img" />

                                <div className="queue-info" onClick={() => !isCurrent && playTrack(track, queue)}>
                                    <span className="q-title" style={{ color: isCurrent ? dominantColor : 'inherit' }}>
                                        {track.name || track.title}
                                    </span>
                                    <span className="q-artist">
                                        {typeof track.artist === 'string' ? track.artist : (track.artist?.name || '')}
                                    </span>
                                </div>

                                {/* Botón Eliminar */}
                                {!isCurrent && (
                                    <button
                                        className="q-remove-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            removeFromQueue(i);
                                        }}
                                        title="Quitar de la cola"
                                    >
                                        <FaTrash />
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderMainView = () => {
        switch (viewMode) {
            case 'lyrics': return renderLyrics();
            case 'queue': return renderQueue();
            default:
                return (
                    <div className="art-container-full">
                        <img
                            src={imageSrc}
                            alt={currentTrack.name}
                            className={`album-art-large ${isPlaying ? 'pulse' : ''}`}
                            style={{ boxShadow: `0 10px 40px ${dominantColor}66` }}
                        />
                    </div>
                );
        }
    };

    if (!currentTrack) return null;
    const trackTitle = currentTrack.name || currentTrack.title;
    const artistNameStr = getArtistName();

    // --- FULLSCREEN RENDER ---
    if (isFullScreen) {
        return (
            <div className={`fullscreen-wrapper ${isDesktop ? 'desktop-layout' : 'mobile-layout'}`} style={{ '--theme-color': dominantColor }}>
                <div className="fullscreen-bg" style={{ backgroundImage: `url(${imageSrc})` }} />
                <div className="fullscreen-backdrop" />

                <header className="fs-header">
                    <button className="icon-btn" onClick={() => setIsFullScreen(false)}><FaChevronDown /></button>
                    <div className="header-meta"><span>REPRODUCIENDO</span><strong>{trackTitle}</strong></div>
                    <div className="menu-anchor" ref={menuRef}>
                        <button className="icon-btn" onClick={() => setShowMenu(!showMenu)}><FaEllipsisH /></button>
                        {showMenu && (
                            <div className="context-menu">
                                <button onClick={() => { setIsFavorite(!isFavorite); setShowMenu(false); }}>
                                    <FaHeart className={isFavorite ? 'active' : ''} /> {isFavorite ? 'Quitar Favorito' : 'Añadir Favorito'}
                                </button>
                                <button onClick={() => { setShowPlaylistModal(true); setShowMenu(false); }}><FaPlus /> Añadir a Playlist</button>
                                <button onClick={() => { navigate(`/artist/${encodeURIComponent(artistNameStr)}`); setIsFullScreen(false); }}>
                                    <FaUser /> Ir al Artista
                                </button>
                            </div>
                        )}
                    </div>
                </header>

                <main className="fs-content">
                    <section className="fs-visuals">{renderMainView()}</section>
                    <section className="fs-controls-area">
                        <div className="track-info-large">
                            <div className="track-text"><h1>{trackTitle}</h1><h2>{artistNameStr}</h2></div>
                            <button className={`like-btn ${isFavorite ? 'active' : ''}`} onClick={() => setIsFavorite(!isFavorite)}><FaHeart /></button>
                        </div>

                        <div className="progress-container">
                            <div className="progress-bar-rail" onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                seekTo((e.clientX - rect.left) / rect.width);
                            }}>
                                <div className="progress-bar-fill" style={{ width: `${played * 100}%`, backgroundColor: dominantColor }}>
                                    <div className="progress-thumb" />
                                </div>
                            </div>
                            <div className="time-labels"><span>{formatTime(played * duration)}</span><span>{formatTime(duration)}</span></div>
                        </div>

                        <div className="playback-controls">
                            <button className="ctrl-btn secondary"><FaRandom /></button>
                            <button className="ctrl-btn secondary" onClick={prev}><FaStepBackward /></button>
                            <button className="ctrl-btn play-pause-large" onClick={togglePlay}>
                                {isLoading ? <div className="spinner-btn" /> : (isPlaying ? <FaPause /> : <FaPlay />)}
                            </button>
                            <button className="ctrl-btn secondary" onClick={next}><FaStepForward /></button>
                            <button className="ctrl-btn secondary"><FaRedo /></button>
                        </div>

                        <div className="bottom-tools">
                            {isDesktop && (
                                <div className="volume-control">
                                    {volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
                                    <input type="range" min="0" max="1" step="0.05" value={volume || 0.5} onChange={handleVolumeChange} className="volume-slider" />
                                </div>
                            )}
                            <div className="view-toggles">
                                <button className={viewMode === 'art' ? 'active' : ''} onClick={() => setViewMode('art')} title="Portada"><FaCompactDisc /></button>
                                <button className={viewMode === 'lyrics' ? 'active' : ''} onClick={() => setViewMode('lyrics')} title="Letras"><FaMicrophoneAlt /></button>
                                <button className={viewMode === 'queue' ? 'active' : ''} onClick={() => setViewMode('queue')} title="Cola"><FaList /></button>
                            </div>
                        </div>
                    </section>
                </main>

                {/* MODAL PLAYLIST */}
                {showPlaylistModal && (
                    <div className="modal-overlay" onClick={() => setShowPlaylistModal(false)}>
                        <div className="modal-content" onClick={stopProp}>
                            <div className="modal-header">
                                <h3>Añadir a Playlist</h3>
                                <button onClick={() => setShowPlaylistModal(false)}><FaTimes /></button>
                            </div>
                            <div className="modal-body-list">
                                {userPlaylists.length > 0 ? userPlaylists.map(pl => (
                                    <div key={pl.id} className="playlist-row">
                                        <FaCompactDisc /> <span>{pl.name}</span>
                                    </div>
                                )) : <p className="empty-msg">No tienes playlists creadas.</p>}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // --- DOCK RENDER (MINI) ---
    return (
        <div className="dock-player" style={{ '--theme-color': dominantColor }} onClick={() => setIsFullScreen(true)}>
            <div className="dock-progress-rail" onClick={(e) => { stopProp(e); handleSeek(e); }}>
                <div className="dock-progress-fill" style={{ width: `${played * 100}%` }} />
            </div>
            <div className="dock-content">
                <div className="dock-left">
                    <img src={imageSrc} alt={trackTitle} className="dock-art" />
                    <div className="dock-meta"><span className="dock-title">{trackTitle}</span><span className="dock-artist">{artistNameStr}</span></div>
                </div>
                <div className="dock-controls">
                    <button className="dock-btn hide-mobile" onClick={(e) => { stopProp(e); prev() }}><FaStepBackward /></button>
                    <button className="dock-btn play" onClick={(e) => { stopProp(e); togglePlay() }}>{isPlaying ? <FaPause /> : <FaPlay />}</button>
                    <button className="dock-btn" onClick={(e) => { stopProp(e); next() }}><FaStepForward /></button>
                </div>
            </div>
        </div>
    );
}