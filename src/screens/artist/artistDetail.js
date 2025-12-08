import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaPlay, FaHeart, FaEllipsisH, FaMusic, FaCompactDisc, FaArrowLeft } from 'react-icons/fa';

import { usePlayer } from '../../context/playerContext';
import {
    artistSearch,
    artistGetTopTracks,
    albumSearch,
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
        return imgObj ?imgObj['#text'] : null;
    }
    return null;
};

const formatTime = (seconds) => {
    if (! seconds) return '--:--';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ?'0' : ''}${sec}`;
};

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

    const [artistInfo, setArtistInfo] = useState(null);
    const [topAlbums, setTopAlbums] = useState([]);
    const [topTracks, setTopTracks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [playingTrackId, setPlayingTrackId] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const safeName = decodeURIComponent(name);

            try {
                const [artistRes, tracksRes, albumsRes] = await Promise.allSettled([
                    artistSearch({ artist: safeName, limit: 1 }),
                    artistGetTopTracks({ artist: safeName, limit: 10 }),
                    albumSearch({ album: safeName, limit: 8 })
                ]);

                if (artistRes.status === 'fulfilled') {
                    const artist = artistRes.value?.results?.artistmatches?.artist?.[0];
                    setArtistInfo(artist || { name: safeName });
                }

                if (tracksRes.status === 'fulfilled' && tracksRes.value?.toptracks?.track) {
                    setTopTracks(tracksRes.value.toptracks.track);
                }

                if (albumsRes.status === 'fulfilled' && albumsRes.value?.results?.albummatches?.album) {
                    const validAlbums = (albumsRes.value.results.albummatches.album || [])
                        .filter(alb => getBestImage(alb.image));
                    setTopAlbums(validAlbums);
                }

            } catch (e) {
                console.error("Error cargando perfil del artista:", e);
            } finally {
                setLoading(false);
            }
        };

        if (name) fetchData();
    }, [name]);

    // ⭐ Función para reproducir una canción - MEJORADA
    const handlePlayTrack = useCallback(async (track, playFullQueue = false) => {
        if (playingTrackId) return;

        const trackId = track.id || track.name;
        setPlayingTrackId(trackId);

        try {
            const trackImg = getBestImage(track.image) || getBestImage(artistInfo?.image) || DEFAULT_IMAGE;
            const trackArtist = track.artist?.name || track.artist || artistInfo?.name || name;
            const trackName = track.name;
            const trackDuration = track.duration ?parseInt(track.duration) : 0;

            console.log(`[ArtistDetail] 🎵 Reproduciendo: "${trackArtist} - ${trackName}"`);

            // Intentar obtener audio de alta calidad
            let audioUrl = track.preview;

            if (!audioUrl) {
                console.log(`[ArtistDetail] 🔍 Buscando audio en backend...`);
                audioUrl = await fetchAudioUrl(trackArtist, trackName, trackDuration);
            }

            if (audioUrl) {
                console.log(`[ArtistDetail] ✅ Audio encontrado`);

                // Construir la cola de reproducción
                const queue = topTracks.map(t => ({
                    id: t.id || t.name,
                    name: t.name,
                    artist: t.artist?.name || t.artist || artistInfo?.name || name,
                    image: getBestImage(t.image) || getBestImage(artistInfo?.image) || DEFAULT_IMAGE,
                    duration: t.duration ?parseInt(t.duration) : 0,
                    url: t.preview,
                    album: t.album || 'Top Hits'
                }));

                playTrack({
                    id: trackId,
                    name: trackName,
                    artist: trackArtist,
                    image: trackImg,
                    duration: trackDuration,
                    url: audioUrl,
                    album: track.album || 'Top Hits'
                }, playFullQueue ?queue : undefined);
            } else {
                console.warn(`[ArtistDetail] ❌ No se encontró audio para: "${trackArtist} - ${trackName}"`);
            }
        } catch (e) {
            console.error("[ArtistDetail] Error reproduciendo:", e);
        } finally {
            setPlayingTrackId(null);
        }
    }, [playingTrackId, topTracks, artistInfo, name, playTrack]);

    // Reproducir todas las canciones del artista
    const handlePlayArtist = useCallback(() => {
        if (topTracks.length > 0) {
            handlePlayTrack(topTracks[0], true);
        }
    }, [topTracks, handlePlayTrack]);

    // --- RENDERIZADO ---

    if (loading) return (
        <div className="artist-loading-screen">
            <div className="spinner-loader"></div>
        </div>
    );

    if (! artistInfo) return (
        <div className="artist-error-screen">
            <h2>Artista no encontrado</h2>
            <button className="back-btn-simple" onClick={() => navigate(-1)}>Volver</button>
        </div>
    );

    const heroImage = getBestImage(artistInfo.image) || '';
    const bgStyle = heroImage
        ?{ backgroundImage: `url(${heroImage})` }
        : { background: 'linear-gradient(45deg, #1e2124, #2c3e50)' };

    return (
        <div className="artist-detail-container">
            <button className="artist-back-btn" onClick={() => navigate(-1)}>
                <FaArrowLeft />
            </button>

            {/* 1.HERO HEADER */}
            <div className="artist-hero-modern">
                <div className="artist-hero-backdrop" style={bgStyle}></div>
                <div className="artist-hero-gradient"></div>

                <div className="artist-hero-content-layer">
                    <div className="artist-avatar-circle">
                        {heroImage ?<img src={heroImage} alt={artistInfo.name} /> : <FaMusic size={40} />}
                    </div>
                    <div className="artist-info-block">
                        <span className="artist-badge">ARTISTA VERIFICADO</span>
                        <h1 className="artist-name-title">{artistInfo.name}</h1>
                        <div className="artist-stats-row">
                            <span>{formatCompactNumber(topTracks[0]?.listeners || Math.floor(Math.random() * 1000000))} oyentes</span>
                            <span className="dot-separator">•</span>
                            <span>{topAlbums.length} álbumes</span>
                        </div>

                        <div className="artist-actions-row">
                            <button
                                className="primary-play-btn"
                                onClick={handlePlayArtist}
                                disabled={topTracks.length === 0}
                            >
                                <FaPlay className="icon-spacer" /> ESCUCHAR
                            </button>
                            <button className="secondary-action-btn"><FaHeart /></button>
                            <button className="secondary-action-btn"><FaEllipsisH /></button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2.CONTENIDO PRINCIPAL */}
            <div className="artist-scroll-body">
                <div className="detail-grid-layout">
                    <div className="main-column">
                        {topTracks.length > 0 && (
                            <section className="content-section">
                                <h2 className="section-title">Populares</h2>
                                <div className="track-list-modern">
                                    {topTracks.map((track, idx) => {
                                        const img = getBestImage(track.image) || getBestImage(artistInfo.image) || DEFAULT_IMAGE;
                                        const isPlaying = playingTrackId === (track.id || track.name);
                                        
                                        return (
                                            <div 
                                                key={track.id || idx} 
                                                className={`track-row-item ${isPlaying ?'loading' : ''}`} 
                                                onClick={() => handlePlayTrack(track)}
                                            >
                                                <span className="track-index">
                                                    {isPlaying ?(
                                                        <div className="track-loading-spinner-small" />
                                                    ) : (
                                                        idx + 1
                                                    )}
                                                </span>
                                                <div className="track-img-tiny">
                                                    <img src={img} alt="" onError={(e) => e.target.src = DEFAULT_IMAGE} />
                                                    <div className="track-hover-overlay"><FaPlay size={10} /></div>
                                                </div>
                                                <div className="track-info-main">
                                                    <span className="track-title-text">{track.name}</span>
                                                    <span className="track-plays-text">
                                                        {formatCompactNumber(track.playcount || track.listeners)} reproducciones
                                                    </span>
                                                </div>
                                                <div className="track-duration">
                                                    {formatTime(track.duration)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* 3. DISCOGRAFÍA */}
                        {topAlbums.length > 0 && (
                            <section className="content-section">
                                <h2 className="section-title">Discografía</h2>
                                <div className="albums-grid-responsive">
                                    {topAlbums.map((album, i) => {
                                        const albSrc = getBestImage(album.image);
                                        if (!albSrc) return null;
                                        return (
                                            <div
                                                key={i}
                                                className="album-card-modern"
                                                onClick={() => navigate(`/album/${encodeURIComponent(artistInfo.name)}/${encodeURIComponent(album.name)}`)}
                                            >
                                                <div className="album-cover-wrapper">
                                                    <img src={albSrc} alt={album.name} loading="lazy" />
                                                    <div className="album-play-icon"><FaCompactDisc /></div>
                                                </div>
                                                <div className="album-meta">
                                                    <span className="album-name-clamp" title={album.name}>{album.name}</span>
                                                    <span className="album-year">Álbum</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}