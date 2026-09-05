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

describe('recent taste and breadth regressions', () => {
    const now = Date.UTC(2026, 8, 5);
    it('makes a current listening shift outrank a large old collection', () => {
        const profile = buildDiscoveryTasteProfile({
            favorites: Array.from({ length: 100 }, (_, i) => track(`Old ${i}`, 'Old Artist')),
            savedArtists: ['Old Artist'],
            listeningHistory: [
                { ...track('Fresh 1', 'New Artist'), timestamp: now },
                { ...track('Fresh 2', 'New Artist'), timestamp: now - 86400000 },
                { ...track('Old listen', 'Old Artist'), timestamp: now - 90 * 86400000 },
            ], now,
        });
        expect(profile.seeds[0].name).toBe('New Artist');
        expect(profile.seeds[0].recentScore).toBeGreaterThan(40);
    });

    it('uses timestamps even when history is unsorted and distinguishes changed listening', () => {
        const old = { ...track('Past', 'Old'), timestamp: now - 180 * 86400000 };
        const recent = { ...track('Current', 'New'), timestamp: now };
        const first = buildDiscoveryTasteProfile({ listeningHistory: [old, recent], now });
        const next = buildDiscoveryTasteProfile({ listeningHistory: [old, { ...recent, name: 'Different' }], now });
        expect(first.seeds[0].name).toBe('New');
        expect(first.signature).not.toBe(next.signature);
    });

    it('does not erase artist and title identities written in non-Latin scripts', () => {
        expect(getDiscoveryTrackKey(track('봄날', '방탄소년단'))).toBe('방탄소년단::봄날');
        expect(getDiscoveryTrackKey(track('봄날', '방탄소년단'))).not.toBe(getDiscoveryTrackKey(track('불타오르네', '방탄소년단')));
    });

    it('deduplicates by artist and title, and spreads related taste origins early', () => {
        const candidates = Array.from({ length: 7 }, (_, i) => ({
            track: track(`Song ${i}`, `Artist ${i}`), source: 'related', seedArtist: 'First Seed', affinity: 20,
        }));
        candidates.push({ track: track('New Style', 'Explorer'), source: 'related', seedArtist: 'Other Seed', affinity: 15 });
        candidates.push({ ...candidates[0], affinity: 1 });
        const result = selectDiscoveryTracks({ candidates, limit: 8 });
        expect(result.slice(0, 3).some((item) => item.artist === 'Explorer')).toBe(true);
        expect(new Set(result.map(getDiscoveryTrackKey)).size).toBe(result.length);
    });

    it('never uses a shared song title as artist affinity or identity', () => {
        const profile = buildDiscoveryTasteProfile({ favorites: [track('Hello', 'Adele')], now });
        const result = selectDiscoveryTracks({ profile, candidates: [
            { track: track('Hello', 'Adele'), source: 'familiar' },
            { track: track('Hello', 'Lionel Richie'), source: 'related' },
        ] });
        expect(result.map((item) => item.artist)).toEqual(['Lionel Richie']);
    });
});
