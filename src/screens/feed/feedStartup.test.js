// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: {}, player: {}, cache: {}, chart: vi.fn(), albums: vi.fn(), related: vi.fn(), tracks: vi.fn(),
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../context/userContext', () => ({ useUser: () => mocks.user }));
vi.mock('../../context/playerContext', () => ({ usePlayer: () => mocks.player, usePlayerActions: () => ({ playTrack: vi.fn(), appendToQueue: vi.fn(), primeResolvedTrack: vi.fn() }) }));
vi.mock('../../services/unifiedService', () => ({ chartGetTopTracks: mocks.chart, getArtistAlbums: mocks.albums, getRelatedArtists: mocks.related, artistGetTopTracks: mocks.tracks, chartGetTopPlaylists: async () => ({ playlists: { playlist: [] } }) }));
vi.mock('../../services/screenStateCache', () => ({ default: { get: (_, key) => mocks.cache[key], set: (_, key, value) => { mocks.cache[key] = value; }, subscribe: () => () => {}, clear: () => { mocks.cache = {}; }, delete: () => {} }, useScrollPersistence: () => {} }));
vi.mock('../../services/playbackPrefetchService', () => ({ getPrefetchLimitForQuality: () => 0, getPlaybackPrefetchKey: () => '', playbackPrefetchService: { prefetch: vi.fn() } }));
vi.mock('../../services/audioQuality', () => ({ getResolvedAudioQualityMode: () => 'standard' }));
vi.mock('../../services/radioService', () => ({ buildRadioQueue: vi.fn() }));
vi.mock('../../components/shared/Card', () => ({ default: ({ item }) => React.createElement('div', {}, item.name) }));
import Feed from './feed';

const track = (artist, name = `Track ${artist}`) => ({ id: `${artist}-${name}`, name, artist, image: 'https://img.test/cover.jpg', duration: 180 });
const album = (name, releaseDate) => ({ id: name, name, artist: 'Recent Artist', releaseDate, image: 'https://img.test/cover.jpg', recordType: 'album' });
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(400); }); };

describe('Feed actualizado y concurrente', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
    mocks.cache = {};
    mocks.user = { user: { uid: 'user-a' }, favorites: [], playlists: [], savedArtists: [], savedAlbums: [], loading: false };
    mocks.player = { listeningHistory: [{ ...track('Recent Artist'), timestamp: Date.now() }], tasteEngagement: {} };
    mocks.chart.mockReset().mockResolvedValue({ tracks: { track: [track('Recent Artist', 'Chart favorite'), track('New Artist', 'Chart discovery')] } });
    mocks.related.mockReset().mockResolvedValue([]);
    mocks.albums.mockReset().mockResolvedValue([]);
    mocks.tracks.mockReset().mockImplementation(async ({ artist }) => ({ toptracks: { track: [track(artist)] } }));
    localStorage.clear();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('solo publica novedades con fecha completa dentro de los últimos 60 días', async () => {
    mocks.albums.mockResolvedValue([
      album('Fresh release', '2026-09-01'), album('Old release', '2026-01-01'),
      album('Unknown release', undefined), album('Future release', '2026-09-10'), album('Year only', '2026'),
    ]);
    render(React.createElement(Feed));
    await flush();
    expect(mocks.cache.sections.newReleases.map(item => item.name)).toEqual(['Fresh release']);
    expect(mocks.cache.sections.newReleases[0]).toMatchObject({ type: 'album', releaseDate: '2026-09-01' });
  });

  it('carga álbumes y recomendaciones mientras las tendencias siguen pendientes', async () => {
    mocks.chart.mockReturnValue(new Promise(() => {}));
    render(React.createElement(Feed));
    await flush();
    expect(mocks.albums).toHaveBeenCalledWith('Recent Artist', 30);
    expect(mocks.related).toHaveBeenCalled();
    expect(mocks.tracks).toHaveBeenCalled();
    expect(mocks.cache.sections.forYouTracks.length).toBeGreaterThan(0);
  });

  it('recalcula a partir de nuevas escuchas y reemplaza el resultado anterior', async () => {
    const view = render(React.createElement(Feed));
    await flush();
    mocks.player = { ...mocks.player, listeningHistory: Array.from({ length: 6 }, (_, i) => ({ ...track('Latest Artist', `Latest ${i}`), timestamp: Date.now() - i * 1000 })) };
    view.rerender(React.createElement(Feed));
    await flush();
    expect(mocks.cache.sections.recommendationMeta.seedNames[0]).toBe('Latest Artist');
    expect(mocks.cache.sections.forYouTracks.some(item => item.artist === 'Latest Artist')).toBe(true);
  });

  it('descarta respuestas de una generación anterior aunque terminen después', async () => {
    let resolveOld;
    const oldAlbums = new Promise(resolve => { resolveOld = resolve; });
    mocks.albums.mockImplementation(artist => artist === 'Recent Artist' ? oldAlbums : Promise.resolve([{ ...album('Latest album', '2026-09-01'), artist }]));
    const view = render(React.createElement(Feed));
    await flush();
    mocks.player = { ...mocks.player, listeningHistory: [{ ...track('Latest Artist'), timestamp: Date.now() }] };
    view.rerender(React.createElement(Feed));
    await flush();
    expect(mocks.cache.sections.newReleases.map(item => item.name)).toEqual(['Latest album']);
    await act(async () => { resolveOld([album('Stale response', '2026-09-02')]); });
    expect(mocks.cache.sections.newReleases.map(item => item.name)).toEqual(['Latest album']);
  });

  it('Popular ahora contiene solo catálogo de charts y admite descubrimiento', async () => {
    render(React.createElement(Feed));
    await flush();
    expect(mocks.cache.sections.trending.map(item => item.name)).toEqual(['Chart favorite', 'Chart discovery']);
    expect(mocks.chart).toHaveBeenCalledTimes(1);
  });
});
