const normalizeToken = (value) => String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es');

export const getTrackArtist = (track) => {
    if (typeof track?.artist === 'string') return track.artist;
    return track?.artist?.name || track?.artist?.['#text'] || '';
};

export const getTrackIdentity = (track) => {
    if (!track) return '';
    if (track.queueEntryId) return `entry:${track.queueEntryId}`;

    const source = normalizeToken(track.source || track.provider);
    const id = normalizeToken(track.id || track.originalId || track.videoId);
    const artistId = normalizeToken(track.artistId || track.artist?.id);
    const artist = normalizeToken(getTrackArtist(track));
    const albumId = normalizeToken(track.albumId || track.album?.id);
    const album = normalizeToken(typeof track.album === 'string' ? track.album : track.album?.name || track.album?.title);
    const title = normalizeToken(track.name || track.title);
    const duration = Number(track.duration) || 0;

    if (id) return `track:${source}:${artistId || artist}:${id}`;
    return `meta:${artistId || artist}:${albumId || album}:${title}:${duration}`;
};

export const isSameTrack = (left, right) => {
    if (!left || !right) return false;
    if (left.queueEntryId && right.queueEntryId) return left.queueEntryId === right.queueEntryId;

    const leftId = getTrackIdentity({ ...left, queueEntryId: undefined });
    const rightId = getTrackIdentity({ ...right, queueEntryId: undefined });
    return Boolean(leftId && leftId === rightId);
};

export const findQueueIndex = (queue, track) => {
    if (!Array.isArray(queue) || !track) return -1;
    return queue.findIndex((candidate) => isSameTrack(candidate, track));
};

const defaultEntryId = () => {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const prepareQueue = (tracks, selectedTrack = null, idFactory = defaultEntryId) => {
    if (!Array.isArray(tracks)) return [];

    const prepared = tracks.filter(Boolean).map((track) => (
        track.queueEntryId ? track : { ...track, queueEntryId: idFactory() }
    ));

    if (!selectedTrack) return prepared;
    const selectedIndex = findQueueIndex(prepared, selectedTrack);
    if (selectedIndex < 0) return prepared;

    prepared[selectedIndex] = {
        ...prepared[selectedIndex],
        ...selectedTrack,
        queueEntryId: prepared[selectedIndex].queueEntryId,
    };
    return prepared;
};

export const shuffleQueueFromTrack = (queue, currentTrack, random = Math.random) => {
    if (!Array.isArray(queue) || queue.length === 0) return [];
    const currentIndex = findQueueIndex(queue, currentTrack);
    const current = currentIndex >= 0 ? queue[currentIndex] : currentTrack;
    const rest = queue.filter((_, index) => index !== currentIndex);

    for (let index = rest.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [rest[index], rest[swapIndex]] = [rest[swapIndex], rest[index]];
    }
    return current ? [current, ...rest] : rest;
};

export const getNextQueuePosition = ({ length, currentIndex, repeatMode }) => {
    if (!Number.isInteger(length) || length <= 0) return -1;
    if (repeatMode === 2 && currentIndex >= 0) return currentIndex;
    const next = currentIndex + 1;
    if (next < length) return next;
    return repeatMode === 1 ? 0 : -1;
};

export const appendUniqueTracks = (queue, tracks) => {
    const nextQueue = Array.isArray(queue) ? [...queue] : [];
    const identities = new Set(nextQueue.map((track) => getTrackIdentity({ ...track, queueEntryId: undefined })));

    for (const track of tracks || []) {
        if (!track) continue;
        const identity = getTrackIdentity({ ...track, queueEntryId: undefined });
        if (!identity || identities.has(identity)) continue;
        identities.add(identity);
        nextQueue.push(track.queueEntryId ? track : { ...track, queueEntryId: defaultEntryId() });
    }
    return nextQueue;
};

export const stripEphemeralAudio = (track) => {
    if (!track) return track;
    const { url, urlSource, urlResolvedAt: _urlResolvedAt, ...persistable } = track;
    if (urlSource === 'preview') return { ...persistable, url, urlSource };
    return persistable;
};

export const serializeQueueSnapshot = ({ queue, currentTrack, currentIndex, shuffledQueue, shuffledIndex }) => ({
    version: 2,
    queue: (queue || []).map(stripEphemeralAudio),
    currentTrack: stripEphemeralAudio(currentTrack),
    currentIndex,
    shuffledQueue: (shuffledQueue || []).map(stripEphemeralAudio),
    shuffledIndex,
});
