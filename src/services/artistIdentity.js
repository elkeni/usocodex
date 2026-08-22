export const normalizeArtistName = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const getArtistId = (artist) => {
    if (!artist || typeof artist !== 'object') return null;
    // En elementos importados, `id` puede ser un UUID local mientras que
    // `originalId` conserva la identidad real del catálogo.
    return artist.artistId || artist.originalId || artist.id || null;
};

export const getArtistName = (artist, fallback = '') => {
    if (typeof artist === 'string') return artist;
    if (typeof artist?.artist === 'string') return artist.artist;
    if (artist?.artist && typeof artist.artist === 'object') return artist.artist.name || fallback;
    return artist?.artistName || artist?.name || fallback;
};

export const getArtistPath = (artist, fallback = '') => {
    const target = getArtistId(artist) || getArtistName(artist, fallback);
    return target ? `/artist/${encodeURIComponent(target)}` : null;
};

// Dos IDs distintos nunca representan al mismo artista. Si faltan IDs, sólo
// admitimos igualdad normalizada exacta; las coincidencias parciales mezclan
// fácilmente artistas como Queen, Queen Naija o nombres homónimos.
export const isSameArtist = (left, right) => {
    const leftId = getArtistId(left);
    const rightId = getArtistId(right);
    if (leftId && rightId) return String(leftId) === String(rightId);

    const leftName = normalizeArtistName(getArtistName(left));
    const rightName = normalizeArtistName(getArtistName(right));
    return Boolean(leftName && rightName && leftName === rightName);
};

export const isArtistCreditMatch = (requestedArtist, candidateCredit) => {
    const requested = normalizeArtistName(requestedArtist);
    const candidate = normalizeArtistName(candidateCredit);
    if (!requested || !candidate) return false;
    if (requested === candidate) return true;

    return String(candidateCredit || '')
        .split(/\s+(?:feat\.?|ft\.?|featuring|with)\s+|\s*[,&;]\s*/i)
        .map(normalizeArtistName)
        .some((credit) => credit === requested);
};
