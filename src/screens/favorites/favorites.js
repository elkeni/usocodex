import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../../shared/globalStyles.css';
import './favorites.css';
import { FaPlay, FaHeart } from 'react-icons/fa';
import { usePlayer } from '../../context/playerContext';
import { useUser } from '../../context/userContext'; // <--- IMPORTAMOS CONTEXTO

export default function Favorites() {
  const { playTrack } = usePlayer();
  const navigate = useNavigate();

  // Usamos los datos reales del contexto
  const { favorites, loading, toggleFavorite } = useUser();

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className='screen-container favorites-container'>
      <div className="favorites-main">
        {/* HERO SECTION */}
        <div className="favorites-hero">
          <div className="favorites-hero-icon">
            <FaHeart />
          </div>
          <div className="favorites-hero-content">
            <div className="favorites-hero-label">TU COLECCIÓN</div>
            <h1 className="favorites-hero-title">Canciones que te gustan</h1>
            <div className="favorites-hero-stats">
              {favorites.length} canciones • Guardadas en la nube
            </div>
          </div>
          {favorites.length > 0 && (
            <button className="favorites-play-all-btn" onClick={() => {
              playTrack(favorites[0], favorites); // Reproduce la primera y pone el resto en cola
            }}>
              <FaPlay style={{ marginRight: '8px', fontSize: '14px' }} /> REPRODUCIR TODO
            </button>
          )}
        </div>

        {/* LIST VIEW SECTION */}
        <div className="favorites-section">
          {loading ? (
            <div className='favorites-loading-container'>
              <div className="glass-spinner"></div>
              <p>Sincronizando biblioteca...</p>
            </div>
          ) : favorites.length === 0 ? (
            <div className='favorites-empty'>
              <div className="empty-icon"><FaHeart /></div>
              <h3>Aún no tienes favoritos</h3>
              <p>¡Dale al corazón en las canciones para verlas aquí!</p>
            </div>
          ) : (
            <div className='favorites-list-container'>
              {/* HEADER ROW */}
              <div className='favorites-list-header'>
                <div className='col-index'>#</div>
                <div className='col-title'>Título</div>
                <div className='col-artist'>Artista</div>
                <div className='col-album'>Álbum</div>
                <div className='col-time'>Duración</div>
                <div className='col-actions'></div>
              </div>

              {/* TRACK ROWS */}
              <div className='favorites-list-body'>
                {favorites.map((track, idx) => {
                  const artistName = track.artist;
                  return (
                    <div
                      key={idx}
                      className='favorites-track-row'
                      onDoubleClick={() => playTrack(track)}
                    >
                      <div className='col-index'>
                        <span className='row-number'>{idx + 1}</span>
                      </div>

                      <div className='col-title'>
                        <div className='row-img-wrapper'>
                          {track.image ? (
                            <img src={track.image} alt={track.name} />
                          ) : (
                            <div className='row-img-placeholder'><FaHeart /></div>
                          )}
                        </div>
                        <span className='row-title-text'>{track.name}</span>
                      </div>

                      <div className='col-artist'>
                        <span className='row-artist-link' onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/artist/${artistName}`);
                        }}>
                          {artistName}
                        </span>
                      </div>

                      <div className='col-album'>
                        <span>{track.album || '—'}</span>
                      </div>

                      <div className='col-time'>
                        <span>{formatDuration(track.duration)}</span>
                      </div>

                      <div className='col-actions'>
                        {/* Botón para quitar de favoritos */}
                        <button
                          className='row-like-active'
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(track);
                          }}
                        >
                          <FaHeart />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}