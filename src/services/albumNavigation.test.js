import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getAlbumPath,
    loadAlbumDetailsDeduped,
    parseSyntheticAlbumId,
    resolveAlbumIdentity,
    shuffleAlbumTracks,
} from './albumNavigation';
import { getAlbumDetails } from './unifiedService';

describe('Navegación y resolución de álbumes', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('prefiere el ID estable del álbum sobre su título', () => {
        expect(getAlbumPath({
            id: 123456,
            name: 'More Than We Ever Imagined (Live in Mexico City)',
            artist: 647650,
        }, 'Twenty One Pilots')).toBe('/album/123456');
    });

    it('prioriza deezerId incluso cuando el ID visible es sintético', () => {
        expect(getAlbumPath({
            id: 'album_Twenty_One_Pilots::Breach',
            deezerId: 819534781,
            name: 'Breach',
            artist: 'Twenty One Pilots',
        })).toBe('/album/819534781');
    });

    it('interpreta album_Twenty_One_Pilots::Breach sin dejar vacío el artista', async () => {
        const parsed = parseSyntheticAlbumId('album_Twenty_One_Pilots::Breach');
        const identity = resolveAlbumIdentity({ albumId: 'album_Twenty_One_Pilots::Breach' });
        const loader = vi.fn(async () => ({ id: 819534781 }));

        expect(parsed).toEqual({ artist: 'Twenty One Pilots', title: 'Breach' });
        expect(identity.artist).toBe('Twenty One Pilots');
        await loadAlbumDetailsDeduped(identity, loader);
        expect(loader).toHaveBeenCalledWith('Breach', 'Twenty One Pilots');
        expect(loader.mock.calls[0][0]).not.toMatch(/^album_/);
    });

    it('carga Breach directamente mediante el Deezer ID 819534781', async () => {
        const fetchMock = vi.fn(async (url) => {
            const endpoint = decodeURIComponent(String(url).split('endpoint=')[1] || '');
            expect(endpoint).toBe('/album/819534781');
            return {
                ok: true,
                json: async () => ({
                    id: 819534781,
                    title: 'Breach',
                    artist: { id: 647650, name: 'Twenty One Pilots' },
                    tracks: { data: [] },
                }),
            };
        });
        vi.stubGlobal('fetch', fetchMock);

        const identity = resolveAlbumIdentity({
            albumId: 'album_Twenty_One_Pilots::Breach',
            deezerId: 819534781,
        });
        const album = await loadAlbumDetailsDeduped(identity, getAlbumDetails);

        expect(album).toMatchObject({ id: 819534781, deezerId: 819534781, name: 'Breach' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('mantiene título y artista separados para un álbum normal', async () => {
        const identity = resolveAlbumIdentity({ artist: 'Radiohead', name: 'In Rainbows' });
        const loader = vi.fn(async () => ({ id: 1 }));
        await loadAlbumDetailsDeduped(identity, loader);
        expect(loader).toHaveBeenCalledWith('In Rainbows', 'Radiohead');
    });

    it('deduplica cargas simultáneas de AlbumDetail por identidad estable', async () => {
        const identity = resolveAlbumIdentity({ deezerId: 819534781 });
        let release;
        const loader = vi.fn(() => new Promise((resolve) => { release = resolve; }));
        const first = loadAlbumDetailsDeduped(identity, loader);
        const second = loadAlbumDetailsDeduped(identity, loader);
        expect(first).toBe(second);
        expect(loader).toHaveBeenCalledTimes(0);
        await Promise.resolve();
        expect(loader).toHaveBeenCalledTimes(1);
        release({ id: 819534781 });
        await first;
    });

    it('conserva compatibilidad con álbumes que todavía no tienen ID', () => {
        expect(getAlbumPath({ name: 'Álbum especial', artist: 'Artista Ñ' }))
            .toBe('/album/Artista%20%C3%91/%C3%81lbum%20especial');
    });

    it('baraja una copia de la cola completa sin modificar el orden original', () => {
        const tracks = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
        const shuffled = shuffleAlbumTracks(tracks, () => 0);

        expect(tracks.map(track => track.id)).toEqual([1, 2, 3, 4]);
        expect(shuffled.map(track => track.id)).toEqual([2, 3, 4, 1]);
        expect(new Set(shuffled.map(track => track.id))).toEqual(new Set([1, 2, 3, 4]));
    });

    it('resuelve enlaces antiguos que contienen un ID de artista y un título', async () => {
        const albumTitle = 'More Than We Ever Imagined (Live in Mexico City)';
        const fetchMock = vi.fn(async (url) => {
            const endpoint = decodeURIComponent(String(url).split('endpoint=')[1] || '');

            if (endpoint.startsWith('/artist/647650/albums')) {
                return {
                    ok: true,
                    json: async () => ({
                        data: [{
                            id: 987654,
                            title: albumTitle,
                            cover_xl: 'https://images.example/album.jpg',
                            artist: { id: 647650, name: 'Twenty One Pilots' },
                        }],
                    }),
                };
            }

            if (endpoint === '/album/987654') {
                return {
                    ok: true,
                    json: async () => ({
                        id: 987654,
                        title: albumTitle,
                        cover_xl: 'https://images.example/album.jpg',
                        artist: { id: 647650, name: 'Twenty One Pilots' },
                        tracks: { data: [{ id: 1, title: 'Overcompensate', artist: { name: 'Twenty One Pilots' } }] },
                    }),
                };
            }

            throw new Error(`Endpoint inesperado: ${endpoint}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        const album = await getAlbumDetails(albumTitle, '647650');

        expect(album).toMatchObject({
            id: 987654,
            name: albumTitle,
            artist: 'Twenty One Pilots',
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
