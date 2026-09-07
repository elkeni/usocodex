import { describe, expect, it } from 'vitest';
import { translateLyricsToSpanish } from './lyricsTranslation';

describe('traducción de letras', () => {
    it('conserva el orden y deja el original como respaldo cuando una línea falla', async () => {
        const fetcher = async (url) => {
            const text = new URL(url).searchParams.get('q');
            if (text === 'Falla') return { ok: false };
            return { ok: true, json: async () => ({ responseData: { translatedText: `${text} en español` } }) };
        };

        await expect(translateLyricsToSpanish(['Hello', 'Falla', 'World'], { fetcher }))
            .resolves.toEqual(['Hello en español', 'Falla', 'World en español']);
    });
});
