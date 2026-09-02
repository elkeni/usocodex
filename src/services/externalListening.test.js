import { describe, expect, it } from 'vitest';
import { getSpotifyListeningUrl } from './externalListening';

describe('externalListening', () => {
    it('preserva un enlace directo válido de Spotify', () => {
        expect(getSpotifyListeningUrl({
            spotifyUrl: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
        })).toBe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    });

    it('crea una búsqueda segura cuando sólo hay título y artista', () => {
        expect(getSpotifyListeningUrl({ title: 'Prayer', artist: 'KATANAZ' }))
            .toBe('https://open.spotify.com/search/KATANAZ%20Prayer');
    });

    it('no acepta una URL arbitraria como enlace de Spotify', () => {
        expect(getSpotifyListeningUrl({ spotifyUrl: 'https://example.com/audio.mp3' })).toBe('');
    });
});
