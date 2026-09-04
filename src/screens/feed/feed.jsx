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
import { getSmartPrefetchPreference } from "../../services/experiencePreferences";
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
const FEED_STARTUP_CACHE_TTL = 14 * 24 * 60 * 60 * 1000;
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
  const reservedWhileLoading = new Set(['forYouTracks', 'smartRecommendations', 'newReleases']);
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
const Row = memo(({ title, subtitle, items, onItemClick, variant = 'default', sectionKey = '', isLoading, playbackPrefetch }) => {
  const displayItems = useMemo(() => {
    if (!items) return [];
    if (variant === 'recent') return items; // Allow history duplicates
    return uniqByKey(items, (it) => it.id);
  }, [items, variant]);

  if (isLoading) {
    const loadingClass = variant === 'album' ? 'feed-section feed-section-albums' : variant === 'recommended' ? 'feed-section feed-section-recommended' : 'feed-section';
    return (
      <section className={loadingClass}>
        <div className="feed-section-header"><h2 className="feed-section-title">{title}</h2>{subtitle && <p className="feed-section-subtitle">{subtitle}</p>}</div>
        <div className="feed-row feed-row-skeleton" role="status" aria-label={`Preparando ${title}`}>
          {[0, 1, 2].map((index) => (
            <div className="feed-content-skeleton" key={index} aria-hidden="true">
              <div className="feed-content-skeleton-image" />
              <div className="feed-content-skeleton-line" />
              <div className="feed-content-skeleton-line short" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (!displayItems?.length) return null;

  let sectionClass = 'feed-section';
  if (variant === 'album') sectionClass += ' feed-section-albums';
  else if (variant === 'recommended') sectionClass += ' feed-section-recommended';
  else if (variant === 'recent') sectionClass += ' feed-section-recent';

  let rowClass = 'feed-row';
  if (variant === 'recommended') rowClass = 'feed-recommended-grid';
  else if (variant === 'album') rowClass = 'feed-row feed-album-row';
  else if (variant === 'mini') rowClass = 'feed-minimal-list-container';
  else if (variant === 'list') rowClass = 'feed-simple-list';

  const mapVariant = (v) => {
    switch (v) {
      case 'list': return 'horizontal';
      case 'wide': return 'wide';
      case 'poster': return 'poster';
      case 'circle': return 'circle';
      case 'recommended': return 'vertical';
      default: return 'vertical';
    }
  };

  // Map sectionKey to className
  const getSectionClassName = (key) => {
    const classNameMap = {
      'newReleases': 'feed-card-new-releases',
      'smartRecommendations': 'feed-card-recommendations',
      'trending': 'feed-card-trending',
      'forYouTracks': 'feed-card-foryou-tracks',
      'topPlaylists': 'feed-card-playlists',
      'partyPlaylists': 'feed-card-playlists',
      'recommendedAlbums': 'feed-card-albums',
      'recentlyPlayed': 'feed-card-recent',
      'flashback': 'feed-card-flashback',
      'moodMixes': 'feed-card-mood',
      'artistSpotlight': 'feed-card-spotlight',
      'global': 'feed-card-global',
    };
    return classNameMap[key] || '';
  };

  const cardVariant = mapVariant(variant);
  const cardClassName = getSectionClassName(sectionKey);



  return (
    <section className={sectionClass}>
      <div className="feed-section-header"><h2 className="feed-section-title">{title}</h2>{subtitle && <p className="feed-section-subtitle">{subtitle}</p>}</div>
      <div className={rowClass}>
        {displayItems.map((it, index) => (
          <Card
            key={variant === 'recent' ? `${it.id}-${it.playedAt}` : `${it.id}`}
            item={it}
            onClick={onItemClick}
            variant={cardVariant}
            className={`${cardClassName} ${variant === 'recommended' ? 'recommended-card-override' : ''}`.trim()}
            {...playbackPrefetch}
          />
        ))}
      </div>
    </section>
  );
}, (prev, next) => prev.title === next.title && prev.isLoading === next.isLoading && (prev.items || []).length === (next.items || []).length && (prev.items || []).every((it, i) => it?.id === next.items?.[i]?.id));

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
}, (prev, next) => prev.item?.id === next.item?.id && prev.item?.image === next.item?.image);

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
}, (prev, next) => prev.isLoading === next.isLoading && (prev.items || []).length === (next.items || []).length && (prev.items || []).every((it, i) => it?.id === next.items?.[i]?.id));

// Helper: Build recently played from history
const buildRecentlyPlayed = (history) => {
  if (!history?.length) return [];
  const seen = new Set(), recent = [];
  for (const h of history) {
    if (!h.name || !h.artist) continue;
    const key = `${h.artist.toLowerCase()}-${h.name.toLowerCase()}`;
    if (seen.has(key)) continue; seen.add(key);
    recent.push({ id: `recent-${key}-${h.timestamp}`, type: 'track', name: h.name, artist: h.artist, image: h.image || DEFAULT_IMAGE, duration: h.duration || 0, playedAt: h.timestamp });
    if (recent.length >= 12) break;
  }
  return recent;
};

// Main Feed Component
export default function Feed() {
  const navigate = useNavigate();
  const { playTrack, appendToQueue, primeResolvedTrack } = usePlayerActions();
  const playerState = usePlayer();
  const { user, favorites, playlists, savedArtists, savedAlbums, loading: userLoading } = useUser();
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

  const discoveryInputsRef = useRef(screenStateCache.get('feed', 'discoveryInputs') || null);
  if (!userLoading && !discoveryInputsRef.current) {
    discoveryInputsRef.current = {
      favorites: [...(favorites || [])],
      playlists: [...(playlists || [])],
      savedArtists: [...(savedArtists || [])],
      savedAlbums: [...(savedAlbums || [])],
      listeningHistory: [...(playerState.listeningHistory || [])],
      engagement: { ...(playerState.tasteEngagement || { likedArtists: {}, skippedArtists: {} }) },
    };
    screenStateCache.set('feed', 'discoveryInputs', discoveryInputsRef.current);
  }
  const discoveryInputs = discoveryInputsRef.current;
  const sessionFavorites = discoveryInputs?.favorites || EMPTY_DISCOVERY_LIST;
  const sessionSavedArtists = discoveryInputs?.savedArtists || EMPTY_DISCOVERY_LIST;
  const sessionSavedAlbums = discoveryInputs?.savedAlbums || EMPTY_DISCOVERY_LIST;

  const listeningHistorySnapshotRef = useRef(discoveryInputs?.listeningHistory || playerState.listeningHistory || []);
  const tasteEngagementSnapshotRef = useRef(discoveryInputs?.engagement || playerState.tasteEngagement || { likedArtists: {}, skippedArtists: {} });

  const [recentlyPlayed] = useState(() => {
    const cached = screenStateCache.get('feed', 'recentlyPlayed');
    if (cached) return cached;
    const snapshot = buildRecentlyPlayed(listeningHistorySnapshotRef.current);
    screenStateCache.set('feed', 'recentlyPlayed', snapshot);
    return snapshot;
  });

  const feedContainerRef = useRef(null);
  useScrollPersistence('feed', feedContainerRef);
  const wasRestoredFromMemoryRef = useRef(Boolean(screenStateCache.get('feed', 'generationStarted')));
  const [error, setError] = useState(null);
  const [hero, setHeroInternal] = useState(() => screenStateCache.get('feed', 'hero') || null);
  const heroRef = useRef(hero);
  const setHero = useCallback((update) => {
    const value = typeof update === 'function' ? update(heroRef.current) : update;
    heroRef.current = value;
    screenStateCache.set('feed', 'hero', value);
    setHeroInternal(value);
  }, []);

  const [sections, setSectionsInternal] = useState(() => {
    const cachedSections = screenStateCache.get('feed', 'sections') || {};
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
    screenStateCache.set('feed', 'sections', value);
    setSectionsInternal(value);
  }, []);

  useEffect(() => screenStateCache.subscribe('feed', (snapshot, changedKey) => {
    if (changedKey === 'sections' && snapshot.sections !== sectionsRef.current) {
      sectionsRef.current = snapshot.sections;
      setSectionsInternal(snapshot.sections);
    }
    if (changedKey === 'hero' && snapshot.hero !== heroRef.current) {
      heroRef.current = snapshot.hero;
      setHeroInternal(snapshot.hero);
    }
  }), []);

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
    const cached = screenStateCache.get('feed', 'sessionSeed');
    if (cached) return cached;
    screenStateCache.set('feed', 'sessionSeed', FALLBACK_SESSION_SEED);
    return FALLBACK_SESSION_SEED;
  });

  // Toast Notification State (enhanced with image)
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const abortRef = useRef({});
  const reqIdRef = useRef(0);
  const startupCatalogPromiseRef = useRef(null);
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
    const cached = screenStateCache.get('feed', 'rotatedSections');
    const result = applySectionsRotation({ sections });
    if (result.length > 0) screenStateCache.set('feed', 'rotatedSections', result);
    return result.length > 0 ? result : (cached || []);
  }, [sections]);

  const cancelKey = useCallback((key) => { const c = abortRef.current[key]; if (c) { try { c.abort(); } catch { } delete abortRef.current[key]; } }, []);
  const makeController = useCallback((key) => { cancelKey(key); const c = new AbortController(); abortRef.current[key] = c; return c; }, [cancelKey]);

  // Esta consulta empieza al montar la pantalla, sin esperar autenticación ni
  // Firestore. Se comparte con el resto del cargador para no duplicar tráfico.
  const loadStartupCatalog = useCallback(() => {
    if (startupCatalogPromiseRef.current) return startupCatalogPromiseRef.current;
    startupCatalogPromiseRef.current = chartGetTopTracks({ limit: 14 }).then((charts) => {
      const tracks = filterQualityTracks(
        uniqByKey((charts?.tracks?.track || []).map((track) => normalizeItem(track, 'track')), makeTrackKey),
      ).filter((track) => track.image && track.image !== DEFAULT_IMAGE).slice(0, 12);
      if (tracks.length) {
        startupTracksRef.current = tracks;
        saveStartupTracks(tracks);
        setSections((previous) => ({ ...previous, trending: tracks.slice(0, 8) }));
        if (!heroRef.current) setHero({ ...tracks[0], heroSource: 'trending' });
      }
      return tracks;
    });
    return startupCatalogPromiseRef.current;
  }, [setHero, setSections]);

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
    const cachedHero = screenStateCache.get('feed', 'heroMix');
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
    screenStateCache.set('feed', 'heroMix', stableItems);
    setHeroMixInternal(stableItems);
  }, []);

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
    const controller = makeController("critical");
    setLoading((p) => ({ ...p, critical: true, newReleases: true })); setError(null);
    try {
      // Una sola consulta pequeña desbloquea el catálogo para usuarios nuevos.
      // Se publica apenas llega; las novedades no pueden retrasar el primer render.
      const firstTrending = await loadStartupCatalog();
      if (controller.signal.aborted || reqIdRef.current !== requestId) return;
      setSections((previous) => ({ ...previous, trending: firstTrending.slice(0, 8) }));
      if (!heroRef.current && firstTrending[0]) {
        setHero({ ...firstTrending[0], heroSource: 'trending' });
      }
      setLoading((previous) => ({ ...previous, critical: false }));

      // === NUEVOS LANZAMIENTOS PERSONALIZADOS ===
      // Intentar recuperar artistas de varias fuentes para asegurar personalización
      let finalUserArtists = [];

      if (sessionSavedArtists.length > 0) {
        finalUserArtists = sessionSavedArtists.map(getDiscoveryArtistName);
      } else if (sessionFavorites.length > 0) {
        // Si no hay artistas guardados, sacar de favoritos
        const unique = new Set(sessionFavorites.map(f => getDiscoveryArtistName(f.artist)));
        finalUserArtists = Array.from(unique).filter(Boolean).slice(0, 50);
        console.log(`[NewReleases] Using ${finalUserArtists.length} artists from Favorites`);
      } else if (tasteProfile?.topArtists?.length > 0) {
        finalUserArtists = tasteProfile.topArtists;
      } else {
        // Fallback emergencia: Leer localStorage directamente si el hook aún no hidrató
        try {
          const stored = localStorage.getItem('library_artists');
          if (stored) {
            const parsed = JSON.parse(stored);
            // Soporte ambos formatos de guardado (array simple o {artists: []})
            const list = Array.isArray(parsed) ? parsed : (parsed.artists || []);
            if (Array.isArray(list) && list.length > 0) {
              finalUserArtists = list.map(a => typeof a === 'string' ? a : a.name).filter(Boolean);
              console.log('[NewReleases] Recovered artists from localStorage:', finalUserArtists.length);
            }
          }
        } catch (e) { console.warn('LS read error', e); }
      }

      const userArtists = finalUserArtists;

      const [resolvedCharts, personalizedNewReleases] = await Promise.all([
        Promise.resolve({ tracks: { track: firstTrending } }),
        (async () => {
          // =================================================================
          // ⚡ CACHE LAYER (24 HORAS)
          // =================================================================
          const CACHE_KEY = `feed_new_releases_cache_v2_${user?.uid || 'guest'}`;
          const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

          try {
            const cachedRaw = localStorage.getItem(CACHE_KEY);
            if (cachedRaw) {
              const cached = JSON.parse(cachedRaw);
              const age = Date.now() - cached.timestamp;
              if (age < CACHE_DURATION && Array.isArray(cached.data) && cached.data.length > 0) {
                console.log(`[NewReleases] ⚡ Using cached data (${(age / 3600000).toFixed(1)}h old)`);
                return cached.data;
              }
            }
          } catch (e) {
            console.warn('[NewReleases] Cache read error:', e);
          }

          if (userArtists.length === 0) {
            console.log('[NewReleases] No user artists found (even in LS). Hiding section.');
            return [];
          }

          console.log(`[NewReleases] 🎵 Finding new album releases from ${userArtists.length} favorite artists`);

          // Seleccionar más artistas para aumentar las posibilidades de encontrar lanzamientos recientes.
          const selectedArtists = pickRandomSample(
            userArtists,
            Math.min(userArtists.length, 4),
            `newReleases-${sessionSeed}`
          );

          // Buscar álbumes realmente nuevos del año actual
          const currentYear = new Date().getFullYear();

          const albumPromises = selectedArtists.map(async (artistName) => {
            try {
              console.log(`[NewReleases] 🔍 Searching ${artistName} + 3 related artists...`);

              // Dos consultas acotadas por artista. Las relaciones se reservan
              // para el motor de recomendaciones y no se duplican aquí.
              const [albums, topTracks] = await Promise.all([
                getArtistAlbums(artistName, 10),
                artistGetTopTracks({ artist: artistName, limit: 12 }),
              ]);
              const relatedArtists = [];

              console.log(`[NewReleases] Found ${albums?.length || 0} albums, ${topTracks?.toptracks?.track?.length || 0} tracks, and ${relatedArtists?.length || 0} related artists for ${artistName}`);

              // Filtrar álbumes y EPs del año actual
              const recentAlbums = (albums || []).filter(album => {
                const rDate = album.releaseDate || album.release_date;
                const releaseYear = rDate ? parseInt(rDate.split('-')[0]) : null;

                // Si hay fecha, verificar que sea del año actual
                if (releaseYear) {
                  return releaseYear === currentYear;
                }

                // Si NO hay fecha, asumir que es reciente (Last.fm a veces falla)
                return true;
              });

              // Filtrar SINGLES/TRACKS del año actual con DETECCIÓN INTELIGENTE
              const tracks = topTracks?.toptracks?.track || [];
              const recentTracks = tracks
                .map(t => normalizeItem(t, 'track'))
                .filter(t => {
                  if (!t.image || t.image === DEFAULT_IMAGE) return false;

                  // 1. Fecha directa del año actual
                  if (t.release_date) {
                    const y = parseInt(t.release_date.split('-')[0]);
                    return y === currentYear;
                  }

                  // 2. Coincide con un álbum verificado del año actual
                  if (t.album && recentAlbums.some(album =>
                    album.name.toLowerCase().trim() === t.album.toLowerCase().trim()
                  )) {
                    return true;
                  }

                  // 3. El nombre declara explícitamente el año actual
                  if ((t.name && t.name.includes(String(currentYear))) || (t.album && t.album.includes(String(currentYear)))) {
                    return true;
                  }

                  return false;
                })
                .slice(0, 8);


              console.log(`[NewReleases] ${artistName}: ${recentAlbums.length} albums + ${recentTracks.length} tracks from ${currentYear}`);

              // Combinar álbumes y singles
              const allRecent = [
                ...recentAlbums.map(album => normalizeItem(album, 'album')),
                ...recentTracks
              ];

              // Si el artista tiene lanzamientos recientes, retornarlos
              if (allRecent.length > 0) {
                return allRecent.slice(0, 5); // Hasta 5 items por artista favorito
              }

              // Paso 2: Si NO tiene lanzamientos recientes, buscar artistas relacionados
              console.log(`[NewReleases] No recent albums for ${artistName}, searching related artists...`);

              try {
                // Si no hay suficientes relacionados, usar los que hay
                if (!relatedArtists?.length) return [];

                // Buscar lanzamientos recientes de artistas relacionados (álbumes Y singles)
                const relatedAlbumsPromises = relatedArtists.slice(0, 5).map(async (relatedArtist) => {
                  try {
                    const [relAlbums, relTracks] = await Promise.all([
                      getArtistAlbums(relatedArtist.name, 10),
                      artistGetTopTracks({ artist: relatedArtist.name, limit: 30 })
                    ]);

                    // Filtrar álbumes del año actual
                    const relRecent = (relAlbums || []).filter(album => {
                      const rDate = album.releaseDate || album.release_date;
                      const releaseYear = rDate ? parseInt(rDate.split('-')[0]) : null;
                      return releaseYear === currentYear;
                    });

                    // Tomar tracks del año actual.
                    const relRecentTracks = (relTracks?.toptracks?.track || [])
                      .map(t => normalizeItem(t, 'track'))
                      .filter(t => {
                        if (!t.image || t.image === DEFAULT_IMAGE) return false;
                        if (t.release_date) {
                          const y = parseInt(t.release_date.split('-')[0]);
                          return y === currentYear;
                        }
                        if (t.album && relRecent.some(album => album.name.toLowerCase().trim() === t.album.toLowerCase().trim())) return true;
                        if ((t.name && t.name.includes(String(currentYear))) || (t.album && t.album.includes(String(currentYear)))) return true;
                        return false;
                      })
                      .slice(0, 5);

                    const relAllRecent = [...relRecent.map(album => normalizeItem(album, 'album')), ...relRecentTracks];
                    return relAllRecent.slice(0, 3);
                  } catch { return []; }
                });

                const relatedAlbums = (await Promise.all(relatedAlbumsPromises)).flat();
                return relatedAlbums;

              } catch (err) {
                return [];
              }

            } catch (err) {
              return [];
            }
          });

          const allNewAlbums = (await Promise.all(albumPromises)).flat();
          const uniqueAlbums = uniqByKey(allNewAlbums, (album) => `${album.artist.toLowerCase()}-${album.name.toLowerCase()}`)
            .filter(album => album.image && album.image !== DEFAULT_IMAGE);

          // Si encontramos resultados, guardar en caché
          if (uniqueAlbums.length > 0) {
            const finalResults = pickRandomSample(uniqueAlbums, Math.min(uniqueAlbums.length, 10), `shuffle-newReleases-${sessionSeed}`);
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data: finalResults
              }));
              console.log(`[NewReleases] 💾 Saved ${finalResults.length} items to cache`);
            } catch (e) { console.warn('Cache write error', e); }
            return finalResults;
          }

          return [];
        })(),
      ]);

      if (controller.signal.aborted || reqIdRef.current !== requestId) return;

      const trending = filterQualityTracks(uniqByKey((resolvedCharts?.tracks?.track || []).map((t) => normalizeItem(t, "track")), makeTrackKey)).filter((t) => t.image && t.image !== DEFAULT_IMAGE);

      // Usar ref para evitar dependencia circular
      const currentSections = sectionsRef.current;
      let heroCandidate = null, heroSource = 'trending';

      if (currentSections.smartRecommendations?.length > 0) {
        heroCandidate = currentSections.smartRecommendations[0];
        heroSource = 'smartRecommendations';
      }
      else if (currentSections.forYouTracks?.length > 0) {
        heroCandidate = currentSections.forYouTracks[0];
        heroSource = 'forYou';
      }
      else if (trending.length > 0) {
        heroCandidate = trending[0];
        heroSource = 'trending';
      }

      console.log(`[NewReleases] 🚨 FINAL RESULT: ${personalizedNewReleases?.length || 0} items to display`, personalizedNewReleases);
      setSections((p) => ({ ...p, trending: p.trending?.length ? p.trending : trending.slice(0, 8), newReleases: personalizedNewReleases }));
      if (heroCandidate && !heroRef.current) {
        setHero({ ...heroCandidate, heroSource });
      }
      setLoading((p) => ({ ...p, critical: false, newReleases: false }));
    } catch (e) { if (!controller.signal.aborted) { setLoading((p) => ({ ...p, critical: false, newReleases: false })); setError("No pudimos actualizar el catálogo. Tu música guardada sigue disponible."); } }
  }, [loadStartupCatalog, makeController, sessionSeed, setHero, setSections, sessionSavedArtists, tasteProfile.topArtists, sessionFavorites, user?.uid]);

  // Load ForYou
  const loadForYou = useCallback(async (requestId) => {
    const controller = makeController("forYou");
    setLoading((p) => ({ ...p, forYou: true }));
    try {
      if (!user) {
        // Fallback para usuarios sin sesión real
        throw new Error("No user for personalized feed");
      }

      // === GENERACIÓN DE TRACKS (Para completar la sección) ===
      const topArtists = tasteProfile.topArtists?.length
        ? tasteProfile.topArtists
        : pickRandomSample(FALLBACK_ARTISTS, 1, `${sessionSeed}:for-you`);
      const primary = topArtists[0];
      const artistTracksRes = await artistGetTopTracks({ artist: primary, limit: 12 });
      const tracks = filterQualityTracks((artistTracksRes?.toptracks?.track || []).map((t) => normalizeItem(t, "track")))
        .filter((t) => t.image && t.image !== DEFAULT_IMAGE)
        .slice(0, 10);

      const artistsYouLike = topArtists.slice(0, 6).map((a) => normalizeItem({ id: `artist-${a}`, name: a, artist: a }, "artist"));

      if (controller.signal.aborted || reqIdRef.current !== requestId) return;

      setSections((prev) => ({
        ...prev,
        moodMixes: (prev.moodMixes || []).filter((item) => !String(item?.id || '').startsWith('feed-')),
        // Lo que ya vio la persona no se sustituye cuando responde la red.
        // Las sugerencias nuevas se añaden detrás y la fila permanece estable.
        forYouTracks: uniqByKey([...(prev.forYouTracks || []), ...tracks], makeTrackKey).slice(0, 12),
        artistsYouLike
      }));

    } catch (e) {
      // Fallback silencioso
    } finally {
      if (!controller.signal.aborted) setLoading((p) => ({ ...p, forYou: false }));
    }
  }, [makeController, tasteProfile, user, setSections, sessionSeed]);

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
      const personalizedSeeds = tasteProfile.seeds.slice(0, 3);
      const fallbackSeeds = pickRandomSample(
        FALLBACK_ARTISTS,
        Math.max(0, 3 - personalizedSeeds.length),
        `${sessionSeed}:fallback`,
      ).map((name, index) => ({ name, score: Math.max(1, 4 - index) }));
      const seeds = [...personalizedSeeds, ...fallbackSeeds].slice(0, 3);

      // Cada semilla usa identidad exacta. Sus artistas relacionados aportan
      // descubrimiento real; sus propios temas solo completan una porción menor.
      const seedGroups = await Promise.all(seeds.map(async (seed) => {
        const [related, ownTracks] = await Promise.all([
          getRelatedArtists(seed.name, 4).catch(() => []),
          artistGetTopTracks({ artist: seed.name, limit: 6 }).catch(() => null),
        ]);
        return {
          seed,
          related: (related || []).slice(0, 4),
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
        relatedArtistMap.set(key, { name, affinity: seed.score, rank });
      }));

      const relatedArtists = pickRandomSample(
        [...relatedArtistMap.values()],
        6,
        `${sessionSeed}:related-artists`,
      );
      const relatedGroups = await Promise.all(relatedArtists.map(async (artist) => {
        const response = await artistGetTopTracks({ artist: artist.name, limit: 5 }).catch(() => null);
        return (response?.toptracks?.track || []).map((track, rank) => ({
          track: normalizeItem(track, 'track'),
          source: 'related',
          affinity: artist.affinity,
          rank: artist.rank + rank,
        }));
      }));

      const chartCandidates = (sectionsRef.current.trending || []).map((track, rank) => ({
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
      const qualityMode = getResolvedAudioQualityMode();
      const validationLimit = Math.min(4, getPrefetchLimitForQuality(qualityMode, 'discovery'));
      let rejectedRecommendationKeys = new Set();
      if (getSmartPrefetchPreference() && validationLimit > 0) {
        const tracksToValidate = rankedRecommendations.slice(0, validationLimit);
        const validationResults = await playbackPrefetchService.prefetchMany(tracksToValidate, {
          limit: validationLimit,
          concurrency: 3,
          qualityMode,
          signal: controller.signal,
        });
        if (controller.signal.aborted || reqIdRef.current !== requestId) return;
        rejectedRecommendationKeys = new Set(tracksToValidate
          .filter((_, index) => !validationResults[index]?.audioUrl)
          .map(makeTrackKey));
      }
      const recommendations = rankedRecommendations
        .filter((track) => !rejectedRecommendationKeys.has(makeTrackKey(track)))
        .slice(0, 18);
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
      setLoading((p) => ({ ...p, recommendations: false }));
    } catch (error) {
      console.warn('[Discover] No se pudieron completar las recomendaciones:', error?.message);
      if (!controller.signal.aborted) setLoading((p) => ({ ...p, recommendations: false }));
    }
  }, [makeController, sessionSeed, setSections, tasteProfile]);

  // Load Recommended Albums
  const loadRecommendedAlbums = useCallback(async (requestId) => {
    const controller = makeController("albums"); setLoading((p) => ({ ...p, albums: true }));
    try {
      const engagement = tasteEngagementSnapshotRef.current || {};
      const followedArtistNames = sessionSavedArtists.map(getDiscoveryArtistName).filter(Boolean);
      const likedArtistEntries = Object.entries(engagement.likedArtists || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
      const historyArtists = (listeningHistorySnapshotRef.current || []).slice(0, 20).map(h => getDiscoveryArtistName(h.artist)).filter(Boolean);
      const artistsToAvoid = new Set(Object.entries(engagement.skippedArtists || {}).filter(([, c]) => c >= 2).map(([a]) => a.toLowerCase()));
      const savedAlbumKeys = new Set(sessionSavedAlbums.map(a => `${getDiscoveryArtistName(a.artist).toLowerCase()}::${(a.name || a.title || '').toLowerCase()}`));

      const artistScores = new Map();
      const WEIGHTS = { followed: 5, liked: 3, taste: 2, history: 1 };
      followedArtistNames.forEach(a => artistScores.set(a, (artistScores.get(a) || 0) + WEIGHTS.followed));
      likedArtistEntries.forEach(a => artistScores.set(a, (artistScores.get(a) || 0) + WEIGHTS.liked));
      (tasteProfile.topArtists || []).forEach(a => artistScores.set(a, (artistScores.get(a) || 0) + WEIGHTS.taste));
      historyArtists.forEach(a => artistScores.set(a, (artistScores.get(a) || 0) + WEIGHTS.history));

      const rankedArtists = [...artistScores.entries()].filter(([n]) => !artistsToAvoid.has(n.toLowerCase())).sort((a, b) => b[1] - a[1]).map(([n]) => n);
      const coreCount = 3, exploreCount = 1;
      const rotatedCore = pickRandomSample(rankedArtists, rankedArtists.length, `${sessionSeed}:album-core`);
      const coreArtists = rotatedCore.slice(0, coreCount);
      const exploreArtists = pickRandomSample(FALLBACK_ARTISTS.filter(a => !coreArtists.some(c => c.toLowerCase() === a.toLowerCase()) && !artistsToAvoid.has(a.toLowerCase())), exploreCount, `albums-explore-${sessionSeed}`);
      const artistsToQuery = coreArtists.length >= 2 ? [...coreArtists, ...exploreArtists] : pickRandomSample(FALLBACK_ARTISTS, 4, `albums-fb-${sessionSeed}`);

      const albumGroups = await Promise.all(artistsToQuery.map(async (artistName) => { try { return ((await getArtistAlbums(artistName, 10)) || []).map(album => ({ ...album, artistQuery: artistName })); } catch { return []; } }));
      if (controller.signal.aborted || reqIdRef.current !== requestId) return;

      const seenAlbumKeys = new Set();
      const finalAlbums = albumGroups.flat()
        .filter(album => { if (!album.image) return false; const key = `${(album.artist || '').toLowerCase()}::${(album.name || '').toLowerCase()}`; if (savedAlbumKeys.has(key) || seenAlbumKeys.has(key)) return false; seenAlbumKeys.add(key); return true; })
        .sort((a, b) => { const typeOrder = { album: 0, ep: 1, single: 2 }; const tA = typeOrder[a.recordType] ?? 1, tB = typeOrder[b.recordType] ?? 1; if (tA !== tB) return tA - tB; return (b.releaseDate ? new Date(b.releaseDate).getTime() : 0) - (a.releaseDate ? new Date(a.releaseDate).getTime() : 0); });
      const selectedAlbums = pickRandomSample(finalAlbums, 12, `${sessionSeed}:albums`)
        .map(album => ({ id: album.id || `album-${album.name}-${album.artist}`, deezerId: album.deezerId || (/^\d+$/.test(String(album.id || '')) ? album.id : null), name: album.name, artist: album.artist || album.artistQuery, image: album.image, type: album.type || 'Álbum', recordType: album.recordType || 'album', releaseYear: album.releaseDate ? new Date(album.releaseDate).getFullYear() : null, trackCount: album.trackCount }));

      setSections((prev) => ({ ...prev, recommendedAlbums: selectedAlbums })); setLoading((p) => ({ ...p, albums: false }));
    } catch { if (!controller.signal.aborted) setLoading((p) => ({ ...p, albums: false })); }
  }, [makeController, sessionSavedArtists, sessionSavedAlbums, tasteProfile.topArtists, sessionSeed, setSections]);

  // Load Artist Spotlight
  // Load Artist Spotlight (Diverse User Favorites)
  const loadArtistSpotlight = useCallback(async (requestId) => {
    const controller = makeController("spotlight"); setLoading((p) => ({ ...p, spotlight: true }));
    try {
      // 1. Build Diverse Candidate Pool
      // Priorities: Favorites > Recent History > Fallback
      const favorites = sessionSavedArtists.map(getDiscoveryArtistName).filter(Boolean);

      const historyArtists = [];
      const seenHistory = new Set();
      (listeningHistorySnapshotRef.current || []).forEach(h => {
        if (h.artist && !seenHistory.has(h.artist)) {
          seenHistory.add(h.artist);
          historyArtists.push(h.artist);
        }
      });

      // Combine and Shuffle all unique artists the user likes
      let candidateArtists = [...new Set([...favorites, ...historyArtists])];

      // If user has few artists, mix in fallbacks but keep unique
      if (candidateArtists.length < 15) {
        candidateArtists = [...new Set([...candidateArtists, ...FALLBACK_ARTISTS])];
      }

      // 🎲 Shuffle completely to get different artists every time
      const shuffledArtists = pickRandomSample(candidateArtists, 6, `spotlight-mix-${sessionSeed}`);

      console.log(`[Feed] 🌟 Spotlight building mix from ${shuffledArtists.length} artists`);

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
  }, [makeController, sessionSavedArtists, setSections, sessionSeed]);

  // Revalidate All
  const revalidateAll = useCallback(async () => {
    const requestId = ++reqIdRef.current;
    ["critical", "forYou", "playlists", "party", "recommendations", "albums", "mood", "flashback", "global", "spotlight"].forEach(cancelKey);
    await Promise.allSettled([
      loadCritical(requestId),
      loadForYou(requestId),
      loadSmartRecommendations(requestId),
    ]);
    screenStateCache.set('feed', 'generationComplete', true);
    if (reqIdRef.current !== requestId) return;

    // El contenido secundario no compite con el primer Play ni con las imágenes
    // visibles. Se incorpora abajo, sin alterar la portada ya fijada.
    window.setTimeout(() => {
      Promise.allSettled([
        loadPlaylistsLazy(requestId),
        loadRecommendedAlbums(requestId),
      ]);
    }, 700);
    window.setTimeout(() => {
      loadArtistSpotlight(requestId);
    }, 2200);
  }, [cancelKey, loadCritical, loadForYou, loadPlaylistsLazy, loadSmartRecommendations, loadRecommendedAlbums, loadArtistSpotlight]);

  const generationStartedRef = useRef(wasRestoredFromMemoryRef.current);
  useEffect(() => {
    if (userLoading || generationStartedRef.current) return;
    generationStartedRef.current = true;
    screenStateCache.set('feed', 'generationStarted', true);
    revalidateAll();
  }, [userLoading, revalidateAll]);

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
      newReleases: sessionSavedArtists.length > 0 || tasteProfile.topArtists?.length > 0
        ? 'Nuevos lanzamientos de tus artistas favoritos'
        : 'Los lanzamientos más recientes',
      smartRecommendations: sections.recommendationMeta?.seedNames?.length
        ? `Artistas relacionados con ${sections.recommendationMeta.seedNames.slice(0, 2).join(' y ')} · ${sections.recommendationMeta.newArtistCount || 0} artistas por descubrir`
        : 'Canciones parecidas a tus gustos, sin repetir lo de siempre',
      recentlyPlayed: 'De tu historial reciente',
      topPlaylists: tasteProfile.topArtists?.length > 0 ? `Con artistas como ${tasteProfile.topArtists.slice(0, 2).join(' y ')}` : 'Playlists populares',
      partyPlaylists: 'Para tus momentos de fiesta', trending: 'Lo más escuchado ahora',
      recommendedAlbums: sessionSavedArtists.length > 0 ? 'De artistas que sigues' : 'Álbumes que te pueden gustar',
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
            <div className="feed-hero-date">{todayText}</div>
            <h1 className="feed-hero-title">Hola, {displayName}</h1>
            <p className="feed-hero-sub">{tasteProfile.sampleSize >= 5 ? "Tu música lista. Elige una y toca play." : "Empieza con una canción; aprenderemos de tus gustos."}</p>
          </div>
        </div>
        <HeroRow
          items={heroMix}
          onItemClick={handlePlay}
          onActiveItemChange={handleHeroScrollChange}
          playbackPrefetch={playbackPrefetch}
          isLoading={heroMix.length === 0}
        />
        {error && <div className="feed-error">{error}</div>}
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
          case 'newReleases': return <Row key={key} sectionKey="newReleases" title={title} subtitle={subtitle} items={sections.newReleases} onItemClick={handleNewReleasesClick} isLoading={loading.newReleases} playbackPrefetch={playbackPrefetch} />;
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
        <div className="feed-toast-container">
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
