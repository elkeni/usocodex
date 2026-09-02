import { CONFIG } from './config';
import {
    AUDIO_QUALITY_CHANGE_EVENT,
    getResolvedAudioQualityMode,
} from './audioQuality';
import { getSmartPrefetchPreference } from './experiencePreferences';
import {
    clearTrackUnavailable,
    clearUnavailableTracks,
    getTrackUnavailable,
    markTrackUnavailable,
} from './playbackAvailability';

const SAAVN_TTL_MS = 90 * 60 * 1000;
const SHORT_LIVED_TTL_MS = 3 * 60 * 1000;
const MAX_LOW_PRIORITY_REQUESTS = 4;
const MAX_PREFETCH_BATCH_SIZE = 6;

export const resolvedPlaybacks = new Map();
export const inFlightPlaybacks = new Map();

const inFlightEntries = new Map();
const lowPriorityQueue = [];
let activeLowPriorityRequests = 0;

const normalizeIdentityPart = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const getArtist = (track) => (
    typeof track?.artist === 'string' ? track.artist : track?.artist?.name || track?.creator || ''
);

const getTitle = (track) => track?.name || track?.title || '';

export const getPlaybackPrefetchKey = (track, qualityMode = getResolvedAudioQualityMode()) => (
    `${normalizeIdentityPart(getArtist(track))}::${normalizeIdentityPart(getTitle(track))}::quality:${qualityMode}`
);

export const getPrefetchLimitForQuality = (qualityMode, context = 'search') => {
    if (qualityMode !== 'data_saver') return context === 'discovery' ? 6 : 3;
    return context === 'discovery' ? 0 : 1;
};

const getPlaybackTtl = (playback) => (
    normalizeIdentityPart(playback?.track?.source) === 'saavn' ? SAAVN_TTL_MS : SHORT_LIVED_TTL_MS
);

const isFresh = (entry, now = Date.now()) => (
    Boolean(entry?.playback?.audioUrl) && now - entry.resolvedAt < getPlaybackTtl(entry.playback)
);

const cachePlayback = (key, playback) => {
    const resolvedAt = Date.now();
    const cachedPlayback = {
        ...playback,
        expiresAt: resolvedAt + getPlaybackTtl(playback),
    };
    resolvedPlaybacks.set(key, { playback: cachedPlayback, resolvedAt });
    return cachedPlayback;
};

const normalizePlayback = (payload, fallbackQualityMode) => {
    const playback = payload?.playback || payload;
    if (!playback?.success || !playback.audioUrl) return null;
    return {
        success: true,
        audioUrl: playback.audioUrl,
        quality: playback.quality || null,
        qualityMode: playback.qualityMode || fallbackQualityMode,
        cacheStatus: playback.cacheStatus || payload?.cacheStatus,
        track: {
            title: playback.track?.title || '',
            artist: playback.track?.artist || '',
            thumbnail: playback.track?.thumbnail,
            videoId: playback.track?.videoId,
            source: playback.track?.source,
        },
        timings: playback.timings,
        ms: playback.ms ?? payload?.ms,
    };
};

const buildRequestUrl = (track, qualityMode, endpoint) => {
    const params = new URLSearchParams({
        artist: getArtist(track),
        quality: qualityMode,
    });
    params.set(endpoint === 'prefetch' ? 'title' : 'track', getTitle(track));
    return `${CONFIG.MUSIC_API_URL}/api/${endpoint}?${params.toString()}`;
};

const removeQueuedJob = (entry) => {
    const index = lowPriorityQueue.indexOf(entry);
    if (index >= 0) lowPriorityQueue.splice(index, 1);
};

const pumpLowPriorityQueue = () => {
    while (activeLowPriorityRequests < MAX_LOW_PRIORITY_REQUESTS && lowPriorityQueue.length) {
        const entry = lowPriorityQueue.shift();
        if (!entry || entry.settled) continue;
        if (entry.consumers.size > 0 && [...entry.consumers].every((consumer) => consumer.aborted)) {
            entry.finish(null);
            continue;
        }
        activeLowPriorityRequests += 1;
        entry.lowPrioritySlot = true;
        entry.start();
    }
};

const createInFlightEntry = (track, qualityMode, endpoint, priority) => {
    const key = getPlaybackPrefetchKey(track, qualityMode);
    let resolvePromise;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });
    const entry = {
        key,
        track,
        qualityMode,
        endpoint,
        priority,
        promise,
        consumers: new Set(),
        controller: new AbortController(),
        started: false,
        settled: false,
        lowPrioritySlot: false,
        finish(value) {
            if (entry.settled) return;
            entry.settled = true;
            resolvePromise(value);
            inFlightEntries.delete(key);
            inFlightPlaybacks.delete(key);
            if (entry.lowPrioritySlot) {
                activeLowPriorityRequests = Math.max(0, activeLowPriorityRequests - 1);
                pumpLowPriorityQueue();
            }
        },
        async start() {
            if (entry.started || entry.settled) return;
            entry.started = true;
            try {
                const response = await fetch(buildRequestUrl(track, qualityMode, endpoint), {
                    signal: entry.controller.signal,
                });
                if (response.ok) clearTrackUnavailable(track);
                const payload = await response.json().catch(() => null);
                if (!response.ok || !payload?.success) {
                    if (response.status === 404 || payload?.reason === 'NO_MATCH') {
                        markTrackUnavailable(track, payload?.reason || 'NO_MATCH');
                    }
                    entry.finish(null);
                    return;
                }
                const playback = normalizePlayback(payload, qualityMode);
                if (playback) {
                    clearTrackUnavailable(track);
                    const cachedPlayback = cachePlayback(key, playback);
                    entry.finish(cachedPlayback);
                    return;
                }
                entry.finish(playback);
            } catch {
                entry.finish(null);
            }
        },
    };
    inFlightEntries.set(key, entry);
    inFlightPlaybacks.set(key, promise);
    if (priority === 'low') {
        lowPriorityQueue.push(entry);
        pumpLowPriorityQueue();
    } else {
        entry.start();
    }
    return entry;
};

const attachConsumer = (entry, signal) => {
    const consumer = { aborted: Boolean(signal?.aborted) };
    entry.consumers.add(consumer);
    if (!signal) return;
    const handleAbort = () => {
        consumer.aborted = true;
        const allCancelled = [...entry.consumers].every((item) => item.aborted);
        if (!allCancelled || entry.settled) return;
        if (!entry.started) {
            removeQueuedJob(entry);
            entry.finish(null);
        } else {
            entry.controller.abort();
        }
    };
    if (signal.aborted) handleAbort();
    else signal.addEventListener('abort', handleAbort, { once: true });
};

const get = (track, qualityMode = getResolvedAudioQualityMode()) => {
    const key = getPlaybackPrefetchKey(track, qualityMode);
    const entry = resolvedPlaybacks.get(key);
    if (!entry) return null;
    if (!isFresh(entry)) {
        resolvedPlaybacks.delete(key);
        return null;
    }
    return entry.playback;
};

const resolve = (track, {
    qualityMode = getResolvedAudioQualityMode(),
    endpoint = 'prefetch',
    priority = 'high',
    signal,
    bypassNegativeCache = false,
} = {}) => {
    if (!getArtist(track) || !getTitle(track) || signal?.aborted) return Promise.resolve(null);
    if (!bypassNegativeCache && getTrackUnavailable(track)) return Promise.resolve(null);
    const cached = get(track, qualityMode);
    if (cached) return Promise.resolve(cached);
    const key = getPlaybackPrefetchKey(track, qualityMode);
    let entry = inFlightEntries.get(key);
    if (!entry) {
        entry = createInFlightEntry(track, qualityMode, endpoint, priority);
    } else if (priority === 'high' && !entry.started) {
        removeQueuedJob(entry);
        entry.priority = 'high';
        entry.start();
    }
    attachConsumer(entry, signal);
    return entry.promise;
};

const store = (track, playback, qualityMode = playback?.qualityMode || getResolvedAudioQualityMode()) => {
    const normalized = normalizePlayback(playback, qualityMode);
    if (!normalized) return null;
    return cachePlayback(getPlaybackPrefetchKey(track, qualityMode), normalized);
};

const invalidate = (track, qualityMode = getResolvedAudioQualityMode()) => {
    resolvedPlaybacks.delete(getPlaybackPrefetchKey(track, qualityMode));
};

const invalidateIncompatible = (qualityMode = getResolvedAudioQualityMode()) => {
    for (const key of resolvedPlaybacks.keys()) {
        if (!key.endsWith(`quality:${qualityMode}`)) resolvedPlaybacks.delete(key);
    }
    for (const [key, entry] of inFlightEntries) {
        if (key.endsWith(`quality:${qualityMode}`)) continue;
        removeQueuedJob(entry);
        entry.controller.abort();
        entry.finish(null);
    }
};

const clear = () => {
    resolvedPlaybacks.clear();
    lowPriorityQueue.length = 0;
    for (const entry of inFlightEntries.values()) {
        entry.controller.abort();
        entry.finish(null);
    }
    clearUnavailableTracks();
};

export const playbackPrefetchService = {
    get,
    getInFlight(track, qualityMode = getResolvedAudioQualityMode()) {
        return inFlightPlaybacks.get(getPlaybackPrefetchKey(track, qualityMode)) || null;
    },
    resolve,
    prefetch(track, options = {}) {
        if (!getSmartPrefetchPreference()) return Promise.resolve(null);
        return resolve(track, { ...options, endpoint: 'prefetch', priority: options.priority || 'low' });
    },
    async prefetchMany(tracks, { limit = 4, concurrency = 4, signal, qualityMode } = {}) {
        if (!getSmartPrefetchPreference()) return [];
        const selected = (tracks || []).filter(Boolean).slice(0, Math.min(limit, MAX_PREFETCH_BATCH_SIZE));
        const results = new Array(selected.length).fill(null);
        let cursor = 0;
        const worker = async () => {
            while (!signal?.aborted) {
                const index = cursor++;
                if (index >= selected.length) return;
                results[index] = await resolve(selected[index], {
                    qualityMode,
                    endpoint: 'prefetch',
                    priority: 'low',
                    signal,
                });
            }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, MAX_LOW_PRIORITY_REQUESTS, selected.length) }, worker));
        return results;
    },
    store,
    invalidate,
    invalidateIncompatible,
    clear,
};

globalThis.addEventListener?.(AUDIO_QUALITY_CHANGE_EVENT, () => {
    playbackPrefetchService.invalidateIncompatible();
});
