import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTrackArtists, getArtistPath, isArtistCreditMatch, isSameArtist } from './artistIdentity';
import { getArtistAlbums, getAlbumDetails, getArtistInfo } from './unifiedService';

describe('Identidad exacta de artistas', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('conserva el ID del artista en la navegación', () => {
        expect(getArtistPath({ id: 412, name: 'Queen' })).toBe('/artist/412');
        expect(getArtistPath({ id: 'local-uuid', originalId: 412, name: 'Queen' })).toBe('/artist/412');
        expect(getArtistPath({ name: 'Beyoncé' })).toBe('/artist/Beyonc%C3%A9');
    });

    it('nunca considera iguales dos IDs diferentes aunque los nombres coincidan', () => {
        expect(isSameArtist(
            { artistId: 10, artist: 'The Band' },
            { artistId: 20, artist: 'The Band' },
        )).toBe(false);
        expect(isSameArtist({ artist: 'Queen' }, { artist: 'Queen Naija' })).toBe(false);
        expect(isSameArtist({ artist: 'Beyoncé' }, { artist: 'beyonce' })).toBe(true);
    });

    it('acepta colaboraciones reales pero rechaza artistas de nombre parecido', () => {
        expect(isArtistCreditMatch('Queen', 'Queen')).toBe(true);
        expect(isArtistCreditMatch('Queen', 'Queen, David Bowie')).toBe(true);
        expect(isArtistCreditMatch('Queen', 'Queen Naija')).toBe(false);
        expect(isArtistCreditMatch('Twenty One Pilots', 'Twenty One Pilots feat. MUTEMATH')).toBe(true);
    });

    it('elige la coincidencia exacta y no el primer nombre parecido', async () => {
        const fetchMock = vi.fn(async (url) => {
            const endpoint = decodeURIComponent(String(url).split('endpoint=')[1] || '');
            if (endpoint.startsWith('/search/artist?q=Queen')) {
                return {
                    ok: true,
                    json: async () => ({ data: [
                        { id: 99, name: 'Queen Naija', nb_fan: 900000 },
                        { id: 412, name: 'Queen', nb_fan: 5000000 },
                    ] }),
                };
            }
            if (endpoint === '/artist/412') {
                return {
                    ok: true,
                    json: async () => ({ id: 412, name: 'Queen', nb_fan: 5000000, nb_album: 50 }),
                };
            }
            throw new Error(`Endpoint inesperado: ${endpoint}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(getArtistInfo('Queen')).resolves.toMatchObject({ id: 412, name: 'Queen' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('rechaza una coincidencia solamente parcial en enlaces antiguos', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            json: async () => ({ data: [{ id: 99, name: 'Queen Naija', nb_fan: 900000 }] }),
        })));

        await expect(getArtistInfo('Queen')).resolves.toBeNull();
    });
});

 describe('Créditos múltiples', () => {
    it('separa colaboraciones antiguas y elimina duplicados', () => {
        expect(getTrackArtists({ artist: 'Dylan Brady, Noisia, Skrillex, josh pan, Noisia' }).map(a => a.name)).toEqual(['Dylan Brady', 'Noisia', 'Skrillex', 'josh pan']);
        expect(getTrackArtists({ artist: 'Bad Bunny feat. Rauw Alejandro' }).map(a => a.name)).toEqual(['Bad Bunny', 'Rauw Alejandro']);
    });
    it('respeta nombres explícitos e identidades del proveedor', () => {
        expect(getTrackArtists({ artists: [{ id: 1, name: 'Tyler, The Creator' }, { id: 2, name: 'Earth, Wind & Fire' }] })).toEqual([{ id: 1, name: 'Tyler, The Creator' }, { id: 2, name: 'Earth, Wind & Fire' }]);
        expect(getTrackArtists({ source: 'spotify', artists: [{ id: 'spotify-id', name: 'Bad Bunny' }] })).toEqual([{ name: 'Bad Bunny' }]);
        expect(getTrackArtists({ artist: 'AC/DC' })).toEqual([{ name: 'AC/DC' }]);
    });
});

it('resuelve álbumes de Brooks, GRX por créditos individuales', async () => {
    const endpoints = [];
    vi.stubGlobal('fetch', vi.fn(async url => {
        const endpoint = decodeURIComponent(String(url).split('endpoint=')[1] || '');
        endpoints.push(endpoint);
        let data = { data: [] };
        if (endpoint.startsWith('/search/artist?q=Brooks&')) data = { data: [{ id: 1, name: 'Brooks' }] };
        if (endpoint.startsWith('/search/artist?q=GRX&')) data = { data: [{ id: 2, name: 'GRX' }] };
        if (endpoint === '/artist/1') data = { id: 1, name: 'Brooks' };
        if (endpoint === '/artist/2') data = { id: 2, name: 'GRX' };
        if (/^\/artist\/[12]\/albums/.test(endpoint)) data = { data: [{ id: 9, title: 'Boomerang' }] };
        if (endpoint === '/album/9') data = { id: 9, title: 'Boomerang', artist: { id: 1, name: 'Brooks' }, tracks: { data: [] } };
        return { ok: true, json: async () => data };
    }));
    try {
        expect(await getArtistAlbums('Brooks, GRX')).toHaveLength(1);
        await getAlbumDetails('Boomerang', 'Brooks, GRX');
        expect(endpoints).toContain('/album/9');
        expect(endpoints.some(endpoint => endpoint.startsWith('/artist/2/albums'))).toBe(true);
    } finally { vi.unstubAllGlobals(); }
});
