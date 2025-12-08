import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaPlay, FaArrowLeft, FaBolt } from 'react-icons/fa';
import { tagGetTopTracks, getDeezerTrackImage } from '../../services/unifiedService';
import { usePlayer } from '../../context/playerContext';
import '../../shared/globalStyles.css';
import './genre.css'; // Crearemos esto en el paso 2

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1493225255756-d9584f8606e9?auto=format&fit=crop&w=1000&q=80';

export default function GenreDetail() {
    const { genreName } = useParams(); // Obtenemos "Rock", "Pop", etc. de la URL
    const navigate = useNavigate();
    const { playTrack } = usePlayer();

    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [heroImage, setHeroImage] = useState(DEFAULT_IMAGE);

    // Normalizamos los datos igual que en el Feed
    const normalizeItem = (item) => {
        if (!item) return null;
        const name = item.name || item.title || 'Desconocido';
        const artist = item.creator || (typeof item.artist === 'object' ? item.artist.name : item.artist) || 'Varios';

        let image = DEFAULT_IMAGE;
        if (typeof item.image === 'string' && item.image.startsWith('http')) image = item.image;
        else if (item.picture_xl || item.cover_xl) image = item.picture_xl || item.cover_xl;
        else if (Array.isArray(item.image) && item.image.length > 0) {
            const big = item.image.find(i => i.size === 'extralarge') || item.image[item.image.length - 1];
            if (big?.['#text']) image = big['#text'];
        }

        return {
            id: item.id || `${name}-${artist}`,
            name,
            artist,
            image,
            duration: item.duration || 0,
            album: item.album ? (item.album.title || item.album) : 'Single'
        };
    };

    useEffect(() => {
        const loadGenreData = async () => {
            setLoading(true);
            try {
                // 1. Pedimos las mejores canciones de este género
                const response = await tagGetTopTracks({ tag: genreName, limit: 20 });
                const rawTracks = response?.tracks?.track || [];
                const cleanTracks = rawTracks.map(normalizeItem);

                setTracks(cleanTracks);

                // 2. Intentamos buscar una imagen HD de la canción #1 para usar de fondo
                if (cleanTracks.length > 0) {
                    const topTrack = cleanTracks[0];
                    const hdImg = await getDeezerTrackImage(topTrack.name, topTrack.artist);
                    if (hdImg) setHeroImage(hdImg);
                    else setHeroImage(topTrack.image);
                }

            } catch (error) {
                console.error("Error cargando género:", error);
            } finally {
                setLoading(false);
            }
        };

        if (genreName) loadGenreData();
    }, [genreName]);

    const handlePlay = (track) => {
        playTrack(track);
    };

    const handlePlayAll = () => {
        if (tracks.length > 0) {
            playTrack(tracks[0], tracks); // Reproduce la primera y pone el resto en cola
        }
    };

    return (
        <div className="genre-container">
            {/* Background Hero */}
            <div className="genre-hero" style={{
                backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.3), #000), url(${heroImage})`
            }}>
                <div className="genre-header-nav">
                    <button className="back-btn" onClick={() => navigate(-1)}>
                        <FaArrowLeft /> Volver
                    </button>
                </div>

                <div className="genre-hero-content">
                    <div className="genre-tag-badge">EXPLORA EL GÉNERO</div>
                    <h1 className="genre-title">{genreName}</h1>
                    <p className="genre-subtitle">Las canciones más populares y artistas tendencia en {genreName}.</p>

                    <button className="genre-play-btn" onClick={handlePlayAll}>
                        <FaPlay /> REPRODUCIR MIX
                    </button>
                </div>
            </div>

            {/* Content List */}
            <div className="genre-content">
                {loading ? (
                    <div className="loading-spinner-container">
                        <div className="loading-spinner"></div>
                    </div>
                ) : (
                    <>
                        <div className="section-title-row">
                            <FaBolt style={{ color: '#00d4ff' }} /> Top Tracks
                        </div>

                        <div className="genre-track-grid">
                            {tracks.map((track, i) => (
                                <div key={i} className="genre-track-card" onClick={() => handlePlay(track)}>
                                    <div className="genre-img-wrapper">
                                        <img src={track.image} alt={track.name} loading="lazy" />
                                        <div className="genre-overlay">
                                            <FaPlay />
                                        </div>
                                    </div>
                                    <div className="genre-track-info">
                                        <div className="track-name">{track.name}</div>
                                        <div className="track-artist">{track.artist}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}