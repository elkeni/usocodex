/**
 * UNIFIED MUSIC SERVICE 2025
 * MEJORADO: Matching exacto por artista + título + duración
 */

import { AuthService } from './authService';
import { CONFIG } from './config';

// unifiedService.js

const cleanMetadata = (str, aggressive = false) => {
    if (!str) return "";
    let s = str.toString().toLowerCase();
    
    // ⭐ CAMBIO: No reemplazamos '&' con 'and', lo convertimos en espacio.
    // Los buscadores funcionan mejor con "CA7RIEL Paco Amoroso" que con "CA7RIEL and Paco Amoroso"
    s = s.replace(/&/g, " ").replace(/\+/g, " ");
    
    s = s.replace(/\[.*?\]/g, "")
        .replace(/\((feat|ft|featuring|remaster|mix|version|edit|live|official|video|audio|lyric).*?\)/gi, "")
        .replace(/\b(official|video|audio|lyrics|letra|hd|hq|4k|remastered|remaster)\b/gi, "");

    if (aggressive) {
        s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }
    
    // ⭐ CAMBIO: Permitimos números dentro del nombre (para CA7RIEL, Blink-182, Maroon 5)
    // Antes eliminaba todo lo que no fuera letra
    return s.replace(/[^a-z0-9áéíóúñü ]/g, " ").replace(/\s+/g, " ").trim();
};

const normalize =(text) => {
    if (!text) return '';
    const LEET_MAP ={ '0':'o','1':'i','2':'z','3':'e','4':'a','5':'s','6':'g','7':'t','8':'b','9':'g' };
    let r =text.toLowerCase();
    r =r.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    r =r.split('').map(c => LEET_MAP[c] || c).join('');
    r =r.replace(/&/g,' ').replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();
    return r;
};

const parseDurationToSeconds =(duration) => {
    if (!duration) return 0;
    if (typeof duration ==='number') return duration;
    if (typeof duration ==='string') {
        if (duration.includes(':')) {
            const parts =duration.split(':').map(Number);
            if (parts.length ===2) return (parts[0] * 60) + parts[1];
            if (parts.length ===3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
        }
        return parseInt(duration) || 0;
    }
    return 0;
};

// =============================================================================
// DEEZER CLIENT
// =============================================================================

const DeezerClient ={
    async _fetch(endpoint) {
        const proxyUrl =`${CONFIG.CORS_PROXIES[0]}${encodeURIComponent(endpoint)}`;
        try {
            const controller =new AbortController();
            const timeoutId =setTimeout(() => controller.abort(),10000);
            const res =await fetch(proxyUrl,{ signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) return { data: [] };
            const data =await res.json();
            if (data.error) return { data: [] };
            return data;
        } catch (e) {
            return { data: [] };
        }
    },

    _mapTrack(dt) {
        if (!dt) return null;
        return {
            id: dt.id,
            name: dt.title,
            artist: dt.artist?.name || "Desconocido",
            album: dt.album?.title || "Sencillo",
            image: dt.album?.cover_xl || dt.album?.cover_big || dt.artist?.picture_xl,
            duration: dt.duration,
            preview: dt.preview,
            link: dt.link
        };
    },

    _mapPlaylist(pl) {
        if (!pl) return null;
        return {
            id: pl.id,
            name: pl.title,
            creator: pl.user?.name || 'Deezer',
            image: pl.picture_xl || pl.picture_big || pl.picture_medium,
            trackCount: pl.nb_tracks,
            link: pl.link
        };
    },

    async searchGlobal(query,type ='track',limit =15) {
        if (!query) return [];
        const q =cleanMetadata(query,false);
        const data =await this._fetch(`/search/${type}?q=${encodeURIComponent(q)}&limit=${limit}`);
        return data?.data || [];
    },

    async getChart(type ='tracks',limit =20) {
        const data =await this._fetch(`/chart/0/${type}?limit=${limit}`);
        if (type ==='playlists') return data?.data ?data.data.map(this._mapPlaylist) : [];
        if (type ==='artists') return data?.data ?data.data.map(r => ({ name: r.name,image: r.picture_xl })) : [];
        return data?.data ?data.data.map(this._mapTrack) : [];
    },

    async getPlaylistDetails(playlistId) {
        const data =await this._fetch(`/playlist/${playlistId}`);
        if (!data || data.error) return null;
        return {
            ...this._mapPlaylist(data),
            description: data.description || "",
            tracks: data.tracks?.data ?data.tracks.data.map(this._mapTrack) : []
        };
    },

    async getArtistTop(artistId,limit =20) {
        let id =artistId;
        if (isNaN(id)) {
            const search =await this.searchGlobal(artistId,'artist',1);
            if (! search[0]) return [];
            id =search[0].id;
        }
        const top =await this._fetch(`/artist/${id}/top?limit=${limit}`);
        return top?.data ?top.data.map(this._mapTrack) : [];
    }
};

// =============================================================================
// AUDIO ENGINE - MEJORADO CON MATCHING EXACTO
// =============================================================================

const AudioEngine ={
    /**
     * ⭐ NUEVO: Calcula similitud entre dos strings (0 a 1)
     */
    stringSimilarity(s1,s2) {
        const a =normalize(s1);
        const b =normalize(s2);
        
        if (a ===b) return 1.0;
        if (! a || !b) return 0;
        
        // Verificar si uno contiene al otro
        if (a.includes(b) || b.includes(a)) {
            const longer =a.length > b.length ?a : b;
            const shorter =a.length > b.length ?b : a;
            return shorter.length / longer.length;
        }
        
        // Contar palabras en común
        const wordsA =a.split(' ').filter(w => w.length > 1);
        const wordsB =b.split(' ').filter(w => w.length > 1);
        
        let matches =0;
        for (const w of wordsA) {
            if (wordsB.some(wb => wb.includes(w) || w.includes(wb))) {
                matches++;
            }
        }
        
        return wordsA.length > 0 ?matches / wordsA.length : 0;
    },

    /**
     * ⭐ MEJORADO: Sistema de puntuación EXACTO
     */
    calculateScore(target,result) {
        let score =0;
        
        const targetTitle =normalize(target.name || '');
        const targetArtist =normalize(target.artist || '');
        const targetDuration =target.duration || 0;
        
        const resultTitle =normalize(result.title || result.name || '');
        const resultArtist =normalize(result.author?.name || result.artist || '');
        const resultDuration =result.duration || 0;
        
        // 1.TÍTULO - Máximo 100 puntos
        const titleSimilarity =this.stringSimilarity(targetTitle,resultTitle);
        score +=titleSimilarity * 100;
        
        // 2.ARTISTA - Máximo 150 puntos (más importante)
        const artistSimilarity =this.stringSimilarity(targetArtist,resultArtist);
        score +=artistSimilarity * 150;
        
        // ⭐ PENALIZACIÓN FUERTE si el artista es "Unknown" o vacío
        if (! resultArtist || resultArtist ==='unknown' || resultArtist.length < 2) {
            score -=100;
        }
        
        // ⭐ BONUS si el artista coincide EXACTAMENTE
        if (targetArtist ===resultArtist) {
            score +=50;
        }
        
        // 3.DURACIÓN - Máximo 80 puntos
        if (targetDuration > 0 && resultDuration > 0) {
            const diff =Math.abs(targetDuration - resultDuration);
            
            if (diff <=3) {
                score +=80;  // Casi exacto
            } else if (diff <=10) {
                score +=60;
            } else if (diff <=20) {
                score +=40;
            } else if (diff <=30) {
                score +=20;
            } else if (diff > 60) {
                score -=50;  // Muy diferente,penalizar
            }
        }
        
        // 4.PENALIZACIONES por contenido no deseado
        const blacklist =['karaoke','cover','tribute','instrumental','remix','live','acoustic','8d','slowed','reverb'];
        for (const word of blacklist) {
            if (resultTitle.includes(word) && !targetTitle.includes(word)) {
                score -=80;
            }
        }
        
        return Math.round(score);
    },

    async searchInSource(source, query, artistContext = '', trackContext = '', durationContext = 0) {
        
        if (!source || !query) return [];

        if (source.type === 'youtube-proxy' || source.type === 'saavn') {
            try {
                const controller = new AbortController();
                // Reducimos timeout a 6s para sensación de velocidad
                const timeoutId = setTimeout(() => controller.abort(), 6000); 
                
                const baseUrl = source.base.replace(/\/$/, '');
                
                // ⭐ AQUÍ ESTÁ LA MAGIA: Enviamos contexto al backend
                let url = `${baseUrl}/api/youtube-search?q=${encodeURIComponent(query)}&limit=15`; // Subí el límite a 15 para tener más opciones
                const cleanArtist = cleanMetadata(artistContext);
                const cleanTrack = cleanMetadata(trackContext);

                if (cleanArtist) url += `&artist=${encodeURIComponent(cleanArtist)}`;
                if (cleanTrack) url += `&track=${encodeURIComponent(cleanTrack)}`;
                if (durationContext) url += `&duration=${durationContext}`;

                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!res.ok) return [];
                const data = await res.json();

                if (!data.success || !Array.isArray(data.results)) return [];

                return data.results.map(item => ({
                    ...item,
                    duration: parseDurationToSeconds(item.duration)
                }));
            } catch (e) {
                console.warn('[AudioEngine] Search Timeout/Error:', e.message);
                return [];
            }
        }
        return [];
    },

    async fetchStreamsFromSource(source,item) {
        if (!source || !item || !item.videoId) return null;

        try {
            const controller =new AbortController();
            const timeoutId =setTimeout(() => controller.abort(),10000);
            const baseUrl =source.base.replace(/\/$/,'');
            const url =`${baseUrl}/api/youtube-streams?videoId=${encodeURIComponent(item.videoId)}`;

            const res =await fetch(url,{ signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) return null;
            const data =await res.json();

            if (! data.success || !Array.isArray(data.audioStreams) || data.audioStreams.length ===0) {
                return null;
            }

            item.downloadUrl =data.audioStreams;
            return item;
        } catch (e) {
            return null;
        }
    },

    extractBestUrl(item) {
        if (!item || !item.downloadUrl) return null;
        const streams = Array.isArray(item.downloadUrl) ? item.downloadUrl : [item.downloadUrl];
        if (streams.length === 0) return null;

        const getKbps = (q) => {
            if (!q) return 0;
            const match = q.match(/(\d+)/);
            return match ? parseInt(match[1]) : 0;
        };

        // Filtrar solo audios válidos
        const validStreams = streams.filter(s => s.url);

        // 1. Buscar calidad ALTA (>128kbps) preferiblemente m4a (mejor compresión que mp3/webm)
        const highQuality = validStreams.sort((a, b) => getKbps(b.quality) - getKbps(a.quality));
        
        // Intentar encontrar 160kbps o 320kbps
        const best = highQuality.find(s => getKbps(s.quality) >= 128);
        if (best) {
             console.log(`[AudioEngine] 🔊 Calidad Alta encontrada: ${best.quality}`);
             return best.url;
        }

        // 2. Fallback: 96kbps mínimo absoluto
        const medium = highQuality.find(s => getKbps(s.quality) >= 96);
        if (medium) return medium.url;

        return highQuality[0]?.url || null;
    },

    /**
     * ⭐ FUNCIÓN PRINCIPAL MEJORADA
     */
    async getAudioUrl(artist,title,inputDuration =0) {
        console.log(`[AudioEngine] 🎵 Buscando: "${artist} - ${title}" (${inputDuration}s)`);

        const targetDuration =inputDuration || 0;

        // Queries de búsqueda - priorizando artista + título
        const queries = [
            `${title} ${artist}`, // La más estándar
            `${artist} ${title} audio` // Forzamos "audio" si la primera falla
        ];

        let bestCandidate = null;
        let bestScore = -Infinity;
        let bestSource = null;

        for (const query of queries) {
            for (const source of CONFIG.AUDIO_SOURCES) {
                // ⭐ PASAMOS LOS METADATOS EXPLÍCITOS
                const results = await this.searchInSource(source, query, artist, title, targetDuration);
                
                if (!results || results.length === 0) continue;

                for (const item of results) {
                    const score = this.calculateScore(
                        { name: title, artist: artist, duration: targetDuration },
                        item
                    );

                    // Si el backend ya nos dice que el score es alto y nosotros coincidimos...
                    if (score >= 200) {
                        console.log(`[AudioEngine] ⚡ Match instantáneo (${score}): ${item.title}`);
                        const candidate = await this.fetchStreamsFromSource(source, item);
                        const url = this.extractBestUrl(candidate);
                        if (url) return url; // Retorno inmediato para velocidad máxima
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        bestCandidate = item;
                        bestSource = source;
                    }
                }
            }
             // Si en la primera query ya tenemos un candidato muy bueno (>150), no hacemos la segunda query
             if (bestScore > 150) break;
        }

        // ⭐ Solo usar el mejor candidato si tiene score > 100
        if (bestCandidate && bestScore > 100 && bestSource) {
            console.log(`[AudioEngine] 🔄 Usando mejor candidato (score: ${bestScore}): ${bestCandidate.title}`);
            
            const candidate =await this.fetchStreamsFromSource(bestSource,bestCandidate);
            if (candidate && candidate.downloadUrl) {
                const url =this.extractBestUrl(candidate);
                if (url) return url;
            }
        }

        console.warn(`[AudioEngine] ❌ No se encontró audio válido para: "${artist} - ${title}"`);
        return null;
    }
};

// =============================================================================
// LYRICS & METADATA (Sin cambios)
// =============================================================================

const LyricsEngine ={
    async getLyrics(artist,title) {
        try {
            const cleanT =cleanMetadata(title,true);
            const cleanA =cleanMetadata(artist,true);
            const url =`${CONFIG.LYRICS_API_URL}/get?artist_name=${encodeURIComponent(cleanA)}&track_name=${encodeURIComponent(cleanT)}`;
            const res =await fetch(url);
            if (!res.ok) throw new Error("Not found");
            const data =await res.json();
            return { plainLyrics: data.plainLyrics,syncedLyrics: data.syncedLyrics,instrumental: data.instrumental };
        } catch (e) {
            return this.searchLyricsFallback(artist,title);
        }
    },

    async searchLyricsFallback(artist,title) {
        try {
            const q =`${artist} ${title}`;
            const res =await fetch(`${CONFIG.LYRICS_API_URL}/search?q=${encodeURIComponent(q)}`);
            const data =await res.json();
            if (Array.isArray(data) && data.length > 0) {
                return { plainLyrics: data[0].plainLyrics,syncedLyrics: data[0].syncedLyrics };
            }
            return null;
        } catch (e) { return null; }
    }
};

const CanonicalCore ={
    async getCanonicalTrack(artist,title) {
        try {
            const query =`${artist} ${title}`;
            const url =`${CONFIG.ITUNES_API_URL}?term=${encodeURIComponent(query)}&media=music&entity=song&limit=1`;
            const res =await fetch(url);
            const data =await res.json();
            if (data.resultCount > 0) {
                const track =data.results[0];
                return {
                    found: true,
                    officialName: track.trackName,
                    officialArtist: track.artistName,
                    officialAlbum: track.collectionName,
                    duration: track.trackTimeMillis / 1000,
                    coverHd: track.artworkUrl100.replace('100x100bb','800x800bb'),
                    isExplicit: track.trackExplicitness ==='explicit'
                };
            }
        } catch (e) {}
        return { found: false };
    }
};

const MetadataCore ={
    async getHighResCover(trackName,artistName) {
        const canonical =await CanonicalCore.getCanonicalTrack(artistName,trackName);
        if (canonical.found && canonical.coverHd) return canonical.coverHd;
        try {
            const query =`artist:"${cleanMetadata(artistName,false)}" AND recording:"${cleanMetadata(trackName,false)}"`;
            const res =await fetch(`${CONFIG.MB_API_URL}/recording?query=${encodeURIComponent(query)}&limit=1&fmt=json`,{
                headers: { 'User-Agent': 'MusicApp/2.0' }
            });
            const data =await res.json();
            const release =data.recordings?.[0]?.releases?.[0];
            if (release?.id) return `${CONFIG.CAA_API_URL}/release/${release.id}/front-500`;
        } catch (e) {}
        return null;
    }
};

// =============================================================================
// API PÚBLICA
// =============================================================================

export const fetchAudioUrl =(artist,title,duration) => AudioEngine.getAudioUrl(artist,title,duration);
export const fetchLyrics =(artist,title) => LyricsEngine.getLyrics(artist,title);
export const getDeezerTrackImage =async (track,artist) => {
    const hdCover =await MetadataCore.getHighResCover(track,artist);
    if (hdCover) return hdCover;
    const results =await DeezerClient.searchGlobal(`${track} ${artist}`,'track',1);
    if (results[0]) return results[0].image;
    return null;
};

export const chartGetTopTracks =async ({ limit =50 }) => {
    const tracks =await DeezerClient.getChart('tracks',limit);
    return { tracks: { track: tracks } };
};

export const chartGetTopPlaylists =async ({ limit =20 }) => {
    const playlists =await DeezerClient.getChart('playlists',limit);
    return { playlists: { playlist: playlists } };
};

export const chartGetTopArtists =async ({ limit =50 }) => {
    const artists =await DeezerClient.getChart('artists',limit);
    return { artists: { artist: artists } };
};

export const trackSearch =async ({ track,limit }) => {
    const rawData =await DeezerClient.searchGlobal(track,'track',limit);
    return { results: { trackmatches: { track: rawData.map(DeezerClient._mapTrack) } } };
};

export const artistSearch =async ({ artist,limit }) => {
    const rawData =await DeezerClient.searchGlobal(artist,'artist',limit);
    return {
        results: {
            artistmatches: {
                artist: rawData.map(r => ({ name: r.name,image: [{ '#text': r.picture_xl,size: 'extralarge' }] }))
            }
        }
    };
};

export const albumSearch =async ({ album,limit }) => {
    const rawData =await DeezerClient.searchGlobal(album,'album',limit);
    return {
        results: {
            albummatches: {
                album: rawData.map(r => ({ name: r.title,artist: r.artist?.name,image: [{ '#text': r.cover_xl,size: 'extralarge' }] }))
            }
        }
    };
};

export const playlistSearch =async ({ query,limit }) => {
    const rawData =await DeezerClient.searchGlobal(query,'playlist',limit);
    return { results: { playlistmatches: { playlist: rawData.map(DeezerClient._mapPlaylist) } } };
};

export const playlistGetInfo =async ({ id }) => await DeezerClient.getPlaylistDetails(id);

export const artistGetTopTracks =async ({ artist,limit =10 }) => {
    const tracks =await DeezerClient.getArtistTop(artist,limit);
    return { toptracks: { track: tracks } };
};

export const tagGetTopTracks =async ({ tag,limit =50 }) => {
    const raw =await DeezerClient.searchGlobal(tag,'track',limit);
    return { tracks: { track: raw.map(DeezerClient._mapTrack) } };
};

export const authGetSession =async () => {
    const user =AuthService.getCurrentUser();
    return { session: { key: user?.uid || "guest",name: user?.displayName || user?.email || "Invitado" } };
};

export const userGetInfo =async () => {
    const user =AuthService.getCurrentUser();
    return { user: { name: user?.displayName || "Invitado",image: [{ '#text': user?.photoURL || "" }] } };
};