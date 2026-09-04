import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const feedSource = readFileSync(new URL('./feed.jsx', import.meta.url), 'utf8');

describe('Descubrir: arranque rápido y estable', () => {
  it('no bloquea toda la pantalla mientras espera el catálogo', () => {
    expect(feedSource).not.toContain('Preparando tu música…');
    expect(feedSource).toContain('instantPlayTracks');
    expect(feedSource).toContain("screenStateCache.set('feed', 'heroMix', stableItems)");
  });

  it('publica el primer catálogo antes de calcular novedades', () => {
    const fetchChart = feedSource.indexOf('chartGetTopTracks({ limit: 14 }).then');
    const publishTrending = feedSource.indexOf('trending: tracks.slice(0, 8)');
    const findReleases = feedSource.indexOf('const selectedArtists = pickRandomSample(');

    expect(fetchChart).toBeGreaterThan(-1);
    expect(publishTrending).toBeGreaterThan(fetchChart);
    expect(findReleases).toBeGreaterThan(publishTrending);
  });

  it('limita el trabajo inicial y posterga contenido secundario', () => {
    expect(feedSource).toContain('Math.min(userArtists.length, 4)');
    expect(feedSource).toContain('tasteProfile.seeds.slice(0, 3)');
    expect(feedSource).toContain('Math.min(4, getPrefetchLimitForQuality');
    expect(feedSource).toContain('}, 700);');
    expect(feedSource).toContain('}, 2200);');
  });

  it('mantiene la música local primero y una cola contextual al tocar', () => {
    expect(feedSource).toContain('uniqByKey([...recentlyPlayed, ...favoriteTracks, ...startupTracksRef.current]');
    expect(feedSource).toContain('[...(prev.forYouTracks || []), ...tracks]');
    expect(feedSource).toContain('handlePlay(item, sections.forYouTracks)');
    expect(feedSource).toContain('if (heroMixRef.current.length || !items?.length) return;');
  });

  it('hidrata una portada pública antes de Firebase y actualiza sin duplicar la consulta', () => {
    expect(feedSource).toContain("const FEED_STARTUP_CACHE_KEY = 'paradox_feed_startup_tracks_v1'");
    expect(feedSource).toContain('startupTracksRef = useRef(readStartupTracks())');
    expect(feedSource).toContain('if (startupCatalogPromiseRef.current) return startupCatalogPromiseRef.current');
    expect(feedSource).toContain('loadStartupCatalog().catch');
  });
});
