const SPOTIFY_TRACK_URL = /^https:\/\/open\.spotify\.com\/track\/[A-Za-z0-9]+(?:[/?#].*)?$/i;

export function getSpotifyListeningUrl(track) {
    if (!track) return '';

    const directUrl = track.spotifyUrl || track.externalUrls?.spotify || track.external_urls?.spotify;
    if (typeof directUrl === 'string' && SPOTIFY_TRACK_URL.test(directUrl)) {
        return directUrl;
    }

    const spotifyId = track.spotifyId
        || (track.source === 'spotify' ? (track.originalId || track.id) : '');
    if (typeof spotifyId === 'string' && /^[A-Za-z0-9]+$/.test(spotifyId)) {
        return `https://open.spotify.com/track/${spotifyId}`;
    }

    const title = String(track.title || track.name || '').trim();
    const artist = String(track.artist?.name || track.artist || track.artists?.[0]?.name || '').trim();
    if (!title || !artist) return '';

    return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`;
}
