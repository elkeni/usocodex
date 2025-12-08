import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Servicios Unificados
import {
  chartGetTopTracks,
  chartGetTopPlaylists,
  artistGetTopTracks,
  playlistSearch,
  playlistGetInfo,
  getDeezerTrackImage
} from '../../services/unifiedService';

import {
  FaPlay, FaHeart, FaBolt, FaListAlt, FaCompactDisc,
  FaStar, FaFire, FaMicrophoneAlt, FaHeadphones
} from 'react-icons/fa';

import '../../shared/globalStyles.css';
import './feed.css';

import { useUser } from '../../context/userContext';
import { usePlayer } from '../../context/playerContext';

// =============================================================================
// CONSTANTES Y CONFIGURACIÓN
// =============================================================================

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60';
const CACHE_KEY = 'feed_data_v1';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas en ms

// Playlists de nuevos lanzamientos
const NEW_RELEASES_PLAYLIST_QUERIES = [
  'New Music Friday',
  'Novedades Viernes',
  'New Releases',
  'Estrenos'
];

// Géneros para "Modo Fiesta"
const PARTY_PLAYLIST_SEARCHES = [
  'Reggaeton Party',
  'Latin Party',
  'Dance Hits',
  'Club Bangers',
  'Fiesta Latina'
];

// Artistas populares como fallback
const FALLBACK_ARTISTS = [
  'Bad Bunny', 'Taylor Swift', 'The Weeknd', 'Drake', 'Dua Lipa',
  'Karol G', 'Ed Sheeran', 'Billie Eilish', 'Post Malone', 'Shakira'
];

// Diccionario de géneros
const GENRE_PLAYLIST_QUERIES = {
  'Pop': ['Top Pop Hits', 'Pop Hits Global', 'Today Top Hits'],
  'Rock': ['Rock Classics', 'Best of Rock', 'Classic Rock Hits'],
  'Indie': ['Indie Essentials', 'Indie Pop', 'Alternative Hits'],
  'Hip Hop': ['Hip Hop Hits', 'Rap Caviar', 'Best Hip Hop'],
  'Jazz': ['Jazz Classics', 'Smooth Jazz', 'Jazz Vibes'],
  'Metal': ['Metal Essentials', 'Heavy Metal Classics', 'Metal Hits'],
  'Latino': ['Éxitos Latinos', 'Reggaeton Hits', 'Latin Hits Today'],
  'R&B': ['R&B Hits', 'Soul & R&B', 'Best R&B'],
  'K-Pop': ['K-Pop Hits', 'Best of K-Pop', 'K-Pop Daebak'],
  'Electrónica': ['Electronic Dance', 'EDM Hits', 'Dance Hits']
};

// =============================================================================
// UTILIDADES DE CACHÉ (Stale-While-Revalidate)
// =============================================================================

const loadFromCache = () => {
  try {
    const cached = localStorage. getItem(CACHE_KEY);
    if (! cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;

    // Si el caché tiene menos de 24 horas, usarlo
    if (age < CACHE_TTL && data) {
      console.log('[Cache] Datos cargados desde caché local');
      return data;
    }

    // Caché expirado
    console.log('[Cache] Caché expirado, se recargará');
    return null;
  } catch (error) {
    console.warn('[Cache] Error leyendo caché:', error);
    return null;
  }
};

const saveToCache = (data) => {
  try {
    const cacheEntry = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
    console.log('[Cache] Datos guardados en caché');
  } catch (error) {
    console.warn('[Cache] Error guardando caché:', error);
  }
};

// =============================================================================
// COMPONENTES VISUALES
// =============================================================================

// Mini spinner para secciones lazy
const SectionLoader = () => (
  <div className="section-loader">
    <div className="section-loader-spinner"></div>
  </div>
);

const GlassCard = ({ item, icon, onPlay, badge, badgeType }) => {
  const getBadgeClass = () => {
    switch (badgeType) {
      case 'new': return 'curated-badge badge-new';
      case 'single': return 'curated-badge badge-single';
      case 'party': return 'curated-badge badge-party';
      case 'official': return 'curated-badge badge-official';
      default: return 'curated-badge';
    }
  };

  return (
    <div className='feed-trending-card' onClick={() => onPlay(item)}>
      <div className='feed-trending-thumb'>
        <img
          className="feed-trending-img"
          src={item.image || DEFAULT_IMAGE}
          alt={item.name}
          loading="lazy"
          onError={(e) => { e.target.src = DEFAULT_IMAGE; }}
        />
        {badge && <div className={getBadgeClass()}>{badge}</div>}
        <div className="feed-play-overlay">
          <div className="feed-play-btn">
            {item.type === 'playlist' ? <FaListAlt size={18} /> : <FaPlay size={18} style={{ marginLeft: '4px' }} />}
          </div>
        </div>
      </div>
      <div className='feed-trending-info'>
        <div className='feed-trending-name' title={item.name}>{item.name}</div>
        <div className='feed-trending-artist'>
          {icon} {item.artist || item.creator || 'Varios'}
        </div>
      </div>
    </div>
  );
};

const ArtistCircle = ({ item, onPlay }) => (
  <div className='artist-circle-card' onClick={() => onPlay(item)}>
    <div className='artist-img-wrapper'>
      <img
        src={item.image || DEFAULT_IMAGE}
        alt={item.artist}
        loading="lazy"
        onError={(e) => { e.target.src = DEFAULT_IMAGE; }}
      />
    </div>
    <div className='artist-name-circle'>{item.artist || item.name}</div>
    <div className='artist-genre-sub'>Artista</div>
  </div>
);

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export default function Feed() {
  const { playTrack } = usePlayer();
  const navigate = useNavigate();
  const { user, favorites } = useUser();
  
  // Ref para evitar doble carga
  const isLoadingRef = useRef(false);
  const hasMountedRef = useRef(false);

  const displayName = user?.displayName || user?.email?. split('@')[0] || 'Viajero';

  // =============================================================================
  // ESTADOS - Granulares para carga progresiva
  // =============================================================================
  
  // Estado crítico (Above the Fold)
  const [heroItem, setHeroItem] = useState(null);
  const [heroColor, setHeroColor] = useState('255, 255, 255');
  const [criticalLoading, setCriticalLoading] = useState(true); // Solo para Hero + Nuevos
  
  // Estado de secciones con loading individual
  const [sections, setSections] = useState({
    newReleases: [],
    trending: [],
    topPlaylists: [],
    personalizedTracks: [],
    partyPlaylists: [],
    artistSpotlight: []
  });

  // Estados de carga por sección (lazy loading)
  const [sectionLoading, setSectionLoading] = useState({
    topPlaylists: true,
    personalizedTracks: true,
    partyPlaylists: true
  });

  const [personalizedTitle, setPersonalizedTitle] = useState('Recomendado para ti');
  const [genreLoading, setGenreLoading] = useState(null);
  const [todayDate, setTodayDate] = useState('');

  const genres = ["Pop", "Rock", "Indie", "Hip Hop", "Jazz", "Metal", "Latino", "R&B", "K-Pop", "Electrónica"];

  // =============================================================================
  // UTILIDADES DE NORMALIZACIÓN
  // =============================================================================

  const normalizeItem = useCallback((item, type = 'track') => {
    if (!item) return null;

    const name = item.name || item.title || 'Desconocido';
    const artist = item.creator || (typeof item.artist === 'object' ? item.artist?. name : item.artist) || 'Varios';
    const id = item.id || `${name}-${artist}-${Date.now()}`;

    let image = DEFAULT_IMAGE;
    if (typeof item.image === 'string' && item.image.startsWith('http')) {
      image = item.image;
    } else if (Array.isArray(item.image)) {
      const big = item.image. find(i => i.size === 'extralarge' || i.size === 'large') || item.image[item.image.length - 1];
      if (big?. ['#text']) image = big['#text'];
    } else if (item.picture_xl || item.cover_xl) {
      image = item.picture_xl || item. cover_xl;
    } else if (item.picture_big || item.cover_big) {
      image = item.picture_big || item.cover_big;
    }

    if (! image || image === '' || image === DEFAULT_IMAGE) {
      if (item.album?. cover_xl) image = item.album. cover_xl;
      else if (item.artist?.picture_xl) image = item.artist.picture_xl;
    }

    return {
      id, name, artist, image, type,
      duration: item.duration || 0,
      album: item.album ?  (item.album.title || item.album) : 'Single',
      trackCount: item.trackCount || item.nb_tracks || 0,
      isSingle: ! item.album || item.album === 'Single' || item.album?. title === name
    };
  }, []);

  const removeDuplicates = useCallback((items) => {
    const seen = new Map();
    return items.filter(item => {
      if (!item) return false;
      const key = item.id || `${item.name?. toLowerCase()}-${item.artist?. toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.set(key, true);
      return true;
    });
  }, []);

  const filterQualityTracks = useCallback((tracks) => {
    const badKeywords = ['cover', 'karaoke', 'instrumental', 'tribute', 'remix', 'slowed', 'reverb', '8d', 'nightcore'];
    return tracks.filter(track => {
      if (!track || !track.name) return false;
      const nameLower = track.name.toLowerCase();
      return ! badKeywords.some(keyword => new RegExp(`\\b${keyword}\\b`, 'i').test(nameLower));
    });
  }, []);

  const shuffleArray = useCallback((array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  const extractUniqueArtists = useCallback((tracks) => {
    const artistMap = new Map();
    tracks.forEach(track => {
      if (track?. artist && ! artistMap.has(track.artist)) {
        artistMap.set(track.artist, {
          id: `artist-${track.artist}`,
          name: track.artist,
          artist: track.artist,
          image: track.image,
          type: 'artist'
        });
      }
    });
    return Array.from(artistMap.values()). slice(0, 6);
  }, []);

  // =============================================================================
  // FUNCIONES DE CARGA - FASE 1 (CRÍTICA)
  // =============================================================================

  /**
   * Carga los datos críticos para el Hero y Nuevos Lanzamientos
   * Esta es la primera en ejecutarse y desbloquea el renderizado principal
   */
  const loadCriticalData = useCallback(async () => {
    console.log('[Feed] Iniciando carga crítica (Fase 1).. .');
    
    try {
      // Ejecutar ambas en paralelo - son las más importantes
      const [chartsResponse, newReleasesData] = await Promise.all([
        chartGetTopTracks({ limit: 12 }),
        loadNewReleasesInternal()
      ]);

      // Procesar tendencias
      const rawTrending = chartsResponse?. tracks?. track || [];
      const normalizedTrending = rawTrending
        .map(t => normalizeItem(t, 'track'))
        .filter(t => t && t.image && t.image !== DEFAULT_IMAGE);

      const trendingTracks = filterQualityTracks(removeDuplicates(normalizedTrending));

      // Configurar Hero (sin esperar imagen HD para no bloquear)
      if (trendingTracks.length > 0) {
        const topTrack = trendingTracks[0];
        setHeroItem(topTrack);
        
        // Cargar imagen HD en background (no bloquea)
        getDeezerTrackImage(topTrack.name, topTrack.artist). then(hdImage => {
          if (hdImage) {
            setHeroItem(prev => prev ? { ...prev, image: hdImage } : prev);
          }
        }). catch(() => {});
      }

      // Extraer artistas
      const spotlightArtists = extractUniqueArtists(trendingTracks);

      // Actualizar estado crítico
      setSections(prev => ({
        ...prev,
        newReleases: newReleasesData,
        trending: trendingTracks. slice(1, 7),
        artistSpotlight: spotlightArtists
      }));

      console.log('[Feed] Fase 1 completada - Hero y Nuevos Lanzamientos listos');
      
      return { trendingTracks, newReleasesData };

    } catch (error) {
      console.error('[Feed] Error en carga crítica:', error);
      return { trendingTracks: [], newReleasesData: [] };
    }
  }, [normalizeItem, removeDuplicates, filterQualityTracks, extractUniqueArtists]);

  /**
   * Función interna para cargar nuevos lanzamientos
   */
  const loadNewReleasesInternal = useCallback(async () => {
    try {
      for (const query of NEW_RELEASES_PLAYLIST_QUERIES) {
        try {
          const searchResult = await playlistSearch({ query, limit: 3 });
          const playlists = searchResult?. results?. playlistmatches?.playlist || [];

          for (const playlist of playlists) {
            if (playlist?. id && playlist?.trackCount > 0) {
              const playlistData = await playlistGetInfo({ id: playlist.id });
              
              if (playlistData?. tracks?.length > 0) {
                const normalizedTracks = playlistData.tracks
                  .map(t => normalizeItem(t, 'track'))
                  .filter(t => t && t.image && t.image !== DEFAULT_IMAGE);

                const qualityTracks = filterQualityTracks(removeDuplicates(normalizedTracks));
                if (qualityTracks.length >= 4) {
                  return qualityTracks.slice(0, 8);
                }
              }
            }
          }
        } catch (e) {
          continue;
        }
      }

      // Fallback a charts
      const chartsResponse = await chartGetTopTracks({ limit: 12 });
      const tracks = chartsResponse?.tracks?.track || [];
      return tracks
        .map(t => normalizeItem(t, 'track'))
        .filter(t => t && t.image && t.image !== DEFAULT_IMAGE)
        .slice(0, 8);

    } catch (error) {
      console.warn('[Feed] Error en loadNewReleases:', error);
      return [];
    }
  }, [normalizeItem, removeDuplicates, filterQualityTracks]);

  // =============================================================================
  // FUNCIONES DE CARGA - FASE 2 (LAZY / BELOW THE FOLD)
  // =============================================================================

  /**
   * Carga playlists populares (lazy)
   */
  const loadTopPlaylistsLazy = useCallback(async () => {
    console.log('[Feed] Cargando playlists populares (Fase 2)...');
    
    try {
      const response = await chartGetTopPlaylists({ limit: 10 });
      const rawPlaylists = response?.playlists?.playlist || [];
      
      const normalized = rawPlaylists
        . map(p => normalizeItem(p, 'playlist'))
        .filter(p => p && p.image && p.image !== DEFAULT_IMAGE);

      const uniquePlaylists = removeDuplicates(normalized). slice(0, 8);

      setSections(prev => ({ ...prev, topPlaylists: uniquePlaylists }));
      setSectionLoading(prev => ({ ... prev, topPlaylists: false }));

    } catch (error) {
      console.warn('[Feed] Error cargando playlists:', error);
      setSectionLoading(prev => ({ ...prev, topPlaylists: false }));
    }
  }, [normalizeItem, removeDuplicates]);

  /**
   * Carga playlists de fiesta (lazy)
   */
  const loadPartyPlaylistsLazy = useCallback(async () => {
    console.log('[Feed] Cargando playlists de fiesta (Fase 2).. .');
    
    try {
      const selectedSearches = shuffleArray(PARTY_PLAYLIST_SEARCHES).slice(0, 3);

      const searchPromises = selectedSearches.map(async (query) => {
        try {
          const result = await playlistSearch({ query, limit: 4 });
          return result?.results?.playlistmatches?.playlist || [];
        } catch {
          return [];
        }
      });

      const results = await Promise.all(searchPromises);
      const allPlaylists = results.flat();

      const normalized = allPlaylists
        .map(p => normalizeItem(p, 'playlist'))
        .filter(p => p && p.image && p.image !== DEFAULT_IMAGE);

      const uniquePlaylists = shuffleArray(removeDuplicates(normalized)).slice(0, 8);

      setSections(prev => ({ ...prev, partyPlaylists: uniquePlaylists }));
      setSectionLoading(prev => ({ ... prev, partyPlaylists: false }));

    } catch (error) {
      console.warn('[Feed] Error cargando party playlists:', error);
      setSectionLoading(prev => ({ ...prev, partyPlaylists: false }));
    }
  }, [normalizeItem, removeDuplicates, shuffleArray]);

  /**
   * Carga contenido personalizado (lazy)
   */
  const loadPersonalizedLazy = useCallback(async () => {
    console.log('[Feed] Cargando contenido personalizado (Fase 2)...');
    
    try {
      let targetArtist = null;
      let sectionTitle = 'Recomendado para ti';

      if (favorites && favorites.length > 0) {
        const artistCounts = {};
        favorites.forEach(fav => {
          if (fav?. artist) {
            const artist = typeof fav.artist === 'object' ? fav.artist.name : fav.artist;
            artistCounts[artist] = (artistCounts[artist] || 0) + 1;
          }
        });

        const sortedArtists = Object.entries(artistCounts). sort((a, b) => b[1] - a[1]);
        if (sortedArtists.length > 0) {
          targetArtist = sortedArtists[0][0];
          sectionTitle = `Porque te gusta ${targetArtist}`;
        }
      }

      if (!targetArtist) {
        targetArtist = FALLBACK_ARTISTS[Math.floor(Math.random() * FALLBACK_ARTISTS.length)];
        sectionTitle = `Lo mejor de ${targetArtist}`;
      }

      setPersonalizedTitle(sectionTitle);

      const artistTracks = await artistGetTopTracks({ artist: targetArtist, limit: 12 });
      const tracks = artistTracks?.toptracks?.track || [];

      const normalized = tracks
        .map(t => normalizeItem(t, 'track'))
        .filter(t => t && t.image && t.image !== DEFAULT_IMAGE);

      const qualityTracks = filterQualityTracks(removeDuplicates(normalized)). slice(0, 8);

      setSections(prev => ({ ... prev, personalizedTracks: qualityTracks }));
      setSectionLoading(prev => ({ ... prev, personalizedTracks: false }));

    } catch (error) {
      console.warn('[Feed] Error cargando personalizado:', error);
      setSectionLoading(prev => ({ ...prev, personalizedTracks: false }));
    }
  }, [favorites, normalizeItem, removeDuplicates, filterQualityTracks]);

  // =============================================================================
  // FUNCIÓN PARA BUSCAR PLAYLIST POR GÉNERO
  // =============================================================================

  const fetchGenrePlaylist = useCallback(async (genre) => {
    const queries = GENRE_PLAYLIST_QUERIES[genre];
    if (!queries) return null;

    for (const query of queries) {
      try {
        const searchResult = await playlistSearch({ query, limit: 5 });
        const playlists = searchResult?.results?.playlistmatches?.playlist || [];

        for (const playlist of playlists) {
          if (playlist?. id && (playlist?.trackCount > 0 || playlist?.nb_tracks > 0)) {
            const normalized = normalizeItem(playlist, 'playlist');
            if (normalized && normalized.image && normalized.image !== DEFAULT_IMAGE) {
              return { playlistId: playlist.id, playlistData: normalized };
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
    return null;
  }, [normalizeItem]);

  // =============================================================================
  // EFECTOS
  // =============================================================================

  // Configuración de fecha
  useEffect(() => {
    const date = new Date();
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    setTodayDate(date.toLocaleDateString('es-ES', options));
  }, []);

  // Efecto de color del Hero
  useEffect(() => {
    if (! heroItem?.image || heroItem.image === DEFAULT_IMAGE) return;

    const img = new Image();
    img. crossOrigin = "Anonymous";
    img.src = heroItem.image;
    img. onload = () => {
      try {
        const canvas = document. createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1;
        canvas.height = 1;
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx. getImageData(0, 0, 1, 1).data;
        setHeroColor(`${r}, ${g}, ${b}`);
      } catch (e) {}
    };
  }, [heroItem]);

  // =============================================================================
  // CARGA PRINCIPAL - ESTRATEGIA STALE-WHILE-REVALIDATE
  // =============================================================================

  useEffect(() => {
    if (! user || hasMountedRef.current) return;
    hasMountedRef.current = true;

    const initializeFeed = async () => {
      // PASO 1: Intentar cargar desde caché (instantáneo)
      const cachedData = loadFromCache();
      
      if (cachedData) {
        console.log('[Feed] Usando datos de caché para renderizado instantáneo');
        
        // Aplicar caché inmediatamente
        if (cachedData.heroItem) setHeroItem(cachedData. heroItem);
        if (cachedData.sections) {
          setSections(cachedData.sections);
          // Si hay caché, marcar secciones como cargadas
          setSectionLoading({
            topPlaylists: ! cachedData.sections.topPlaylists?. length,
            personalizedTracks: !cachedData.sections.personalizedTracks?. length,
            partyPlaylists: !cachedData.sections.partyPlaylists?.length
          });
        }
        if (cachedData.personalizedTitle) setPersonalizedTitle(cachedData.personalizedTitle);
        
        // Desbloquear renderizado inmediatamente
        setCriticalLoading(false);
        
        // Revalidar en background después de 500ms
        setTimeout(() => {
          revalidateInBackground();
        }, 500);
        
      } else {
        // Sin caché: carga normal con cascada
        console.log('[Feed] Sin caché, iniciando carga fresca');
        await loadFreshData();
      }
    };

    /**
     * Revalida datos en background sin bloquear UI
     */
    const revalidateInBackground = async () => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      console.log('[Feed] Revalidando datos en background.. .');

      try {
        // Fase 1: Crítica
        await loadCriticalData();

        // Fase 2: Lazy (en paralelo, no bloqueante)
        Promise.all([
          loadTopPlaylistsLazy(),
          loadPartyPlaylistsLazy(),
          loadPersonalizedLazy()
        ]).then(() => {
          // Guardar en caché cuando todo termine
          setTimeout(() => {
            setSections(currentSections => {
              const dataToCache = {
                heroItem,
                sections: currentSections,
                personalizedTitle,
                timestamp: Date.now()
              };
              saveToCache(dataToCache);
              return currentSections;
            });
          }, 100);
        });

      } finally {
        isLoadingRef. current = false;
      }
    };

    /**
     * Carga fresca con estrategia de cascada
     */
    const loadFreshData = async () => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      try {
        // FASE 1: Cargar datos críticos (Hero + Nuevos Lanzamientos)
        await loadCriticalData();
        
        // Desbloquear renderizado principal
        setCriticalLoading(false);
        console.log('[Feed] UI desbloqueada - usuario puede interactuar');

        // FASE 2: Cargar datos secundarios en cascada (no bloquea)
        // Disparo secuencial con pequeños delays para no saturar
        
        // Primero playlists populares
        loadTopPlaylistsLazy();
        
        // Después de 200ms, personalizado
        setTimeout(() => {
          loadPersonalizedLazy();
        }, 200);
        
        // Después de 400ms, fiesta
        setTimeout(() => {
          loadPartyPlaylistsLazy();
        }, 400);

        // Guardar en caché cuando termine la fase 2
        setTimeout(() => {
          setSections(currentSections => {
            const dataToCache = {
              heroItem,
              sections: currentSections,
              personalizedTitle,
              timestamp: Date.now()
            };
            saveToCache(dataToCache);
            return currentSections;
          });
        }, 2000);

      } catch (error) {
        console. error('[Feed] Error en carga inicial:', error);
        setCriticalLoading(false);
      } finally {
        isLoadingRef.current = false;
      }
    };

    initializeFeed();
  }, [user, loadCriticalData, loadTopPlaylistsLazy, loadPartyPlaylistsLazy, loadPersonalizedLazy, heroItem, personalizedTitle]);

  // =============================================================================
  // HANDLERS
  // =============================================================================

  const handlePlay = useCallback((item) => {
    if (item. type === 'playlist') {
      navigate(`/playlist/${item.id}`);
      return;
    }
    if (item.type === 'artist') {
      navigate(`/artist/${encodeURIComponent(item.artist || item.name)}`);
      return;
    }
    playTrack(item);
  }, [navigate, playTrack]);

  const handleGenreClick = useCallback(async (genre) => {
    setGenreLoading(genre);

    try {
      const result = await fetchGenrePlaylist(genre);

      if (result && result.playlistId) {
        navigate(`/playlist/${result. playlistId}`);
      } else {
        const fallbackQuery = GENRE_PLAYLIST_QUERIES[genre]?.[0] || genre;
        navigate(`/genre/${encodeURIComponent(genre)}`, {
          state: { searchQuery: fallbackQuery }
        });
      }
    } catch (error) {
      navigate(`/genre/${encodeURIComponent(genre)}`);
    } finally {
      setGenreLoading(null);
    }
  }, [navigate, fetchGenrePlaylist]);

  const getReleaseBadge = (item) => {
    if (item.isSingle || item.album === 'Single' || ! item.album) {
      return { text: 'SENCILLO', type: 'single' };
    }
    return { text: 'NUEVO', type: 'new' };
  };

  // =============================================================================
  // RENDER
  // =============================================================================

  // Solo mostrar loading completo si no hay Hero ni datos críticos
  if (criticalLoading && !heroItem && sections.newReleases.length === 0) {
    return (
      <div className="feed-loading">
        <div className="loading-spinner"></div>
        Preparando tu música...
      </div>
    );
  }

  return (
    <div className='feed-container'>
      <div className='feed-main'>
        <div className="feed-content-wrapper">

          {/* 1.  HERO SECTION */}
          {heroItem && (
            <div
              className="feed-hero"
              style={{
                backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 100%), url(${heroItem.image})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center 20%'
              }}
            >
              <div className="hero-overlay"></div>
              <div className="hero-content">
                <div className="hero-label" style={{ color: `rgb(${heroColor})` }}>
                  TENDENCIA MUNDIAL #1
                </div>
                <h1 className="hero-title">{heroItem.name}</h1>
                <p className="hero-desc">{heroItem.artist} • {heroItem.album}</p>
                <div className="hero-actions">
                  <button className="hero-play-btn" onClick={() => handlePlay(heroItem)}>
                    <span className="hero-btn-text">ESCUCHAR AHORA</span>
                    <div className="hero-icon-rectangle">
                      <FaPlay size={12} />
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. BARRA DE GÉNEROS */}
          <div className="feed-pills-container">
            {genres.map(g => (
              <div
                key={g}
                className={`genre-pill ${genreLoading === g ? 'genre-pill-loading' : ''}`}
                onClick={() => ! genreLoading && handleGenreClick(g)}
                style={{
                  pointerEvents: genreLoading ?  'none' : 'auto',
                  opacity: genreLoading && genreLoading !== g ? 0.5 : 1
                }}
              >
                {genreLoading === g && <span className="pill-loading-spinner"></span>}
                {g}
              </div>
            ))}
          </div>

          {/* 3. NUEVOS LANZAMIENTOS */}
          {sections.newReleases.length > 0 && (
            <div className="feed-section">
              <div className="section-header" style={{ display: 'block' }}>
                <span className="section-super-title">
                  <FaCompactDisc style={{ marginRight: 6, position: 'relative', top: 1 }} />
                  ESTA SEMANA
                </span>
                <h2 className="feed-title">Nuevos lanzamientos</h2>
              </div>
              <div className='feed-trending-grid'>
                {sections.newReleases.map((item) => {
                  const badgeInfo = getReleaseBadge(item);
                  return (
                    <GlassCard
                      key={item.id}
                      item={item}
                      icon={<FaCompactDisc size={10} style={{ marginRight: 4, opacity: 0.7 }} />}
                      onPlay={handlePlay}
                      badge={badgeInfo.text}
                      badgeType={badgeInfo.type}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* 4.  TENDENCIAS */}
          {sections.trending.length > 0 && (
            <div className="feed-section">
              <div className="section-header">
                <FaBolt style={{ marginRight: '10px', color: '#e91e63' }} />
                <h2 className="feed-title">Tendencias para {displayName}</h2>
              </div>
              <div className='feed-trending-grid'>
                {sections.trending.map((item) => (
                  <GlassCard key={item.id} item={item} onPlay={handlePlay} />
                ))}
              </div>
            </div>
          )}

          {/* 5.  CONTENIDO PERSONALIZADO (Lazy) */}
          <div className="feed-section">
            <div className="section-header">
              <FaStar style={{ marginRight: '10px', color: '#ffd700' }} />
              <h2 className="feed-title">{personalizedTitle}</h2>
            </div>
            {sectionLoading.personalizedTracks ?  (
              <SectionLoader />
            ) : sections.personalizedTracks.length > 0 ? (
              <div className='feed-trending-grid'>
                {sections.personalizedTracks.map((item) => (
                  <GlassCard
                    key={item.id}
                    item={item}
                    onPlay={handlePlay}
                    icon={<FaHeadphones size={10} style={{ marginRight: 4, opacity: 0.7 }} />}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {/* 6. ARTISTAS DESTACADOS */}
          {sections. artistSpotlight.length > 0 && (
            <div className="feed-section">
              <div className="section-header">
                <FaMicrophoneAlt style={{ marginRight: '10px', color: '#00d4ff' }} />
                <h2 className="feed-title">Artistas del Momento</h2>
              </div>
              <div className='artist-grid'>
                {sections.artistSpotlight.map((item) => (
                  <ArtistCircle key={item.id} item={item} onPlay={handlePlay} />
                ))}
              </div>
            </div>
          )}

          {/* 7. PLAYLISTS POPULARES (Lazy) */}
          <div className="feed-section">
            <div className="section-header">
              <FaListAlt style={{ marginRight: '10px', color: '#76ff03' }} />
              <h2 className="feed-title">Playlists Populares</h2>
            </div>
            {sectionLoading.topPlaylists ? (
              <SectionLoader />
            ) : sections.topPlaylists.length > 0 ? (
              <div className='feed-trending-grid'>
                {sections.topPlaylists.map((item) => (
                  <GlassCard
                    key={item.id}
                    item={item}
                    icon={<FaHeart size={10} style={{ marginRight: 4 }} />}
                    onPlay={handlePlay}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {/* 8. MODO FIESTA (Lazy) */}
          <div className="feed-section">
            <div className="section-header">
              <FaFire style={{ marginRight: '10px', color: '#ff4500' }} />
              <h2 className="feed-title">Modo Fiesta 🎉</h2>
            </div>
            {sectionLoading.partyPlaylists ? (
              <SectionLoader />
            ) : sections. partyPlaylists.length > 0 ? (
              <div className='feed-trending-grid'>
                {sections.partyPlaylists.map((item) => (
                  <GlassCard
                    key={item.id}
                    item={item}
                    onPlay={handlePlay}
                    badge="PARTY"
                    badgeType="party"
                  />
                ))}
              </div>
            ) : null}
          </div>

        </div>
      </div>
    </div>
  );
}