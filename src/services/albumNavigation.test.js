import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAlbumPath, shuffleAlbumTracks } from './albumNavigation';
import { getAlbumDetails } from './unifiedService';

describe('Navegación y resolución de álbumes', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('prefiere el ID estable del álbum sobre su título', () => {
        expect(getAlbumPath({
            id: 123456,
            name: 'More Than We Ever Imagined (Live in Mexico City)',
            artist: 647650,
        }, 'Twenty One Pilots')).toBe('/album/Twenty%20One%20Pilots/123456');
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
