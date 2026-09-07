const translationCache = new Map();
const MAX_SEGMENT_BYTES = 500;

const getByteLength = (value) => (
    typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(value).length : value.length
);

const decodeEntities = (value) => String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

const translateLine = async (text, fetcher) => {
    const source = String(text || '').trim();
    if (!source || getByteLength(source) > MAX_SEGMENT_BYTES) return source;

    const cacheKey = `en:es:${source}`;
    if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

    const params = new URLSearchParams({ q: source, langpair: 'en|es' });
    const response = await fetcher(`https://api.mymemory.translated.net/get?${params}`);
    if (!response.ok) throw new Error('TRANSLATION_UNAVAILABLE');
    const payload = await response.json();
    const translated = decodeEntities(payload?.responseData?.translatedText).trim();
    if (!translated) throw new Error('TRANSLATION_EMPTY');

    translationCache.set(cacheKey, translated);
    return translated;
};

/** Traduce una letra inglesa al español manteniendo una línea por cada tiempo. */
export const translateLyricsToSpanish = async (lines, { fetcher = fetch } = {}) => {
    const sourceLines = Array.isArray(lines) ? lines.map((line) => String(line || '')) : [];
    const translated = new Array(sourceLines.length);
    let cursor = 0;
    let completed = 0;
    const workers = Array.from({ length: Math.min(3, sourceLines.length) }, async () => {
        while (cursor < sourceLines.length) {
            const index = cursor++;
            try {
                translated[index] = await translateLine(sourceLines[index], fetcher);
                if (translated[index] && translated[index] !== sourceLines[index]) completed += 1;
            } catch {
                translated[index] = sourceLines[index];
            }
        }
    });

    await Promise.all(workers);
    if (!completed) throw new Error('TRANSLATION_UNAVAILABLE');
    return translated;
};
