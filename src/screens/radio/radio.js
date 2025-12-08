import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  chartGetTopArtists,
  artistGetTopTracks
} from '../../services/unifiedService';
import { FaPlay, FaHeart, FaMusic, FaBroadcastTower } from 'react-icons/fa';
import '../../shared/globalStyles.css';
import './radio.css';
import { usePlayer } from '../../context/playerContext';

// Imagen por defecto si falla la carga
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60';

export default function Radio() {
  const { playTrack } = usePlayer();
  const navigate = useNavigate();

  const [topArtists, setTopArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1); // Mantenemos estado, aunque la API de charts suele ser estática
  const [playingArtist, setPlayingArtist] = useState(null);

  const limit = 18;

  // --- FETCH: Top Artists ---
  useEffect(() => {
    let isMounted = true;

    const fetchTopArtists = async () => {
      setLoading(true);
      try {
        // unifiedService devuelve: { artists: { artist: [ { name, image (string) }, ... ] } }
        const data = await chartGetTopArtists({ limit });

        if (isMounted && data?.artists?.artist) {
          setTopArtists(data.artists.artist);
        }
      } catch (error) {
        console.error('[Radio] Error cargando charts:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchTopArtists();
    return () => { isMounted = false; };
  }, [page]);

  // --- HANDLER: Smart Play ---
  const handlePlayArtist = async (e, artist) => {
    e.stopPropagation();
    if (playingArtist) return;

    setPlayingArtist(artist.name);

    try {
      // 1. Obtener Top Track del Artista usando unifiedService
      const topTracksRes = await artistGetTopTracks({
        artist: artist.name,
        limit: 1
      });

      // La estructura de respuesta es { toptracks: { track: [...] } }
      const track = topTracksRes?.toptracks?.track?.[0];

      if (track) {
        // 2. Preparar objeto para el reproductor
        // unifiedService ya devuelve 'image' como string URL, no necesitamos helpers complejos.
        const trackToPlay = {
          name: track.name,
          artist: artist.name,
          image: track.image || artist.image || DEFAULT_IMAGE,
          duration: track.duration, // unifiedService ya lo entrega limpio
          album: track.album || 'Top Hits'
        };

        // 3. Reproducir
        playTrack(trackToPlay);
      } else {
        console.warn('No se encontraron pistas para', artist.name);
      }
    } catch (error) {
      console.error('Error al intentar reproducir artista:', error);
    } finally {
      setPlayingArtist(null);
    }
  };

  return (
    <div className='screen-container radio-container'>
      <div className="radio-main">

        {/* HERO SECTION */}
        <div className="radio-hero">
          <div className="hero-overlay"></div>
          <div className="radio-hero-content">
            <div className="radio-hero-label">
              <FaBroadcastTower style={{ marginRight: 8 }} /> ESTACIÓN DESTACADA
            </div>
            <h1 className="radio-hero-title">Global Top 50</h1>
            <div className="radio-hero-desc">
              Los artistas más escuchados en todo el mundo, actualizados en tiempo real.
            </div>
            <div className="radio-hero-actions">
              <button
                className="radio-play-btn"
                onClick={(e) => topArtists[0] && handlePlayArtist(e, topArtists[0])}
                disabled={loading || topArtists.length === 0}
              >
                <span className="btn-icon">
                  {playingArtist === topArtists[0]?.name ? <div className="spinner-mini"></div> : <FaPlay />}
                </span>
                {playingArtist === topArtists[0]?.name ? 'Cargando...' : 'Iniciar Radio'}
              </button>
              <button className="radio-save-btn">
                <span className="btn-icon"><FaHeart /></span>
                Seguir
              </button>
            </div>
          </div>
        </div>

        {/* ARTISTS GRID */}
        <div className="radio-section">
          <div className="radio-section-header">
            <h2 className='radio-title'>Artistas en Tendencia</h2>
            {/* Ocultamos paginación si la API no soporta offset real por ahora */}
            <div className="radio-section-more">Top Mundial</div>
          </div>

          {loading ? (
            <div className='radio-loading-container'>
              <div className="loading-spinner"></div>
              <p>Sintonizando frecuencias...</p>
            </div>
          ) : (
            <div className='radio-grid'>
              {topArtists.map((artist, index) => {
                // unifiedService devuelve la imagen directamente en artist.image
                const imageUrl = artist.image || DEFAULT_IMAGE;
                const isPlayingThis = playingArtist === artist.name;

                return (
                  <div
                    key={`${artist.name}-${index}`}
                    className='radio-card'
                    onClick={() => navigate(`/artist/${encodeURIComponent(artist.name)}`)}
                  >
                    <div className='radio-card-thumb'>
                      <img
                        className='radio-card-img'
                        src={imageUrl}
                        alt={artist.name}
                        loading="lazy"
                        onError={(e) => { e.target.src = DEFAULT_IMAGE; }}
                      />

                      <div className="radio-play-overlay">
                        <button
                          className={`radio-card-play-btn ${isPlayingThis ? 'loading' : ''}`}
                          onClick={(e) => handlePlayArtist(e, artist)}
                          disabled={isPlayingThis}
                        >
                          {isPlayingThis ? <div className="spinner-mini"></div> : <FaPlay />}
                        </button>
                      </div>
                    </div>

                    <div className='radio-card-info'>
                      <div className='radio-card-name' title={artist.name}>
                        {artist.name}
                      </div>
                      <div className='radio-card-plays'>
                        Tendencia Global
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PAGINATION VISUAL (Desactivada funcionalmente para evitar confusión con Charts estáticos) */}
          <div className="radio-pagination">
            {/* Paginación simplificada */}
            <span className='radio-page-label'>Mostrando los artistas más populares de hoy</span>
          </div>
        </div>
      </div>
    </div>
  );
}