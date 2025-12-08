// musicalol/src/config.js

// ⚠️ IMPORTANTE: NO debe haber espacios en la URL
export const BACKEND_URL = "https://music-backend-tau.vercel.app";

export const CONFIG = {
    MUSIC_API_URL: BACKEND_URL,
    
    // APIs externas
    DEEZER_API_BASE: 'https://api.deezer.com',
    LYRICS_API_URL: 'https://lrclib.net/api',
    ITUNES_API_URL: 'https://itunes.apple.com/search',
    MB_API_URL: 'https://musicbrainz.org/ws/2',
    CAA_API_URL: 'https://coverartarchive.org',

    // ⭐ PROXY - Sin espacios en la URL
    CORS_PROXIES: [
        `${BACKEND_URL}/api/deezer-proxy?endpoint=`
        //                              ^ SIN espacio aquí
    ],

    // Fuentes de audio
    AUDIO_SOURCES: [
        {
            type: 'youtube-proxy',
            name: 'Vercel Backend (Saavn)',
            base: BACKEND_URL,
            priority: 1
        }
    ]
};