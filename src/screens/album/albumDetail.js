import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    albumSearch, 
    trackSearch,
    fetchAudioUrl 
} from '../../services/unifiedService';
import '../../shared/globalStyles.css';
import './albumDetail.css';
import { FaPlay, FaClock, FaHeart, FaEllipsisH, FaCompactDisc, FaArrowLeft } from 'react-icons/fa';
import { usePlayer } from '../../context/playerContext';

// --- HELPERS ---

const getBestImage = (imageSource) => {
    if (! imageSource) return null;
    if (typeof imageSource === 'string') return imageSource;
    if (Array.isArray(imageSource)) {
        const imgObj = imageSource.find(img => img.size === 'extralarge') ||
            imageSource.find(img => img.size === 'mega') ||
            imageSource.find(img => img.size === 'large') ||
            imageSource[imageSource.length - 1];
        return imgObj ?imgObj['#text'] : null;
    }
    return null;
};

const formatTime = (seconds) => {
    if (!seconds) return '--:--';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ?'0' : ''}${sec}`;
};

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60';

export default function AlbumDetail() {
    const { artist, name } = useParams();
    const navigate = useNavigate();
    const { playTrack } = usePlayer();

    const [albumInfo, setAlbumInfo] = useState(null);
    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [playingTrackId, setPlayingTrackId] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const safeName = decodeURIComponent(name);
            const safeArtist = decodeURIComponent(artist);

            try {
                // 1.Buscar metadatos del álbum
                const albumRes = await albumSearch({ album: safeName, limit: 5 });
                const foundAlbum = albumRes?.results?.albummatches?.album?.find(a =>
                    a.artist.toLowerCase().includes(safeArtist.toLowerCase()) ||
                    safeArtist.toLowerCase().includes(a.artist.toLowerCase())
                ) || albumRes?.results?.albummatches?.album?.[0];

                if (foundAlbum) {
                    setAlbumInfo(foundAlbum);

                    // 2.Buscar canciones del álbum
                    const searchQ = `${safeArtist} ${safeName}`;
                    const tracksRes = await trackSearch({ track: searchQ, limit: 50 });
                    let foundTracks = tracksRes?.results?.trackmatches?.track || [];
                    setTracks(foundTracks);
                }
            } catch (e) {
                console.error("Error cargando álbum:", e);
            } finally {
                setLoading(false);
            }
        };

        if (artist && name) fetchData();
    }, [artist, name]);

    // ⭐ Función para reproducir una canción - MEJORADA
    const handlePlayTrack = useCallback(async (track, playFullQueue = false) => {
        if (playingTrackId) return;

        const trackId = track.id || track.name;
        setPlayingTrackId(trackId);

        try {
            const albumImg = getBestImage(albumInfo?.image) || DEFAULT_IMAGE;
            const trackImg = getBestImage(track.image) || albumImg;
            const trackArtist = track.artist || artist;
            const trackName = track.name;
            const trackDuration = track.duration ?parseInt(track.duration) : 0;

            console.log(`[AlbumDetail] 🎵 Reproduciendo: "${trackArtist} - ${trackName}"`);

            // Intentar obtener audio de alta calidad
            let audioUrl = track.preview;

            if (!audioUrl) {
                console.log(`[AlbumDetail] 🔍 Buscando audio en backend...`);
                audioUrl = await fetchAudioUrl(trackArtist, trackName, trackDuration);
            }

            if (audioUrl) {
                console.log(`[AlbumDetail] ✅ Audio encontrado`);

                // Construir la cola de reproducción
                const fullQueue = tracks.map(t => ({
                    id: t.id || t.name,
                    name: t.name,
                    artist: t.artist || artist,
                    image: getBestImage(t.image) || albumImg,
                    duration: t.duration ?parseInt(t.duration) : 0,
                    url: t.preview,
                    album: name
                }));

                playTrack({
                    id: trackId,
                    name: trackName,
                    artist: trackArtist,
                    image: trackImg,
                    duration: trackDuration,
                    url: audioUrl,
                    album: name
                }, playFullQueue ?fullQueue : undefined);
            } else {
                console.warn(`[AlbumDetail] ❌ No se encontró audio para: "${trackArtist} - ${trackName}"`);
            }
        } catch (e) {
            console.error("[AlbumDetail] Error reproduciendo:", e);
        } finally {
            setPlayingTrackId(null);
        }
    }, [playingTrackId, tracks, albumInfo, artist, name, playTrack]);

    // Reproducir todo el álbum
    const handlePlayAlbum = useCallback(() => {
        if (tracks.length > 0) {
            handlePlayTrack(tracks[0], true);
        }
    }, [tracks, handlePlayTrack]);

    // --- RENDER ---

    if (loading) return (
        <div className="screen-container loading-container">
            <div className="spinner-loader"></div>
        </div>
    );

    if (!albumInfo) return (
        <div className="screen-container error-container">
            <div className="error-text">Álbum no encontrado</div>
            <button className="retry-btn" onClick={() => navigate(-1)}>Volver</button>
        </div>
    );

    const heroImg = getBestImage(albumInfo.image) || DEFAULT_IMAGE;
    const bgStyle = heroImg
        ?{ backgroundImage: `url(${heroImg})` }
        : { background: 'linear-gradient(45deg, #4b6cb7, #182848)' };

    return (
        <div className="screen-container album-detail-container">

            {/* 1.HERO HEADER */}
            <div className="album-hero-modern">
                <button className="back-btn-absolute" onClick={() => navigate(-1)}>
                    <FaArrowLeft />
                </button>

                <div className="album-hero-backdrop" style={bgStyle}></div>
                <div className="album-hero-gradient"></div>

                <div className="album-hero-content-layer">
                    <div className="album-cover-shadow-box">
                        {heroImg ?<img src={heroImg} alt={albumInfo.name} /> : <FaCompactDisc size={60} />}
                    </div>

                    <div className="album-info-block">
                        <span className="album-type-badge">Álbum</span>
                        <h1 className="album-title-modern">{albumInfo.name}</h1>

                        <div className="album-meta-row">
                            <span className="album-artist-name">{albumInfo.artist}</span>
                            <span className="dot-separator">•</span>
                            <span>{tracks.length} canciones</span>
                            <span className="dot-separator mobile-hidden">•</span>
                            <span className="mobile-hidden">{new Date().getFullYear()}</span>
                        </div>

                        <div className="album-actions-row">
                            <button
                                className="primary-play-btn"
                                onClick={handlePlayAlbum}
                                disabled={tracks.length === 0}
                            >
                                <FaPlay className="icon-spacer" /> Reproducir
                            </button>
                            <button className="secondary-action-btn"><FaHeart /></button>
                            <button className="secondary-action-btn"><FaEllipsisH /></button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2.TRACKLIST BODY */}
            <div className="album-scroll-body">
                <div className="tracklist-container">

                    {/* Header de la Tabla (Solo PC) */}
                    <div className="tracklist-header desktop-only">
                        <div className="col-num">#</div>
                        <div className="col-title">Título</div>
                        <div className="col-clock"><FaClock /></div>
                    </div>

                    {/* Lista de Canciones */}
                    <div className="tracklist-rows">
                        {tracks.length === 0 ?(
                            <div className="empty-state">No se encontraron canciones disponibles para este álbum.</div>
                        ) : (
                            tracks.map((track, i) => {
                                const tImg = getBestImage(track.image) || heroImg;
                                const isPlaying = playingTrackId === (track.id || track.name);
                                
                                return (
                                    <div 
                                        key={i} 
                                        className={`track-row-modern ${isPlaying ?'loading' : ''}`} 
                                        onClick={() => handlePlayTrack(track)}
                                    >
                                        <div className="col-num">
                                            {isPlaying ?(
                                                <div className="track-loading-spinner-small" />
                                            ) : (
                                                <>
                                                    <span className="num-text">{i + 1}</span>
                                                    <span className="play-icon-hover"><FaPlay size={10} /></span>
                                                </>
                                            )}
                                        </div>

                                        <div className="col-title">
                                            {tImg && <img src={tImg} alt="" className="mobile-track-img mobile-only" onError={(e) => e.target.src = DEFAULT_IMAGE} />}
                                            <div className="track-text-group">
                                                <div className="t-name">{track.name}</div>
                                                <div className="t-artist mobile-only">{track.artist}</div>
                                            </div>
                                        </div>

                                        <div className="col-clock desktop-only">
                                            {formatTime(track.duration)}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                <div className="album-copyright">
                    <p>© {new Date().getFullYear()} {albumInfo.artist}</p>
                </div>
            </div>
        </div>
    );
}