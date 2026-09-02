const getArtistName = (album, fallbackArtist = '') => {
    if (typeof album?.artist === 'string') return album.artist;
    return album?.artist?.name || album?.artistQuery || fallbackArtist || 'artista';
};

const decodeRoutePart = (value) => {
    try {
        return decodeURIComponent(String(value || ''));
    } catch {
        return String(value || '');
    }
};

const restoreSyntheticText = (value) => decodeRoutePart(value).replace(/_+/g, ' ').trim();
const isNumericDeezerId = (value) => /^\d+$/.test(String(value || '').trim());

export const parseSyntheticAlbumId = (value) => {
    const decoded = decodeRoutePart(value);
    if (!decoded.startsWith('album_') || !decoded.includes('::')) return null;
    const separatorIndex = decoded.indexOf('::');
    const artist = restoreSyntheticText(decoded.slice('album_'.length, separatorIndex));
    const title = restoreSyntheticText(decoded.slice(separatorIndex + 2));
    if (!artist || !title) return null;
    return { artist, title };
};

export const resolveAlbumIdentity = ({ albumId, artist, name, deezerId } = {}) => {
    const numericId = [deezerId, albumId].find(isNumericDeezerId);
    if (numericId) {
        const stableId = String(numericId).trim();
        return { deezerId: stableId, artist: '', title: '', stableKey: `deezer:${stableId}` };
    }

    const synthetic = parseSyntheticAlbumId(albumId);
    const resolvedArtist = synthetic?.artist || restoreSyntheticText(artist);
    const resolvedTitle = synthetic?.title || restoreSyntheticText(name || albumId);
    return {
        deezerId: null,
        artist: resolvedArtist,
        title: resolvedTitle,
        stableKey: `catalog:${resolvedArtist.toLowerCase()}::${resolvedTitle.toLowerCase()}`,
    };
};

const albumDetailRequests = new Map();

export const loadAlbumDetailsDeduped = (identity, loader) => {
    if (!identity?.stableKey || typeof loader !== 'function') return Promise.resolve(null);
    const existing = albumDetailRequests.get(identity.stableKey);
    if (existing) return existing;

    const request = Promise.resolve().then(() => (
        identity.deezerId
            ? loader(identity.deezerId, '')
            : loader(identity.title, identity.artist)
    ));
    albumDetailRequests.set(identity.stableKey, request);
    const cleanup = () => {
        if (albumDetailRequests.get(identity.stableKey) === request) {
            albumDetailRequests.delete(identity.stableKey);
        }
    };
    request.then(cleanup, cleanup);
    return request;
};

/**
 * Usa el ID estable de Deezer cuando existe. El nombre queda como respaldo para
 * enlaces antiguos y datos provenientes de otras fuentes.
 */
export const getAlbumPath = (album, fallbackArtist = '') => {
    const artist = getArtistName(album, fallbackArtist);
    const deezerId = [album?.deezerId, album?.originalId, album?.id].find(isNumericDeezerId);
    if (deezerId) return `/album/${encodeURIComponent(deezerId)}`;

    const synthetic = parseSyntheticAlbumId(album?.id || album?.originalId);
    if (synthetic) {
        return `/album/${encodeURIComponent(synthetic.artist)}/${encodeURIComponent(synthetic.title)}`;
    }

    const title = album?.name || album?.title;
    if (!title) return null;
    return `/album/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
};

export const shuffleAlbumTracks = (source, random = Math.random) => {
    const shuffled = [...(source || [])];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
};

export default getAlbumPath;
