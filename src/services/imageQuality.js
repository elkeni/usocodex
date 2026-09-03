const ARTWORK_SIZES = [96, 160, 250, 500, 1000];

const isUsableUrl = (value) => typeof value === 'string' && /^(https?:|data:|blob:)/i.test(value.trim());

const getArrayImage = (images) => {
    if (!Array.isArray(images)) return '';
    const order = ['mega', 'extralarge', 'large', 'medium', 'small'];
    for (const size of order) {
        const match = images.find((image) => image?.size === size && isUsableUrl(image?.['#text']));
        if (match) return match['#text'];
    }
    return images.map((image) => image?.['#text']).find(isUsableUrl) || '';
};

/** Prioriza siempre la fuente de mayor resolución disponible. */
export const getBestArtworkUrl = (item, fallback = '') => {
    if (isUsableUrl(item)) return item.trim();
    if (Array.isArray(item)) return getArrayImage(item) || fallback;
    if (!item || typeof item !== 'object') return fallback;

    const candidates = [
        item.image_xl,
        item.picture_xl,
        item.cover_xl,
        item.album?.cover_xl,
        item.artist?.picture_xl,
        item.image_big,
        item.picture_big,
        item.cover_big,
        item.album?.cover_big,
        typeof item.image === 'string' ? item.image : '',
        getArrayImage(item.image),
        item.picture_medium,
        item.cover_medium,
        item.album?.cover_medium,
        item.thumbnail,
    ];

    return candidates.find(isUsableUrl)?.trim() || fallback;
};

const nearestArtworkSize = (requested) => (
    ARTWORK_SIZES.find((size) => size >= Number(requested || 500)) || ARTWORK_SIZES.at(-1)
);

export const supportsResponsiveArtwork = (url) => (
    typeof url === 'string' && (
        (url.includes('dzcdn.net') && /\/\d+x\d+(?=[/-])/.test(url))
        || (/lastfm[^/]*\.(?:net|com)/i.test(url) && /\/i\/u\/(?:\d+x\d+|avatar\d+s?)\//i.test(url))
    )
);

/** Cambia solo URLs de CDN que oficialmente codifican el tamaño en la ruta. */
export const resizeArtworkUrl = (url, requestedSize = 500) => {
    if (!isUsableUrl(url)) return url || '';
    const size = nearestArtworkSize(requestedSize);

    if (url.includes('dzcdn.net')) {
        return url.replace(/\/\d+x\d+(?=[/-])/, `/${size}x${size}`);
    }
    if (/lastfm[^/]*\.(?:net|com)/i.test(url)) {
        return url.replace(/\/i\/u\/(?:\d+x\d+|avatar\d+s?)\//i, `/i/u/${size}x${size}/`);
    }
    return url;
};

export const buildArtworkSrcSet = (url, maxSize = 1000) => {
    if (!supportsResponsiveArtwork(url)) return undefined;
    return ARTWORK_SIZES
        .filter((size) => size >= 250 && size <= maxSize)
        .map((size) => `${resizeArtworkUrl(url, size)} ${size}w`)
        .join(', ');
};

export const getArtworkImageProps = (item, {
    fallback = '',
    size = 500,
    maxSize = 1000,
    sizes = '(max-width: 600px) 44vw, 220px',
} = {}) => {
    const source = getBestArtworkUrl(item, fallback);
    return {
        src: resizeArtworkUrl(source, size),
        srcSet: buildArtworkSrcSet(source, maxSize),
        sizes,
        decoding: 'async',
    };
};

export { ARTWORK_SIZES };
