import React, { createContext, useState, useContext, useRef, useEffect, useCallback } from 'react';
import { fetchAudioUrl } from '../services/unifiedService';

const PlayerContext = createContext();

export const usePlayer = () => useContext(PlayerContext);

export const PlayerProvider = ({ children }) => {
    // --- ESTADOS PERSISTENTES ---
    const [currentTrack, setCurrentTrack] = useState(() => {
        try { return JSON.parse(localStorage.getItem('paradox_track')) || null; } catch { return null; }
    });
    const [queue, setQueue] = useState(() => {
        try { return JSON. parse(localStorage.getItem('paradox_queue')) || []; } catch { return []; }
    });
    const [currentIndex, setCurrentIndex] = useState(() => {
        return parseInt(localStorage.getItem('paradox_index')) || -1;
    });
    const [volume, setVolumeState] = useState(() => {
        const stored = localStorage.getItem('paradox_volume');
        if (! stored) return 0.5;
        const val = parseFloat(stored);
        return val > 1 ? val / 100 : val;
    });

    // --- ESTADOS VOLÁTILES ---
    const [isPlaying, setIsPlaying] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [played, setPlayed] = useState(0);
    const [duration, setDuration] = useState(0);
    const [errorMsg, setErrorMsg] = useState(null);
    const [isShuffle, setIsShuffle] = useState(false);
    const [repeatMode, setRepeatMode] = useState(0); // 0: None, 1: All, 2: One

    // Estado para visibilidad del Panel de Cola
    const [isQueueOpen, setIsQueueOpen] = useState(false);

    // --- REFS ---
    const audioRef = useRef(null);
    const activeRequestId = useRef(0);
    const queueRef = useRef(queue);
    const indexRef = useRef(currentIndex);
    const skipRef = useRef(null);

    // Inicializar el elemento Audio
    useEffect(() => {
        if (! audioRef.current) {
            audioRef.current = new Audio();
            audioRef.current.volume = volume;
            audioRef.current.preload = 'auto';
            console.log('[Player] 🔊 Audio element inicializado');
        }
    }, []);

    // Actualizar Refs y LocalStorage
    useEffect(() => {
        queueRef.current = queue;
        indexRef.current = currentIndex;
        localStorage.setItem('paradox_track', JSON.stringify(currentTrack));
        localStorage.setItem('paradox_queue', JSON.stringify(queue));
        localStorage.setItem('paradox_index', currentIndex);
    }, [queue, currentIndex, currentTrack]);

    const showError = useCallback((msg) => {
        setErrorMsg(msg);
        setTimeout(() => setErrorMsg(null), 3000);
    }, []);

    const setVolume = (val) => {
        const safeVal = val > 1 ? val / 100 : val;
        setVolumeState(safeVal);
    };

    const getSafeString = (val) => {
        if (typeof val === 'object' && val !== null) return val.name || val['#text'] || '';
        return val || '';
    };

    // --- CORE PLAY LOGIC ---
    const playTrackInternal = useCallback(async (track, currentQueue, newIndex) => {
        setCurrentTrack(track);
        setCurrentIndex(newIndex);
        setQueue(currentQueue);
        setIsLoading(true);
        setIsPlaying(false);
        setPlayed(0);
        setErrorMsg(null);

        const requestId = Date.now();
        activeRequestId.current = requestId;

        const artistName = getSafeString(track. artist);
        const trackName = getSafeString(track.name || track.title);

        console.log(`[Player] 🎵 Iniciando reproducción: "${artistName} - ${trackName}"`);

        try {
            const url = await fetchAudioUrl(artistName, trackName, track.duration);

            console.log(`[Player] 📡 URL obtenida:`, url ? url.substring(0, 100) + '...' : 'NULL');

            if (activeRequestId.current !== requestId) {
                console. log('[Player] ⚠️ Request cancelada (obsoleta)');
                return;
            }

            if (url) {
                // Asegurarse que audioRef existe
                if (!audioRef. current) {
                    audioRef.current = new Audio();
                    audioRef.current.volume = volume;
                }

                // Detener audio anterior
                audioRef.current.pause();
                audioRef.current. currentTime = 0;

                // Asignar nueva fuente
                audioRef.current.src = url;
                console.log(`[Player] 🔗 SRC asignado:`, audioRef.current.src. substring(0, 100));
                console.log(`[Player] 🔊 Volumen actual: ${audioRef.current.volume}`);

                // Cargar
                audioRef.current.load();
                console.log('[Player] ⏳ Cargando audio...');

                // Esperar a que esté listo
                await new Promise((resolve, reject) => {
                    const timeoutId = setTimeout(() => {
                        audioRef.current.removeEventListener('canplay', onCanPlay);
                        audioRef.current.removeEventListener('error', onError);
                        console.warn('[Player] ⏱️ Timeout esperando audio');
                        resolve(); // Intentar reproducir de todos modos
                    }, 15000);

                    const onCanPlay = () => {
                        clearTimeout(timeoutId);
                        console.log('[Player] ✅ Audio listo para reproducir');
                        audioRef.current.removeEventListener('canplay', onCanPlay);
                        audioRef.current.removeEventListener('error', onError);
                        resolve();
                    };

                    const onError = (e) => {
                        clearTimeout(timeoutId);
                        console.error('[Player] ❌ Error cargando audio:', audioRef.current.error);
                        audioRef.current.removeEventListener('canplay', onCanPlay);
                        audioRef.current.removeEventListener('error', onError);
                        reject(new Error('Error loading audio'));
                    };

                    audioRef.current.addEventListener('canplay', onCanPlay);
                    audioRef.current.addEventListener('error', onError);
                });

                if (activeRequestId.current === requestId) {
                    console.log('[Player] ▶️ Intentando play().. .');
                    try {
                        await audioRef.current.play();
                        console.log('[Player] 🎶 ¡Reproduciendo!');
                        setIsPlaying(true);
                    } catch (playError) {
                        console. error('[Player] ❌ Error en play():', playError. message);
                        // Intentar una vez más después de interacción del usuario
                        showError("Haz clic para reproducir");
                    }
                }
            } else {
                console.warn(`[Player] ⚠️ No se encontró audio para: ${trackName}`);
                showError("Audio no disponible");
                setTimeout(() => {
                    if (activeRequestId.current === requestId && skipRef.current) {
                        skipRef.current(true); // Auto-skip
                    }
                }, 1500);
            }
        } catch (error) {
            console. error("[Player] 💥 Error:", error. message);
            showError("Error de conexión");
        } finally {
            if (activeRequestId.current === requestId) setIsLoading(false);
        }
    }, [showError, volume]);

    // --- CONTROLES PÚBLICOS ---

    // 1. Reproducir (Reemplaza cola o salta)
    const playTrack = useCallback((track, contextQueue = null) => {
        let newQueue = [...queue];
        let newIndex = -1;

        if (contextQueue && contextQueue.length > 0) {
            // Si viene de una playlist nueva, reemplazamos todo
            newQueue = isShuffle ? [...contextQueue]. sort(() => Math.random() - 0.5) : contextQueue;
            newIndex = newQueue.findIndex(t => (t.id && t.id === track.id) || (t.name === track.name));
            if (newIndex === -1) newIndex = 0;
        } else {
            // Si es una canción suelta
            const idx = queue.findIndex(t => t.name === track.name);
            if (idx !== -1) {
                newIndex = idx;
            } else {
                newQueue. push(track);
                newIndex = newQueue.length - 1;
            }
        }
        playTrackInternal(track, newQueue, newIndex);
    }, [queue, isShuffle, playTrackInternal]);

    // 2. Agregar al final (Add to Queue)
    const addToQueue = useCallback((track) => {
        setQueue(prev => {
            return [...prev, track];
        });
        showError("Agregado a la cola");
    }, [showError]);

    // 3.  Reproducir a continuación (Play Next)
    const playNextInQueue = useCallback((track) => {
        setQueue(prev => {
            const newQ = [...prev];
            const insertIndex = currentIndex + 1;
            newQ.splice(insertIndex, 0, track);
            return newQ;
        });
        showError("Se reproducirá a continuación");
    }, [currentIndex, showError]);

    // 4. Eliminar de la cola
    const removeFromQueue = useCallback((indexToRemove) => {
        setQueue(prev => {
            const newQ = [...prev];
            newQ.splice(indexToRemove, 1);
            return newQ;
        });
        if (indexToRemove < currentIndex) {
            setCurrentIndex(prev => prev - 1);
        }
    }, [currentIndex]);

    // 5. Reordenar (Drag & Drop)
    const reorderQueue = useCallback((sourceIndex, destIndex) => {
        setQueue(prev => {
            const result = [...prev];
            const [removed] = result.splice(sourceIndex, 1);
            result. splice(destIndex, 0, removed);
            return result;
        });

        if (currentIndex === sourceIndex) setCurrentIndex(destIndex);
        else if (currentIndex > sourceIndex && currentIndex <= destIndex) setCurrentIndex(prev => prev - 1);
        else if (currentIndex < sourceIndex && currentIndex >= destIndex) setCurrentIndex(prev => prev + 1);

    }, [currentIndex]);

    const next = useCallback((isAuto = false) => {
        const q = queueRef.current;
        const i = indexRef.current;
        if (! q || q.length === 0) return;

        let nextIndex = i + 1;
        if (nextIndex >= q.length) {
            if (repeatMode === 1) nextIndex = 0;
            else {
                setIsPlaying(false);
                return;
            }
        }
        playTrackInternal(q[nextIndex], q, nextIndex);
    }, [repeatMode, playTrackInternal]);

    useEffect(() => { skipRef.current = next; }, [next]);

    const prev = useCallback(() => {
        if (audioRef.current && audioRef.current.currentTime > 3) {
            audioRef.current.currentTime = 0;
            return;
        }
        const q = queueRef.current;
        const i = indexRef. current;
        if (i > 0) playTrackInternal(q[i - 1], q, i - 1);
        else if (audioRef.current) audioRef.current.currentTime = 0;
    }, [playTrackInternal]);

    const seekTo = (fraction) => {
        if (audioRef.current && audioRef.current.duration) {
            audioRef.current. currentTime = fraction * audioRef. current.duration;
        }
    };

    // --- EVENTOS AUDIO ---
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const updateTime = () => {
            if (audio.duration) {
                setPlayed(audio.currentTime / audio.duration);
            }
        };
        const updateDuration = () => setDuration(audio.duration || 0);
        const handleEnded = () => {
            console.log('[Player] 🏁 Canción terminada');
            if (repeatMode === 2) {
                audio.currentTime = 0;
                audio.play();
            } else {
                next(true);
            }
        };
        const handleError = (e) => {
            console. error('[Player] ❌ Error de audio:', audio.error);
            if (isPlaying) {
                setTimeout(() => next(true), 1000);
            }
        };
        const handlePlay = () => {
            console.log('[Player] ▶️ Evento play disparado');
            setIsPlaying(true);
        };
        const handlePause = () => {
            console.log('[Player] ⏸️ Evento pause disparado');
        };

        audio.addEventListener('timeupdate', updateTime);
        audio. addEventListener('durationchange', updateDuration);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('error', handleError);
        audio.addEventListener('play', handlePlay);
        audio.addEventListener('pause', handlePause);

        return () => {
            audio.removeEventListener('timeupdate', updateTime);
            audio.removeEventListener('durationchange', updateDuration);
            audio.removeEventListener('ended', handleEnded);
            audio.removeEventListener('error', handleError);
            audio.removeEventListener('play', handlePlay);
            audio.removeEventListener('pause', handlePause);
        };
    }, [repeatMode, isPlaying, next]);

    // Control de play/pause
    useEffect(() => {
        if (! audioRef.current) return;
        
        if (isPlaying) {
            audioRef.current.play(). catch((e) => {
                console. warn('[Player] No se pudo reproducir automáticamente:', e. message);
                setIsPlaying(false);
            });
        } else {
            audioRef.current.pause();
        }
    }, [isPlaying]);

    // Control de volumen
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
            console.log(`[Player] 🔊 Volumen establecido: ${volume}`);
        }
        localStorage.setItem('paradox_volume', volume. toString());
    }, [volume]);

    // Toggle play/pause mejorado
    const togglePlay = useCallback(() => {
        if (! audioRef.current) return;
        
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play()
                .then(() => setIsPlaying(true))
                . catch(e => {
                    console. error('[Player] Error toggle play:', e.message);
                    showError("Error al reproducir");
                });
        }
    }, [isPlaying, showError]);

    return (
        <PlayerContext.Provider value={{
            currentTrack, isPlaying, isLoading, queue, played, duration, volume, errorMsg,
            isShuffle, repeatMode, isQueueOpen, currentIndex,
            setVolume, playTrack, togglePlay,
            next, prev, seekTo,
            toggleShuffle: () => setIsShuffle(!isShuffle),
            toggleRepeat: () => setRepeatMode(p => (p + 1) % 3),
            toggleQueue: () => setIsQueueOpen(!isQueueOpen),
            addToQueue, playNextInQueue, removeFromQueue, reorderQueue,
            audioRef // Exportado para debugging
        }}>
            {children}
        </PlayerContext.Provider>
    );
};