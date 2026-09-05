// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chartGetTopTracks, getArtistAlbums, searchGlobal } from './unifiedService';

afterEach(() => vi.restoreAllMocks());

describe('fresh discovery catalog', () => {
  it('shares simultaneous charts but fetches again on the next refresh', async () => {
    let resolve;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(done => { resolve = done; }));
    const first = chartGetTopTracks({ limit: 30 });
    const concurrent = chartGetTopTracks({ limit: 30 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve({ ok: true, json: async () => ({ data: [{ id: 1, title: 'Now', artist: { name: 'Artist' }, rank: 99 }] }) });
    const [a, b] = await Promise.all([first, concurrent]);
    expect(a).toEqual(b);
    expect(a.tracks.track[0].rank).toBe(99);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
    await chartGetTopTracks({ limit: 30 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('requests newest albums before truncation and preserves dates', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true, json: async () => ({ data: [{ id: 123, title: 'New album', release_date: '2026-09-01', artist: { name: 'Artist' } }] }),
    });
    const albums = await getArtistAlbums(42, 30);
    const endpoint = new URL(fetchMock.mock.calls[0][0]).searchParams.get('endpoint');
    expect(endpoint).toBe('/artist/42/albums?limit=30&order=release_desc');
    expect(albums[0].releaseDate).toBe('2026-09-01');
  });

  it('allows retry after a failed shared request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ id: 2, title: 'Recovered' }] }) });
    expect((await chartGetTopTracks({ limit: 20 })).tracks.track).toEqual([]);
    expect((await chartGetTopTracks({ limit: 20 })).tracks.track[0].name).toBe('Recovered');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('distinguishes search outages from empty matches and allows retry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [] }) });
    await expect(searchGlobal('test', 'track', 12)).rejects.toThrow('503');
    await expect(searchGlobal('test', 'track', 12)).resolves.toEqual([]);
  });

  it('reports catalog errors instead of caching an empty search', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ error: { message: 'Quota exceeded' } }) });
    await expect(searchGlobal('test', 'artist', 10)).rejects.toThrow('Quota exceeded');
  });

});
