// =============================================================================
// IMPORTS
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  chartGetTopTracks, chartGetTopPlaylists, artistGetTopTracks, getArtistAlbums,
  getRelatedArtists,
} from "../../services/unifiedService";
import { useUser } from "../../context/userContext";
import { usePlayerActions, usePlayer } from "../../context/playerContext";
import screenStateCache, { useScrollPersistence } from "../../services/screenStateCache";
import { buildRadioQueue } from "../../services/radioService";
import { PRODUCT_EVENTS, recordProductEvent } from "../../services/productMetrics";
import { getAlbumPath } from "../../services/albumNavigation";
import { getArtistPath } from "../../services/artistIdentity";
import { getPrefetchLimitForQuality, playbackPrefetchService, getPlaybackPrefetchKey } from "../../services/playbackPrefetchService";
import { getResolvedAudioQualityMode } from "../../services/audioQuality";
import { getArtworkImageProps, getBestArtworkUrl, resizeArtworkUrl } from "../../services/imageQuality";
import {
  buildDiscoveryTasteProfile,
  getDiscoveryArtistName,
  normalizeDiscoveryText,
  selectDiscoveryTracks,
} from "../../services/discoveryRecommendations";
import "./feed.css";
import Card from "../../components/shared/Card";

// =============================================================================
// CONSTANTS & CONFIG
// =============================================================================
const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60";
const FALLBACK_ARTISTS = ["Bad Bunny", "Taylor Swift", "The Weeknd", "Drake", "Dua Lipa", "Karol G", "Ed Sheeran", "Billie Eilish", "Post Malone", "Shakira"];
const FALLBACK_SESSION_SEED = `discover-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const EMPTY_DISCOVERY_LIST = Object.freeze([]);
const FEED_STARTUP_CACHE_KEY = 'paradox_feed_startup_tracks_v1';
const FEED_STARTUP_CACHE_TTL = 60 * 60 * 1000;
const createEmptyFeedSections = () => ({
  trending: [],
  newReleases: [],
  forYouTracks: [],
  partyPlaylists: [],
  topPlaylists: [],
  artistsYouLike: [],
  smartRecommendations: [],
  recommendedAlbums: [],
  moodMixes: [],
  flashback: [],
  artistSpotlight: [],
  global: [],
});

const readStartupTracks = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(FEED_STARTUP_CACHE_KEY) || 'null');
    if (!cached?.savedAt || Date.now() - cached.savedAt > FEED_STARTUP_CACHE_TTL) return [];
    return Array.isArray(cached.tracks) ? cached.tracks.slice(0, 12) : [];
  } catch {
    return [];
  }
};

const saveStartupTracks = (tracks) => {
  try {
    const safeTracks = (tracks || []).slice(0, 12).map((track) => ({
      id: track.id,
      type: 'track',
      name: track.name,
      artist: track.artist,
      album: track.album,
      image: track.image,
      duration: track.duration || 0,
    }));
    if (safeTracks.length) {
      localStorage.setItem(FEED_STARTUP_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), tracks: safeTracks }));
    }
  } catch { /* iOS puede bloquear localStorage en navegación privada. */ }
};

// Pre-compiled RegExp patterns for quality filtering
const BAD_TRACK_PATTERNS = ["cover", "karaoke", "instrumental", "tribute", "slowed", "reverb", "8d", "nightcore"]
  .map(word => new RegExp(`\\b${word}\\b`, "i"));

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Math & General Utils
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const normalizeText = (s) => (s || "").toString().trim();

// Array Utils
const uniqByKey = (items, keyFn) => {
  const seen = new Set(), out = [];
  for (const it of items || []) { if (!it) continue; const k = keyFn(it); if (!k || seen.has(k)) continue; seen.add(k); out.push(it); }
  return out;
};

const pickRandomSample = (arr, n, seedKey = "") => {
  const a = [...(arr || [])]; if (!a.length) return [];
  let seed = 0; for (let i = 0; i < seedKey.length; i++) seed = (seed * 31 + seedKey.charCodeAt(i)) >>> 0;
  for (let i = a.length - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = seed % (i + 1);[a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, clamp(n, 0, a.length));
};

// =============================================================================
// DATA NORMALIZATION
// =============================================================================

// Track naming utilities
const toArtistName = (a) => !a ? "" : typeof a === "string" ? a : a.name || a["#text"] || "";
const toTrackName = (t) => !t ? "" : normalizeText(t.name || t.title || "");
const makeTrackKey = (t) => `${toArtistName(t.artist).toLowerCase()}::${toTrackName(t).toLowerCase()}::${t.duration ? String(t.duration) : ""}`.trim();

// Quality filtering
const filterQualityTracks = (tracks) => {
  return (tracks || []).filter((t) => {
    const name = (t?.name || "").toLowerCase();
    return name && !BAD_TRACK_PATTERNS.some(pattern => pattern.test(name));
  });
};

// Normalize items to common format
const normalizeItem = (item, type = "track") => {
  if (!item) return null;
  const name = normalizeText(item.name || item.title || "Desconocido");
  const artist = normalizeText(item.creator || toArtistName(item.artist) || "Varios");

  let id = item.id;
  if (!id) {
    const base = type === "track" ? `${artist}::${name}::${item.duration ? String(Math.round(item.duration)) : ""}` :
      type === "playlist" ? `${type}::${name}::${artist}` :
        type === "album" ? `${artist}::${name}` : `${type}_${name}_${artist}`;
    id = `${type}_${base}`.replace(/[^\w:]/g, '_');
  }

  const rawImage = getBestArtworkUrl(item, DEFAULT_IMAGE);
  // 500 px mantiene nitidez en tarjetas Retina; srcset permite bajar a 250
  // cuando la tarjeta realmente es pequeña.
  const imageOptimized = resizeArtworkUrl(rawImage, 500);
  const imageXl = resizeArtworkUrl(rawImage, 1000);

  return {
    id,
    deezerId: type === 'album' ? (item.deezerId || (/^\d+$/.test(String(item.id || '')) ? item.id : null)) : undefined,
    type,
    name,
    artist,
    image: imageOptimized || DEFAULT_IMAGE, // Tarjetas Retina con selección adaptativa.
    image_xl: imageXl || DEFAULT_IMAGE,     // For Player (1000x1000)
    releaseDate: item.releaseDate || item.release_date || null,
    genre: item.genre || item.genre_id || null,
    rank: item.rank || 0,
    recordType: item.recordType,
    duration: item.duration || 0,
    album: item.album?.title || item.album || (type === "track" ? "Single" : ""),
    trackCount: item.trackCount || item.nb_tracks || item.tracks?.length || 0
  };
};

// =============================================================================
// PROFILE BUILDERS
// =============================================================================

// Apply sections rotation based on priority
const applySectionsRotation = ({ sections }) => {
  const reservedWhileLoading = new Set(['forYouTracks', 'smartRecommendations', 'newReleases', 'trending', 'recommendedAlbums']);
  const allSections = [
    { key: 'forYouTracks', title: 'Empieza por aquí', priority: 12 },
    { key: 'smartRecommendations', title: 'Descubrimientos para ti', priority: 11 },
    { key: 'recentlyPlayed', title: 'Vuelve a escuchar', priority: 10 },
    { key: 'newReleases', title: 'Novedades de tus artistas', priority: 9 },
    { key: 'trending', title: 'Popular ahora', priority: 7 },
    { key: 'topPlaylists', title: 'Playlists para continuar', priority: 5 },
    { key: 'recommendedAlbums', title: 'Álbumes para ti', priority: 4 },
    { key: 'artistSpotlight', title: 'Más de tus artistas', priority: 3 },
  ];
  return allSections.filter(s => {
    const content = sections[s.key];
    return reservedWhileLoading.has(s.key) || (content && (Array.isArray(content) ? content.length > 0 : true));
  }).sort((a, b) => b.priority - a.priority);
};

// =============================================================================
// ROW & CARD COMPONENTS
// =============================================================================

// Generic Row Component
const Row = memo(({ title, subtitle, items, onItemClick, variant = 'default', sectionKey = '', isLoading, playbackPrefetch, emptyMessage }) => {
  const rowRef = useRef(null);
  const displayItems = useMemo(() => uniqByKey(items || [], (item) => item.id), [items]);
  const move = (direction) => rowRef.current?.scrollBy({ left: direction * rowRef.current.clientWidth * 0.8, behavior: 'smooth' });
  if (!isLoading && !displayItems.length && !emptyMessage) return null;
  const cardVariant = variant === 'circle' ? 'circle' : variant === 'list' || variant === 'recommended' ? 'horizontal' : 'vertical';
  return (
    <section className={`feed-section feed-section-${sectionKey}`} id={`feed-${sectionKey}`} aria-label={title} aria-busy={!!isLoading}>
      <div className="feed-section-heading">
        <div className="feed-section-header">
          <h2 className="feed-section-title">{title}</h2>
          {subtitle && <p className="feed-section-subtitle">{subtitle}</p>}
        </div>
        {displayItems.length > 3 && <div className="feed-row-controls">
          <button type="button" onClick={() => move(-1)} aria-label={`Anterior en ${title}`}><span aria-hidden="true">‹</span></button>
          <button type="button" onClick={() => move(1)} aria-label={`Siguiente en ${title}`}><span aria-hidden="true">›</span></button>
        </div>}
      </div>
      {isLoading && !displayItems.length ? <div className="feed-row feed-row-skeleton" role="status" aria-label={`Preparando ${title}`}>
        {[0, 1, 2, 3, 4].map(index => <div className="feed-content-skeleton" key={index} aria-hidden="true"><div className="feed-content-skeleton-image" /><div className="feed-content-skeleton-line" /><div className="feed-content-skeleton-line short" /></div>)}
      </div> : !displayItems.length ? <p className="feed-empty" role="status">{emptyMessage}</p> :
        <div className={variant === 'recommended' ? 'feed-recommended-grid' : 'feed-row'} ref={rowRef}>
          {displayItems.map(item => <div className={`feed-item ${variant === 'recommended' ? 'feed-item-discovery' : ''}`} key={item.id}>
            <Card item={item} onClick={onItemClick} variant={cardVariant} className={`feed-card-${sectionKey}`} {...playbackPrefetch} />
            {sectionKey === 'newReleases' && item.releaseDate && <span className="feed-release-date">{new Date(`${String(item.releaseDate).slice(0, 10)}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          </div>)}
        </div>}
    </section>
  );
});

// HeroCard - Single large card
const HeroCard = memo(({ item, onPlay, playbackPrefetch }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    if (item.type === 'album') {
      navigate(getAlbumPath(item));
    } else if (item.type === 'playlist') {
      navigate(`/playlist/${item.id}`, { state: { playlist: item } });
    } else if (item.type === 'artist') {
      navigate(getArtistPath(item));
    } else {
      onPlay(item);
    }
  }, [item, navigate, onPlay]);

  if (!item) return null;

  const typeLabel = item.type === 'album' ? 'Álbum' : item.type === 'playlist' ? 'Playlist' : item.type === 'artist' ? 'Artista' : null;

  const heroImageProps = getArtworkImageProps(item, {
    fallback: DEFAULT_IMAGE,
    size: 1000,
    sizes: '(max-width: 600px) 88vw, 640px',
  });

  return (
    <button
      type="button"
      className="feed-hero-card"
      onClick={handleClick}
      onPointerEnter={() => playbackPrefetch?.onPrefetchIntent?.(item, { reason: 'pointer' })}
      onPointerDown={() => playbackPrefetch?.onPlaybackPointerDown?.(item)}
      title={`${item.type === 'track' ? 'Reproducir' : 'Ver'} ${item.name} - ${item.artist}`}
    >
      <div className="feed-hero-img-wrapper">
        {!imageLoaded && !imageFailed && <div className="feed-hero-img-skeleton" />}
        {imageFailed && <div className="feed-hero-img-fallback"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg></div>}
        <img
          className={['feed-hero-img', imageLoaded && 'is-loaded'].filter(Boolean).join(' ')}
          {...heroImageProps}
          alt={item.name}
          onLoad={() => { setImageLoaded(true); setImageFailed(false); }}
          onError={() => { setImageLoaded(true); setImageFailed(true); }}
          loading="eager"
          fetchPriority="high"
        />
        {item.type === 'track' && (
          <span className="feed-hero-play-hint" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </span>
        )}
      </div>
      <div className="feed-hero-info">
        <div className="feed-hero-track">{item.name}</div>
        <div className="feed-hero-artist">{item.artist || item.creator || 'Playlist'}</div>
        {typeLabel && <div className="feed-hero-type">{typeLabel}</div>}
      </div>
    </button>
  );
});

// HeroRow - Horizontal scrollable row of hero cards
const HeroRow = memo(({ items, onItemClick, isLoading, onActiveItemChange, playbackPrefetch }) => {
  const rowRef = useRef(null);

  // Handle scroll to detect active item
  const handleScroll = useCallback(() => {
    if (!rowRef.current || !items?.length) return;

    const container = rowRef.current;

    // Dynamically calculate measurements to be precise regardless of CSS changes
    let totalWidth = 201; // Default fallback (185 + 16)

    if (container.children.length >= 1) {
      const firstCard = container.children[0];
      const cardWidth = firstCard.offsetWidth;

      // Try to measure gap from second card if available
      if (container.children.length >= 2) {
        const secondCard = container.children[1];
        totalWidth = secondCard.offsetLeft - firstCard.offsetLeft;
      } else {
        // Fallback: Assume 16px gap if we only have one card (though logic doesn't matter for 1 card)
        totalWidth = cardWidth + 16;
      }
    }

    // Calculate index based on scroll position
    // We add a tiny offset (totalWidth * 0.1) to snap slightly earlier/later if needed, 
    // but Math.round is usually the best for "closest center".
    const index = Math.round(container.scrollLeft / totalWidth);

    // Clamp index to bounds
    const safeIndex = Math.max(0, Math.min(index, items.length - 1));

    if (onActiveItemChange) {
      onActiveItemChange(items[safeIndex]);
    }
  }, [items, onActiveItemChange]);

  // Initial call to set first item
  useEffect(() => {
    if (items?.length > 0 && onActiveItemChange) {
      onActiveItemChange(items[0]);
    }
  }, [items, onActiveItemChange]);

  if (isLoading) {
    return (
      <div className="feed-hero-row">
        {[1, 2, 3].map(i => (
          <div key={i} className="feed-hero-card feed-hero-card-skeleton">
            <div className="feed-hero-img-wrapper"><div className="feed-hero-img-skeleton" /></div>
            <div className="feed-hero-info">
              <div className="feed-hero-skeleton-title" />
              <div className="feed-hero-skeleton-artist" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!items?.length) return null;

  return (
    <div
      className="feed-hero-row"
      ref={rowRef}
      onScroll={handleScroll}
    >
      {items.map((item, index) => (
        <HeroCard key={item.id || `hero-${index}-${item.name}`} item={item} onPlay={onItemClick} playbackPrefetch={playbackPrefetch} />
      ))}
    </div>
  );
});

// Helper: Build recently played from history
const buildRecentlyPlayed = (history) => {
  if (!history?.length) return [];
  const seen = new Set(), recent = [];
  for (const h of history) {
    if (!h.name || !h.artist) continue;
    const key = `${toArtistName(h.artist).toLowerCase()}-${h.name.toLowerCase()}`;
    if (seen.has(key)) continue; seen.add(key);
    recent.push({ id: `recent-${key}-${h.timestamp}`, type: 'track', name: h.name, artist: h.artist, image: h.image || DEFAULT_IMAGE, duration: h.duration || 0, playedAt: h.timestamp });
    if (recent.length >= 12) break;
  }
  return recent;
};

// Main Feed Component
export default function Feed() {
  const { user: feedUser } = useUser();
  return <FeedContent key={feedUser?.uid || 'guest'} />;
}

function FeedContent() {
  const navigate = useNavigate();
  const { playTrack, appendToQueue, primeResolvedTrack } = usePlayerActions();
  const playerState = usePlayer();
  const { user, favorites, playlists, savedArtists, savedAlbums, loading: userLoading } = useUser();
  const feedCacheKey = `feed:${user?.uid || 'guest'}`;
  const artistRadioRequestRef = useRef(0);
  const discoveryPrefetchKeysRef = useRef(new Set());
  const startupTracksRef = useRef(readStartupTracks());

  const handleDiscoveryPrefetch = useCallback((item, { signal, reason = 'visible' } = {}) => {
    if (!item || ['album', 'playlist', 'artist'].includes(item.type)) return Promise.resolve(null);
    const qualityMode = getResolvedAudioQualityMode();
    const visibilityLimit = getPrefetchLimitForQuality(qualityMode, 'discovery');
    if (reason === 'visible' && visibilityLimit === 0) return Promise.resolve(null);
    const key = getPlaybackPrefetchKey(item, qualityMode);
    if (reason === 'visible' && !discoveryPrefetchKeysRef.current.has(key)) {
      if (discoveryPrefetchKeysRef.current.size >= visibilityLimit) return Promise.resolve(null);
      discoveryPrefetchKeysRef.current.add(key);
    }
    return playbackPrefetchService.prefetch(item, {
      qualityMode,
      priority: 'low',
      signal,
    });
  }, []);

  const playbackPrefetch = useMemo(() => ({
    onPrefetchIntent: handleDiscoveryPrefetch,
    onPlaybackPointerDown: primeResolvedTrack,
    prefetchOnVisible: true,
  }), [handleDiscoveryPrefetch, primeResolvedTrack]);

  const discoveryInputs = useMemo(() => ({
    favorites: favorites || EMPTY_DISCOVERY_LIST,
    playlists: playlists || EMPTY_DISCOVERY_LIST,
    savedArtists: savedArtists || EMPTY_DISCOVERY_LIST,
    savedAlbums: savedAlbums || EMPTY_DISCOVERY_LIST,
    listeningHistory: playerState.listeningHistory || EMPTY_DISCOVERY_LIST,
    engagement: playerState.tasteEngagement || {},
  }), [favorites, playlists, savedArtists, savedAlbums, playerState.listeningHistory, playerState.tasteEngagement]);
  const sessionFavorites = discoveryInputs.favorites;
  const sessionSavedArtists = discoveryInputs.savedArtists;
  const sessionSavedAlbums = discoveryInputs.savedAlbums;
  const listeningHistorySnapshotRef = useRef([]);
  listeningHistorySnapshotRef.current = discoveryInputs.listeningHistory;
  const recentlyPlayed = useMemo(() => buildRecentlyPlayed(discoveryInputs.listeningHistory), [discoveryInputs.listeningHistory]);

  const feedContainerRef = useRef(null);
  useScrollPersistence(feedCacheKey, feedContainerRef);
  const wasRestoredFromMemoryRef = useRef(Boolean(screenStateCache.get(feedCacheKey, 'generationStarted')));
  const [error, setError] = useState(null);
  const [hero, setHeroInternal] = useState(() => screenStateCache.get(feedCacheKey, 'hero') || null);
  const heroRef = useRef(hero);
  const setHero = useCallback((update) => {
    const value = typeof update === 'function' ? update(heroRef.current) : update;
    heroRef.current = value;
    screenStateCache.set(feedCacheKey, 'hero', value);
    setHeroInternal(value);
  }, [feedCacheKey]);

  const [sections, setSectionsInternal] = useState(() => {
    const cachedSections = screenStateCache.get(feedCacheKey, 'sections') || {};
    return {
      ...createEmptyFeedSections(),
      ...cachedSections,
      trending: cachedSections.trending?.length ? cachedSections.trending : startupTracksRef.current,
      recentlyPlayed,
    };
  });
  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  const setSections = useCallback((update) => {
    const value = typeof update === 'function' ? update(sectionsRef.current) : update;
    sectionsRef.current = value;
    screenStateCache.set(feedCacheKey, 'sections', value);
    setSectionsInternal(value);
  }, [feedCacheKey]);

  useEffect(() => screenStateCache.subscribe(feedCacheKey, (snapshot, changedKey) => {
    if (changedKey === 'sections' && snapshot.sections !== sectionsRef.current) {
      sectionsRef.current = snapshot.sections;
      setSectionsInternal(snapshot.sections);
    }
    if (changedKey === 'hero' && snapshot.hero !== heroRef.current) {
      heroRef.current = snapshot.hero;
      setHeroInternal(snapshot.hero);
    }
  }), [feedCacheKey]);

  useEffect(() => {
    // Retirar datos que pudieron quedar guardados por el antiguo generador automático.
    try {
      const migrationKey = 'paradox_removed_automatic_mixes_v1';
      if (localStorage.getItem(migrationKey) !== 'true') {
        Object.keys(localStorage)
          .filter((key) => key.startsWith('feed_gen_cache_') || key.startsWith('feed_v4:'))
          .forEach((key) => localStorage.removeItem(key));
        localStorage.setItem(migrationKey, 'true');
      }
    } catch { /* El almacenamiento puede estar bloqueado en modo privado. */ }

    setSections((previous) => {
      const { forYouPlaylists: _removedAutomaticPlaylists, ...clean } = previous || {};
      return {
        ...clean,
        moodMixes: (clean.moodMixes || []).filter((item) => !String(item?.id || '').startsWith('feed-')),
      };
    });
  }, [setSections]);

  const [loading, setLoading] = useState(() => wasRestoredFromMemoryRef.current ? { critical: false, newReleases: false, forYou: false, playlists: false, party: false, recommendations: false, albums: false, mood: false, flashback: false, global: false, spotlight: false } : { critical: true, newReleases: true, forYou: true, playlists: true, party: true, recommendations: true, albums: true, mood: true, flashback: true, global: true, spotlight: true });
  const [todayText, setTodayText] = useState("");
  const [sessionSeed] = useState(() => {
    const cached = screenStateCache.get(feedCacheKey, 'sessionSeed');
    if (cached) return cached;
    screenStateCache.set(feedCacheKey, 'sessionSeed', FALLBACK_SESSION_SEED);
    return FALLBACK_SESSION_SEED;
  });

  // Toast Notification State (enhanced with image)
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const abortRef = useRef({});
  const reqIdRef = useRef(0);
  const startupCatalogPromiseRef = useRef(null);
  const startupCatalogFetchedAtRef = useRef(0);
  const showToast = useCallback((msg, image = null, loading = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, image, loading });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, loading ? 6000 : 3000);
  }, []);

  useEffect(() => () => {
    artistRadioRequestRef.current += 1;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  // useMemo en lugar de useEffect+useState para evitar loops infinitos
  const rotatedSections = useMemo(() => {
    const cached = screenStateCache.get(feedCacheKey, 'rotatedSections');
    const result = applySectionsRotation({ sections });
    if (result.length > 0) screenStateCache.set(feedCacheKey, 'rotatedSections', result);
    return result.length > 0 ? result : (cached || []);
  }, [sections, feedCacheKey]);

  const cancelKey = useCallback((key) => { const c = abortRef.current[key]; if (c) { try { c.abort(); } catch { } delete abortRef.current[key]; } }, []);
  const makeController = useCallback((key) => { cancelKey(key); const c = new AbortController(); abortRef.current[key] = c; return c; }, [cancelKey]);

  // Esta consulta empieza al montar la pantalla, sin esperar autenticación ni
  // Firestore. Se comparte con el resto del cargador para no duplicar tráfico.
  const loadStartupCatalog = useCallback(() => {
    if (startupCatalogPromiseRef.current && Date.now() - startupCatalogFetchedAtRef.current < 5 * 60 * 1000) return startupCatalogPromiseRef.current;
    startupCatalogFetchedAtRef.current = Date.now();
    startupCatalogPromiseRef.current = chartGetTopTracks({ limit: 100 }).then((charts) => {
      const tracks = filterQualityTracks(
        uniqByKey((charts?.tracks?.track || []).map((track) => normalizeItem(track, 'track')), makeTrackKey),
      ).filter((track) => track.image && track.image !== DEFAULT_IMAGE).slice(0, 100);
      if (!tracks.length) {
        startupCatalogPromiseRef.current = null;
        startupCatalogFetchedAtRef.current = 0;
      }
      if (tracks.length) {
        startupTracksRef.current = tracks;
        saveStartupTracks(tracks);
        // Publishing personalized chart order belongs to the current generation.
        if (!heroRef.current) setHero({ ...tracks[0], heroSource: 'trending' });
      }
      return tracks;
    }).catch((error) => {
      startupCatalogPromiseRef.current = null;
      startupCatalogFetchedAtRef.current = 0;
      throw error;
    });
    return startupCatalogPromiseRef.current;
  }, [setHero]);

  useEffect(() => {
    loadStartupCatalog().catch(() => {
      // La portada guardada o el historial siguen disponibles sin conexión.
    });
  }, [loadStartupCatalog]);

  const tasteProfile = useMemo(() => {
    const profile = buildDiscoveryTasteProfile({
      favorites: discoveryInputs?.favorites,
      playlists: discoveryInputs?.playlists,
      savedArtists: discoveryInputs?.savedArtists,
      savedAlbums: discoveryInputs?.savedAlbums,
      listeningHistory: discoveryInputs?.listeningHistory,
      engagement: discoveryInputs?.engagement,
      userId: user?.uid || 'guest',
      sessionSeed,
    });
    return {
      ...profile,
      topArtists: profile.seeds.slice(0, 8).map((seed) => seed.name),
      sampleSize: profile.knownTrackKeys.size,
    };
  }, [discoveryInputs, user?.uid, sessionSeed]);

  const timeOfDay = useMemo(() => { const h = new Date().getHours(); return h < 6 ? 'dawn' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'night'; }, []);

  useEffect(() => { setTodayText(new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })); }, []);

  // Primer contenido: únicamente canciones que ya existen en el dispositivo.
  // Esto permite tocar Play antes de que termine cualquier consulta de red.
  const instantPlayTracks = useMemo(() => {
    const favoriteTracks = [...sessionFavorites]
      .reverse()
      .map((item) => normalizeItem(item, 'track'));
    return pickRandomSample(
      filterQualityTracks(uniqByKey([...recentlyPlayed, ...favoriteTracks, ...startupTracksRef.current], makeTrackKey))
        .filter((item) => item?.name && item?.artist && item?.image && item.image !== DEFAULT_IMAGE),
      12,
      `instant-home-${sessionSeed}`,
    );
  }, [recentlyPlayed, sessionFavorites, sessionSeed]);

  const [heroMix, setHeroMixInternal] = useState(() => {
    const cachedHero = screenStateCache.get(feedCacheKey, 'heroMix');
    if (cachedHero?.length) return cachedHero;
    return uniqByKey([...recentlyPlayed, ...startupTracksRef.current], makeTrackKey)
      .filter((item) => item?.name && item?.artist && item?.image && item.image !== DEFAULT_IMAGE)
      .slice(0, 8);
  });
  const heroMixRef = useRef(heroMix);
  const lockHeroMix = useCallback((items) => {
    if (heroMixRef.current.length || !items?.length) return;
    const stableItems = items.slice(0, 8);
    heroMixRef.current = stableItems;
    screenStateCache.set(feedCacheKey, 'heroMix', stableItems);
    setHeroMixInternal(stableItems);
  }, [feedCacheKey]);

  useEffect(() => {
    if (!instantPlayTracks.length) return;
    lockHeroMix(instantPlayTracks);
    setSections((previous) => ({
      ...previous,
      recentlyPlayed,
      forYouTracks: previous.forYouTracks?.length ? previous.forYouTracks : instantPlayTracks,
    }));
    if (!heroRef.current) setHero({ ...instantPlayTracks[0], heroSource: 'instant' });
  }, [instantPlayTracks, lockHeroMix, recentlyPlayed, setHero, setSections]);

  // Si la persona todavía no tiene historial ni favoritos, el primer lote de
  // catálogo se fija como portada. No cambia de nuevo hasta reabrir la app.
  useEffect(() => {
    if (heroMixRef.current.length) return;
    const networkFallback = [
      ...(sections.smartRecommendations || []),
      ...(sections.trending || []),
      ...(sections.newReleases || []).filter((item) => item.type === 'track'),
    ].filter((item) => item?.image && item.image !== DEFAULT_IMAGE);
    lockHeroMix(networkFallback);
  }, [lockHeroMix, sections.newReleases, sections.smartRecommendations, sections.trending]);

  // =========================================================================
  // 🎵 RADIO INSTANTÁNEA: Genera cola de canciones similares automáticamente
  // =========================================================================
  const buildInstantRadio = useCallback((seedTrack, contextTracks = []) => (
    buildRadioQueue({
      seedTrack,
      contextTracks,
      targetSize: 24,
    })
  ), []);

  const handlePlay = useCallback(async (item, contextQueue = null) => {
    // Cualquier reproducción manual invalida una radio de artista aún en preparación.
    artistRadioRequestRef.current += 1;

    console.log('[handlePlay] Called with:', {
      itemName: item?.name,
      itemArtist: item?.artist,
      itemType: item?.type,
      hasContextQueue: !!contextQueue,
      contextQueueLength: contextQueue?.length
    });

    if (!item) return;
    if (item.type === "playlist") { navigate(`/playlist/${item.id}`, { state: { playlist: item } }); return; }
    if (item.type === "artist") { navigate(getArtistPath(item, item.artist)); return; }
    if (item.type === "album") { navigate(getAlbumPath(item)); return; }

    // Si ya viene con una cola, usarla directamente
    if (contextQueue?.length > 1) {
      console.log('[handlePlay] Using provided contextQueue, skipping radio');
      playTrack(item, contextQueue, { id: 'feed-selection', type: 'collection', autoExtend: false });
      return;
    }

    // =========================================================================
    // 🚀 OPTIMIZACIÓN: Reproducir INMEDIATAMENTE, radio en segundo plano
    // =========================================================================
    console.log('[handlePlay] 🚀 Playing track IMMEDIATELY, radio will build in background...');

    // 1️⃣ REPRODUCIR INMEDIATAMENTE (sin esperar la radio)
    // ⭐ USA LA IMAGEN XL PARA EL REPRODUCTOR
    const trackToPlay = { ...item, image: item.image_xl || item.image };
    const queueSessionId = playTrack(trackToPlay, [trackToPlay], {
      id: `radio-${makeTrackKey(trackToPlay)}`,
      type: 'radio',
      name: `Radio de ${trackToPlay.artist || trackToPlay.name}`,
      autoExtend: true,
      seedTrack: trackToPlay,
    });
    console.log('[handlePlay] ✅ Track playing NOW!');

    // 2️⃣ GENERAR RADIO EN SEGUNDO PLANO (1 segundo después)
    setTimeout(async () => {
      console.log('[handlePlay] 🎵 Building radio in background...');

      try {
        const radioQueue = await buildInstantRadio(item);

        // Filtrar: excluir la canción actual (ya está reproduciéndose)
        const tracksToAdd = radioQueue.filter(t =>
          t && makeTrackKey(t) !== makeTrackKey(item)
        );

        if (tracksToAdd.length > 0) {
          recordProductEvent(PRODUCT_EVENTS.RADIO_STARTED);
          console.log(`[handlePlay] 🎵 Adding ${tracksToAdd.length} tracks to queue automatically`);

          // Agregar cada track a la cola, asegurando imagen XL
          appendToQueue(
            tracksToAdd.map(track => ({ ...track, image: track.image_xl || track.image })),
            { sessionId: queueSessionId, silent: true, maxSize: 200 },
          );

          console.log(`[handlePlay] ✅ Radio complete! ${tracksToAdd.length} tracks added to queue`);
        } else {
          console.log('[handlePlay] No additional tracks to add from radio');
        }
      } catch (err) {
        console.warn('[handlePlay] Background radio generation failed:', err?.message);
      }
    }, 1000); // Esperar 1 segundo después de que la canción comience

  }, [navigate, playTrack, appendToQueue, buildInstantRadio]);

  // =========================================================================
  // 🎵 ARTIST RADIO: Genera radio prácticamente infinita basada en un artista
  // =========================================================================
  const handleArtistRadioClick = useCallback(async (artist) => {
    if (!artist?.name) return;

    const requestId = ++artistRadioRequestRef.current;
    showToast(`Buscando música de ${artist.name}...`, artist.image, true);
    const seedResponse = await artistGetTopTracks({ artist: artist.name, limit: 1 }).catch(() => null);
    if (requestId !== artistRadioRequestRef.current) return;

    const seedTrack = seedResponse?.toptracks?.track?.[0];

    if (!seedTrack) {
      showToast('No encontramos canciones disponibles para esta estación.', artist.image);
      return;
    }

    // La canción semilla empieza primero; ampliar la radio nunca bloquea la reproducción.
    const trackToPlay = normalizeItem(seedTrack, 'track') || seedTrack;
    recordProductEvent(PRODUCT_EVENTS.RADIO_STARTED);
    const queueSessionId = playTrack(trackToPlay, [trackToPlay], {
      id: `radio-${makeTrackKey(trackToPlay)}`,
      type: 'radio',
      name: `Radio de ${trackToPlay.artist || trackToPlay.name}`,
      autoExtend: true,
      seedTrack: trackToPlay,
    });
    showToast(`Reproduciendo ${artist.name}. Completando la radio...`, artist.image, true);

    try {
      const additionalTracks = await buildRadioQueue({
        seedTrack: trackToPlay,
        // Una radio de artista no debe contaminarse con recomendaciones
        // generales del inicio, que pueden pertenecer a otros artistas.
        contextTracks: [],
        existingQueue: [trackToPlay],
        targetSize: 31,
        includeSeed: false,
      });

      if (requestId !== artistRadioRequestRef.current) return;

      appendToQueue(
        additionalTracks.map(track => ({ ...track, image: track.image_xl || track.image })),
        { sessionId: queueSessionId, silent: true, maxSize: 200 },
      );

      showToast(
        additionalTracks.length > 0
          ? `Radio de ${artist.name} lista: ${additionalTracks.length + 1} canciones.`
          : `Radio de ${artist.name} iniciada con la música disponible.`,
        artist.image,
      );
    } catch (error) {
      console.warn('[ArtistRadio] No se pudo ampliar la cola:', error?.message);
      if (requestId === artistRadioRequestRef.current) {
        showToast(`Radio de ${artist.name} iniciada. No pudimos ampliar la cola.`, artist.image);
      }
    }
  }, [playTrack, appendToQueue, showToast]);

  // =========================================================================
  // LOADERS
  // =========================================================================

  const loadCritical = useCallback(async (requestId) => {
    const controller = makeController('critical');
    setLoading(p => ({ ...p, critical: true, newReleases: true }));
    setError(null);
    const current = () => !controller.signal.aborted && reqIdRef.current === requestId;
    const artists = [...new Set([...tasteProfile.topArtists, ...sessionSavedArtists.map(getDiscoveryArtistName)])].filter(Boolean).slice(0, 12);
    await Promise.allSettled([
      (async () => {
        try {
          const [charts, relatedGroups] = await Promise.all([
            loadStartupCatalog(),
            Promise.all(artists.slice(0, 6).map(name => getRelatedArtists(name, 8).catch(() => []))),
          ]);
          const affinity = new Set([...artists, ...relatedGroups.flat().map(getDiscoveryArtistName)].map(normalizeDiscoveryText));
          if (!charts.length && current()) setError('No pudimos obtener el catálogo actual. Intenta actualizar de nuevo.');
          const ranked = charts.map((track, rank) => ({ track, rank, score: (affinity.has(normalizeDiscoveryText(track.artist)) ? 70 : 0) + 100 - rank }));
          const aligned = ranked.filter(item => affinity.has(normalizeDiscoveryText(item.track.artist))).sort((a, b) => b.score - a.score);
          const exploration = ranked.filter(item => !affinity.has(normalizeDiscoveryText(item.track.artist)));
          const pool = [];
          while (aligned.length || exploration.length) {
            pool.push(...aligned.splice(0, 2), ...exploration.splice(0, 1));
          }
          const counts = new Map();
          const trending = pool.filter(({ track }) => { const key = normalizeDiscoveryText(track.artist); const count = counts.get(key) || 0; counts.set(key, count + 1); return count < 2; }).slice(0, 15).map(item => item.track);
          if (current()) setSections(previous => ({ ...previous, trending }));
        } catch { if (current()) setError('No pudimos actualizar las tendencias. Intenta actualizar de nuevo.'); }
        finally { if (current()) setLoading(p => ({ ...p, critical: false })); }
      })(),
      (async () => {
        try {
          const groups = await Promise.all(artists.map(name => getArtistAlbums(name, 30).catch(() => [])));
          const now = Date.now();
          const recent = groups.flat().filter(album => {
            const raw = album.releaseDate || album.release_date;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(raw || '')) return false;
            const date = Date.parse(`${raw}T00:00:00Z`);
            return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === raw && date <= now && now - date <= 60 * 86400000;
          }).sort((a, b) => Date.parse(b.releaseDate || b.release_date) - Date.parse(a.releaseDate || a.release_date));
          const counts = new Map();
          const releases = uniqByKey(recent, album => `${normalizeDiscoveryText(toArtistName(album.artist))}::${normalizeDiscoveryText(album.name)}`).filter(album => {
            const key = normalizeDiscoveryText(toArtistName(album.artist)); const count = counts.get(key) || 0; counts.set(key, count + 1); return count < 2;
          }).slice(0, 18).map(album => normalizeItem(album, 'album'));
          if (current()) setSections(previous => ({ ...previous, newReleases: releases }));
        } finally { if (current()) setLoading(p => ({ ...p, newReleases: false })); }
      })(),
    ]);
  }, [loadStartupCatalog, makeController, setSections, sessionSavedArtists, tasteProfile.topArtists]);

  const loadForYou = useCallback(async (requestId) => {
    const controller = makeController('forYou');
    setLoading(p => ({ ...p, forYou: true }));
    try {
      const artists = tasteProfile.topArtists.slice(0, 6);
      const groups = await Promise.all(artists.map(artist => artistGetTopTracks({ artist, limit: 8 }).catch(() => null)));
      const tracks = filterQualityTracks(groups.flatMap(group => (group?.toptracks?.track || []).map(track => normalizeItem(track, 'track'))));
      const counts = new Map();
      const selected = uniqByKey([...recentlyPlayed.slice(0, 3), ...tracks], makeTrackKey).filter(track => {
        const key = normalizeDiscoveryText(track.artist); const count = counts.get(key) || 0; counts.set(key, count + 1); return count < 2;
      }).slice(0, 12);
      if (!controller.signal.aborted && reqIdRef.current === requestId) setSections(previous => ({ ...previous, forYouTracks: selected.length ? selected : startupTracksRef.current.slice(0, 12) }));
    } finally { if (!controller.signal.aborted && reqIdRef.current === requestId) setLoading(p => ({ ...p, forYou: false })); }
  }, [makeController, tasteProfile.topArtists, recentlyPlayed, setSections]);

  // Load Playlists
  const loadPlaylistsLazy = useCallback(async (requestId) => {
    const controller = makeController("playlists"); setLoading((p) => ({ ...p, playlists: true }));
    try {
      const r = await chartGetTopPlaylists({ limit: 12 });
      const top = uniqByKey((r?.playlists?.playlist || []).map((p) => normalizeItem(p, "playlist")), (p) => `${p.id}`).filter((p) => p.image && p.image !== DEFAULT_IMAGE).slice(0, 10);
      if (!controller.signal.aborted && reqIdRef.current === requestId) { setSections((prev) => ({ ...prev, topPlaylists: top })); setLoading((p) => ({ ...p, playlists: false })); }
    } catch { if (!controller.signal.aborted) setLoading((p) => ({ ...p, playlists: false })); }
  }, [makeController, setSections]);

  // Load Smart Recommendations
  const loadSmartRecommendations = useCallback(async (requestId) => {
    const controller = makeController("recommendations");
    setLoading((p) => ({ ...p, recommendations: true }));
    try {
      const personalizedSeeds = tasteProfile.seeds.slice(0, 8);
      const fallbackSeeds = pickRandomSample(
        FALLBACK_ARTISTS,
        Math.max(0, 3 - personalizedSeeds.length),
        `${sessionSeed}:fallback`,
      ).map((name, index) => ({ name, score: Math.max(1, 4 - index) }));
      const seeds = [...personalizedSeeds, ...fallbackSeeds].slice(0, 8);

      // Cada semilla usa identidad exacta. Sus artistas relacionados aportan
      // descubrimiento real; sus propios temas solo completan una porción menor.
      const seedGroups = await Promise.all(seeds.map(async (seed) => {
        const [related, ownTracks] = await Promise.all([
          getRelatedArtists(seed.name, 8).catch(() => []),
          artistGetTopTracks({ artist: seed.name, limit: 6 }).catch(() => null),
        ]);
        return {
          seed,
          related: (related || []).slice(0, 8),
          familiar: (ownTracks?.toptracks?.track || []).map((track) => ({
            track: normalizeItem(track, 'track'),
            source: 'familiar',
            affinity: seed.score,
          })),
        };
      }));

      const relatedArtistMap = new Map();
      seedGroups.forEach(({ seed, related }) => related.forEach((artist, rank) => {
        const name = getDiscoveryArtistName(artist);
        const key = normalizeDiscoveryText(name);
        if (!key || relatedArtistMap.has(key)) return;
        relatedArtistMap.set(key, { name, affinity: seed.score, rank, seedArtist: seed.name });
      }));

      const relatedArtists = pickRandomSample(
        [...relatedArtistMap.values()],
        16,
        `${sessionSeed}:related-artists`,
      );
      const relatedGroups = await Promise.all(relatedArtists.map(async (artist) => {
        const response = await artistGetTopTracks({ artist: artist.name, limit: 5 }).catch(() => null);
        return (response?.toptracks?.track || []).map((track, rank) => ({
          track: normalizeItem(track, 'track'),
          source: 'related',
          seedArtist: artist.seedArtist,
          affinity: artist.affinity,
          rank: artist.rank + rank,
        }));
      }));

      const chartCandidates = (await loadStartupCatalog().catch(() => [])).map((track, rank) => ({
        track: normalizeItem(track, 'track'),
        source: 'chart',
        affinity: 0,
        rank,
      }));

      if (controller.signal.aborted || reqIdRef.current !== requestId) return;

      const alreadyVisibleTrackKeys = new Set([
        ...(sectionsRef.current.trending || []),
        ...(sectionsRef.current.newReleases || []).filter((item) => item.type === 'track'),
      ].map(makeTrackKey).filter(Boolean));
      const candidates = [
        ...relatedGroups.flat(),
        ...seedGroups.flatMap((group) => group.familiar),
        ...chartCandidates,
      ].filter((candidate) => (
        candidate.track?.image &&
        candidate.track.image !== DEFAULT_IMAGE &&
        !alreadyVisibleTrackKeys.has(makeTrackKey(candidate.track))
      ));
      const rankedRecommendations = selectDiscoveryTracks({
        candidates,
        profile: tasteProfile,
        sessionSeed,
        limit: 24,
      });
      // Playback resolution happens on card intent; it must never gate discovery.
      const recommendations = rankedRecommendations.slice(0, 18);
      const discoveredArtists = new Set(recommendations
        .map((track) => getDiscoveryArtistName(track.artist))
        .filter((artist) => artist && !tasteProfile.knownArtists.has(normalizeDiscoveryText(artist))));

      setSections((prev) => ({
        ...prev,
        smartRecommendations: recommendations,
        recommendationMeta: {
          seedNames: seeds.slice(0, 3).map((seed) => seed.name),
          newArtistCount: discoveredArtists.size,
        },
      }));
      if (recommendations.length) {
        const refreshedHero = recommendations.slice(0, 8);
        heroMixRef.current = refreshedHero;
        screenStateCache.set(feedCacheKey, 'heroMix', refreshedHero);
        setHeroMixInternal(refreshedHero);
      }
      setLoading((p) => ({ ...p, recommendations: false }));
    } catch (error) {
      console.warn('[Discover] No se pudieron completar las recomendaciones:', error?.message);
      if (!controller.signal.aborted) setLoading((p) => ({ ...p, recommendations: false }));
    }
  }, [makeController, sessionSeed, setSections, tasteProfile, loadStartupCatalog, feedCacheKey]);

  // Load Recommended Albums
  const loadRecommendedAlbums = useCallback(async (requestId) => {
    const controller = makeController("albums"); setLoading((p) => ({ ...p, albums: true }));
    try {
      const savedAlbumKeys = new Set(sessionSavedAlbums.map(a => `${getDiscoveryArtistName(a.artist).toLowerCase()}::${(a.name || a.title || '').toLowerCase()}`));
      const coreArtists = tasteProfile.topArtists.slice(0, 7);
      const relatedGroups = await Promise.all(coreArtists.slice(0, 3).map(name => getRelatedArtists(name, 3).catch(() => [])));
      const exploreArtists = [...new Set(relatedGroups.flat().map(getDiscoveryArtistName))].filter(name => !coreArtists.includes(name)).slice(0, 3);
      const artistsToQuery = [...coreArtists, ...exploreArtists];
      const albumGroups = await Promise.all(artistsToQuery.map(async (artistName) => { try { return ((await getArtistAlbums(artistName, 30)) || []).map(album => ({ ...album, artistQuery: artistName })); } catch { return []; } }));
      if (controller.signal.aborted || reqIdRef.current !== requestId) return;

      const seenAlbumKeys = new Set();
      const finalAlbums = albumGroups.flat()
        .filter(album => { if (!album.image) return false; const key = `${(album.artist || '').toLowerCase()}::${(album.name || '').toLowerCase()}`; if (savedAlbumKeys.has(key) || seenAlbumKeys.has(key)) return false; seenAlbumKeys.add(key); return true; })
        .sort((a, b) => { const typeOrder = { album: 0, ep: 1, single: 2 }; const tA = typeOrder[a.recordType] ?? 1, tB = typeOrder[b.recordType] ?? 1; if (tA !== tB) return tA - tB; return (b.releaseDate ? new Date(b.releaseDate).getTime() : 0) - (a.releaseDate ? new Date(a.releaseDate).getTime() : 0); });
      const albumCounts = new Map();
      const selectedAlbums = finalAlbums.filter(album => { const key = normalizeDiscoveryText(toArtistName(album.artist)); const count = albumCounts.get(key) || 0; albumCounts.set(key, count + 1); return count < 2; }).slice(0, 12)
        .map(album => ({ id: album.id || `album-${album.name}-${album.artist}`, deezerId: album.deezerId || (/^\d+$/.test(String(album.id || '')) ? album.id : null), name: album.name, artist: album.artist || album.artistQuery, image: album.image, type: 'album', recordType: album.recordType || 'album', releaseYear: album.releaseDate ? new Date(album.releaseDate).getFullYear() : null, trackCount: album.trackCount }));

      setSections((prev) => ({ ...prev, recommendedAlbums: selectedAlbums })); setLoading((p) => ({ ...p, albums: false }));
    } catch { if (!controller.signal.aborted) setLoading((p) => ({ ...p, albums: false })); }
  }, [makeController, sessionSavedAlbums, tasteProfile.topArtists, setSections]);

  // Load Artist Spotlight
  // Load Artist Spotlight (Diverse User Favorites)
  const loadArtistSpotlight = useCallback(async (requestId) => {
    const controller = makeController("spotlight"); setLoading((p) => ({ ...p, spotlight: true }));
    try {
      const shuffledArtists = tasteProfile.topArtists.slice(0, 6);

      // 2. Fetch 1 Top Track per Artist (Parallel)
      // We limit concurrency to avoid overwhelming the API
      const BATCH_SIZE = 5;
      const finalTracks = [];

      for (let i = 0; i < shuffledArtists.length; i += BATCH_SIZE) {
        if (controller.signal.aborted) break;
        const batch = shuffledArtists.slice(i, i + BATCH_SIZE);

        const results = await Promise.all(batch.map(async (artistName) => {
          try {
            // Get only top 1 track to be efficient
            const r = await artistGetTopTracks({ artist: artistName, limit: 1 });
            const track = (r?.toptracks?.track || [])[0];
            if (track) return normalizeItem(track, "track");
            return null;
          } catch { return null; }
        }));

        // Add valid tracks
        results.forEach(t => {
          if (t && t.image && t.image !== DEFAULT_IMAGE) finalTracks.push(t);
        });

        // If we have enough good tracks (e.g. 15), we can stop early to be fast
        if (finalTracks.length >= 6) break;
      }

      const finalList = finalTracks.slice(0, 6);

      if (!controller.signal.aborted && reqIdRef.current === requestId) {
        setSections((prev) => ({ ...prev, artistSpotlight: finalList }));
        setLoading((p) => ({ ...p, spotlight: false }));
      }
    } catch (err) {
      console.warn("[Feed] Spotlight error:", err);
      if (!controller.signal.aborted) setLoading((p) => ({ ...p, spotlight: false }));
    }
  }, [makeController, tasteProfile.topArtists, setSections]);

  // Revalidate All
  const revalidateAll = useCallback(async () => {
    const requestId = ++reqIdRef.current;
    ["critical", "forYou", "playlists", "party", "recommendations", "albums", "mood", "flashback", "global", "spotlight"].forEach(cancelKey);
    if (Date.now() - startupCatalogFetchedAtRef.current >= 5 * 60 * 1000) startupCatalogPromiseRef.current = null;
    await Promise.allSettled([
      loadCritical(requestId), loadForYou(requestId), loadSmartRecommendations(requestId),
      loadPlaylistsLazy(requestId), loadRecommendedAlbums(requestId), loadArtistSpotlight(requestId),
    ]);
    if (reqIdRef.current !== requestId) return;
    screenStateCache.set(feedCacheKey, 'generationComplete', Date.now());
  }, [cancelKey, loadCritical, loadForYou, loadPlaylistsLazy, loadSmartRecommendations, loadRecommendedAlbums, loadArtistSpotlight, feedCacheKey]);

  useEffect(() => {
    if (userLoading) return;
    const controllers = abortRef.current;
    const timer = window.setTimeout(() => { revalidateAll(); }, 350);
    return () => {
      window.clearTimeout(timer);
      reqIdRef.current += 1;
      Object.values(controllers).forEach(controller => controller.abort());
    };
  }, [userLoading, revalidateAll]);

  useEffect(() => {
    const refresh = () => { if (!document.hidden && !userLoading) revalidateAll(); };
    const timer = window.setInterval(refresh, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [revalidateAll, userLoading]);

  // Stable callbacks
  // 🎵 handleNewReleasesClick: Ahora usa Radio Instantánea (no pasa contextQueue)
  const handleNewReleasesClick = useCallback((item) => handlePlay(item), [handlePlay]);
  const handleTrendingClick = useCallback((item) => handlePlay(item, sections.trending), [handlePlay, sections.trending]);
  const handleForYouTracksClick = useCallback((item) => handlePlay(item, sections.forYouTracks), [handlePlay, sections.forYouTracks]);
  const handlePlaylistClick = useCallback((item) => handlePlay(item), [handlePlay]);
  // Fix: Direct navigation for albums to avoid type mismatch ('Álbum' vs 'album')
  const handleAlbumClick = useCallback((item) => navigate(getAlbumPath(item)), [navigate]);
  const handleRecentlyPlayedClick = useCallback((item) => handlePlay(item, recentlyPlayed), [handlePlay, recentlyPlayed]);
  // 🎵 handleRecommendationsClick: Ahora usa Radio Instantánea (no pasa contextQueue)
  const handleRecommendationsClick = useCallback((item) => handlePlay(item), [handlePlay]);

  /* handleManualRefresh removed as unused */

  const displayName = user?.displayName || user?.email?.split("@")[0] || "Viajero";

  const getSectionSubtitle = (key) => {
    const map = {
      forYouTracks: instantPlayTracks.length > 0
        ? 'Tus favoritos y escuchas recientes, listos para sonar'
        : 'Una selección rápida para empezar',
      newReleases: 'Lanzamientos verificados de los últimos 60 días',
      smartRecommendations: sections.recommendationMeta?.seedNames?.length
        ? `Artistas relacionados con ${sections.recommendationMeta.seedNames.slice(0, 2).join(' y ')} · ${sections.recommendationMeta.newArtistCount || 0} artistas por descubrir`
        : 'Canciones parecidas a tus gustos, sin repetir lo de siempre',
      recentlyPlayed: 'De tu historial reciente',
      topPlaylists: tasteProfile.topArtists?.length > 0 ? `Con artistas como ${tasteProfile.topArtists.slice(0, 2).join(' y ')}` : 'Playlists populares',
      partyPlaylists: 'Para tus momentos de fiesta', trending: 'Del chart de Deezer, seleccionado para tus gustos',
      recommendedAlbums: 'Para explorar tus gustos recientes y artistas relacionados',
      moodMixes: tasteProfile.topArtists?.length > 0
        ? `Perfecto para ${timeOfDay === 'morning' ? 'empezar el día' : timeOfDay === 'night' ? 'cerrar el día' : 'este momento'} con ${tasteProfile.topArtists[0]}`
        : `Perfecto para ${timeOfDay === 'morning' ? 'empezar el día' : timeOfDay === 'night' ? 'cerrar el día' : 'este momento'}`,
      flashback: 'Viaja en el tiempo con estos éxitos',
      artistSpotlight: sections.artistSpotlight?.length > 0
        ? `Una mezcla de artistas que te encantan: ${sections.artistSpotlight.slice(0, 2).map(t => t.artist).join(', ')} y más`
        : 'Tus artistas favoritos',
      global: 'Lo que suena en todo el mundo'
    };
    return map[key] || null;
  };

  // State for the active hero item (determined by scroll)
  const [activeHeroItem, setActiveHeroItem] = useState(null);

  // Handler for HeroRow scroll updates
  const handleHeroScrollChange = useCallback((item) => {
    setActiveHeroItem(prev => (prev?.id === item?.id ? prev : item));
  }, []);

  const currentHeroBg = activeHeroItem?.image || heroMix[0]?.image || hero?.image || DEFAULT_IMAGE;

  return (
    <div className="feed-screen" ref={feedContainerRef}>
      <header className="feed-hero">
        <div
          className="feed-hero-background"
          style={{
            '--hero-bg-image': `url(${currentHeroBg})`,
            transition: 'opacity 0.35s ease'
          }}
        />
        <div className="feed-hero-top">
          <div className="feed-hero-greeting">
            <div className="feed-hero-date">TU FEED <span aria-hidden="true"> / </span> {todayText}</div>
            <h1 className="feed-hero-title">Hola, {displayName}</h1>
            <p className="feed-hero-sub">{tasteProfile.sampleSize >= 5 ? "Lo que te gusta hoy. Y lo que te va a gustar mañana." : "Escucha lo que te mueve. Tu feed crecerá contigo."}</p>
          </div>
          <button type="button" className="feed-refresh" onClick={() => { startupCatalogPromiseRef.current = null; startupCatalogFetchedAtRef.current = 0; revalidateAll(); }} disabled={loading.critical || loading.forYou || loading.recommendations}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" /></svg>
            {loading.critical || loading.forYou || loading.recommendations ? 'Actualizando' : 'Actualizar'}
          </button>
        </div>
        <div className="feed-hero-label">Tu próxima canción</div>
        <HeroRow
          items={heroMix}
          onItemClick={handlePlay}
          onActiveItemChange={handleHeroScrollChange}
          playbackPrefetch={playbackPrefetch}
          isLoading={heroMix.length === 0 && (loading.critical || loading.forYou)}
        />
        {!heroMix.length && !loading.critical && !loading.forYou && <p className="feed-empty">No pudimos preparar tu selección. Usa Actualizar para intentarlo de nuevo.</p>}
        {error && <div className="feed-error" role="status">{error}</div>}
        <nav className="feed-jump-links" aria-label="Explorar tu feed">
          <a href="#feed-smartRecommendations">Descubrir</a><a href="#feed-newReleases">Novedades</a><a href="#feed-trending">Popular ahora</a><a href="#feed-recommendedAlbums">Álbumes</a>
        </nav>
      </header>

      {/* RADIO SECTION - Artistas Favoritos con Radio Infinita */}
      {(() => {
        // Usar savedArtists si están disponibles, sino usar topArtists del taste profile
        // "Artistas más recientes que agregó": Asumimos que savedArtists viene ordenado (o usamos todo el pool)
        // Tomamos los 50 más recientes como pool para rotar
        const sourceList = sessionSavedArtists.length > 0
          ? sessionSavedArtists
          : (tasteProfile.topArtists || []).map(a => ({ name: a, id: `artist-${a}` }));

        // Pool de candidatos (hasta 50 para asegurar frescura pero variedad)
        const candidates = sourceList.slice(0, 50).map(artist => {
          const artistName = getDiscoveryArtistName(artist);
          return {
          id: artist.id || `artist-${artistName}`,
          type: 'artist',
          name: artistName,
          artist: artistName,
          image: artist.image || DEFAULT_IMAGE,
        }}).filter((artist) => artist.name);

        if (candidates.length === 0) return null;

        // Selección aleatoria determinista basada en el bloque de 3 horas
        const radioArtists = pickRandomSample(
          candidates,
          12,
          `radio-session-${sessionSeed}-${user?.uid || 'guest'}`
        );

        return (
          <section className="feed-section feed-section-radio">
            <div className="feed-section-header">
              <h2 className="feed-section-title">Radio de tus artistas favoritos</h2>
              <p className="feed-section-subtitle">
                {sessionSavedArtists.length > 0
                  ? "Tus artistas recientes"
                  : "Escucha radio infinita de tus artistas"}
              </p>
            </div>
            <div className="feed-row">
              {radioArtists.map((artist) => (
                <Card
                  key={artist.id || artist.name}
                  item={artist}
                  onClick={() => handleArtistRadioClick(artist)}
                  variant="circle"
                  className="feed-card-radio"
                />
              ))}
            </div>
          </section>
        );
      })()}

      {rotatedSections.map(({ key, title }) => {
        const subtitle = getSectionSubtitle(key);
        switch (key) {
          case 'forYouTracks': return <Row key={key} sectionKey="forYouTracks" title={title} subtitle={subtitle} items={sections.forYouTracks} onItemClick={handleForYouTracksClick} isLoading={loading.forYou && !sections.forYouTracks.length} playbackPrefetch={playbackPrefetch} />;
          case 'newReleases': return <Row key={key} sectionKey="newReleases" title={title} subtitle={subtitle} items={sections.newReleases} onItemClick={handleNewReleasesClick} isLoading={loading.newReleases} emptyMessage="No encontramos lanzamientos verificados de los últimos 60 días. Vuelve pronto para descubrir novedades de tus artistas." playbackPrefetch={playbackPrefetch} />;
          case 'smartRecommendations':
            return <Row key={key} sectionKey="smartRecommendations" title={title} subtitle={subtitle} items={sections.smartRecommendations} onItemClick={handleRecommendationsClick} variant="recommended" isLoading={loading.recommendations} playbackPrefetch={playbackPrefetch} />;
          case 'recentlyPlayed': return recentlyPlayed.length > 0 ? <Row key={key} sectionKey="recentlyPlayed" title={title} subtitle={subtitle} items={recentlyPlayed} onItemClick={handleRecentlyPlayedClick} variant="recent" playbackPrefetch={playbackPrefetch} /> : null;
          case 'topPlaylists': return <Row key={key} sectionKey="topPlaylists" title={title} subtitle={subtitle} items={sections.topPlaylists} onItemClick={handlePlaylistClick} isLoading={loading.playlists} />;

          case 'partyPlaylists': return <Row key={key} sectionKey="partyPlaylists" title={title} subtitle={subtitle} items={sections.partyPlaylists} onItemClick={handlePlaylistClick} isLoading={loading.party} />;
          case 'recommendedAlbums': return <Row key={key} sectionKey="recommendedAlbums" title={title} subtitle={subtitle} items={sections.recommendedAlbums} variant="album" onItemClick={handleAlbumClick} isLoading={loading.albums} />;
          case 'trending': return <Row key={key} sectionKey="trending" title={title} subtitle={subtitle} items={sections.trending} onItemClick={handleTrendingClick} playbackPrefetch={playbackPrefetch} />;
          case 'moodMixes': return <Row key={key} sectionKey="moodMixes" title={title} subtitle={subtitle} items={sections.moodMixes} onItemClick={handlePlaylistClick} variant="wide" isLoading={loading.mood} />;
          case 'flashback': return <Row key={key} sectionKey="flashback" title={title} subtitle={subtitle} items={sections.flashback} onItemClick={handlePlaylistClick} isLoading={loading.flashback} />;
          case 'artistSpotlight': return <Row key={key} sectionKey="artistSpotlight" title={title} subtitle={subtitle} items={sections.artistSpotlight} onItemClick={handleRecommendationsClick} variant="poster" isLoading={loading.spotlight} playbackPrefetch={playbackPrefetch} />;
          case 'global': return <Row key={key} sectionKey="global" title={title} subtitle={subtitle} items={sections.global} onItemClick={handlePlaylistClick} variant="list" isLoading={loading.global} />;
          default: return null;
        }
      })}

      {/* Toast Notification */}
      {toast && (
        <div className="feed-toast-container" role="status" aria-live="polite">
          <div
            className="feed-toast"
            style={{ '--toast-img': `url(${toast.image || DEFAULT_IMAGE})` }}
          >
            <div className="feed-toast-bg" />
            {toast.loading && <div className="feed-spinner-tiny" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}
    </div>
  );
}
