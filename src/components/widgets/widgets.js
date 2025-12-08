import React, { useEffect, useState } from 'react';
import './widgets.css';
import { usePlayer } from '../../context/playerContext';
import { artistSearch, artistGetTopTracks } from '../../services/unifiedService';
import { FaPlay, FaMusic } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';

export default function RightSidebar() {
    const { currentTrack, playTrack } = usePlayer();
    const [artistInfo, setArtistInfo] = useState(null);
    const [similarTracks, setSimilarTracks] = useState([]);
    const navigate = useNavigate();

    // Efecto para cargar info cuando cambia la canción
    useEffect(() => {
        if (currentTrack?.artist) {
            const fetchInfo = async () => {
                try {
                    const artistName = typeof currentTrack.artist === 'object'
                        ? currentTrack.artist['#text']
                        : currentTrack.artist;

                    const [infoRes, tracksRes] = await Promise.all([
                        artistSearch({ artist: artistName, limit: 1 }),
                        artistGetTopTracks({ artist: artistName, limit: 3 })
                    ]);

                    // artistSearch retorna { results: { artistmatches: { artist: [...] } } }
                    const artist = infoRes?.results?.artistmatches?.artist?.[0];
                    setArtistInfo(artist);
                    setSimilarTracks(tracksRes?.toptracks?.track || []);
                } catch (e) {
                    console.error("Error fetching widget info:", e);
                }
            };
            fetchInfo();
        }
    }, [currentTrack]);

    // Helper para imagen segura (Improved Logic)
    const getImage = (item) => {
        if (!item?.image) return '';

        // Handle Last.fm array format
        if (Array.isArray(item.image)) {
            // Try to find extralarge, then large, then medium
            const extraLarge = item.image.find(img => img.size === 'extralarge');
            if (extraLarge && extraLarge['#text']) return extraLarge['#text'];

            const large = item.image.find(img => img.size === 'large');
            if (large && large['#text']) return large['#text'];

            // Fallback to index if find fails
            return item.image[3]?.['#text'] || item.image[2]?.['#text'] || '';
        }

        // Handle string format
        return typeof item.image === 'string' ? item.image : '';
    };

    if (!currentTrack) return (
        <div className="right-sidebar">
            <div className="widget-placeholder">
                <FaMusic className="placeholder-icon" />
                <p>Play something to see details</p>
            </div>
        </div>
    );

    return (
        <div className="right-sidebar">
            {/* 1. NOW PLAYING INFO */}
            <div className="widget-section">
                <h3 className="widget-title">Now Playing</h3>
                <div className="np-card">
                    <div className="np-img-container">
                        <img
                            src={getImage(currentTrack) || 'https://via.placeholder.com/300/000000/FFFFFF/?text=No+Image'}
                            alt="Album Art"
                            className="np-img"
                            onError={(e) => { e.target.src = 'https://via.placeholder.com/300/000000/FFFFFF/?text=No+Image'; }}
                        />
                        <div className="np-glow"></div>
                    </div>
                    <div className="np-info">
                        <div className="np-track-name" title={currentTrack.name}>{currentTrack.name}</div>
                        <div className="np-artist-name">{artistInfo?.name || "Unknown Artist"}</div>
                    </div>
                </div>
            </div>

            {/* 2. ARTIST BIO SNIPPET */}
            {artistInfo && (
                <div className="widget-section">
                    <h3 className="widget-title">About the Artist</h3>
                    <div className="artist-bio-widget" onClick={() => navigate(`/artist/${artistInfo.name}`)}>
                        <div className="bio-header">
                            <img
                                src={getImage(artistInfo) || 'https://via.placeholder.com/100'}
                                alt={artistInfo.name}
                                className="bio-avatar"
                                onError={(e) => { e.target.src = 'https://via.placeholder.com/100'; }}
                            />
                            <div className="bio-stats">
                                <span className="stat-label">{artistInfo.name}</span>
                            </div>
                        </div>
                        <button className="view-artist-btn">VIEW FULL PROFILE</button>
                    </div>
                </div>
            )}

            {/* 3. POPULAR TRACKS (SIMILAR) */}
            {similarTracks.length > 0 && (
                <div className="widget-section">
                    <h3 className="widget-title">Popular by {artistInfo?.name}</h3>
                    <div className="widget-list">
                        {similarTracks.map((track, i) => (
                            <div key={i} className="widget-row" onClick={() => playTrack(track)}>
                                <img
                                    src={getImage(track) || 'https://via.placeholder.com/40'}
                                    alt=""
                                    className="widget-row-img"
                                    onError={(e) => { e.target.src = 'https://via.placeholder.com/40'; }}
                                />
                                <div className="widget-row-info">
                                    <div className="w-title">{track.name}</div>
                                    <div className="w-plays">{parseInt(track.playcount || 0).toLocaleString()} plays</div>
                                </div>
                                <button className="w-play-btn"><FaPlay /></button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
