import { describe, expect, it } from 'vitest';
import {
    buildDiscoveryTasteProfile,
    getDiscoveryArtistName,
    getDiscoveryTrackKey,
    selectDiscoveryTracks,
} from './discoveryRecommendations';

const track = (name, artist, image = 'https://img.test/cover.jpg') => ({ name, artist, image, type: 'track' });

describe('discoveryRecommendations', () => {
    it('normaliza artistas objeto y colaboraciones sin confundir identidades', () => {
        expect(getDiscoveryArtistName({ name: 'Kendrick Lamar feat. SZA' })).toBe('Kendrick Lamar');
        expect(getDiscoveryTrackKey(track('Not Like Us', { name: 'Kendrick Lamar' }))).toBe('kendrick lamar::not like us');
    });

    it('prioriza señales explícitas y evita artistas saltados repetidamente', () => {
        const profile = buildDiscoveryTasteProfile({
            savedArtists: [{ name: 'Twenty One Pilots' }],
            favorites: [track('A', { name: 'Twenty One Pilots' }), track('B', 'Skrillex')],
            engagement: { likedArtists: { Skrillex: 2 }, skippedArtists: { Drake: 3 } },
            sessionSeed: 'open-1',
        });

        expect(profile.seeds[0].name).toBe('Twenty One Pilots');
        expect(profile.avoidedArtists.has('drake')).toBe(true);
        expect(profile.seeds.some((seed) => seed.name === 'Drake')).toBe(false);
    });

    it('recomienda temas nuevos con variedad de artistas y resultado estable', () => {
        const favorite = track('Known Song', 'Seed Artist');
        const profile = buildDiscoveryTasteProfile({ favorites: [favorite], sessionSeed: 'open-2' });
        const candidates = [
            { track: favorite, source: 'familiar', affinity: 10 },
            { track: track('New One', 'Related A'), source: 'related', affinity: 10, rank: 0 },
            { track: track('New Two', 'Related A'), source: 'related', affinity: 9, rank: 1 },
            { track: track('New Three', 'Related A'), source: 'related', affinity: 8, rank: 2 },
            { track: track('New Four', 'Related B'), source: 'related', affinity: 8, rank: 0 },
            { track: track('Karaoke Version', 'Related C'), source: 'related', affinity: 20 },
            { track: track('Chart Song', 'Popular Artist'), source: 'chart', affinity: 0 },
        ];

        const first = selectDiscoveryTracks({ candidates, profile, sessionSeed: 'open-2', limit: 5 });
        const second = selectDiscoveryTracks({ candidates, profile, sessionSeed: 'open-2', limit: 5 });

        expect(first).toEqual(second);
        expect(first.some((item) => item.name === 'Known Song')).toBe(false);
        expect(first.some((item) => item.name === 'Karaoke Version')).toBe(false);
        expect(first.filter((item) => item.artist === 'Related A')).toHaveLength(2);
        expect(new Set(first.map((item) => item.artist)).size).toBeGreaterThanOrEqual(3);
    });
});
