import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./artistDetail.jsx', import.meta.url), 'utf8');
const handler = source.match(
    /const handlePlayArtistRadio[\s\S]*?\n {4}\}, \[artistInfo, name, isStartingRadio, topTracks, playTrack, appendToQueue, notify\]\);/,
)?.[0] || '';

describe('ArtistDetail: radio del artista', () => {
    it('expone una acción diferente de reproducir y aleatorio', () => {
        expect(source).toContain('onClick={handlePlayArtistRadio}');
        expect(source).toContain('Reproducir radio de ${artistInfo.name}');
    });

    it('inicia una estación con una semilla variable antes de ampliar la cola', () => {
        expect(handler).toContain('artistGetTopTracks({');
        expect(handler).toContain('limit: 25');
        expect(handler).toContain('selectArtistRadioSeed(');
        expect(handler).toContain('playTrack(seedTrack, [seedTrack], {');
        expect(handler.indexOf('playTrack(seedTrack, [seedTrack], {'))
            .toBeLessThan(handler.indexOf('await buildRadioQueue'));
    });

    it('ancla toda la estación al artista elegido y mezcla relacionados', () => {
        expect(handler).toContain('stationArtist: artistName');
        expect(handler).toContain('artistName,');
        expect(handler).toContain('contextTracks: []');
        expect(handler).toContain('includeSeed: false');
        expect(handler).toContain('appendToQueue(additionalTracks, {');
    });
});
