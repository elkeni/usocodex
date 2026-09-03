import { describe, expect, it } from 'vitest';
import {
    buildSearchTasteProfile,
    getPersonalizedSearchSuggestions,
    rankPersonalizedSearchResults,
} from './searchPersonalization';

const track = (id, name, artist, rank = 0) => ({ id, name, artist, rank });

describe('personalización segura de búsqueda', () => {
    it('prioriza gustos cuando los resultados tienen relevancia equivalente', () => {
        const profile = buildSearchTasteProfile({
            favorites: [track('fav', 'DNA.', 'Kendrick Lamar')],
        });
        const ranked = rankPersonalizedSearchResults([
            track('other', 'Money Trees Live', 'Cover Band', 900000),
            track('known', 'Money Trees', 'Kendrick Lamar', 100),
        ], 'Money', 'track', profile);

        expect(ranked[0].id).toBe('known');
        expect(ranked[0]._searchMeta.personalized).toBe(true);
    });

    it('nunca pone una coincidencia personalizada parcial sobre un título exacto', () => {
        const profile = buildSearchTasteProfile({ savedArtists: [{ name: 'Artista favorito' }] });
        const ranked = rankPersonalizedSearchResults([
            track('partial', 'Breach Deluxe', 'Artista favorito', 999999),
            track('exact', 'Breach', 'Otro artista', 1),
        ], 'Breach', 'track', profile);

        expect(ranked[0].id).toBe('exact');
    });

    it('deduplica por identidad de catálogo y conserva sugerencias de mayor afinidad', () => {
        const profile = buildSearchTasteProfile({
            savedArtists: [{ name: 'Twenty One Pilots' }],
            listeningHistory: [track('h', 'SOMA', 'Skrillex')],
        });
        const ranked = rankPersonalizedSearchResults([
            track('same', 'Ride', 'Twenty One Pilots'),
            track('same', 'Ride', 'Twenty One Pilots'),
        ], 'Ride', 'track', profile);

        expect(ranked).toHaveLength(1);
        expect(getPersonalizedSearchSuggestions(profile, 2)).toEqual(['Twenty One Pilots', 'Skrillex']);
    });
});
