// =============================================================================
// IMPORTS
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  chartGetTopTracks, chartGetTopPlaylists, artistGetTopTracks, getArtistAlbums,
  getRelatedArtists, playlistSearch, playlistGetInfo, getDeezerTrackImage,
} from "../../services/unifiedService";
import { useUser } from "../../context/userContext";
import { usePlayerActions, usePlayer } from "../../context/playerContext";
import screenStateCache, { useScrollPersistence } from "../../services/screenStateCache";
import { buildRadioQueue } from "../../services/radioService";
import { PRODUCT_EVENTS, recordProductEvent } from "../../services/productMetrics";
import "./feed.css";
import Card from "../../components/shared/Card";

// =============================================================================
// CONSTANTS & CONFIG
// =============================================================================
const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=60";
const PARTY_QUERIES = ["Reggaeton Party", "Latin Party", "Dance Hits", "Club Bangers", "Fiesta Latina"];
const FALLBACK_ARTISTS = ["Bad Bunny", "Taylor Swift", "The Weeknd", "Drake", "Dua Lipa", "Karol G", "Ed Sheeran", "Billie Eilish", "Post Malone", "Shakira"];
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_PREFIX = "feed_v4";

// Pre-compiled RegExp patterns for quality filtering
const BAD_TRACK_PATTERNS = ["cover", "karaoke", "instrumental", "tribute", "slowed", "reverb", "8d", "nightcore"]
  .map(word => new RegExp(`\\b${word}\\b`, "i"));

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Math & General Utils
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const safeJsonParse = (k, fallback) => { try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
const safeJsonWrite = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } };
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

  // Find best possible image URL
  let rawImage = DEFAULT_IMAGE;
  if (typeof item.image === "string" && item.image.startsWith("http")) rawImage = item.image;
  if (Array.isArray(item.image)) { const big = item.image.find((i) => i.size === "extralarge" || i.size === "large") || item.image[item.image.length - 1]; if (big?.["#text"]) rawImage = big["#text"]; }
  rawImage = item.picture_xl || item.cover_xl || item.picture_big || item.cover_big || item.album?.cover_xl || item.artist?.picture_xl || rawImage;

  // Create Optimized 250x250 Image for UI
  let imageOptimized = rawImage;
  if (typeof rawImage === 'string' && rawImage.includes('dzcdn.net')) {
    imageOptimized = rawImage
      .replace(/\/1000x1000/, '/250x250')
      .replace(/\/500x500/, '/250x250')
      .replace(/\/[\dx]+(-000000-80-0-0\.jpg)/, '/250x250$1');
  }

  // Create High-Res 1000x1000 Image for Player
  let imageXl = rawImage;
  if (typeof rawImage === 'string' && rawImage.includes('dzcdn.net')) {
    imageXl = rawImage
      .replace(/\/250x250/, '/1000x1000')
      .replace(/\/500x500/, '/1000x1000')
      .replace(/\/[\dx]+(-000000-80-0-0\.jpg)/, '/1000x1000$1');
  }

  return {
    id,
    type,
    name,
    artist,
    image: imageOptimized || DEFAULT_IMAGE, // For UI Lists (250x250)
    image_xl: imageXl || DEFAULT_IMAGE,     // For Player (1000x1000)
    duration: item.duration || 0,
    album: item.album?.title || item.album || (type === "track" ? "Single" : ""),
    trackCount: item.trackCount || item.nb_tracks || item.tracks?.length || 0
  };
};

// =============================================================================
// PROFILE BUILDERS
// =============================================================================

// Build user taste profile from favorites and playlists
const buildTasteProfile = ({ favorites, playlists, user, refreshNonce }) => {
  const pool = [...(favorites || []), ...(playlists || []).flatMap((p) => p?.tracks || [])]
    .map((t) => ({ ...t, name: toTrackName(t), artist: toArtistName(t.artist) }))
    .filter((t) => t.name && t.artist);
  const uniquePool = uniqByKey(pool, makeTrackKey);
  const sample = pickRandomSample(uniquePool, 20, `${user?.uid || "guest"}::${uniquePool.length}::${refreshNonce}`);

  const artistScore = new Map();
  const now = Date.now();
  for (const t of sample) {
    const artist = toArtistName(t.artist); if (!artist) continue;
    const age = t.addedAt ? now - t.addedAt : 0;
    const recencyBoost = t.addedAt ? clamp(1.15 - age / (30 * 24 * 60 * 60 * 1000), 0.85, 1.15) : 1.0;
    artistScore.set(artist, (artistScore.get(artist) || 0) + recencyBoost);
  }

  const topArtists = Array.from(artistScore.entries()).sort((a, b) => b[1] - a[1]).map(([name]) => name).slice(0, 3);
  return { topArtists, signature: sample.slice(0, 20).map(makeTrackKey).sort().join("|"), sampleSize: sample.length };
};

// Apply sections rotation based on priority
const applySectionsRotation = ({ sections }) => {
  const allSections = [
    { key: 'newReleases', title: 'Nuevos lanzamientos', priority: 10 },

    { key: 'smartRecommendations', title: 'Recomendadas para ti', priority: 9 },
    { key: 'artistSpotlight', title: 'Spotlight de tus artistas favoritos', priority: 8.5 },
    { key: 'recentlyPlayed', title: 'Recién escuchadas', priority: 8 },
    { key: 'flashback', title: 'Cápsula del Tiempo', priority: 7.5 },

    { key: 'topPlaylists', title: 'Playlists populares', priority: 6 },
    { key: 'trending', title: 'Tendencias', priority: 5 },
    { key: 'global', title: 'Tendencias Globales', priority: 4.5 },
    { key: 'recommendedAlbums', title: 'Álbumes que te pueden gustar', priority: 4 },
    { key: 'partyPlaylists', title: 'Modo fiesta', priority: 3 },
  ];
  return allSections.filter(s => { const c = sections[s.key]; return c && (Array.isArray(c) ? c.length > 0 : true); }).sort((a, b) => b.priority - a.priority);
};

// =============================================================================
// ROW & CARD COMPONENTS
// =============================================================================

// Generic Row Component
const Row = memo(({ title, subtitle, items, onItemClick, variant = 'default', sectionKey = '', isLoading }) => {
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
        <div className={variant === 'album' ? 'feed-album-loading' : variant === 'recommended' ? 'feed-recommended-loading' : 'feed-loading-inline'}>
          {variant === 'album' || variant === 'recommended' ? <><div className="feed-spinner-small" /><span>Buscando...</span></> : 'Cargando...'}
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
          />
        ))}
      </div>
    </section>
  );
}, (prev, next) => prev.title === next.title && prev.isLoading === next.isLoading && (prev.items || []).length === (next.items || []).length && (prev.items || []).every((it, i) => it?.id === next.items?.[i]?.id));

// HeroCard - Single large card
const HeroCard = memo(({ item, onPlay }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const navigate = useNavigate();

  const handleClick = useCallback(() => {
    if (item.type === 'album') {
      navigate(`/album/${encodeURIComponent(item.artist)}/${encodeURIComponent(item.name)}`);
    } else if (item.type === 'playlist') {
      navigate(`/playlist/${item.id}`, { state: { playlist: item } });
    } else if (item.type === 'artist') {
      navigate(`/artist/${encodeURIComponent(item.name)}`);
    } else {
      onPlay(item);
    }
  }, [item, navigate, onPlay]);

  if (!item) return null;

  const typeLabel = item.type === 'album' ? 'Álbum' : item.type === 'playlist' ? 'Playlist' : item.type === 'artist' ? 'Artista' : null;

  return (
    <button
      type="button"
      className="feed-hero-card"
      onClick={handleClick}
      title={`${item.type === 'track' ? 'Reproducir' : 'Ver'} ${item.name} - ${item.artist}`}
    >
      <div className="feed-hero-img-wrapper">
        {!imageLoaded && !imageFailed && <div className="feed-hero-img-skeleton" />}
        {imageFailed && <div className="feed-hero-img-fallback"><svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg></div>}
        <img
          className={['feed-hero-img', imageLoaded && 'is-loaded'].filter(Boolean).join(' ')}
          src={item.image || DEFAULT_IMAGE}
          alt={item.name}
          onLoad={() => { setImageLoaded(true); setImageFailed(false); }}
          onError={() => { setImageLoaded(true); setImageFailed(true); }}
          loading="lazy"
        />
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
const HeroRow = memo(({ items, onItemClick, isLoading, onActiveItemChange }) => {
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
        <HeroCard key={item.id || `hero-${index}-${item.name}`} item={item} onPlay={onItemClick} />
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
  const { playTrack, addToQueue } = usePlayerActions();
  const playerState = usePlayer();
  const { user, favorites, playlists, savedArtists, savedAlbums, loading: userLoading } = useUser();
  const artistRadioRequestRef = useRef(0);

  const listeningHistorySnapshotRef = useRef(playerState.listeningHistory || []);
  const tasteEngagementSnapshotRef = useRef(playerState.tasteEngagement || { likedArtists: {}, skippedArtists: {} });

  const [recentlyPlayed, setRecentlyPlayed] = useState(() => buildRecentlyPlayed(listeningHistorySnapshotRef.current));

  useEffect(() => {
    listeningHistorySnapshotRef.current = playerState.listeningHistory || [];
    tasteEngagementSnapshotRef.current = playerState.tasteEngagement || { likedArtists: {}, skippedArtists: {} };
    setRecentlyPlayed(buildRecentlyPlayed(listeningHistorySnapshotRef.current));
  }, [playerState.listeningHistory, playerState.tasteEngagement]);

  const feedContainerRef = useRef(null);
  useScrollPersistence('feed', feedContainerRef);
  const wasRestoredFromMemoryRef = useRef(false);

  const [criticalReady, setCriticalReady] = useState(() => { const cached = screenStateCache.get('feed', 'criticalReady'); if (cached !== undefined) { wasRestoredFromMemoryRef.current = true; return cached; } return false; });
  const [error, setError] = useState(null);
  const [hero, setHeroInternal] = useState(() => screenStateCache.get('feed', 'hero') || null);
  const setHero = useCallback((h) => { setHeroInternal(h); screenStateCache.set('feed', 'hero', h); }, []);

  const [sections, setSectionsInternal] = useState(() => screenStateCache.get('feed', 'sections') || { trending: [], newReleases: [], forYouTracks: [], partyPlaylists: [], topPlaylists: [], artistsYouLike: [], smartRecommendations: [], recommendedAlbums: [], moodMixes: [], flashback: [], artistSpotlight: [], global: [], heroMix: [] });
  const sectionsRef = useRef(sections);
  useEffect(() => { sectionsRef.current = sections; }, [sections]);
  const setSections = useCallback((u) => setSectionsInternal(p => { const v = typeof u === 'function' ? u(p) : u; screenStateCache.set('feed', 'sections', v); return v; }), []);

  useEffect(() => {
    // Retirar datos que pudieron quedar guardados por el antiguo generador automático.
    try {
      const migrationKey = 'paradox_removed_automatic_mixes_v1';
      if (localStorage.getItem(migrationKey) !== 'true') {
        Object.keys(localStorage)
          .filter((key) => key.startsWith('feed_gen_cache_') || key.startsWith(`${CACHE_PREFIX}:`))
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

  const [loading, setLoading] = useState(() => wasRestoredFromMemoryRef.current ? { critical: false, forYou: false, playlists: false, party: false, recommendations: false, albums: false, mood: false, flashback: false, global: false, spotlight: false } : { critical: true, forYou: true, playlists: true, party: true, recommendations: true, albums: true, mood: true, flashback: true, global: true, spotlight: true });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [forYouTitle, setForYouTitle] = useState("Para ti");
  const [todayText, setTodayText] = useState("");
  // Estado para controlar la rotación de "Mi Radio" cada 3 horas automáticamente
  const [radioRotationBlock, setRadioRotationBlock] = useState(() => Math.floor(Date.now() / (3 * 60 * 60 * 1000)));

  useEffect(() => {
    const timer = setInterval(() => {
      const current = Math.floor(Date.now() / (3 * 60 * 60 * 1000));
      setRadioRotationBlock(prev => prev !== current ? current : prev);
    }, 60000); // Chequear cada minuto
    return () => clearInterval(timer);
  }, []);

  // Toast Notification State (enhanced with image)
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
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

  const abortRef = useRef({});
  const reqIdRef = useRef(0);
  const cancelKey = useCallback((key) => { const c = abortRef.current[key]; if (c) { try { c.abort(); } catch { } delete abortRef.current[key]; } }, []);
  const makeController = useCallback((key) => { cancelKey(key); const c = new AbortController(); abortRef.current[key] = c; return c; }, [cancelKey]);

  useEffect(() => { const ref = abortRef.current; return () => Object.keys(ref).forEach((k) => { try { ref[k]?.abort(); } catch { } }); }, []);

  const tasteProfile = useMemo(() => buildTasteProfile({ favorites, playlists, user, refreshNonce }), [favorites, playlists, user, refreshNonce]);

  const timeOfDay = useMemo(() => { const h = new Date().getHours(); return h < 6 ? 'dawn' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'night'; }, []);

  const cacheKey = useMemo(() => `${CACHE_PREFIX}:${user?.uid || "guest"}:${tasteProfile.signature || "nosig"}:${refreshNonce}`, [user, tasteProfile.signature, refreshNonce]);
  useEffect(() => { setTodayText(new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })); }, []);

  // HeroMix: descubrimiento, novedades y elementos elegidos por el usuario.
  const heroMix = useMemo(() => {
    // === 1. NUEVOS DESCUBRIMIENTOS (Basados en gustos recientes) ===
    // Usamos las recomendaciones inteligentes pero priorizamos las mejores
    // NOTA: Estas canciones se mostrarán AQUÍ en el Hero y NO deben repetirse abajo
    const newDiscoveries = (sections.smartRecommendations || [])
      .slice(0, 5) // Tomamos las 5 mejores predicciones para el Hero
      .filter(t => t.image && t.image !== DEFAULT_IMAGE)
      .map(t => ({ ...t, _source: 'discovery' })); // Marcamos para posible UI distinctiva

    // === 2. NUEVOS LANZAMIENTOS (De artistas favoritos) ===
    const likedArtistNames = new Set([
      ...(savedArtists || []).map(a => a.name?.toLowerCase()),
      ...(tasteProfile.topArtists || []).map(a => a?.toLowerCase()),
    ].filter(Boolean));

    const relevantNewReleases = (sections.newReleases || [])
      .filter(t => {
        const artistName = (t.artist || '').toLowerCase();
        return likedArtistNames.has(artistName) ||
          [...likedArtistNames].some(liked => artistName.includes(liked) || liked.includes(artistName));
      })
      .filter(t => t.image && t.image !== DEFAULT_IMAGE)
      .slice(0, 4);

    // === 3. DE TU LIBRERÍA (Recordatorios de lo que amas) ===
    const libraryFavorites = [
      ...(favorites || []).slice(0, 10), // Pool más grande de favoritos
      ...(savedAlbums || []).slice(0, 5).map(a => ({ ...a, type: 'album' })),
      ...(savedArtists || []).slice(0, 5).map(a => ({ ...a, type: 'artist', artist: a.name }))
    ];

    // Seleccionamos aleatoriamente 4 items de la librería para mantenerlo fresco
    const selectedLibraryItems = pickRandomSample(
      libraryFavorites.filter(i => i.image && i.image !== DEFAULT_IMAGE),
      4,
      `lib-hero-${refreshNonce}`
    ).map(item => normalizeItem(item, item.type || 'track'));

    const shuffledContent = pickRandomSample(
      [...newDiscoveries, ...relevantNewReleases, ...selectedLibraryItems],
      15, // Traemos bastantes items
      `heroMix-content-${refreshNonce}`
    );

    return shuffledContent.slice(0, 15);
  }, [favorites, savedArtists, savedAlbums, sections, tasteProfile.topArtists, refreshNonce]);

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
    if (item.type === "artist") { navigate(`/artist/${encodeURIComponent(item.artist || item.name)}`); return; }
    if (item.type === "album") { navigate(`/album/${encodeURIComponent(item.artist)}/${encodeURIComponent(item.name)}`); return; }

    // Si ya viene con una cola, usarla directamente
    if (contextQueue?.length > 1) {
      console.log('[handlePlay] Using provided contextQueue, skipping radio');
      playTrack(item, contextQueue);
      return;
    }

    // =========================================================================
    // 🚀 OPTIMIZACIÓN: Reproducir INMEDIATAMENTE, radio en segundo plano
    // =========================================================================
    console.log('[handlePlay] 🚀 Playing track IMMEDIATELY, radio will build in background...');

    // 1️⃣ REPRODUCIR INMEDIATAMENTE (sin esperar la radio)
    // ⭐ USA LA IMAGEN XL PARA EL REPRODUCTOR
    const trackToPlay = { ...item, image: item.image_xl || item.image };
    playTrack(trackToPlay, [trackToPlay]);
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
          tracksToAdd.forEach(track => {
            addToQueue({ ...track, image: track.image_xl || track.image });
          });

          console.log(`[handlePlay] ✅ Radio complete! ${tracksToAdd.length} tracks added to queue`);
        } else {
          console.log('[handlePlay] No additional tracks to add from radio');
        }
      } catch (err) {
        console.warn('[handlePlay] Background radio generation failed:', err?.message);
      }
    }, 1000); // Esperar 1 segundo después de que la canción comience

  }, [navigate, playTrack, addToQueue, buildInstantRadio]);

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
    playTrack(trackToPlay, [trackToPlay]);
    showToast(`Reproduciendo ${artist.name}. Completando la radio...`, artist.image, true);

    try {
      const additionalTracks = await buildRadioQueue({
        seedTrack: trackToPlay,
        contextTracks: sectionsRef.current.smartRecommendations || [],
        existingQueue: [trackToPlay],
        targetSize: 31,
        includeSeed: false,
      });

      if (requestId !== artistRadioRequestRef.current) return;

      additionalTracks.forEach((track) => {
        addToQueue({ ...track, image: track.image_xl || track.image }, true);
      });

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
  }, [playTrack, addToQueue, showToast]);

  const applyCacheIfValid = useCallback(() => {
    const cached = safeJsonParse(cacheKey, null);
    if (!cached?.timestamp || !cached?.data || Date.now() - cached.timestamp > CACHE_TTL_MS) return false;
    const { hero: h, sections: s, forYouTitle: t, refreshNonce: n } = cached.data;
    if (h) setHero(h); if (s) setSections(s); if (t) setForYouTitle(t); if (n && n > refreshNonce) setRefreshNonce(n);
    setLoading((p) => ({ ...p, critical: false, forYou: false, playlists: false, party: false }));
    setCriticalReady(true); screenStateCache.set('feed', 'criticalReady', true); setError(null);
    return true;
  }, [cacheKey, setHero, setSections, refreshNonce]);

  const saveCache = useCallback((data) => safeJsonWrite(cacheKey, { timestamp: Date.now(), data }), [cacheKey]);

  // =========================================================================
  // LOADERS
  // =========================================================================

  const loadCritical = useCallback(async (requestId) => {
    const controller = makeController("critical");
    setLoading((p) => ({ ...p, critical: true })); setError(null);
    try {
      // === NUEVOS LANZAMIENTOS PERSONALIZADOS ===
      // Intentar recuperar artistas de varias fuentes para asegurar personalización
      let finalUserArtists = [];

      if (savedArtists?.length > 0) {
        finalUserArtists = savedArtists.map(a => a.name);
      } else if (favorites?.length > 0) {
        // Si no hay artistas guardados, sacar de favoritos
        const unique = new Set(favorites.map(f => typeof f.artist === 'object' ? (f.artist.name || f.artist) : f.artist));
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

      const [charts, personalizedNewReleases] = await Promise.all([
        chartGetTopTracks({ limit: 14 }),
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
            Math.min(userArtists.length, 20), // Aumentado de 10 a 20
            `newReleases-${refreshNonce}`
          );

          // Buscar álbumes realmente nuevos del año actual
          const currentYear = new Date().getFullYear();

          const albumPromises = selectedArtists.map(async (artistName) => {
            try {
              console.log(`[NewReleases] 🔍 Searching ${artistName} + 3 related artists...`);

              // Paso 1: Buscar artista favorito Y artistas relacionados EN PARALELO
              const [albums, topTracks, relatedArtists] = await Promise.all([
                getArtistAlbums(artistName, 15),
                artistGetTopTracks({ artist: artistName, limit: 50 }),
                getRelatedArtists(artistName, 8) // Buscar relacionados desde el inicio
              ]);

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
            const finalResults = pickRandomSample(uniqueAlbums, Math.min(uniqueAlbums.length, 10), `shuffle-newReleases-${refreshNonce}`);
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

      const trending = filterQualityTracks(uniqByKey((charts?.tracks?.track || []).map((t) => normalizeItem(t, "track")), makeTrackKey)).filter((t) => t.image && t.image !== DEFAULT_IMAGE);

      // Usar ref para evitar dependencia circular
      const currentSections = sectionsRef.current;
      let heroCandidate = null, heroSource = 'trending';

      if (currentSections.smartRecommendations?.length > 0) {
        heroCandidate = currentSections.smartRecommendations[refreshNonce % Math.min(currentSections.smartRecommendations.length, 3)];
        heroSource = 'smartRecommendations';
      }
      else if (currentSections.forYouTracks?.length > 0) {
        heroCandidate = currentSections.forYouTracks[refreshNonce % Math.min(currentSections.forYouTracks.length, 3)];
        heroSource = 'forYou';
      }
      else if (trending.length > 0) {
        heroCandidate = trending[refreshNonce > 0 && trending.length > 3 ? refreshNonce % 3 : 0];
        heroSource = 'trending';
      }

      console.log(`[NewReleases] 🚨 FINAL RESULT: ${personalizedNewReleases?.length || 0} items to display`, personalizedNewReleases);
      setSections((p) => ({ ...p, trending: trending.slice(1, 7), newReleases: personalizedNewReleases }));
      if (heroCandidate) {
        setHero({ ...heroCandidate, heroSource });
        getDeezerTrackImage(heroCandidate.name, heroCandidate.artist).then((hd) => { if (hd && reqIdRef.current === requestId) setHero((prev) => prev ? { ...prev, image: hd } : prev); }).catch(() => { });
      }
      setLoading((p) => ({ ...p, critical: false })); setCriticalReady(true);
    } catch (e) { if (!controller.signal.aborted) { setLoading((p) => ({ ...p, critical: false })); setCriticalReady(true); setError("No se pudo cargar el inicio. Revisa tu conexión."); } }
  }, [makeController, refreshNonce, setHero, setSections, savedArtists, tasteProfile.topArtists, favorites, user?.uid]);

  // Load ForYou
  // Load ForYou
  const loadForYou = useCallback(async (requestId) => {
    const controller = makeController("forYou");
    setLoading((p) => ({ ...p, forYou: true, playlists: true })); // Activamos loading de playlists también
    try {
      if (!user) {
        // Fallback para usuarios sin sesión real
        throw new Error("No user for personalized feed");
      }

      // === GENERACIÓN DE TRACKS (Para completar la sección) ===
      const topArtists = tasteProfile.topArtists?.length ? tasteProfile.topArtists : [FALLBACK_ARTISTS[Math.floor(Math.random() * FALLBACK_ARTISTS.length)]];
      const primary = topArtists[0];
      setForYouTitle(tasteProfile.sampleSize >= 5 ? `Porque tu vibra va por ${primary}` : `Para empezar el día`);

      const artistTracksRes = await artistGetTopTracks({ artist: primary, limit: 12 });
      const tracks = filterQualityTracks((artistTracksRes?.toptracks?.track || []).map((t) => normalizeItem(t, "track")))
        .filter((t) => t.image && t.image !== DEFAULT_IMAGE)
        .slice(0, 10);

      const artistsYouLike = topArtists.slice(0, 6).map((a) => normalizeItem({ id: `artist-${a}`, name: a, artist: a }, "artist"));

      if (controller.signal.aborted || reqIdRef.current !== requestId) return;

      setSections((prev) => ({
        ...prev,
        moodMixes: (prev.moodMixes || []).filter((item) => !String(item?.id || '').startsWith('feed-')),
        forYouTracks: tracks,
        artistsYouLike
      }));

    } catch (e) {
      // Fallback silencioso
    } finally {
      if (!controller.signal.aborted) setLoading((p) => ({ ...p, forYou: false, playlists: false }));
    }
  }, [makeController, tasteProfile, user, setSections]);

  // Load Playlists
  const loadPlaylistsLazy = useCallback(async (requestId) => {
    const controller = makeController("playlists"); setLoading((p) => ({ ...p, playlists: true }));
    try {
      const r = await chartGetTopPlaylists({ limit: 12 });
      const top = uniqByKey((r?.playlists?.playlist || []).map((p) => normalizeItem(p, "playlist")), (p) => `${p.id}`).filter((p) => p.image && p.image !== DEFAULT_IMAGE).slice(0, 10);
      if (!controller.signal.aborted && reqIdRef.current === requestId) { setSections((prev) => ({ ...prev, topPlaylists: top })); setLoading((p) => ({ ...p, playlists: false })); }
    } catch { if (!controller.signal.aborted) setLoading((p) => ({ ...p, playlists: false })); }
  }, [makeController, setSections]);

  // Load Party
  const loadPartyLazy = useCallback(async (requestId) => {
    const controller = makeController("party"); setLoading((p) => ({ ...p, party: true }));
    try {
      const chosen = pickRandomSample(PARTY_QUERIES, 3, tasteProfile.signature || "party");
      const results = await Promise.all(chosen.map(async (q) => { try { const r = await playlistSearch({ query: q, limit: 6 }); return (r?.results?.playlistmatches?.playlist || []).map((p) => normalizeItem(p, "playlist")); } catch { return []; } }));
      if (!controller.signal.aborted && reqIdRef.current === requestId) { setSections((prev) => ({ ...prev, partyPlaylists: uniqByKey(results.flat(), (p) => `${p.id}`).filter((p) => p.image && p.image !== DEFAULT_IMAGE).slice(0, 10) })); setLoading((p) => ({ ...p, party: false })); }
    } catch { if (!controller.signal.aborted) setLoading((p) => ({ ...p, party: false })); }
  }, [makeController, tasteProfile.signature, setSections]);

  // Load Smart Recommendations
  const loadSmartRecommendations = useCallback(async (requestId) => {
    // FORCE REFRESH: Removed the check that skips if data exists
    const controller = makeController("recommendations");
    setLoading((p) => ({ ...p, recommendations: true }));
    try {
      const engagement = tasteEngagementSnapshotRef.current || {};

      // 1. Gather Seeds (Prioritize favorites and recent history)
      const liked = Object.entries(engagement.likedArtists || {}).sort((a, b) => b[1] - a[1]).map(([a]) => a);
      const favArtists = [...new Set((favorites || []).map(t => t.artist).filter(Boolean))].reverse().slice(0, 15);
      const historyArtists = (tasteProfile.topArtists || []).slice(0, 10);

      const artistsToAvoid = new Set(Object.entries(engagement.skippedArtists || {}).filter(([, c]) => c >= 2).map(([a]) => a.toLowerCase().trim()));

      let uniqueSeeds = [...new Set([...liked, ...favArtists, ...historyArtists])]
        .filter(a => !artistsToAvoid.has(a.toLowerCase().trim()));

      // Fallback seeds if user has no data
      if (uniqueSeeds.length < 3) {
        const defaults = pickRandomSample(FALLBACK_ARTISTS, 5, `fallback-seeds-${Date.now()}`);
        uniqueSeeds = [...new Set([...uniqueSeeds, ...defaults])];
      }

      // Take top 8 seeds to generate mix
      const selectedSeeds = uniqueSeeds.slice(0, 8);

      const discoveryGroups = await Promise.all(selectedSeeds.map(async (seedArtist) => {
        try {
          const queries = [`${seedArtist} Mix`, `${seedArtist} Radio`, `Similar to ${seedArtist}`];
          const randomQuery = queries[Math.floor(Math.random() * queries.length)];
          const search = await playlistSearch({ query: randomQuery, limit: 4 });

          // Get tracks from a playlist
          let normalizedTracks = [];
          const playlists = (search?.results?.playlistmatches?.playlist || []).filter(p => p.nb_tracks > 8);

          if (playlists.length > 0) {
            const target = playlists[0];
            const info = await playlistGetInfo({ id: target.id });
            normalizedTracks = (info?.tracks || []).map(t => normalizeItem(t, "track"));
          } else {
            // Fallback to top tracks
            const r = await artistGetTopTracks({ artist: seedArtist, limit: 10 });
            normalizedTracks = (r?.toptracks?.track || []).map(t => normalizeItem(t, "track"));
          }

          return normalizedTracks.filter(t => t && t.artist && t.name && !artistsToAvoid.has(t.artist.toLowerCase()));
        } catch { return []; }
      }));

      if (controller.signal.aborted || reqIdRef.current !== requestId) return;

      // Unir todos los grupos
      let allCandidates = discoveryGroups.flat();

      // Mezclar para variedad - Usamos Date.now() para aleatoriedad total
      allCandidates = pickRandomSample(allCandidates, allCandidates.length, `rec-shuffle-${Date.now()}`);

      const finalTracks = [];
      const seenArtists = new Map(); // artist -> count
      const seenTrackKeys = new Set();

      // Pass 1: Strict Uniqueness (1 per artist)
      for (const t of allCandidates) {
        if (finalTracks.length >= 27) break;
        const artistKey = t.artist.toLowerCase().trim();
        const trackKey = `${artistKey}-${t.name.toLowerCase().trim()}`;

        if (seenTrackKeys.has(trackKey)) continue;

        if (!seenArtists.has(artistKey)) {
          seenArtists.set(artistKey, 1);
          seenTrackKeys.add(trackKey);
          finalTracks.push(t);
        }
      }

      // Pass 2: Relaxed (allow up to 2 per artist if we need more)
      if (finalTracks.length < 27) {
        for (const t of allCandidates) {
          if (finalTracks.length >= 27) break;
          const artistKey = t.artist.toLowerCase().trim();
          const trackKey = `${artistKey}-${t.name.toLowerCase().trim()}`;

          if (seenTrackKeys.has(trackKey)) continue;

          const count = seenArtists.get(artistKey) || 0;
          if (count < 2) {
            seenArtists.set(artistKey, count + 1);
            seenTrackKeys.add(trackKey);
            finalTracks.push(t);
          }
        }
      }

      // Pass 3: Fill with anything valid if still short
      if (finalTracks.length < 27) {
        for (const t of allCandidates) {
          if (finalTracks.length >= 27) break;
          const trackKey = `${t.artist.toLowerCase()}-${t.name.toLowerCase()}`;
          if (!seenTrackKeys.has(trackKey)) {
            seenTrackKeys.add(trackKey);
            finalTracks.push(t);
          }
        }
      }

      // Filter quality and slice
      const recommendations = filterQualityTracks(finalTracks)
        .filter((t) => t.image && t.image !== DEFAULT_IMAGE)
        .slice(0, 27);

      setSections((prev) => ({ ...prev, smartRecommendations: recommendations }));
      setLoading((p) => ({ ...p, recommendations: false }));
    } catch { if (!controller.signal.aborted) setLoading((p) => ({ ...p, recommendations: false })); }
  }, [makeController, tasteProfile.topArtists, favorites, setSections]);

  // Load Recommended Albums
  const loadRecommendedAlbums = useCallback(async (requestId) => {
    const controller = makeController("albums"); setLoading((p) => ({ ...p, albums: true }));
    try {
      const engagement = tasteEngagementSnapshotRef.current || {};
      const followedArtistNames = (savedArtists || []).map(a => a.name).filter(Boolean);
      const likedArtistEntries = Object.entries(engagement.likedArtists || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n]) => n);
      const historyArtists = (listeningHistorySnapshotRef.current || []).slice(0, 20).map(h => h.artist).filter(Boolean);
      const artistsToAvoid = new Set(Object.entries(engagement.skippedArtists || {}).filter(([, c]) => c >= 2).map(([a]) => a.toLowerCase()));
      const savedAlbumKeys = new Set((savedAlbums || []).map(a => `${(a.artist || '').toLowerCase()}::${(a.name || '').toLowerCase()}`));

      const artistScores = new Map();
      const WEIGHTS = { followed: 5, liked: 3, taste: 2, history: 1 };
      followedArtistNames.forEach(a => artistScores.set(a, (artistScores.get(a) || 0) + WEIGHTS.followed));
      likedArtistEntries.forEach(a => artistScores.set(a, (artistScores.get(a) || 0) + WEIGHTS.liked));
      (tasteProfile.topArtists || []).forEach(a => artistScores.set(a, (artistScores.get(a) || 0) + WEIGHTS.taste));
      historyArtists.forEach(a => artistScores.set(a, (artistScores.get(a) || 0) + WEIGHTS.history));

      const rankedArtists = [...artistScores.entries()].filter(([n]) => !artistsToAvoid.has(n.toLowerCase())).sort((a, b) => b[1] - a[1]).map(([n]) => n);
      const coreCount = Math.ceil(8 * 0.7), exploreCount = 8 - coreCount;
      const rotatedCore = [...rankedArtists]; if (refreshNonce > 0 && rotatedCore.length > coreCount) { const shift = refreshNonce % Math.min(rotatedCore.length, 5); rotatedCore.push(...rotatedCore.splice(0, shift)); }
      const coreArtists = rotatedCore.slice(0, coreCount);
      const exploreArtists = pickRandomSample(FALLBACK_ARTISTS.filter(a => !coreArtists.some(c => c.toLowerCase() === a.toLowerCase()) && !artistsToAvoid.has(a.toLowerCase())), exploreCount, `albums-explore-${refreshNonce}`);
      const artistsToQuery = coreArtists.length >= 2 ? [...coreArtists, ...exploreArtists] : pickRandomSample(FALLBACK_ARTISTS, 8, `albums-fb-${refreshNonce}`);

      const albumGroups = await Promise.all(artistsToQuery.map(async (artistName) => { try { return ((await getArtistAlbums(artistName, 10)) || []).map(album => ({ ...album, artistQuery: artistName })); } catch { return []; } }));
      if (controller.signal.aborted || reqIdRef.current !== requestId) return;

      const seenAlbumKeys = new Set();
      const finalAlbums = albumGroups.flat()
        .filter(album => { if (!album.image) return false; const key = `${(album.artist || '').toLowerCase()}::${(album.name || '').toLowerCase()}`; if (savedAlbumKeys.has(key) || seenAlbumKeys.has(key)) return false; seenAlbumKeys.add(key); return true; })
        .sort((a, b) => { const typeOrder = { album: 0, ep: 1, single: 2 }; const tA = typeOrder[a.recordType] ?? 1, tB = typeOrder[b.recordType] ?? 1; if (tA !== tB) return tA - tB; return (b.releaseDate ? new Date(b.releaseDate).getTime() : 0) - (a.releaseDate ? new Date(a.releaseDate).getTime() : 0); })
        .sort((a, b) => (((a.name || '').charCodeAt(0) + (a.artist || '').charCodeAt(0) + refreshNonce) % 17) - (((b.name || '').charCodeAt(0) + (b.artist || '').charCodeAt(0) + refreshNonce) % 17))
        .slice(0, 12).map(album => ({ id: album.id || `album-${album.name}-${album.artist}`, name: album.name, artist: album.artist || album.artistQuery, image: album.image, type: album.type || 'Álbum', recordType: album.recordType || 'album', releaseYear: album.releaseDate ? new Date(album.releaseDate).getFullYear() : null, trackCount: album.trackCount }));

      setSections((prev) => ({ ...prev, recommendedAlbums: finalAlbums })); setLoading((p) => ({ ...p, albums: false }));
    } catch { if (!controller.signal.aborted) setLoading((p) => ({ ...p, albums: false })); }
  }, [makeController, savedArtists, savedAlbums, tasteProfile.topArtists, refreshNonce, setSections]);

  // Load Mood Mixes (Personalized)
  const loadMoodMixes = useCallback(async (requestId) => {
    const controller = makeController("mood"); setLoading((p) => ({ ...p, mood: true }));
    try {
      const topArtists = tasteProfile.topArtists || [];
      // Si tenemos artistas favoritos, usarlos para personalizar el mood
      const usePersonalized = topArtists.length > 0;

      const moodKeywords = {
        dawn: ['Chill', 'Acoustic', 'Coffee', 'Sunrise', 'Quiet'],
        morning: ['Energy', 'Workout', 'Happy', 'Booster', 'Good Vibes'],
        afternoon: ['Focus', 'Work', 'Lounge', 'Study', 'Sunny'],
        evening: ['Dinner', 'Jazz', 'Acoustic', 'Relax', 'Cooking'],
        night: ['Vibes', 'Sleep', 'Deep', 'Midnight', 'Chill']
      };

      const timeKeywords = moodKeywords[timeOfDay] || moodKeywords['morning'];
      let queries = [];

      if (usePersonalized) {
        // Combinar artistas top con keywords del momento
        // Ej: "The Weeknd Chill", "Bad Bunny Party", "Arctic Monkeys Energy"
        const artist = topArtists[refreshNonce % Math.min(topArtists.length, 5)];
        const artist2 = topArtists[(refreshNonce + 1) % Math.min(topArtists.length, 5)];

        queries = [
          `${artist} ${timeKeywords[0]}`,
          `${artist2} ${timeKeywords[1] || timeKeywords[0]}`,
          `${artist} ${timeOfDay === 'night' ? 'Night' : 'Mix'}`,
          `${artist2} Vibes`
        ];
      } else {
        // Fallback genérico mejorado
        queries = timeKeywords.map(k => `${k} Mix`);
      }

      const chosen = pickRandomSample(queries, 3, `${timeOfDay}-${refreshNonce}`);
      const results = await Promise.all(chosen.map(async (q) => { try { const r = await playlistSearch({ query: q, limit: 4 }); return (r?.results?.playlistmatches?.playlist || []).map((p) => normalizeItem(p, "playlist")); } catch { return []; } }));

      if (!controller.signal.aborted && reqIdRef.current === requestId) {
        setSections((prev) => ({ ...prev, moodMixes: uniqByKey(results.flat(), (p) => `${p.id}`).filter((p) => p.image && p.image !== DEFAULT_IMAGE).slice(0, 8) }));
        setLoading((p) => ({ ...p, mood: false }));
      }
    } catch { if (!controller.signal.aborted) setLoading((p) => ({ ...p, mood: false })); }
  }, [makeController, timeOfDay, refreshNonce, setSections, tasteProfile.topArtists]);

  // Load Flashback
  const loadFlashback = useCallback(async (requestId) => {
    const controller = makeController("flashback"); setLoading((p) => ({ ...p, flashback: true }));
    try {
      const eras = ['80s Hits', '90s Rock', '2000s Pop', 'Oldies but Goldies', 'Classic Rock', 'Disco Fever'];
      const era = eras[refreshNonce % eras.length];
      const r = await playlistSearch({ query: era, limit: 12 });
      const top = uniqByKey((r?.results?.playlistmatches?.playlist || []).map((p) => normalizeItem(p, "playlist")), (p) => `${p.id}`).filter((p) => p.image && p.image !== DEFAULT_IMAGE).slice(0, 8);
      if (!controller.signal.aborted && reqIdRef.current === requestId) { setSections((prev) => ({ ...prev, flashback: top })); setLoading((p) => ({ ...p, flashback: false })); }
    } catch { if (!controller.signal.aborted) setLoading((p) => ({ ...p, flashback: false })); }
  }, [makeController, refreshNonce, setSections]);

  // Load Global Vibes
  const loadGlobalVibes = useCallback(async (requestId) => {
    const controller = makeController("global"); setLoading((p) => ({ ...p, global: true }));
    try {
      const vibes = ['Global Top 50', 'Viral Hits', 'Latin Hits', 'K-Pop Essentials', 'Afrobeats', 'Eurovision'];
      const vibe = vibes[(refreshNonce + 1) % vibes.length];
      const r = await playlistSearch({ query: vibe, limit: 12 });
      const top = uniqByKey((r?.results?.playlistmatches?.playlist || []).map((p) => normalizeItem(p, "playlist")), (p) => `${p.id}`).filter((p) => p.image && p.image !== DEFAULT_IMAGE).slice(0, 8);
      if (!controller.signal.aborted && reqIdRef.current === requestId) { setSections((prev) => ({ ...prev, global: top })); setLoading((p) => ({ ...p, global: false })); }
    } catch { if (!controller.signal.aborted) setLoading((p) => ({ ...p, global: false })); }
  }, [makeController, refreshNonce, setSections]);

  // Load Artist Spotlight
  // Load Artist Spotlight (Diverse User Favorites)
  const loadArtistSpotlight = useCallback(async (requestId) => {
    const controller = makeController("spotlight"); setLoading((p) => ({ ...p, spotlight: true }));
    try {
      // 1. Build Diverse Candidate Pool
      // Priorities: Favorites > Recent History > Fallback
      const favorites = (savedArtists || []).map(a => typeof a === 'string' ? a : a.name).filter(Boolean);

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
      const shuffledArtists = pickRandomSample(candidateArtists, 30, `spotlight-mix-${Math.random()}`);

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
        if (finalTracks.length >= 15 && i > 10) break;
      }

      const finalList = finalTracks.slice(0, 30); // Max 30 as requested

      if (!controller.signal.aborted && reqIdRef.current === requestId) {
        setSections((prev) => ({ ...prev, artistSpotlight: finalList }));
        setLoading((p) => ({ ...p, spotlight: false }));
      }
    } catch (err) {
      console.warn("[Feed] Spotlight error:", err);
      if (!controller.signal.aborted) setLoading((p) => ({ ...p, spotlight: false }));
    }
  }, [makeController, savedArtists, setSections]);

  // Revalidate All
  const revalidateAll = useCallback(async () => {
    const requestId = ++reqIdRef.current;
    ["critical", "forYou", "playlists", "party", "recommendations", "albums", "mood", "flashback", "global", "spotlight"].forEach(cancelKey);
    await loadCritical(requestId);
    loadForYou(requestId); loadPlaylistsLazy(requestId); loadPartyLazy(requestId); loadSmartRecommendations(requestId); loadRecommendedAlbums(requestId);
    loadMoodMixes(requestId); loadFlashback(requestId); loadGlobalVibes(requestId); loadArtistSpotlight(requestId);
  }, [cancelKey, loadCritical, loadForYou, loadPlaylistsLazy, loadPartyLazy, loadSmartRecommendations, loadRecommendedAlbums, loadMoodMixes, loadFlashback, loadGlobalVibes, loadArtistSpotlight]);

  const debounceRef = useRef(null);
  useEffect(() => { if (userLoading) return; const usedCache = applyCacheIfValid(); if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => revalidateAll(), usedCache ? 450 : 0); return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, [userLoading, applyCacheIfValid, revalidateAll, cacheKey]);
  useEffect(() => { if (!criticalReady) return; const t = setTimeout(() => saveCache({ hero, sections, forYouTitle, refreshNonce }), 250); return () => clearTimeout(t); }, [criticalReady, hero, sections, forYouTitle, saveCache, refreshNonce]);

  // Stable callbacks
  // 🎵 handleNewReleasesClick: Ahora usa Radio Instantánea (no pasa contextQueue)
  const handleNewReleasesClick = useCallback((item) => handlePlay(item), [handlePlay]);
  const handleTrendingClick = useCallback((item) => handlePlay(item, sections.trending), [handlePlay, sections.trending]);
  /* handleForYouTracksClick removed as unused */
  const handlePlaylistClick = useCallback((item) => handlePlay(item), [handlePlay]);
  // Fix: Direct navigation for albums to avoid type mismatch ('Álbum' vs 'album')
  const handleAlbumClick = useCallback((item) => navigate(`/album/${encodeURIComponent(item.artist || item.artistQuery)}/${encodeURIComponent(item.name)}`), [navigate]);
  const handleRecentlyPlayedClick = useCallback((item) => handlePlay(item, recentlyPlayed), [handlePlay, recentlyPlayed]);
  // 🎵 handleRecommendationsClick: Ahora usa Radio Instantánea (no pasa contextQueue)
  const handleRecommendationsClick = useCallback((item) => handlePlay(item), [handlePlay]);

  /* handleManualRefresh removed as unused */

  const displayName = user?.displayName || user?.email?.split("@")[0] || "Viajero";

  const getSectionSubtitle = (key) => {
    const map = {
      newReleases: savedArtists?.length > 0 || tasteProfile.topArtists?.length > 0
        ? 'Nuevos lanzamientos de tus artistas favoritos'
        : 'Los lanzamientos más recientes',
      smartRecommendations: 'Basado en tus artistas favoritos',
      recentlyPlayed: 'De tu historial reciente',
      topPlaylists: tasteProfile.topArtists?.length > 0 ? `Con artistas como ${tasteProfile.topArtists.slice(0, 2).join(' y ')}` : 'Playlists populares',
      partyPlaylists: 'Para tus momentos de fiesta', trending: 'Lo más escuchado ahora',
      recommendedAlbums: savedArtists?.length > 0 ? 'De artistas que sigues' : 'Álbumes que te pueden gustar',
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

  if (loading.critical && !hero && !sections.trending.length) {
    return <div className="feed-screen"><div className="feed-loading" role="status" aria-live="polite"><div className="feed-spinner" aria-hidden="true" /><div>Preparando tu música…</div></div></div>;
  }

  const currentHeroBg = activeHeroItem?.image || heroMix[0]?.image || hero?.image || DEFAULT_IMAGE;

  return (
    <div className="feed-screen" ref={feedContainerRef}>
      <header className="feed-hero">
        <div
          className="feed-hero-background"
          style={{
            '--hero-bg-image': `url(${currentHeroBg})`,
            transition: 'opacity 0.5s ease' // Smooth transition is handled by CSS on the element usually, but variable change is instant unless handled.
            // Note: CSS variables render instantly. For smooth cross-fading we'd need two layers, 
            // but for this iteration we'll rely on the CSS filtered blur abstractness to mask the swap flick.
          }}
        />
        <div className="feed-hero-top">
          <div className="feed-hero-greeting">
            <div className="feed-hero-date">{todayText}</div>
            <h1 className="feed-hero-title">Hola, {displayName}</h1>
            <p className="feed-hero-sub">{tasteProfile.sampleSize >= 5 ? "Selección personalizada basada en tus gustos." : "Descubriendo tu estilo musical..."}</p>
          </div>
        </div>
        <HeroRow
          items={heroMix}
          onItemClick={handlePlay}
          onActiveItemChange={handleHeroScrollChange}
          isLoading={(loading.critical || loading.recommendations || loading.albums) && heroMix.length === 0}
        />
        {error && <div className="feed-error">{error}</div>}
      </header>

      {/* RADIO SECTION - Artistas Favoritos con Radio Infinita */}
      {(() => {
        // Rotación cada 3 horas (usando estado para auto-update)
        const timeBlock = radioRotationBlock;

        // Usar savedArtists si están disponibles, sino usar topArtists del taste profile
        // "Artistas más recientes que agregó": Asumimos que savedArtists viene ordenado (o usamos todo el pool)
        // Tomamos los 50 más recientes como pool para rotar
        const sourceList = savedArtists?.length > 0
          ? savedArtists
          : (tasteProfile.topArtists || []).map(a => ({ name: a, id: `artist-${a}` }));

        // Pool de candidatos (hasta 50 para asegurar frescura pero variedad)
        const candidates = sourceList.slice(0, 50).map(artist => ({
          id: artist.id || `artist-${artist.name}`,
          type: 'artist',
          name: artist.name,
          artist: artist.name,
          image: artist.image || DEFAULT_IMAGE,
        }));

        if (candidates.length === 0) return null;

        // Selección aleatoria determinista basada en el bloque de 3 horas
        const radioArtists = pickRandomSample(
          candidates,
          12,
          `radio-rotation-${timeBlock}-${user?.uid || 'guest'}`
        );

        return (
          <section className="feed-section feed-section-radio">
            <div className="feed-section-header">
              <h2 className="feed-section-title">Radio de tus artistas favoritos</h2>
              <p className="feed-section-subtitle">
                {savedArtists?.length > 0
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
          case 'newReleases': return <Row key={key} sectionKey="newReleases" title={title} subtitle={subtitle} items={sections.newReleases} onItemClick={handleNewReleasesClick} />;
          case 'smartRecommendations':
            // Excluimos las top 5 que ya se muestran en el Hero para evitar duplicados
            return <Row key={key} sectionKey="smartRecommendations" title={title} subtitle={subtitle} items={sections.smartRecommendations?.slice(5)} onItemClick={handleRecommendationsClick} variant="recommended" isLoading={loading.recommendations} />;
          case 'recentlyPlayed': return recentlyPlayed.length > 0 ? <Row key={key} sectionKey="recentlyPlayed" title={title} subtitle={subtitle} items={recentlyPlayed} onItemClick={handleRecentlyPlayedClick} variant="recent" /> : null;
          case 'topPlaylists': return <Row key={key} sectionKey="topPlaylists" title={title} subtitle={subtitle} items={sections.topPlaylists} onItemClick={handlePlaylistClick} isLoading={loading.playlists} />;

          case 'partyPlaylists': return <Row key={key} sectionKey="partyPlaylists" title={title} subtitle={subtitle} items={sections.partyPlaylists} onItemClick={handlePlaylistClick} isLoading={loading.party} />;
          case 'recommendedAlbums': return <Row key={key} sectionKey="recommendedAlbums" title={title} subtitle={subtitle} items={sections.recommendedAlbums} variant="album" onItemClick={handleAlbumClick} isLoading={loading.albums} />;
          case 'trending': return <Row key={key} sectionKey="trending" title={title} subtitle={subtitle} items={sections.trending} onItemClick={handleTrendingClick} />;
          case 'moodMixes': return <Row key={key} sectionKey="moodMixes" title={title} subtitle={subtitle} items={sections.moodMixes} onItemClick={handlePlaylistClick} variant="wide" isLoading={loading.mood} />;
          case 'flashback': return <Row key={key} sectionKey="flashback" title={title} subtitle={subtitle} items={sections.flashback} onItemClick={handlePlaylistClick} isLoading={loading.flashback} />;
          case 'artistSpotlight': return <Row key={key} sectionKey="artistSpotlight" title={title} subtitle={subtitle} items={sections.artistSpotlight} onItemClick={handleRecommendationsClick} variant="poster" isLoading={loading.spotlight} />;
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
