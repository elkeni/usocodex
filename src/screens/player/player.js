import React, { useState, useEffect, useRef } from 'react';
import './player.css';
import { FaPlay, FaPause, FaStepForward, FaStepBackward, FaRandom, FaRedo, FaList, FaEllipsisH } from 'react-icons/fa';
import { MdLyrics } from 'react-icons/md';
import { IoChevronDown } from 'react-icons/io5';
import { usePlayer } from '../../context/playerContext';
import { useNavigate } from 'react-router-dom';

export default function Player() {
  const {
    currentTrack,
    isPlaying,
    play,
    pause,
    next,
    prev,
    queue,
    played,    // Progreso (0 a 1)
    duration,  // Duración en segundos
    seekTo     // Función para adelantar/atrasar
  } = usePlayer();

  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [lyrics, setLyrics] = useState('');
  const [loadingLyrics, setLoadingLyrics] = useState(false);

  const navigate = useNavigate();
  const progressBarRef = useRef(null);

  // --- SAFE IMAGE EXTRACTION (Consistent with Radio/Widgets) ---
  const getTrackImage = () => {
    const PLACEHOLDER = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png';
    if (!currentTrack || !currentTrack.image) return PLACEHOLDER;

    if (Array.isArray(currentTrack.image)) {
      return currentTrack.image.find(i => i.size === 'extralarge')?.['#text'] ||
        currentTrack.image[3]?.['#text'] ||
        currentTrack.image[2]?.['#text'] ||
        currentTrack.image[0]?.['#text'] ||
        PLACEHOLDER;
    }
    return currentTrack.image || PLACEHOLDER;
  };

  const trackTitle = currentTrack?.name || currentTrack?.title || 'No Track Selected';
  const trackArtist = typeof currentTrack?.artist === 'object'
    ? currentTrack.artist['#text']
    : currentTrack?.artist || 'Select a song';
  const trackImage = getTrackImage();

  // --- MANEJO DE LYRICS ---
  useEffect(() => {
    if (showLyrics && !lyrics && currentTrack) {
      setLoadingLyrics(true);
      fetch(`https://api.lyrics.ovh/v1/${trackArtist}/${trackTitle}`)
        .then(res => res.json())
        .then(data => {
          setLyrics(data.lyrics || 'Lyrics not found.');
          setLoadingLyrics(false);
        })
        .catch(err => {
          console.error(err);
          setLyrics('Lyrics not found.');
          setLoadingLyrics(false);
        });
    }
  }, [showLyrics, currentTrack, lyrics, trackArtist, trackTitle]);

  // Si cambia la canción, reseteamos lyrics
  useEffect(() => {
    setLyrics('');
  }, [currentTrack]);

  // --- FORMATO DE TIEMPO ---
  const formatTime = (seconds) => {
    if (!seconds) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // --- CONTROL DE BARRA DE PROGRESO ---
  const handleSeek = (e) => {
    if (!progressBarRef.current) return;
    const width = progressBarRef.current.clientWidth;
    const clickX = e.nativeEvent.offsetX;
    const percentage = clickX / width;
    seekTo(percentage);
  };

  // Si no hay canción, mostramos un estado vacío
  if (!currentTrack) {
    return (
      <div className='player-screen' style={{ background: 'linear-gradient(135deg, #0a0a0f 0%, #1a0a1f 100%)', color: '#fff' }}>
        <div className="no-track-container">
          <h1>No music playing</h1>
          <button className="glass-btn" onClick={() => navigate('/')}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className='player-screen'>
      {/* DYNAMIC BACKGROUND - Changes with current song */}
      <div
        className="player-dynamic-bg"
        style={{
          backgroundImage: trackImage !== 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'
            ? `url(${trackImage})`
            : 'none',
          background: trackImage === 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png'
            ? 'linear-gradient(135deg, #0a0a0f 0%, #1a0a1f 100%, #0f0a1a 100%)'
            : undefined
        }}
      ></div>

      <div className="player-content">
        {/* Header */}
        <div className="player-header">
          <button className="player-header-btn" onClick={() => navigate(-1)}>
            <IoChevronDown style={{ transform: 'rotate(90deg)' }} />
          </button>
          <div className="player-header-title">Now Playing</div>
          <button className="player-header-btn" onClick={() => setShowMenu(!showMenu)}>
            <FaEllipsisH />
          </button>

          {showMenu && (
            <div className="player-menu-popup glass-card">
              <div className="menu-item">Add to Playlist</div>
              <div className="menu-item">Go to Artist</div>
              <div className="menu-item">Share</div>
            </div>
          )}
        </div>

        {/* Main Art */}
        <div className="player-art-container">
          <img
            src={trackImage}
            alt={trackTitle}
            className={`player-art ${isPlaying ? 'playing' : ''}`}
          />
        </div>

        {/* Track Info */}
        <div className="player-track-info">
          <h1 className="player-track-title">{trackTitle}</h1>
          <h2 className="player-track-artist">{trackArtist}</h2>
        </div>

        {/* Progress Real Conectado al Contexto */}
        <div className="player-progress-container">
          <div
            className="player-progress-bar"
            ref={progressBarRef}
            onClick={handleSeek}
            style={{ cursor: 'pointer' }}
          >
            <div className="player-progress-fill" style={{ width: `${played * 100}%` }}></div>
          </div>
          <div className="player-time">
            <span>{formatTime(played * duration)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="player-controls">
          <button className="control-btn secondary"><FaRandom /></button>

          <button className="control-btn secondary" onClick={prev}>
            <FaStepBackward />
          </button>

          <button className="control-btn primary" onClick={isPlaying ? pause : play}>
            {isPlaying ? <FaPause /> : <FaPlay style={{ marginLeft: '4px' }} />}
          </button>

          <button className="control-btn secondary" onClick={next}>
            <FaStepForward />
          </button>

          <button className="control-btn secondary"><FaRedo /></button>
        </div>

        {/* Bottom Actions */}
        <div className="player-actions">
          <button className={`action-btn ${showLyrics ? 'active' : ''}`} onClick={() => setShowLyrics(!showLyrics)}>
            <MdLyrics />
            <span>Lyrics</span>
          </button>
          <button className={`action-btn ${showQueue ? 'active' : ''}`} onClick={() => setShowQueue(!showQueue)}>
            <FaList />
            <span>Queue</span>
          </button>
        </div>
      </div>

      {/* Lyrics Overlay */}
      <div className={`player-overlay-view ${showLyrics ? 'open' : ''}`}>
        <div className="overlay-header">
          <h3>Lyrics</h3>
          <button className="overlay-close" onClick={() => setShowLyrics(false)}><IoChevronDown /></button>
        </div>
        <div className="lyrics-content">
          {loadingLyrics ? <div className="spinner"></div> : <pre>{lyrics}</pre>}
        </div>
      </div>

      {/* Queue Overlay */}
      <div className={`player-overlay-view ${showQueue ? 'open' : ''}`}>
        <div className="overlay-header">
          <h3>Up Next</h3>
          <button className="overlay-close" onClick={() => setShowQueue(false)}><IoChevronDown /></button>
        </div>
        <div className="queue-list">
          {queue.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center' }}>Queue is empty</p>
          ) : (
            queue.map((q, i) => {
              let qImg = 'https://via.placeholder.com/50';
              if (q.image && Array.isArray(q.image)) {
                qImg = q.image.find(img => img.size === 'extralarge')?.['#text'] || q.image[0]?.['#text'];
              } else if (q.image) {
                qImg = q.image;
              }

              return (
                <div key={i} className="queue-item glass-card">
                  <img src={qImg} alt={q.name} className="queue-img" />
                  <div className="queue-info">
                    <div className="queue-title">{q.name || q.title}</div>
                    <div className="queue-artist">{typeof q.artist === 'object' ? q.artist['#text'] : q.artist}</div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  );
}