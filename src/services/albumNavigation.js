const getArtistName = (album, fallbackArtist = '') => {
    if (typeof album?.artist === 'string') return album.artist;
    return album?.artist?.name || album?.artistQuery || fallbackArtist || 'artista';
};

/**
 * Usa el ID estable de Deezer cuando existe. El nombre queda como respaldo para
 * enlaces antiguos y datos provenientes de otras fuentes.
 */
export const getAlbumPath = (album, fallbackArtist = '') => {
    const artist = getArtistName(album, fallbackArtist);
    const target = album?.id || album?.name || album?.title;
    if (!target) return null;
    return `/album/${encodeURIComponent(artist)}/${encodeURIComponent(target)}`;
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
