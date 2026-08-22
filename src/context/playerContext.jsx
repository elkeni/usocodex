import {
    createContext,
    useState,
    useContext,
    useRef,
    useEffect,
    useCallback,
    useMemo,
} from "react";
import { fetchAudioUrl } from "../services/unifiedService";
import { buildRadioQueue } from "../services/radioService";
import { PRODUCT_EVENTS, recordProductEvent } from "../services/productMetrics";

const PlayerContext = createContext(null);
export const usePlayer = () => useContext(PlayerContext);

const PlayerActionsContext = createContext(null);
export const usePlayerActions = () => useContext(PlayerActionsContext);


const safeJsonParse = (key, fallback) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const safeInt = (key, fallback = -1) => {
    try {
        const v = parseInt(localStorage.getItem(key), 10);
        return Number.isFinite(v) ? v : fallback;
    } catch {
        return fallback;
    }
};

const getSafeString = (val) => {
    if (typeof val === "object" && val !== null) {
        return String(val.name || val["#text"] || "");
    }
    return val == null ? "" : String(val);
};

const makeTrackKey = (track) => {
    const name = getSafeString(track?.name || track?.title).toLowerCase();
    const artist = getSafeString(track?.artist).toLowerCase();
    return `${artist}-${name}`.trim();
};

const makeAudioCacheKey = (track) => {
    const name = getSafeString(track?.name || track?.title).toLowerCase();
    const artist = getSafeString(track?.artistId || track?.artist).toLowerCase();
    const duration = track?.duration || 0;
    return `${artist}-${name}-${duration}`.trim();
};

const makeFailureKey = (track) => {
    const name = getSafeString(track?.name || track?.title).toLowerCase();
    const artist = getSafeString(track?.artistId || track?.artist).toLowerCase();
    return `${artist}::${name}`;
};

const findTrackIndex = (arr, track) => {
    if (!arr || !arr.length || !track) return -1;
    const id = track.id;
    const key = makeTrackKey(track);

    const idx = arr.findIndex((t) => (id && t.id && t.id === id) || makeTrackKey(t) === key);
    return idx;
};

const useThrottledEffect = (fn, deps, delay = 250) => {
    const t = useRef(null);
    useEffect(() => {
        if (t.current) clearTimeout(t.current);
        t.current = setTimeout(() => fn(), delay);
        return () => t.current && clearTimeout(t.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
};

const PROGRESS_THROTTLE_MS = 250;        // Throttle para actualizaciones de progreso

const AUDIO_LOAD_TIMEOUT_MS = 6000;      // Timeout para carga de audio (reducido para reproducción inmediata)
// [CIRUGÍA] Eliminado ERROR_RETRY_MAX - el backend ya decidió, no reitentar

export const PlayerProvider = ({ children }) => {
    const [currentTrack, setCurrentTrack] = useState(() => safeJsonParse("paradox_track", null));
    const [queue, setQueue] = useState(() => safeJsonParse("paradox_queue", []));
    const [currentIndex, setCurrentIndex] = useState(() => safeInt("paradox_index", -1));

    const [cachedAudioUrl, setCachedAudioUrl] = useState(() =>
        safeJsonParse("paradox_audio_cache", null)
    );
    const cachedAudioUrlRef = useRef(cachedAudioUrl);

    const [volume, setVolumeState] = useState(() => {
        try {
            const stored = localStorage.getItem("paradox_volume");
            if (!stored) return 0.5;
            const val = parseFloat(stored);
            return val > 1 ? val / 100 : val;
        } catch {
            return 0.5;
        }
    });

    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [played, setPlayed] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [errorMsg, setErrorMsg] = useState(null);

    const [isShuffle, setIsShuffle] = useState(() => {
        try {
            const saved = localStorage.getItem("paradox_shuffle");
            return saved ? JSON.parse(saved) : false;
        } catch {
            return false;
        }
    });

    const [repeatMode, setRepeatMode] = useState(() => {
        try {
            const saved = localStorage.getItem("paradox_repeat_mode");
            return saved ? parseInt(saved, 10) : 0; // 0 none, 1 all, 2 one
        } catch {
            return 0;
        }
    });

    const [shuffledQueue, setShuffledQueue] = useState([]);
    const [shuffledIndex, setShuffledIndex] = useState(-1);

    const [listeningHistory, setListeningHistory] = useState(() =>
        safeJsonParse("paradox_listening_history", [])
    );
    const [historyPaused, setHistoryPaused] = useState(() =>
        safeJsonParse("paradox_history_paused", false)
    );

    // Engagement tracking: artistas que gustan vs no gustan
    // { likedArtists: { "Artist Name": score }, skippedArtists: { "Artist Name": count } }
    const [tasteEngagement, setTasteEngagement] = useState(() =>
        safeJsonParse("paradox_taste_engagement", { likedArtists: {}, skippedArtists: {} })
    );

    // [AUTOMIX] Crossfade Start
    const [isCrossfadeEnabled, setIsCrossfadeEnabled] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem("paradox_crossfade_enabled") || "false");
        } catch { return false; }
    });
    const CROSSFADE_DURATION = 6; // Segundos de overlap
    const isCrossfadingRef = useRef(false);
    const audioListenersCleanupRef = useRef(null); // Para limpiar listeners al hacer swap
    const performCrossfadeRef = useRef(null);
    const finalizeCrossfadeRef = useRef(null);

    // [NUEVO] Context Awareness
    // Identifica qué sección "manda" en la reproducción actual
    const [playbackContext, setPlaybackContext] = useState(null); // { id, type, name }

    // Ref para trackear tiempo de reproducción del track actual
    const playStartTimeRef = useRef(null);
    const currentTrackKeyRef = useRef(null);
    const historyRecordedKeyRef = useRef(null);
    const playbackStartedKeyRef = useRef(null);
    const historyPausedRef = useRef(historyPaused);

    const [isQueueOpen, setIsQueueOpen] = useState(false);

    // =========================
    // Refs (evitan closures viejas)
    // =========================
    // =========================
    // Refs (evitan closures viejas)
    // =========================
    // [FIX AUTOMIX] Punteros lógicos (swappables)
    const audioRef = useRef(null);      // Siempre apunta al que SUEÑA (Active)
    const nextAudioRef = useRef(null);  // Siempre apunta al que CARGA (Buffer)

    // [FIX AUTOMIX] Refs físicos (DOM elements fijos)
    const playerARef = useRef(null);
    const playerBRef = useRef(null);

    const prefetchCacheRef = useRef(new Map()); // Cache de URLs futuras: Key -> { url, status, timestamp }
    const PREFETCH_LOOKAHEAD = 4;               // Reserva suficiente para varios saltos en segundo plano

    // [FIX #1] Contador incremental para requestId (evita race conditions de Date.now())
    const requestSeqRef = useRef(0);
    const activeRequestId = useRef(0);

    // Helper para obtener un requestId único
    const nextRequestId = useCallback(() => {
        requestSeqRef.current += 1;
        return requestSeqRef.current;
    }, []);

    const queueRef = useRef(queue);
    const indexRef = useRef(currentIndex);

    const shuffledQueueRef = useRef(shuffledQueue);
    const shuffledIndexRef = useRef(shuffledIndex);

    const skipRef = useRef(null);
    const previousRef = useRef(null);

    // =========================
    // Prefetch refs
    // =========================
    const prefetchedNextUrl = useRef(null);
    const prefetchedNextTrack = useRef(null);
    const isPrefetching = useRef(false);
    const prefetchTriggeredForTrack = useRef(""); // trackKey para evitar spam

    // [FIX #3] Throttle para progress updates
    const lastProgressUpdateRef = useRef(0);

    // [CIRUGÍA] Eliminado trackErrorRetryRef - no hay reintentos automáticos

    // [FIX iOS #1] Refs para evitar recreación de listeners
    // Los handlers leen de estos refs en vez de closures
    const currentTrackRef = useRef(currentTrack);
    const durationRef = useRef(duration);
    const volumeRef = useRef(volume);

    // [FIX iOS #2] Mutex para evitar doble avance (ended + error racing)
    const isAdvancingRef = useRef(false);

    // [FIX LOOP] Memoria de tracks que ya fallaron - evita reintentos infinitos
    const failedTracksRef = useRef(new Set());
    const errorTimeoutRef = useRef(null);



    // =========================
    // Utilidad UI
    // =========================
    const showError = useCallback((msg) => {
        setErrorMsg(msg);
        window.clearTimeout(errorTimeoutRef.current);
        errorTimeoutRef.current = window.setTimeout(() => setErrorMsg(null), 4000);
    }, []);

    useEffect(() => () => window.clearTimeout(errorTimeoutRef.current), []);

    // Helper para limpiar prefetch (evita repetición)
    const clearPrefetch = useCallback(() => {
        prefetchedNextUrl.current = null;
        prefetchedNextTrack.current = null;
        prefetchTriggeredForTrack.current = "";
    }, []);

    // Helper para verificar si toda la cola ha fallado
    const checkIfAllQueueFailed = useCallback(() => {
        const q = queueRef.current;
        return q.length > 0 && q.every((track) => failedTracksRef.current.has(makeFailureKey(track)));
    }, []);

    const setVolume = useCallback((val) => {
        const newVol = parseFloat(val);
        const safeVal = newVol > 1 ? newVol / 100 : newVol;
        const a = audioRef.current;
        if (a) a.volume = safeVal;
        setVolumeState(safeVal);
    }, []);

    // =========================
    // Refs sync
    // =========================
    useEffect(() => {
        queueRef.current = queue;
        indexRef.current = currentIndex;
    }, [queue, currentIndex]);

    useEffect(() => {
        cachedAudioUrlRef.current = cachedAudioUrl;
    }, [cachedAudioUrl]);

    useEffect(() => {
        shuffledQueueRef.current = shuffledQueue;
        shuffledIndexRef.current = shuffledIndex;
    }, [shuffledQueue, shuffledIndex]);

    // [FIX iOS #1] Sync refs para listeners estables
    useEffect(() => {
        currentTrackRef.current = currentTrack;
    }, [currentTrack]);

    useEffect(() => {
        durationRef.current = duration;
    }, [duration]);

    useEffect(() => {
        volumeRef.current = volume;
    }, [volume]);

    useEffect(() => {
        historyPausedRef.current = historyPaused;
        try { localStorage.setItem("paradox_history_paused", JSON.stringify(historyPaused)); } catch { }
    }, [historyPaused]);

    // =========================
    // Persistencia (throttle con try/catch)
    // =========================
    useThrottledEffect(
        () => {
            try {
                localStorage.setItem("paradox_track", JSON.stringify(currentTrack));
                localStorage.setItem("paradox_queue", JSON.stringify(queue));
                localStorage.setItem("paradox_index", String(currentIndex));
                if (cachedAudioUrl) localStorage.setItem("paradox_audio_cache", JSON.stringify(cachedAudioUrl));
            } catch {
                // iOS puede fallar en private mode - no bloquear reproducción
            }
        },
        [currentTrack, queue, currentIndex, cachedAudioUrl],
        250
    );

    useEffect(() => {
        try {
            localStorage.setItem("paradox_shuffle", JSON.stringify(isShuffle));
        } catch { }
    }, [isShuffle]);

    useEffect(() => {
        try {
            localStorage.setItem("paradox_repeat_mode", String(repeatMode));
        } catch { }
    }, [repeatMode]);

    useThrottledEffect(
        () => {
            try {
                localStorage.setItem("paradox_listening_history", JSON.stringify(listeningHistory));
            } catch { }
        },
        [listeningHistory],
        500
    );
    useThrottledEffect(
        () => {
            try {
                localStorage.setItem("paradox_taste_engagement", JSON.stringify(tasteEngagement));
            } catch { }
        },
        [tasteEngagement],
        1000
    );

    useEffect(() => {
        try {
            localStorage.setItem("paradox_crossfade_enabled", JSON.stringify(isCrossfadeEnabled));
        } catch { }
    }, [isCrossfadeEnabled]);

    // =========================
    // Shuffle helpers
    // =========================
    const generateShuffledQueue = useCallback((originalQueue, current) => {
        if (!current || !originalQueue?.length) return originalQueue || [];
        const shuffled = [...originalQueue];

        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const currentKey = makeTrackKey(current);
        let pos = shuffled.findIndex((t) => makeTrackKey(t) === currentKey);

        if (pos === -1) {
            shuffled.unshift(current);
            return shuffled;
        }

        const [cur] = shuffled.splice(pos, 1);
        shuffled.unshift(cur);
        return shuffled;
    }, []);

    // [FIX #6] Helper para sincronizar índices por trackId
    const syncIndicesByTrackId = useCallback((trackId, trackObj) => {
        if (!trackId && !trackObj) return;

        const targetId = trackId || trackObj?.id;
        const targetKey = trackObj ? makeTrackKey(trackObj) : null;

        // Actualizar currentIndex en cola original
        const originalIdx = queue.findIndex(t =>
            (targetId && t.id === targetId) || (targetKey && makeTrackKey(t) === targetKey)
        );
        if (originalIdx >= 0) setCurrentIndex(originalIdx);

        // Si shuffle está activo, también actualizar shuffledIndex
        if (isShuffle && shuffledQueue.length) {
            const shuffledIdx = shuffledQueue.findIndex(t =>
                (targetId && t.id === targetId) || (targetKey && makeTrackKey(t) === targetKey)
            );
            if (shuffledIdx >= 0) setShuffledIndex(shuffledIdx);
        }
    }, [queue, isShuffle, shuffledQueue]);

    // =========================
    // [FIX PROD] Refs y callbacks indirectos para audio events
    // Deben estar ANTES del useEffect que los usa
    // =========================
    const handleAudioEndedInternalRef = useRef(null);
    const prefetchNextTrackInternalRef = useRef(null);

    const handleAudioEndedInternal = useCallback(() => {
        if (handleAudioEndedInternalRef.current) {
            handleAudioEndedInternalRef.current();
        }
    }, []);

    const prefetchNextTrackInternal = useCallback(() => {
        if (prefetchNextTrackInternalRef.current) {
            prefetchNextTrackInternalRef.current();
        }
    }, []);

    // =========================
    // [FIX #2] Audio event listeners centralizados
    // Solo un punto controla play/pause basado en eventos reales del audio
    // [FIX iOS #1] Los handlers leen de refs para evitar recreación
    // =========================
    // =========================
    // [FIX #2] Audio event listeners centralizados & AUTOMIX Support
    // =========================

    // Función factoría para crear los listeners (se usa en init y en swap de crossfade)
    const setupAudioEvents = useCallback((a) => {
        if (!a) return () => { };

        // Evento: audio comenzó a reproducir
        const onPlay = () => {
            setIsPlaying(true);
            setIsBuffering(false);
            const track = currentTrackRef.current;
            const key = makeTrackKey(track);
            if (key && playbackStartedKeyRef.current !== key) {
                playbackStartedKeyRef.current = key;
                recordProductEvent(PRODUCT_EVENTS.PLAYBACK_STARTED);
            }
        };

        // Evento: audio pausado
        const onPause = () => {
            // Si estamos en crossfade, no reportar pausa (es técnico)
            if (isCrossfadingRef.current) return;
            setIsPlaying(false);
        };

        // Evento: esperando datos (buffering)
        const onWaiting = () => {
            setIsBuffering(true);
            setIsLoading(true);
        };

        // Evento: listo para reproducir
        const onCanPlay = () => {
            setIsBuffering(false);
            setIsLoading(false);
        };

        // Evento: audio terminó
        const onEnded = (e) => {
            // [FIX BUG SALTO 2] Ignorar si evento viene de player inactivo
            if (e.target !== audioRef.current) return;

            // Si estamos en crossfade, el 'ended' del audio viejo se ignora o maneja internamente
            if (isCrossfadingRef.current) return;
            handleAudioEndedInternal();
        };

        // [FIX #3] Evento: timeupdate con throttle
        const onTimeUpdate = (e) => {
            // [FIX BUG SALTO 2] Ignorar timeupdate de player inactivo
            if (e.target !== audioRef.current) return;

            const now = Date.now();
            if (now - lastProgressUpdateRef.current < PROGRESS_THROTTLE_MS) return;
            lastProgressUpdateRef.current = now;

            if (!a.duration || !Number.isFinite(a.duration)) return;

            const ct = a.currentTime;
            const dur = a.duration;

            setCurrentTime(ct);
            setPlayed(ct / dur);

            const track = currentTrackRef.current;
            const key = makeTrackKey(track);
            if (ct >= 30 && key && historyRecordedKeyRef.current !== key) {
                historyRecordedKeyRef.current = key;
                recordProductEvent(PRODUCT_EVENTS.PLAYBACK_30_SECONDS);
                if (!historyPausedRef.current) {
                    const artist = getSafeString(track?.artist);
                    const name = getSafeString(track?.name || track?.title);
                    const image = track?.image || track?.album?.cover_xl || track?.album?.cover_big || track?.picture_xl || "";
                    setListeningHistory((previous) => {
                        const entry = { name, artist, image, timestamp: Date.now(), duration: track?.duration || dur || 0 };
                        return [entry, ...previous.filter((item) => makeTrackKey(item) !== key)].slice(0, 100);
                    });
                }
            }

            // Sincronizar duration si difiere significativamente
            const currentDuration = durationRef.current;
            if (Number.isFinite(dur) && dur > 0 && Math.abs(currentDuration - dur) > 0.5) {
                setDuration(dur);
            }

            // [AUTOMIX] Detector de transición Crossfade
            // Chequeamos refs directamente para evitar closures viejos en callbacks
            if (isCrossfadeEnabled && document.visibilityState !== 'hidden' && !isCrossfadingRef.current && dur > 0) {
                const remaining = dur - ct;
                // Iniciar si falta poco, pero no si la canción es muy corta (<20s)
                if (remaining <= CROSSFADE_DURATION && remaining > 1 && dur > 20) {
                    // Verificar si tenemos el siguiente listo
                    if (prefetchedNextUrl.current && prefetchedNextTrack.current) {
                        performCrossfadeRef.current?.();
                    }
                }
            }

            // [PREFETCH MANTENIMIENTO]
            const shouldRetryPrefetch = (dur > 0 && ct > 5) && !prefetchedNextUrl.current && !isPrefetching.current;
            if (shouldRetryPrefetch) {
                // console.log(`[PlayerContext] 🔄 Reintentando prefetch at ${Math.round(ct)}s`);
                prefetchNextTrackInternal();
            }
        };

        // Evento: duración cambió
        const onDurationChange = () => {
            if (a.duration && Number.isFinite(a.duration)) {
                setDuration(a.duration);
            }
        };

        // [CIRUGÍA] Evento error
        const onError = () => {
            if (isCrossfadingRef.current) return; // Ignorar errores durante transición crítica por ahora

            if (isAdvancingRef.current) return;
            isAdvancingRef.current = true;

            const track = currentTrackRef.current;
            const artistName = getSafeString(track?.artist);
            const trackName = getSafeString(track?.name || track?.title);
            const failedKey = makeFailureKey(track);

            failedTracksRef.current.add(failedKey);
            console.error(`[PlayerContext] ❌ Error de audio: ${artistName} - ${trackName}`);

            if (checkIfAllQueueFailed()) {
                console.error('[PlayerContext] 🛑 Toda la cola ha fallado. Deteniendo reproducción.');
                a.pause();
                setIsPlaying(false);
                setIsLoading(false);
                setErrorMsg('No pudimos reproducir esta selección. Algunas canciones no están disponibles.');
                isAdvancingRef.current = false;
                return;
            }

            setTimeout(() => {
                if (skipRef.current) skipRef.current(true);
                isAdvancingRef.current = false;
            }, 300);
        };

        const onVolumeChange = () => {
            const currentVol = volumeRef.current;
            if (Math.abs(a.volume - currentVol) > 0.01) {
                setVolumeState(a.volume);
            }
        };

        // Registrar
        a.addEventListener("play", onPlay);
        a.addEventListener("pause", onPause);
        a.addEventListener("waiting", onWaiting);
        a.addEventListener("canplay", onCanPlay);
        a.addEventListener("ended", onEnded);
        a.addEventListener("timeupdate", onTimeUpdate);
        a.addEventListener("durationchange", onDurationChange);
        a.addEventListener("error", onError);
        a.addEventListener("volumechange", onVolumeChange);

        return () => {
            a.removeEventListener("play", onPlay);
            a.removeEventListener("pause", onPause);
            a.removeEventListener("waiting", onWaiting);
            a.removeEventListener("canplay", onCanPlay);
            a.removeEventListener("ended", onEnded);
            a.removeEventListener("timeupdate", onTimeUpdate);
            a.removeEventListener("durationchange", onDurationChange);
            a.removeEventListener("error", onError);
            a.removeEventListener("volumechange", onVolumeChange);
        };
    }, [isCrossfadeEnabled, checkIfAllQueueFailed, handleAudioEndedInternal, prefetchNextTrackInternal]);

    // [AUTOMIX] Lógica de ejecución
    const performCrossfade = useCallback(() => {
        const nextUrl = prefetchedNextUrl.current;
        const nextTrack = prefetchedNextTrack.current;
        const mainAudio = audioRef.current;
        const secondAudio = nextAudioRef.current;

        if (!nextUrl || !nextTrack || !mainAudio || !secondAudio) return;

        console.log('[Automix] 🔀 Iniciando Crossfade...');
        isCrossfadingRef.current = true;

        // Preparar audio 2
        secondAudio.src = nextUrl;
        secondAudio.volume = 0; // Empezar silencio

        // Reproducir segundo audio
        secondAudio.play().then(() => {
            // Animación de volumen
            const duration = CROSSFADE_DURATION * 1000; // ms
            const steps = 60;
            const intervalTime = duration / steps;
            let step = 0;
            const targetVol = volumeRef.current;

            const fadeInterval = setInterval(() => {
                step++;
                const ratio = step / steps;

                // Fade OUT main
                try { mainAudio.volume = Math.max(0, targetVol * (1 - ratio)); } catch (e) { }
                // Fade IN second
                try { secondAudio.volume = Math.min(targetVol, targetVol * ratio); } catch (e) { }

                if (step >= steps) {
                    clearInterval(fadeInterval);
                    finalizeCrossfadeRef.current?.(nextTrack);
                }
            }, intervalTime);

        }).catch(err => {
            console.warn('[Automix] Falló inicio de crossfade', err);
            isCrossfadingRef.current = false;
        });

    }, []);

    const finalizeCrossfade = useCallback((nextTrack) => {
        console.log('[Automix] ✨ Crossfade completo. Swapping players.');

        // Punteros actuales
        const activePlayer = audioRef.current; // El que terminó de sonar
        const nextPlayer = nextAudioRef.current; // El que está sonando ahora

        if (!activePlayer || !nextPlayer) return;

        // 1. Limpiar listeners del viejo activo
        if (audioListenersCleanupRef.current) audioListenersCleanupRef.current();

        // 2. SWAP DE PUNTEROS LÓGICOS
        // Ahora audioRef apuntará al player que está sonando (nextPlayer)
        // Y nextAudioRef apuntará al player libre (activePlayer)
        audioRef.current = nextPlayer;
        nextAudioRef.current = activePlayer;

        // 3. Resetear el player libre (ahora nextAudioRef)
        try {
            activePlayer.pause();
            activePlayer.currentTime = 0;
            activePlayer.src = "";
            activePlayer.volume = volumeRef.current; // Reset volumen para cuando vuelva a usarse
        } catch (e) { console.warn("Error reset old player", e); }

        // 4. Conectar listeners al nuevo activo (ahora audioRef)
        audioListenersCleanupRef.current = setupAudioEvents(audioRef.current);

        // 5. Actualizar estado lógico (Indices, Track)
        isCrossfadingRef.current = false; // Liberar lock antes de llamar a next() logic

        // Inyectar el cambio de estado sin recargar audio
        // Usamos una versión manual de 'playTrackInternal'

        // Calcular nuevos índices
        clearPrefetch();
        const q = isShuffle ? shuffledQueueRef.current : queueRef.current;
        const i = isShuffle ? shuffledIndexRef.current : indexRef.current;

        let nextIndex = i + 1;
        if (nextIndex >= q.length && repeatMode === 1) nextIndex = 0;
        if (nextIndex >= q.length) nextIndex = 0; // Fallback

        // Update State
        setCurrentTrack(nextTrack);
        if (isShuffle) setShuffledIndex(nextIndex);
        else setCurrentIndex(nextIndex);

        setPlayed(0); // Visualmente empieza
        setCurrentTime(0);

        syncIndicesByTrackId(nextTrack.id, nextTrack);

        // Tracking
        const artistName = getSafeString(nextTrack.artist);
        const trackName = getSafeString(nextTrack.name || nextTrack.title);
        playStartTimeRef.current = Date.now();
        currentTrackKeyRef.current = `${artistName.toLowerCase()}-${trackName.toLowerCase()}`;

        // Trigger prefetch del *siguiente* al nuevo
        setTimeout(() => {
            prefetchNextTrackInternal();
        }, 1000);

    }, [isShuffle, repeatMode, prefetchNextTrackInternal, setupAudioEvents, syncIndicesByTrackId, clearPrefetch]);

    performCrossfadeRef.current = performCrossfade;
    finalizeCrossfadeRef.current = finalizeCrossfade;

    // Initial Setup
    // Initial Setup
    useEffect(() => {
        // [FIX AUTOMIX] Inicialización de punteros
        // Al inicio, audioRef -> A, nextAudioRef -> B
        audioRef.current = playerARef.current;
        nextAudioRef.current = playerBRef.current;

        const a = audioRef.current;
        if (!a) return;

        // Volumen inicial
        if (playerARef.current) playerARef.current.volume = volumeRef.current;
        if (playerBRef.current) playerBRef.current.volume = volumeRef.current;

        audioListenersCleanupRef.current = setupAudioEvents(a);

        return () => {
            if (audioListenersCleanupRef.current) audioListenersCleanupRef.current();
        };
    }, [setupAudioEvents]);

    // =========================
    // Audio hydration inicial
    // =========================
    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;

        a.volume = volume;

        const hydrate = async () => {
            if (!currentTrack || !cachedAudioUrl?.url) return;

            const expectedKey = makeAudioCacheKey(currentTrack);
            if (cachedAudioUrl.key !== expectedKey) return;

            try {
                a.src = cachedAudioUrl.url;
                a.load();

                await new Promise((resolve) => {
                    const onCanPlay = () => {
                        a.removeEventListener("canplay", onCanPlay);
                        a.removeEventListener("error", onErr);
                        resolve();
                    };
                    const onErr = () => {
                        a.removeEventListener("canplay", onCanPlay);
                        a.removeEventListener("error", onErr);
                        setCachedAudioUrl(null);
                        try {
                            localStorage.removeItem("paradox_audio_cache");
                        } catch { }
                        resolve();
                    };

                    a.addEventListener("canplay", onCanPlay);
                    a.addEventListener("error", onErr);

                    setTimeout(() => {
                        a.removeEventListener("canplay", onCanPlay);
                        a.removeEventListener("error", onErr);
                        resolve();
                    }, 4000);
                });

                if (a.duration && !Number.isNaN(a.duration)) setDuration(a.duration);
            } catch {
                // ignore
            }
        };

        hydrate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // =========================
    // URL fetch con cache - CONTRATO FORMAL
    // =========================
    const resolveAudioUrl = useCallback(
        async (track) => {
            const artistName = getSafeString(track?.artist);
            const trackName = getSafeString(track?.name || track?.title);
            const trackDuration = track?.duration || 0;

            // Cache key incluye duración para evitar servir audio equivocado
            const cacheKey = makeAudioCacheKey({
                artist: artistName,
                artistId: track?.artistId,
                name: trackName,
                duration: trackDuration,
            });

            // Las pantallas de artista/álbum ya resuelven el audio dentro del
            // gesto del usuario. Reutilizarlo evita una segunda petición que
            // puede perder la autorización de reproducción en iOS.
            if (typeof track?.url === 'string' && /^https?:\/\//i.test(track.url)) {
                failedTracksRef.current.delete(makeFailureKey(track));
                return {
                    status: "ok",
                    url: track.url,
                    confidence: track.urlSource === 'resolved' ? 1 : 0.5,
                    cacheKey,
                };
            }

            const failedKey = makeFailureKey(track);

            // Cache check (solo para status: ok)
            const TTL = 6 * 60 * 60 * 1000;
            const cacheOk =
                cachedAudioUrlRef.current &&
                cachedAudioUrlRef.current.key === cacheKey &&
                cachedAudioUrlRef.current.url &&
                (!cachedAudioUrlRef.current.timestamp || Date.now() - cachedAudioUrlRef.current.timestamp < TTL);

            if (cacheOk) {
                failedTracksRef.current.delete(failedKey);
                return {
                    status: "ok",
                    url: cachedAudioUrlRef.current.url,
                    cacheKey
                };
            }

            // [CONTRATO] Llamar a UnifiedService - siempre devuelve objeto estructurado
            const result = await fetchAudioUrl({
                id: track?.id,
                artist: artistName,
                artistId: track?.artistId || null,
                albumId: track?.albumId || null,
                title: trackName,
                duration: trackDuration,
            });

            // [CONTRATO] Interpretar resultado según status
            if (result.status === "unavailable") {
                console.warn(`[PlayerContext] ⚠️ Audio no disponible: ${artistName} - ${trackName} (${result.reason})`);
                return {
                    status: "unavailable",
                    reason: result.reason,
                    cacheKey
                };
            }

            // [CONTRATO] status === "ok" - audio disponible
            const audioUrl = result.audio?.url;

            if (!audioUrl || typeof audioUrl !== 'string') {
                console.error(`[PlayerContext] ❌ Contrato roto: status ok pero sin URL`);
                return {
                    status: "unavailable",
                    reason: "CONTRACT_VIOLATION",
                    cacheKey
                };
            }

            console.log(`[PlayerContext] ✅ Audio OK: ${audioUrl.substring(0, 60)}...`);
            failedTracksRef.current.delete(failedKey);

            // Guardar en cache
            const cacheEntry = { key: cacheKey, url: audioUrl, timestamp: Date.now() };
            cachedAudioUrlRef.current = cacheEntry;
            setCachedAudioUrl(cacheEntry);

            return {
                status: "ok",
                url: audioUrl,
                confidence: result.confidence,
                cacheKey
            };
        },
        []
    );

    // =========================
    // ESTRATEGIA: Prefetch Agresivo & Smart Buffer
    // =========================


    // Helper: Limpiar caché antiguo
    const prunePrefetchCache = useCallback(() => {
        const now = Date.now();
        prefetchCacheRef.current.forEach((val, key) => {
            const ttl = val.status === 'error' ? 10 * 1000 : 30 * 60 * 1000;
            if (now - val.timestamp > ttl) prefetchCacheRef.current.delete(key);
        });
    }, []);

    // Selecciona de forma síncrona la siguiente URL ya resuelta. Esto es
    // esencial en iOS: al quedar la app en segundo plano no podemos depender
    // de un temporizador o de una petición de red para responder a "siguiente".
    const primeNextFromCache = useCallback((startIndex, queueSource) => {
        if (!queueSource?.length || startIndex < 0) {
            clearPrefetch();
            return false;
        }

        for (let offset = 1; offset <= queueSource.length; offset += 1) {
            let candidateIndex = startIndex + offset;
            if (candidateIndex >= queueSource.length) {
                if (repeatMode !== 1) break;
                candidateIndex %= queueSource.length;
            }

            const candidate = queueSource[candidateIndex];
            const cached = prefetchCacheRef.current.get(makeTrackKey(candidate));
            if (cached?.status !== 'ok' || !cached.url) continue;

            prefetchedNextUrl.current = cached.url;
            prefetchedNextTrack.current = candidate;
            prefetchTriggeredForTrack.current = makeTrackKey(candidate);

            const buffer = nextAudioRef.current;
            if (buffer && buffer.src !== cached.url) {
                buffer.src = cached.url;
                buffer.preload = 'auto';
                buffer.load();
            }
            return true;
        }

        clearPrefetch();
        return false;
    }, [clearPrefetch, repeatMode]);

    // Motor de Prefetching
    const runAggressivePrefetch = useCallback(async (startIndex, queueSource) => {
        if (!queueSource || !queueSource.length) return;

        const cache = prefetchCacheRef.current;
        let pIndex = startIndex;
        const processedKeys = new Set();
        const MAX_LOOKAHEAD_TOTAL = 5; // Limite total de tracks a revisar

        // Precargar audio bytes SOLO de la inmediata siguiente (para gapless real)
        let immediateNextFound = false;
        let lookaheadCount = 0;

        for (let offset = 1; offset <= MAX_LOOKAHEAD_TOTAL; offset++) {
            pIndex++;
            // Wrap around logic
            if (pIndex >= queueSource.length) {
                if (repeatMode === 1) pIndex = 0; // Loop simple o infinito
                else break; // Fin de la cola
            }

            const track = queueSource[pIndex];
            if (!track) continue;

            const key = makeTrackKey(track);
            if (processedKeys.has(key)) continue; // Evitar duplicados en el mismo ciclo (si la cola repite tracks)
            processedKeys.add(key);

            // Solo hacemos 'prefetch' activo de los primeros 3 válidos
            if (lookaheadCount >= PREFETCH_LOOKAHEAD) break;

            // Si ya está en caché y es válido, pasamos (pero revisamos si necesitamos cargar el audio object)
            if (cache.has(key)) {
                const cachedEntry = cache.get(key);
                if (cachedEntry.status === 'error' && Date.now() - cachedEntry.timestamp > 10 * 1000) {
                    cache.delete(key);
                } else {
                    if (cachedEntry.status === 'ok') {
                        // Solo contamos como "prefetch exitoso" los que están OK
                        lookaheadCount++;

                        if (!immediateNextFound) {
                            // Cargar bytes en el segundo player para zero-latency
                            nextAudioRef.current.src = cachedEntry.url;
                            nextAudioRef.current.preload = "auto";
                            nextAudioRef.current.load();
                            immediateNextFound = true;

                            // [FIX LOOP] Sync legacy refs to satisfy onTimeUpdate check & playTrackInternal
                            // SOLO actualizar para el INMEDIATO siguiente, no para los futuros
                            prefetchedNextUrl.current = cachedEntry.url;
                            prefetchedNextTrack.current = track;
                            prefetchTriggeredForTrack.current = key;
                        }
                    }
                    continue;
                }
            }

            // Resolver URL
            // console.log(`[Prefetch] 🔮 Resolving lookahead +${offset}: ${track.name}`);
            try {
                const result = await resolveAudioUrl(track);

                if (result.status === 'ok' && result.url) {
                    cache.set(key, { url: result.url, status: 'ok', timestamp: Date.now() });
                    lookaheadCount++;

                    // Si es la inmediata siguiente, cargar bytes
                    if (!immediateNextFound) {
                        nextAudioRef.current.src = result.url;
                        nextAudioRef.current.preload = "auto";
                        nextAudioRef.current.load();
                        immediateNextFound = true;

                        // [FIX LOOP] Sync legacy refs to satisfy onTimeUpdate check & playTrackInternal
                        prefetchedNextUrl.current = result.url;
                        prefetchedNextTrack.current = track;
                        prefetchTriggeredForTrack.current = key;
                    }
                } else {
                    // El error solo evita repetir de inmediato esta precarga.
                    cache.set(key, { status: 'error', timestamp: Date.now() });
                }
            } catch (err) {
                cache.set(key, { status: 'error', timestamp: Date.now() });
            }
        }

        prunePrefetchCache();
    }, [resolveAudioUrl, repeatMode, prunePrefetchCache]);

    // Trigger de prefetch cuando cambia la canción O cuando crece la cola.
    // Las radios del Feed empiezan con una pista y agregan el resto después.
    useEffect(() => {
        if (!currentTrack) return;

        // Debounce corto para agrupar los addToQueue consecutivos.
        const t = setTimeout(() => {
            const q = isShuffle ? shuffledQueueRef.current : queueRef.current;
            const i = isShuffle ? shuffledIndexRef.current : indexRef.current;
            runAggressivePrefetch(i, q);
        }, 120);

        return () => clearTimeout(t);
    }, [currentTrack, currentIndex, queue.length, shuffledIndex, shuffledQueue.length, isShuffle, runAggressivePrefetch]);

    // iOS concede una ventana muy corta antes de suspender una PWA oculta.
    // Aprovecharla para dejar seleccionado el siguiente audio ya resuelto y
    // completar la reserva, sin esperar al evento `ended` en segundo plano.
    useEffect(() => {
        const prepareForBackground = () => {
            if (document.visibilityState !== 'hidden') return;

            const q = isShuffle ? shuffledQueueRef.current : queueRef.current;
            const i = isShuffle ? shuffledIndexRef.current : indexRef.current;
            primeNextFromCache(i, q);
            runAggressivePrefetch(i, q);
        };

        document.addEventListener('visibilitychange', prepareForBackground);
        return () => document.removeEventListener('visibilitychange', prepareForBackground);
    }, [isShuffle, primeNextFromCache, runAggressivePrefetch]);


    // [FIX MISSING REF] Definition of prefetchNextTrack for manual calls
    const prefetchNextTrack = useCallback(() => {
        const q = isShuffle ? shuffledQueueRef.current : queueRef.current;
        const i = isShuffle ? shuffledIndexRef.current : indexRef.current;
        runAggressivePrefetch(i, q);
    }, [isShuffle, runAggressivePrefetch]);

    // Sync ref for internal calls (e.g. from timeUpdate)
    useEffect(() => {
        prefetchNextTrackInternalRef.current = prefetchNextTrack;
    }, [prefetchNextTrack]);

    // =========================
    // Core play (Modificado para usar Buffer)
    // =========================
    const playTrackInternal = useCallback(
        async (track, contextQueue, newIndex) => {
            if (!track) return;

            setIsLoading(true);
            setIsBuffering(false);
            setPlayed(0);
            setCurrentTime(0);
            setErrorMsg(null);

            // [CIRUGÍA] Eliminado reset de retry counter - no hay reintentos

            // Actualizar estado de cola e índices con menos renders
            setCurrentTrack(track);
            setCurrentIndex(newIndex);
            if (contextQueue && contextQueue !== queueRef.current) setQueue(contextQueue);

            // [FIX #1] Usar contador incremental en lugar de Date.now()
            const requestId = nextRequestId();
            activeRequestId.current = requestId;

            // [OPTIMIZACIÓN REPRODUCCIÓN INMEDIATA]
            // Verificar si esta canción ya está en el caché de prefetch
            const trackKey = makeTrackKey(track);
            const cachedEntry = prefetchCacheRef.current.get(trackKey);

            // Caso 1: Cache OK -> Reproducción instantánea
            if (cachedEntry && cachedEntry.status === 'ok' && cachedEntry.url) {
                console.log('[PlayerContext] ⚡ Usando URL prefetcheada - reproducción instantánea');
                failedTracksRef.current.delete(makeFailureKey(track));

                const a = audioRef.current;
                if (a) {
                    a.src = cachedEntry.url;
                    a.preload = "auto";
                    a.load();

                    // Intentar PLAY inmediatamente
                    try {
                        await a.play();
                    } catch (playError) {
                        if (playError.name !== 'AbortError') showError("Toca play para continuar");
                    }

                    // Track engagement y historial
                    const artistName = getSafeString(track.artist);
                    const trackName = getSafeString(track.name || track.title);
                    playStartTimeRef.current = Date.now();
                    currentTrackKeyRef.current = `${artistName.toLowerCase()}-${trackName.toLowerCase()}`;
                    syncIndicesByTrackId(track.id, track);

                    setIsLoading(false);
                    return;
                }
            }

            // Un fallo de precarga es especulativo: la reproducción explícita
            // siempre debe volver a resolver la canción.
            if (cachedEntry && cachedEntry.status === 'error') {
                prefetchCacheRef.current.delete(trackKey);
            }

            // No hay prefetch o cache no válido - hacer fetch normal
            try {
                const result = await resolveAudioUrl(track);

                if (activeRequestId.current !== requestId) return;

                // [CONTRATO] Interpretar status
                if (result.status === "unavailable") {
                    const artistName = getSafeString(track?.artist);
                    const trackName = getSafeString(track?.name || track?.title);

                    console.warn(`[PlayerContext] ⚠️ Track unavailable: ${artistName} - ${trackName} (${result.reason})`);
                    failedTracksRef.current.add(makeFailureKey(track));

                    // [CORTE DE LOOPS] Verificar si TODA la cola falló
                    if (checkIfAllQueueFailed()) {
                        console.error('[PlayerContext] 🛑 Toda la cola ha fallado. Deteniendo.');
                        setIsLoading(false);
                        setErrorMsg('No disponible. Intenta otra playlist.');
                        return;
                    }

                    // Hay más tracks - avanzar UNA vez (no loop infinito gracias al set failedTracksRef)
                    setIsLoading(false);
                    setTimeout(() => skipRef.current && skipRef.current(true), 200);
                    return;
                }

                // [CONTRATO] status === "ok" - reproducir
                const audioUrl = result.url;

                const a = audioRef.current;
                if (!a) return;

                // [FIX #1] Invalidar requests previos antes de tocar audio.src
                activeRequestId.current = requestId;

                a.pause();
                a.currentTime = 0;
                a.src = audioUrl;
                a.load();

                await new Promise((resolve, reject) => {
                    const onCanPlay = () => {
                        cleanup();
                        resolve();
                    };
                    const onErr = () => {
                        cleanup();
                        reject(new Error("Error loading audio"));
                    };
                    const onTimeout = () => {
                        cleanup();
                        resolve(); // intentar igual
                    };

                    const cleanup = () => {
                        clearTimeout(t);
                        a.removeEventListener("canplay", onCanPlay);
                        a.removeEventListener("error", onErr);
                    };

                    const t = setTimeout(onTimeout, AUDIO_LOAD_TIMEOUT_MS);
                    a.addEventListener("canplay", onCanPlay);
                    a.addEventListener("error", onErr);
                });

                if (activeRequestId.current !== requestId) return;

                // [FIX #2] Solo playTrackInternal llama a play()
                // El estado isPlaying se actualizará via evento "play"
                // [FIX iOS] Manejar rechazo de play() de manera más elegante
                try {
                    await a.play();
                } catch (playError) {
                    // En iOS, play() puede ser rechazado por políticas de autoplay
                    // Si el audio está listo, el usuario puede tocar play manualmente
                    console.warn('[playerContext] play() rechazado:', playError.name);
                    if (playError.name !== 'AbortError') {
                        showError("Toca play para continuar");
                    }
                    // No lanzar error - dejamos que el usuario lo resuelva manualmente
                }

                // Historial
                const artistName = getSafeString(track.artist);
                const trackName = getSafeString(track.name || track.title);
                // Iniciar tracking de engagement
                playStartTimeRef.current = Date.now();
                currentTrackKeyRef.current = `${artistName.toLowerCase()}-${trackName.toLowerCase()}`;

                // [FIX #6] Sincronizar índices después de setCurrentTrack
                syncIndicesByTrackId(track.id, track);

            } catch (e) {
                console.error('[PlayerContext] Error inesperado al preparar la reproducción:', e);
                if (activeRequestId.current === requestId) {
                    showError("Error de conexión");
                }
            } finally {
                if (activeRequestId.current === requestId) setIsLoading(false);
            }
        },
        [resolveAudioUrl, showError, nextRequestId, syncIndicesByTrackId, checkIfAllQueueFailed]
    );

    // =========================
    // Controles públicos
    // =========================
    const playTrack = useCallback(
        (track, contextQueue = null, contextData = null, forceShuffle = false) => {
            let newQueue = queueRef.current;
            let newIndex;

            let newShuffledQueue = shuffledQueueRef.current;
            let newShuffledIndex = -1;

            // [NUEVO] Actualizar contexto
            if (contextData) {
                setPlaybackContext(contextData);
            }

            // [NUEVO] Forzar shuffle si se necesita
            if (forceShuffle) {
                setIsShuffle(true);
            }
            const effectiveShuffle = isShuffle || forceShuffle;

            // DETECCION DE CONTEXTO: ¿Es la misma cola visual?
            // Si contextQueue es null, o es idéntica a la actual (referencia o contenido)
            const isSameQueue = !contextQueue || contextQueue === queueRef.current;

            if (!isSameQueue && contextQueue?.length) {
                // CAMBIO DE CONTEXTO REAL (Nueva playlist/álbum)
                // [CIRUGÍA] Nueva cola = borrón y cuenta nueva para tracks fallidos
                failedTracksRef.current.clear();

                newQueue = contextQueue;
                const trackKey = makeTrackKey(track);
                newIndex = newQueue.findIndex(t => makeTrackKey(t) === trackKey);

                if (newIndex === -1) newIndex = findTrackIndex(newQueue, track);
                if (newIndex === -1) newIndex = 0;

                if (effectiveShuffle) {
                    // Nuevo contexto + shuffle explícito = Barajar todo nuevo
                    newShuffledQueue = generateShuffledQueue(newQueue, track);
                    newShuffledIndex = 0;
                    setShuffledQueue(newShuffledQueue);
                    setShuffledIndex(newShuffledIndex);
                }
            } else {
                // MISMO CONTEXTO (Usuario seleccionó canción de la lista actual)
                // O canción suelta

                // Si la cola estaba vacía, se comporta como nueva
                if (newQueue.length === 0 && contextQueue?.length) {
                    newQueue = contextQueue;
                }

                const idx = findTrackIndex(newQueue, track);

                if (idx !== -1) {
                    // La canción EXISTE en la cola actual
                    newIndex = idx;

                    if (effectiveShuffle) {
                        // [FIX SHUFFLE STABILITY]
                        // Si ya estamos en modo shuffle y la canción existe en la cola barajada,
                        // NO REBARAJAR. Solo saltar a esa canción.
                        const sidx = findTrackIndex(newShuffledQueue, track);

                        if (sidx !== -1) {
                            // Encontrada en la mezcla actual: MANTENER ORDEN
                            newShuffledIndex = sidx;
                        } else {
                            // No encontrada en mezcla (raro) o shuffle recién activado:
                            // Regenerar mezcla centrada en el track
                            newShuffledQueue = generateShuffledQueue(newQueue, track);
                            newShuffledIndex = 0;
                            setShuffledQueue(newShuffledQueue);
                        }
                        setShuffledIndex(newShuffledIndex); // Asegurar actualización
                    }
                } else {
                    // Canción NO está en cola (ej: búsqueda suelta) -> Añadir
                    newQueue = [...newQueue, track];
                    newIndex = newQueue.length - 1;

                    if (effectiveShuffle) {
                        newShuffledQueue = [...newShuffledQueue, track];
                        newShuffledIndex = newShuffledQueue.length - 1;
                        setShuffledQueue(newShuffledQueue);
                        setShuffledIndex(newShuffledIndex);
                    }
                }
            }

            setQueue(newQueue);
            setCurrentIndex(newIndex);

            // [FIX #6] effectiveQueue/effectiveIndex para reproducción
            const effectiveQueue = effectiveShuffle ? newShuffledQueue : newQueue;
            const effectiveIndex = effectiveShuffle ? newShuffledIndex : newIndex;

            playTrackInternal(track, effectiveQueue, effectiveIndex);
        },
        [isShuffle, generateShuffledQueue, playTrackInternal]
    );

    const addToQueue = useCallback(
        (track, silent = false) => {
            setQueue((prev) => {
                const nextQ = [...prev, track];
                if (isShuffle) setShuffledQueue((s) => [...s, track]);
                if (!silent) showError("Agregado a la cola");
                return nextQ;
            });
        },
        [showError, isShuffle]
    );

    const playNextInQueue = useCallback(
        (track) => {
            setQueue((prev) => {
                const existingIndex = findTrackIndex(prev, track);
                const newQ = [...prev];

                const insertAt = Math.min((indexRef.current ?? -1) + 1, newQ.length);

                if (existingIndex !== -1) {
                    const [removed] = newQ.splice(existingIndex, 1);
                    const adjustedInsert = existingIndex < insertAt ? insertAt - 1 : insertAt;
                    newQ.splice(adjustedInsert, 0, removed);
                } else {
                    newQ.splice(insertAt, 0, track);
                }

                if (isShuffle && currentTrack) {
                    const s = generateShuffledQueue(newQ, currentTrack);
                    setShuffledQueue(s);
                    setShuffledIndex(0);
                }

                showError(existingIndex !== -1 ? "Movido a siguiente" : "Se reproducirá a continuación");
                return newQ;
            });
        },
        [isShuffle, currentTrack, generateShuffledQueue, showError]
    );

    const removeFromQueue = useCallback(
        (indexToRemove) => {
            setQueue((prev) => {
                const newQ = [...prev];
                const removed = newQ[indexToRemove];
                newQ.splice(indexToRemove, 1);

                if (isShuffle && removed) {
                    setShuffledQueue((s) => s.filter((t) => makeTrackKey(t) !== makeTrackKey(removed)));
                }
                return newQ;
            });

            if (indexToRemove < indexRef.current) setCurrentIndex((p) => p - 1);
            if (isShuffle && indexToRemove < shuffledIndexRef.current) setShuffledIndex((p) => p - 1);
        },
        [isShuffle]
    );

    const reorderQueue = useCallback(
        (sourceIndex, destIndex) => {
            setQueue((prev) => {
                const result = [...prev];
                const [removed] = result.splice(sourceIndex, 1);
                result.splice(destIndex, 0, removed);

                if (isShuffle && currentTrack) {
                    const s = generateShuffledQueue(result, currentTrack);
                    setShuffledQueue(s);
                    setShuffledIndex(0);
                }
                return result;
            });

            setCurrentIndex((ci) => {
                if (ci === sourceIndex) return destIndex;
                if (ci > sourceIndex && ci <= destIndex) return ci - 1;
                if (ci < sourceIndex && ci >= destIndex) return ci + 1;
                return ci;
            });
        },
        [isShuffle, currentTrack, generateShuffledQueue]
    );

    const clearQueue = useCallback(() => {
        setQueue([]);
        setCurrentIndex(-1);
        setShuffledQueue([]);
        setShuffledIndex(-1);
        showError("Cola limpiada");
    }, [showError]);

    const shuffleQueue = useCallback(() => {
        const q = queueRef.current;
        if (!q.length) return;
        const s = generateShuffledQueue(q, currentTrack);
        setShuffledQueue(s);
        setShuffledIndex(0);
        showError("Cola mezclada");
    }, [generateShuffledQueue, currentTrack, showError]);

    const toggleShuffle = useCallback(() => {
        const q = queueRef.current;
        if (!q.length) {
            setIsShuffle((p) => !p);
            return;
        }

        setIsShuffle((prev) => {
            const next = !prev;
            if (next && currentTrack) {
                const s = generateShuffledQueue(q, currentTrack);
                setShuffledQueue(s);
                setShuffledIndex(0);
            } else if (!next && currentTrack) {
                const idx = findTrackIndex(q, currentTrack);
                if (idx !== -1) setCurrentIndex(idx);
            }
            return next;
        });
    }, [currentTrack, generateShuffledQueue]);

    // =========================
    // 🎵 RADIO INFINITA - Auto-genera más tracks cuando la cola se agota
    // =========================
    const isGeneratingRadioRef = useRef(false);
    const lastRadioGenerationRef = useRef(0);
    const RADIO_THRESHOLD = 3; // Generar más cuando quedan 3 o menos tracks
    const RADIO_DEBOUNCE_MS = 5000; // No generar más seguido que cada 5 segundos

    const generateMoreRadioTracks = useCallback(async (seedTrack) => {
        // Evitar múltiples generaciones simultáneas
        if (isGeneratingRadioRef.current) return [];
        if (Date.now() - lastRadioGenerationRef.current < RADIO_DEBOUNCE_MS) return [];

        isGeneratingRadioRef.current = true;
        lastRadioGenerationRef.current = Date.now();

        try {
            const newTracks = await buildRadioQueue({
                seedTrack,
                existingQueue: queueRef.current,
                targetSize: 10,
                includeSeed: false,
            });
            isGeneratingRadioRef.current = false;
            return newTracks;
        } catch (err) {
            console.warn('[RadioInfinita] Error generating tracks:', err);
            isGeneratingRadioRef.current = false;
            return [];
        }
    }, []);

    // Efecto que detecta cuando la cola está por terminarse
    useEffect(() => {
        if (!currentTrack || !isPlaying) return;

        const q = isShuffle ? shuffledQueueRef.current : queueRef.current;
        const i = isShuffle ? shuffledIndexRef.current : indexRef.current;

        if (!q?.length || i < 0) return;

        const remainingTracks = q.length - i - 1;

        // Si quedan pocas canciones, generar más
        if (remainingTracks <= RADIO_THRESHOLD && remainingTracks >= 0) {
            generateMoreRadioTracks(currentTrack).then((newTracks) => {
                if (newTracks.length > 0) {
                    // Agregar silenciosamente a la cola
                    setQueue(prev => [...prev, ...newTracks]);
                    if (isShuffle) {
                        setShuffledQueue(prev => [...prev, ...newTracks]);
                    }
                    console.log(`[RadioInfinita] 📻 Added ${newTracks.length} tracks to queue. New total: ${queueRef.current.length + newTracks.length}`);
                }
            });
        }
    }, [currentIndex, shuffledIndex, currentTrack, isPlaying, isShuffle, generateMoreRadioTracks]);

    // =========================
    // Next / Prev
    // =========================
    const next = useCallback(
        (isAuto = false) => {
            // [FIX iOS] Si es skip manual, limpiar prefetch para evitar URLs viejas
            if (!isAuto) clearPrefetch();

            // Evaluar engagement del track anterior antes de cambiar
            if (playStartTimeRef.current && currentTrack && !isAuto) {
                const listenedMs = Date.now() - playStartTimeRef.current;
                const artistName = getSafeString(currentTrack.artist);

                if (artistName) {
                    if (listenedMs < 5000) {
                        // Skip rápido = no le gustó
                        setTasteEngagement((prev) => ({
                            ...prev,
                            skippedArtists: {
                                ...prev.skippedArtists,
                                [artistName]: (prev.skippedArtists[artistName] || 0) + 1,
                            },
                        }));
                    } else if (listenedMs > 30000) {
                        // Escuchó >30s = le gustó
                        setTasteEngagement((prev) => ({
                            ...prev,
                            likedArtists: {
                                ...prev.likedArtists,
                                [artistName]: (prev.likedArtists[artistName] || 0) + 1,
                            },
                        }));
                    }
                }
            }

            // Reset tracking para el siguiente track
            playStartTimeRef.current = null;
            currentTrackKeyRef.current = null;

            const q = isShuffle ? shuffledQueueRef.current : queueRef.current;
            const i = isShuffle ? shuffledIndexRef.current : indexRef.current;

            if (!q?.length) {
                if (currentTrack && repeatMode === 2) playTrackInternal(currentTrack, [currentTrack], 0);
                else {
                    const a = audioRef.current;
                    if (a) a.pause();
                    setIsPlaying(false);
                }
                return;
            }

            let nextIndex = i + 1;
            if (nextIndex >= q.length) {
                if (repeatMode === 1) nextIndex = 0;
                else if (repeatMode === 2) {
                    playTrackInternal(q[i], q, i);
                    return;
                } else {
                    const a = audioRef.current;
                    if (a) a.pause();
                    setIsPlaying(false);
                    return;
                }
            }

            if (isShuffle) setShuffledIndex(nextIndex);
            else setCurrentIndex(nextIndex);

            playTrackInternal(q[nextIndex], q, nextIndex);
            // Preparar +1 ahora; los timers pueden quedar congelados en iOS.
            primeNextFromCache(nextIndex, q);
        },
        [isShuffle, repeatMode, currentTrack, playTrackInternal, clearPrefetch, primeNextFromCache]
    );

    useEffect(() => {
        skipRef.current = next;
    }, [next]);

    const prev = useCallback(() => {
        // [FIX iOS] Limpiar prefetch - usuario cambió dirección manualmente
        clearPrefetch();

        const a = audioRef.current;
        if (a && a.currentTime > 3) {
            a.currentTime = 0;
            return;
        }

        const q = isShuffle ? shuffledQueueRef.current : queueRef.current;
        const i = isShuffle ? shuffledIndexRef.current : indexRef.current;

        if (i > 0) {
            const prevIndex = i - 1;
            if (isShuffle) setShuffledIndex(prevIndex);
            else setCurrentIndex(prevIndex);
            playTrackInternal(q[prevIndex], q, prevIndex);
        } else if (a) {
            a.currentTime = 0;
        }
    }, [isShuffle, playTrackInternal, clearPrefetch]);

    useEffect(() => {
        previousRef.current = prev;
    }, [prev]);

    const seekTo = useCallback((fraction) => {
        const a = audioRef.current;
        if (a?.duration) {
            // Clamp entre 0 y duration
            const targetTime = Math.max(0, Math.min(fraction * a.duration, a.duration));
            a.currentTime = targetTime;
        }
    }, []);

    // =========================
    // [FIX #2] togglePlay solo controla play/pause
    // Estado isPlaying se actualiza via eventos del audio
    // =========================
    const togglePlay = useCallback(async () => {
        const a = audioRef.current;
        if (!a) return;

        // [AJUSTE C] Bloquear togglePlay si está cargando - evita estados cruzados
        if (isLoading) return;

        if (isPlaying) {
            a.pause();
            // isPlaying se actualizará via evento "pause"
            return;
        }

        // Si no hay src, intentar hidratar con cache o recargar
        if (!a.src && currentTrack) {
            const expectedKey = makeAudioCacheKey(currentTrack);
            if (cachedAudioUrlRef.current?.key === expectedKey && cachedAudioUrlRef.current.url) {
                a.src = cachedAudioUrlRef.current.url;
                a.load();
            } else {
                setIsLoading(true);
                try {
                    const result = await resolveAudioUrl(currentTrack);
                    if (result.status === "ok" && result.url) {
                        a.src = result.url;
                        a.load();
                    } else {
                        showError("Audio no disponible");
                        setIsLoading(false);
                        return;
                    }
                } catch {
                    showError("Error al recargar");
                    setIsLoading(false);
                    return;
                }
                setIsLoading(false);
            }
        }

        // Solo llamar play(), el estado se actualiza via evento
        a.play().catch(() => showError("Error al reproducir"));
    }, [isPlaying, isLoading, currentTrack, resolveAudioUrl, showError]);

    // =========================
    // [FIX #7] handleAudioEnded con doble buffer
    // [FIX iOS] Optimizado para iOS PWA
    // =========================
    const handleAudioEnded = useCallback(() => {
        // [FIX iOS #2] Mutex - evitar doble entrada
        if (isAdvancingRef.current) return;
        isAdvancingRef.current = true;

        // Repeat one
        if (repeatMode === 2) {
            const a = audioRef.current;
            if (a) {
                a.currentTime = 0;
                a.play().catch(() => { });
            }
            isAdvancingRef.current = false;
            return;
        }

        // [FIX #1] Invalidar requests anteriores
        activeRequestId.current = nextRequestId();

        // [FIX #7] Switch instantáneo con prefetch (doble buffer)
        if (prefetchedNextUrl.current && prefetchedNextTrack.current) {
            const nextTrackObj = prefetchedNextTrack.current;
            const nextUrl = prefetchedNextUrl.current;

            // Limpiar refs de prefetch
            clearPrefetch();

            const q = isShuffle ? shuffledQueueRef.current : queueRef.current;
            const i = isShuffle ? shuffledIndexRef.current : indexRef.current;

            let nextIndex = i + 1;
            if (nextIndex >= q.length && repeatMode === 1) nextIndex = 0;

            // Si por alguna razón no calza, fallback normal
            if (!q?.length || nextIndex >= q.length) {
                isAdvancingRef.current = false;
                next(true);
                return;
            }

            // [CIRUGÍA] Eliminado reset de retry counter - no hay reintentos

            const a = audioRef.current;
            if (a) {
                // [GAPLESS OPTIMIZADO]
                // 1. Asignar SRC directamente (sin resetear currentTime ni pause, es automático)
                a.src = nextUrl;
                a.preload = "auto"; // Reforzar preload
                a.load();

                // 2. Intentar PLAY inmediatamente (Estrategia Optimista)
                // Esto elimina la latencia de esperar el evento 'canplay' via JS.
                // El navegador maneja el buffer internamente de forma más eficiente.
                const playPromise = a.play();

                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        console.warn("[PlayerContext] Gapless play deferred (buffering or iOS restriction):", err);

                        // Fallback para iOS/Slow Network: Esperar a que sea reproducible
                        const playWhenReady = () => {
                            a.play().catch(() => showError("Toca play para continuar"));
                        };
                        a.addEventListener('canplay', playWhenReady, { once: true });
                    });
                }
            }

            setCurrentTrack(nextTrackObj);
            if (isShuffle) setShuffledIndex(nextIndex);
            else setCurrentIndex(nextIndex);
            setPlayed(0);
            setCurrentTime(0);

            // [FIX #6] Sincronizar índices
            syncIndicesByTrackId(nextTrackObj.id, nextTrackObj);

            // Preparar la pista posterior de forma síncrona antes de que iOS
            // vuelva a suspender la ejecución en segundo plano.
            primeNextFromCache(nextIndex, q);
            runAggressivePrefetch(nextIndex, q);

            // Liberar mutex después de que la transición esté completa
            setTimeout(() => {
                isAdvancingRef.current = false;
            }, 300);
            return;
        }

        // Fallback normal
        isAdvancingRef.current = false;
        next(true);
    }, [repeatMode, isShuffle, next, nextRequestId, syncIndicesByTrackId, showError, clearPrefetch, primeNextFromCache, runAggressivePrefetch]);

    // Actualizar ref de ended handler
    useEffect(() => {
        handleAudioEndedInternalRef.current = handleAudioEnded;
    }, [handleAudioEnded]);

    // =========================
    // [FIX #8] Media Session
    // =========================
    const updatePositionState = useCallback(() => {
        if (!("mediaSession" in navigator) || !audioRef.current) return;
        try {
            const a = audioRef.current;
            if (a.duration && !Number.isNaN(a.duration)) {
                navigator.mediaSession.setPositionState({
                    duration: a.duration,
                    playbackRate: a.playbackRate || 1,
                    position: a.currentTime || 0,
                });
            }
        } catch {
            // ignore
        }
    }, []);

    const updateMediaSession = useCallback((track) => {
        if (!("mediaSession" in navigator) || !track) return;

        const trackName = getSafeString(track.name || track.title);
        const artistName = getSafeString(track.artist);
        const albumName = getSafeString(track.album) || "ParadisQuo";

        let artworkUrl = "";
        if (track.image) {
            if (Array.isArray(track.image)) {
                const large = track.image.find((img) => img.size === "extralarge" || img.size === "large");
                artworkUrl = large?.["#text"] || track.image[track.image.length - 1]?.["#text"] || "";
            } else if (typeof track.image === "string") {
                artworkUrl = track.image;
            } else if (track.image.url) {
                artworkUrl = track.image.url;
            }
        }
        if (!artworkUrl && track.cover) artworkUrl = typeof track.cover === "string" ? track.cover : track.cover.url || "";
        if (!artworkUrl && track.albumArt) artworkUrl = track.albumArt;

        const sizes = [96, 128, 192, 256, 384, 512];
        const artwork = artworkUrl
            ? sizes.map((s) => ({ src: artworkUrl, sizes: `${s}x${s}`, type: "image/jpeg" }))
            : [];

        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: trackName || "Canción desconocida",
                artist: artistName || "Artista desconocido",
                album: albumName,
                artwork,
            });
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        if (currentTrack) updateMediaSession(currentTrack);
    }, [currentTrack, updateMediaSession]);

    useEffect(() => {
        if (!("mediaSession" in navigator)) return;
        try {
            navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
        } catch {
            // ignore
        }
    }, [isPlaying]);

    useEffect(() => {
        if (!("mediaSession" in navigator)) return;

        const handlePlay = async () => {
            const audio = audioRef.current;
            if (audio?.paused) {
                try {
                    await audio.play();
                } catch {
                    showError('Abre la app y toca play para continuar');
                }
            }
        };
        const handlePause = () => {
            audioRef.current?.pause();
        };
        const handlePreviousTrack = () => previousRef.current?.();
        const handleNextTrack = () => skipRef.current?.(false);

        // [FIX #8] seekto con clamp
        const handleSeekTo = (details) => {
            const a = audioRef.current;
            if (a && details.seekTime !== undefined && a.duration) {
                a.currentTime = Math.max(0, Math.min(details.seekTime, a.duration));
                updatePositionState();
            }
        };

        // [FIX iOS] seekbackward: si está cerca del inicio, ir a prev
        // Esto hace que el botón -10s de iOS sea más útil para música
        const handleSeekBackward = (details) => {
            const a = audioRef.current;
            if (!a) return;

            // Si estamos en los primeros 5 segundos, ir al track anterior
            if (a.currentTime < 5) {
                previousRef.current?.();
                return;
            }

            const skip = details.seekOffset || 10;
            a.currentTime = Math.max(a.currentTime - skip, 0);
            updatePositionState();
        };

        // [FIX iOS] seekforward: si está cerca del final, ir a next
        // Esto hace que el botón +10s de iOS sea más útil para música
        const handleSeekForward = (details) => {
            const a = audioRef.current;
            if (!a?.duration) return;

            // Si estamos en los últimos 10 segundos, ir al siguiente track
            if (a.duration - a.currentTime < 10) {
                skipRef.current?.(false);
                return;
            }

            const skip = details.seekOffset || 10;
            a.currentTime = Math.min(a.currentTime + skip, a.duration);
            updatePositionState();
        };

        const handleStop = () => {
            const a = audioRef.current;
            if (a) {
                a.pause();
                a.currentTime = 0;
            }
            // Estado se actualizará via evento pause
        };

        const handlers = {
            play: handlePlay,
            pause: handlePause,
            previoustrack: handlePreviousTrack,
            nexttrack: handleNextTrack,
            seekto: handleSeekTo,
            seekbackward: handleSeekBackward,
            seekforward: handleSeekForward,
            stop: handleStop,
        };

        // Safari no admite necesariamente todas las acciones. Registrar cada
        // una por separado evita que una acción no soportada anule "siguiente".
        Object.entries(handlers).forEach(([action, handler]) => {
            try {
                navigator.mediaSession.setActionHandler(action, handler);
            } catch {
                // Acción no soportada por esta versión de WebKit.
            }
        });

        return () => {
            Object.keys(handlers).forEach((action) => {
                try {
                    navigator.mediaSession.setActionHandler(action, null);
                } catch {
                    // Acción no soportada.
                }
            });
        };
    }, [showError, updatePositionState]);

    useEffect(() => {
        if (!isPlaying || !("mediaSession" in navigator)) return;
        updatePositionState();
        const id = setInterval(updatePositionState, 1000);
        return () => clearInterval(id);
    }, [isPlaying, updatePositionState]);

    // Sync volume al localStorage (el volume del audio ya se actualiza en setVolume)
    useEffect(() => {
        try {
            localStorage.setItem("paradox_volume", String(volume));
        } catch { }
    }, [volume]);

    // =========================
    // Definir funciones que se usan en ambos contextos
    // =========================
    const toggleRepeat = useCallback(() => setRepeatMode((p) => (p + 1) % 3), []);
    const toggleQueue = useCallback(() => setIsQueueOpen((p) => !p), []);
    const toggleHistoryPaused = useCallback(() => setHistoryPaused((paused) => !paused), []);
    const clearListeningHistory = useCallback(() => setListeningHistory([]), []);

    // =========================
    // Value memo (menos renders)
    // =========================
    const value = useMemo(
        () => ({
            currentTrack,
            isPlaying,
            isLoading,
            isBuffering,

            // [FIX] Exponer la cola efectiva según el modo shuffle
            queue: isShuffle ? shuffledQueue : queue,
            originalQueue: queue, // Acceso raw si se necesita

            played,
            currentTime,
            duration,
            volume,
            errorMsg,
            isShuffle,
            repeatMode,
            isQueueOpen,

            // [FIX] Exponer índice efectivo
            currentIndex: isShuffle ? shuffledIndex : currentIndex,

            listeningHistory,
            historyPaused,
            tasteEngagement, // Engagement tracking para recomendaciones
            playbackContext, // [NUEVO] Contexto activo

            setVolume,
            playTrack,
            togglePlay,
            next,
            prev,
            seekTo,

            toggleShuffle,
            toggleRepeat,
            toggleQueue,
            toggleHistoryPaused,
            clearListeningHistory,

            addToQueue,
            playNextInQueue,
            removeFromQueue,
            reorderQueue,
            clearQueue,
            shuffleQueue,

            audioRef,

            // AUTOMIX
            isCrossfadeEnabled,
            toggleCrossfade: () => setIsCrossfadeEnabled(p => !p),
        }),
        [
            currentTrack,
            isPlaying,
            isLoading,
            isBuffering,
            queue,
            played,
            currentTime,
            duration,
            volume,
            errorMsg,
            isShuffle,
            repeatMode,
            isQueueOpen,
            currentIndex,
            shuffledIndex,
            shuffledQueue,
            playbackContext,
            listeningHistory,
            historyPaused,
            tasteEngagement,
            isCrossfadeEnabled,
            setVolume,
            playTrack,
            togglePlay,
            next,
            prev,
            seekTo,
            toggleShuffle,
            toggleRepeat,
            toggleQueue,
            toggleHistoryPaused,
            clearListeningHistory,
            addToQueue,
            playNextInQueue,
            removeFromQueue,
            reorderQueue,
            clearQueue,
            shuffleQueue,
        ]
    );

    // =========================
    // Actions-only context value (stable - never triggers re-renders)
    // Contains ONLY action callbacks, NO state
    // =========================

    const actionsValue = useMemo(
        () => ({
            playTrack,
            togglePlay,
            next,
            prev,
            seekTo,
            setVolume,
            toggleShuffle,
            toggleRepeat,
            toggleQueue,
            addToQueue,
            playNextInQueue,
            removeFromQueue,
            reorderQueue,
            clearQueue,
            shuffleQueue,
        }),
        [
            playTrack,
            togglePlay,
            next,
            prev,
            seekTo,
            setVolume,
            toggleShuffle,
            toggleRepeat,
            toggleQueue,
            addToQueue,
            playNextInQueue,
            removeFromQueue,
            reorderQueue,
            clearQueue,
            shuffleQueue,
        ]
    );

    return (
        <PlayerActionsContext.Provider value={actionsValue}>
            <PlayerContext.Provider value={value}>
                <audio
                    ref={playerARef}
                    playsInline
                    preload="auto"
                    style={{ display: "none" }}
                    id="player-A"
                />
                <audio
                    ref={playerBRef}
                    playsInline
                    preload="auto"
                    style={{ display: "none" }}
                    id="player-B"
                />
                {children}
            </PlayerContext.Provider>
        </PlayerActionsContext.Provider>
    );
};
