import { afterEach, describe, expect, it, vi } from 'vitest';
import { getArtistPath, isArtistCreditMatch, isSameArtist } from './artistIdentity';
import { getArtistInfo } from './unifiedService';

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
