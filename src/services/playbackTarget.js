// Preserve recording identity across playback, prefetch and client caches.
export const getPlaybackTarget = (track = {}) => {
    const rawDuration = track.duration;
    const duration = typeof rawDuration === 'string' && rawDuration.includes(':')
        ? rawDuration.split(':').reduce((total, part) => total * 60 + Number(part), 0)
        : Number(rawDuration) || 0;
    const rawExplicit = track.explicit ?? track.explicit_lyrics ?? track.isExplicit;
    return {
        artist: typeof track.artist === 'string' ? track.artist : track.artist?.name || track.creator || '',
        track: track.title || track.name || '',
        duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
        album: typeof track.album === 'string' ? track.album : track.album?.title || track.album?.name || '',
        explicit: typeof rawExplicit === 'boolean' ? rawExplicit : undefined,
    };
};

export const appendPlaybackTarget = (params, track) => {
    const target = getPlaybackTarget(track);
    if (target.duration) params.set('duration', String(target.duration));
    if (target.album) params.set('album', target.album);
    if (target.explicit !== undefined) params.set('explicit', String(target.explicit));
    return params;
};

export const getRecordingCacheKey = (track, qualityMode) => {
    const target = getPlaybackTarget(track);
    const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    return JSON.stringify([normalize(target.artist), normalize(target.track), target.duration,
        normalize(target.album), target.explicit ?? null, qualityMode]);
};
