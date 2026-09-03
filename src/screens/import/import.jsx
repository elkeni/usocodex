import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    FaSpotify, FaYoutube, FaArrowLeft, FaCheck, FaTimes, FaMusic,
    FaHeart, FaList, FaCompactDisc, FaUser,
    FaExclamationTriangle, FaChevronRight, FaSync
} from 'react-icons/fa';
import { HiSparkles } from 'react-icons/hi';
import { useUser } from '../../context/userContext';
import ImportService, { MATCH_STATUS } from '../../services/importService';
import { finalizeTracksArray } from '../../utils/trackNormalizer';
import { PRODUCT_EVENTS, recordProductEvent } from '../../services/productMetrics';
import { getArtworkImageProps } from '../../services/imageQuality';
import './import.css';

// =============================================================================
// CONSTANTS
// =============================================================================

const IMPORT_STEPS = {
    SELECT_PLATFORM: 'select_platform',
    SPOTIFY_AUTH: 'spotify_auth',
    SPOTIFY_SELECT: 'spotify_select',
    SPOTIFY_PLAYLIST_SELECTION: 'spotify_playlist_selection',
    YOUTUBE_URL: 'youtube_url',
    IMPORTING: 'importing',
    RESULTS: 'results',
    ERROR: 'error'
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function Import() {
    const navigate = useNavigate();
    const location = useLocation();
    const {
        user,
        bulkAddFavorites,
        bulkAddAlbums,
        bulkAddArtists,
        createPlaylistWithTracks // Usar método atómico
    } = useUser();

    // State
    const [step, setStep] = useState(IMPORT_STEPS.SELECT_PLATFORM);
    const [spotifySummary, setSpotifySummary] = useState(null);
    const [spotifySelections, setSpotifySelections] = useState({
        likedSongs: true,
        playlists: false,
        albums: false,
        artists: false
    });

    // New state for playlist selection
    const [userPlaylists, setUserPlaylists] = useState([]);
    const [selectedPlaylistIds, setSelectedPlaylistIds] = useState([]);
    // Note: isLoadingPlaylists is set but used only internally for now
    const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false); // eslint-disable-line no-unused-vars

    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [progress, setProgress] = useState({ phase: '', current: 0, total: 0, type: '' });
    const [importResult, setImportResult] = useState(null);
    const [error, setError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 });

    // Handle Spotify OAuth callback
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const code = params.get('code');
        const error = params.get('error');

        if (error) {
            setError('Acceso denegado. Por favor, autoriza la aplicación.');
            setStep(IMPORT_STEPS.ERROR);
            return;
        }

        if (code) {
            handleSpotifyCallback(code);
        }
    }, [location]);

    // ==========================================================================
    // SPOTIFY HANDLERS
    // ==========================================================================

    const handleSpotifyConnect = async () => {
        try {
            setStep(IMPORT_STEPS.SPOTIFY_AUTH);
            const authUrl = await ImportService.Spotify.startAuth();
            window.location.href = authUrl;
        } catch (err) {
            setError(err.message);
            setStep(IMPORT_STEPS.ERROR);
        }
    };

    const handleSpotifyCallback = async (code) => {
        try {
            setStep(IMPORT_STEPS.SPOTIFY_AUTH);
            await ImportService.Spotify.exchangeCode(code);

            // Clear URL params
            window.history.replaceState({}, document.title, '/import');

            // Fetch summary
            const summary = await ImportService.Spotify.getLibrarySummary();
            setSpotifySummary(summary);
            setStep(IMPORT_STEPS.SPOTIFY_SELECT);
        } catch (err) {
            setError(err.message);
            setStep(IMPORT_STEPS.ERROR);
        }
    };

    // Pre-import check: If playlists selected, fetch them first
    const handlePreImport = async () => {
        if (spotifySelections.playlists) {
            setIsLoadingPlaylists(true);
            try {
                const playlists = await ImportService.Spotify.getUserPlaylistsMetadata();
                setUserPlaylists(playlists);
                // Select all by default
                setSelectedPlaylistIds(playlists.map(p => p.id));
                setStep(IMPORT_STEPS.SPOTIFY_PLAYLIST_SELECTION);
            } catch (err) {
                setError("Error cargando playlists: " + err.message);
                setStep(IMPORT_STEPS.ERROR);
            } finally {
                setIsLoadingPlaylists(false);
            }
        } else {
            handleSpotifyImport();
        }
    };

    const handleSpotifyImport = async () => {
        recordProductEvent(PRODUCT_EVENTS.IMPORT_STARTED);
        setStep(IMPORT_STEPS.IMPORTING);
        setProgress({ phase: 'starting', current: 0, total: 0 });

        try {
            const result = await ImportService.importFromSpotify(
                {
                    importLikedSongs: spotifySelections.likedSongs,
                    importPlaylists: spotifySelections.playlists,
                    importAlbums: spotifySelections.albums,
                    importArtists: spotifySelections.artists,
                    selectedPlaylistIds: spotifySelections.playlists ? selectedPlaylistIds : []
                },
                (p) => setProgress(p)
            );

            setImportResult(result);
            recordProductEvent(result?.errors?.length ? PRODUCT_EVENTS.IMPORT_FAILED : PRODUCT_EVENTS.IMPORT_COMPLETED);
            setStep(IMPORT_STEPS.RESULTS);
        } catch (err) {
            recordProductEvent(PRODUCT_EVENTS.IMPORT_FAILED);
            setError(err.message);
            setStep(IMPORT_STEPS.ERROR);
        }
    };

    // Toggle playlist selection
    const togglePlaylistSelection = (id) => {
        setSelectedPlaylistIds(prev =>
            prev.includes(id)
                ? prev.filter(pId => pId !== id)
                : [...prev, id]
        );
    };

    const toggleAllPlaylists = () => {
        if (selectedPlaylistIds.length === userPlaylists.length) {
            setSelectedPlaylistIds([]);
        } else {
            setSelectedPlaylistIds(userPlaylists.map(p => p.id));
        }
    };

    // ==========================================================================
    // YOUTUBE HANDLERS
    // ==========================================================================

    const handleYouTubeImport = async () => {
        if (!youtubeUrl.trim()) {
            setError('Por favor, ingresa una URL de playlist de YouTube');
            return;
        }

        recordProductEvent(PRODUCT_EVENTS.IMPORT_STARTED);
        setStep(IMPORT_STEPS.IMPORTING);
        setProgress({ phase: 'starting', current: 0, total: 0 });

        try {
            const result = await ImportService.importYouTubePlaylist(
                youtubeUrl,
                (p) => setProgress(p)
            );

            setImportResult(result);
            recordProductEvent(result?.errors?.length ? PRODUCT_EVENTS.IMPORT_FAILED : PRODUCT_EVENTS.IMPORT_COMPLETED);
            setStep(IMPORT_STEPS.RESULTS);
        } catch (err) {
            recordProductEvent(PRODUCT_EVENTS.IMPORT_FAILED);
            setError(err.message);
            setStep(IMPORT_STEPS.ERROR);
        }
    };

    // ==========================================================================
    // SAVE TO LIBRARY - Versión robusta con UX honesta
    // ==========================================================================

    const saveToLibrary = async () => {
        if (!importResult || isSaving) return;

        setIsSaving(true);

        // Estado de guardado detallado para UX honesta
        const saveStats = {
            favorites: { total: 0, saved: 0, failed: 0 },
            playlists: { total: 0, saved: 0, failed: 0 },
            albums: { total: 0, saved: 0, failed: 0 },
            artists: { total: 0, saved: 0, failed: 0 },
            errors: []
        };

        setSaveProgress({ current: 0, total: 0, phase: 'preparing', stats: saveStats });

        try {
            // Calcular totales
            let totalSteps = 0;
            let completedSteps = 0;

            // Contar favoritos matcheados
            const matchedFavorites = (importResult.likedSongs || []).filter(t =>
                t.matchStatus === MATCH_STATUS.MATCHED || t.matchStatus === MATCH_STATUS.PARTIAL
            );
            if (matchedFavorites.length > 0) totalSteps++;
            saveStats.favorites.total = matchedFavorites.length;

            // Contar playlists con tracks matcheados
            const playlistsToSave = (importResult.playlists || []).map(pl => ({
                ...pl,
                matchedTracks: (pl.tracks || []).filter(t =>
                    t.matchStatus === MATCH_STATUS.MATCHED || t.matchStatus === MATCH_STATUS.PARTIAL
                )
            })).filter(pl => pl.matchedTracks.length > 0);
            totalSteps += playlistsToSave.length;
            saveStats.playlists.total = playlistsToSave.length;

            // YouTube playlist
            const youtubeMatchedTracks = (importResult.playlist?.tracks || []).filter(t =>
                t.matchStatus === MATCH_STATUS.MATCHED || t.matchStatus === MATCH_STATUS.PARTIAL
            );
            if (youtubeMatchedTracks.length > 0) totalSteps++;

            // Albums y Artists
            if (importResult.albums?.length) totalSteps++;
            saveStats.albums.total = importResult.albums?.length || 0;

            if (importResult.artists?.length) totalSteps++;
            saveStats.artists.total = importResult.artists?.length || 0;

            setSaveProgress({ current: 0, total: totalSteps, phase: 'saving', stats: saveStats });

            // ===== 1. GUARDAR FAVORITOS =====
            if (matchedFavorites.length > 0) {
                setSaveProgress(prev => ({ ...prev, phase: 'saving_favorites' }));

                try {
                    // OBLIGATORIO: Normalizar tracks antes de guardar
                    const { valid: tracksToSave, invalid } = finalizeTracksArray(
                        matchedFavorites,
                        'spotify'
                    );

                    if (invalid.length > 0) {
                        console.warn(`[Save] ⚠️ ${invalid.length} favoritos descartados por datos incompletos`);
                    }

                    if (tracksToSave.length > 0) {
                        const result = await bulkAddFavorites(tracksToSave);
                        saveStats.favorites.saved = result.added || tracksToSave.length;
                        console.log(`[Save] ✅ Favoritos: ${saveStats.favorites.saved} guardados`);
                    }
                } catch (err) {
                    console.error('[Save] ❌ Error guardando favoritos:', err);
                    saveStats.favorites.failed = matchedFavorites.length;
                    saveStats.errors.push({ type: 'favorites', message: err.message });
                }

                completedSteps++;
                setSaveProgress({ current: completedSteps, total: totalSteps, phase: 'saving', stats: saveStats });
            }

            // ===== 2. GUARDAR PLAYLISTS DE SPOTIFY (ATÓMICO) =====
            for (const playlist of playlistsToSave) {
                setSaveProgress(prev => ({
                    ...prev,
                    phase: 'saving_playlist',
                    currentPlaylist: playlist.name
                }));

                try {
                    // OBLIGATORIO: Normalizar tracks antes de guardar
                    const { valid: tracksToSave, invalid } = finalizeTracksArray(
                        playlist.matchedTracks,
                        'spotify'
                    );

                    if (invalid.length > 0) {
                        console.warn(`[Save] ⚠️ ${invalid.length} tracks descartados en "${playlist.name}"`);
                    }

                    if (tracksToSave.length > 0) {
                        // Usar método atómico: crea playlist con tracks en una sola operación
                        const result = await createPlaylistWithTracks(
                            playlist.name,
                            playlist.description || '',
                            tracksToSave
                        );

                        saveStats.playlists.saved++;
                        console.log(`[Save] ✅ Playlist "${playlist.name}": ${result.added} tracks`);
                    } else {
                        console.warn(`[Save] ⚠️ Playlist "${playlist.name}" sin tracks válidos`);
                    }
                } catch (err) {
                    console.error(`[Save] ❌ Error guardando playlist "${playlist.name}":`, err);
                    saveStats.playlists.failed++;
                    saveStats.errors.push({ type: 'playlist', name: playlist.name, message: err.message });
                }

                completedSteps++;
                setSaveProgress({ current: completedSteps, total: totalSteps, phase: 'saving', stats: saveStats });
            }

            // ===== 3. GUARDAR PLAYLIST DE YOUTUBE (ATÓMICO) =====
            if (youtubeMatchedTracks.length > 0) {
                setSaveProgress(prev => ({
                    ...prev,
                    phase: 'saving_youtube',
                    currentPlaylist: importResult.playlist?.name || 'YouTube Import'
                }));

                try {
                    // OBLIGATORIO: Normalizar tracks antes de guardar
                    // YouTube tracks usan 'youtube' como source → album = "Single" si no existe
                    const { valid: tracksToSave, invalid } = finalizeTracksArray(
                        youtubeMatchedTracks,
                        'youtube'
                    );

                    if (invalid.length > 0) {
                        console.warn(`[Save] ⚠️ ${invalid.length} tracks YouTube descartados`);
                    }

                    if (tracksToSave.length === 0) {
                        console.warn('[Save] ⚠️ Playlist YouTube sin tracks válidos');
                        completedSteps++;
                        setSaveProgress({ current: completedSteps, total: totalSteps, phase: 'saving', stats: saveStats });
                        return;
                    }

                    const result = await createPlaylistWithTracks(
                        importResult.playlist?.name || 'YouTube Import',
                        `Importada desde YouTube el ${new Date().toLocaleDateString()}`,
                        tracksToSave
                    );

                    console.log(`[Save] ✅ Playlist YouTube: ${result.added} tracks`);
                } catch (err) {
                    console.error('[Save] ❌ Error guardando playlist YouTube:', err);
                    saveStats.errors.push({ type: 'youtube', message: err.message });
                }

                completedSteps++;
                setSaveProgress({ current: completedSteps, total: totalSteps, phase: 'saving', stats: saveStats });
            }

            // ===== 4. GUARDAR ÁLBUMES =====
            if (importResult.albums?.length) {
                setSaveProgress(prev => ({ ...prev, phase: 'saving_albums' }));

                try {
                    const result = await bulkAddAlbums(importResult.albums);
                    saveStats.albums.saved = result.added || importResult.albums.length;
                    console.log(`[Save] ✅ Álbumes: ${saveStats.albums.saved} guardados`);
                } catch (err) {
                    console.error('[Save] ❌ Error guardando álbumes:', err);
                    saveStats.albums.failed = importResult.albums.length;
                    saveStats.errors.push({ type: 'albums', message: err.message });
                }

                completedSteps++;
                setSaveProgress({ current: completedSteps, total: totalSteps, phase: 'saving', stats: saveStats });
            }

            // ===== 5. GUARDAR ARTISTAS =====
            if (importResult.artists?.length) {
                setSaveProgress(prev => ({ ...prev, phase: 'saving_artists' }));

                try {
                    const result = await bulkAddArtists(importResult.artists);
                    saveStats.artists.saved = result.added || importResult.artists.length;
                    console.log(`[Save] ✅ Artistas: ${saveStats.artists.saved} guardados`);
                } catch (err) {
                    console.error('[Save] ❌ Error guardando artistas:', err);
                    saveStats.artists.failed = importResult.artists.length;
                    saveStats.errors.push({ type: 'artists', message: err.message });
                }

                completedSteps++;
                setSaveProgress({ current: completedSteps, total: totalSteps, phase: 'saving', stats: saveStats });
            }

            // ===== DETERMINAR ESTADO FINAL (UX HONESTA) =====
            // Note: hasErrors is used for logging/debugging
            const hasErrors = saveStats.errors.length > 0; // eslint-disable-line no-unused-vars
            const totalSaved = saveStats.favorites.saved + saveStats.playlists.saved +
                saveStats.albums.saved + saveStats.artists.saved;
            const totalFailed = saveStats.favorites.failed + saveStats.playlists.failed +
                saveStats.albums.failed + saveStats.artists.failed;

            let finalPhase;
            if (totalFailed === 0 && totalSaved > 0) {
                finalPhase = 'completed'; // Todo guardado exitosamente
            } else if (totalSaved > 0 && totalFailed > 0) {
                finalPhase = 'partial'; // Guardado parcial
            } else if (totalSaved === 0 && totalFailed > 0) {
                finalPhase = 'error'; // Todo falló
            } else {
                finalPhase = 'completed'; // Nada que guardar
            }

            setSaveProgress({
                current: totalSteps,
                total: totalSteps,
                phase: finalPhase,
                stats: saveStats
            });

            // Solo navegar si todo fue exitoso
            if (finalPhase === 'completed') {
                await new Promise(r => setTimeout(r, 1500));
                navigate('/library');
            }

        } catch (err) {
            console.error('[Save] ❌ Error crítico:', err);
            setSaveProgress(prev => ({
                ...prev,
                phase: 'error',
                error: err.message,
                stats: saveStats
            }));
            setError(`Error guardando biblioteca: ${err.message}`);
        } finally {
            setTimeout(() => setIsSaving(false), 2000);
        }
    };

    // ==========================================================================
    // RENDER FUNCTIONS
    // ==========================================================================

    const renderPlatformSelection = () => (
        <div className="import-step platform-select">
            <div className="import-header">
                <button className="back-btn" onClick={() => navigate(-1)}>
                    <FaArrowLeft />
                </button>
                <h1>Importa tu Música</h1>
            </div>

            <div className="import-hero">
                <div className="hero-icon">
                    <HiSparkles />
                </div>
                <h2>Trae tu biblioteca a ParadisQuo</h2>
                <p>
                    Elige una fuente e importa los datos compatibles a tu biblioteca.
                    <br />
                    <span className="privacy-note">
                        <FaCheck /> Solo importamos metadatos, nunca audio.
                    </span>
                </p>
            </div>

            <div className="platform-cards">
                <button
                    className="platform-card spotify"
                    onClick={handleSpotifyConnect}
                >
                    <div className="platform-icon">
                        <FaSpotify />
                    </div>
                    <div className="platform-info">
                        <h3>Spotify</h3>
                        <p>Conecta una vez y elige qué guardar</p>
                    </div>
                    <FaChevronRight className="platform-arrow" />
                </button>

                <button
                    className="platform-card youtube disabled"
                    disabled
                    aria-describedby="youtube-import-status"
                >
                    <div className="platform-icon">
                        <FaYoutube />
                    </div>
                    <div className="platform-info">
                        <h3>YouTube</h3>
                        <p id="youtube-import-status">En preparación: falta habilitarlo en el backend</p>
                    </div>
                    <span className="platform-status">Próximamente</span>
                </button>

            </div>

            <div className="import-footer">
                <p>
                    <strong>¿Por qué importar?</strong><br />
                    No empieces de cero. Tu música, tus gustos, tu biblioteca — todo listo para reproducir.
                </p>
            </div>
        </div>
    );

    const renderSpotifyAuth = () => (
        <div className="import-step auth-loading">
            <div className="loading-animation">
                <FaSpotify className="spotify-spin" />
            </div>
            <h2>Conectando con Spotify...</h2>
            <p>Se abrirá una ventana para autorizar el acceso</p>
        </div>
    );

    const renderSpotifySelect = () => (
        <div className="import-step spotify-select">
            <div className="import-header">
                <button className="back-btn" onClick={() => setStep(IMPORT_STEPS.SELECT_PLATFORM)}>
                    <FaArrowLeft />
                </button>
                <h1>Tu Biblioteca de Spotify</h1>
            </div>

            <div className="spotify-connected">
                <FaSpotify />
                <span>Conectado</span>
            </div>

            <h2>¿Qué deseas importar?</h2>

            <div className="import-options">
                <label className={`import-option ${spotifySelections.likedSongs ? 'selected' : ''}`}>
                    <input
                        type="checkbox"
                        checked={spotifySelections.likedSongs}
                        onChange={(e) => setSpotifySelections(s => ({ ...s, likedSongs: e.target.checked }))}
                    />
                    <div className="option-icon songs">
                        <FaHeart />
                    </div>
                    <div className="option-info">
                        <span className="option-title">Canciones Guardadas</span>
                        <span className="option-count">{spotifySummary?.likedSongs || 0} canciones</span>
                    </div>
                    <div className="option-check">
                        {spotifySelections.likedSongs && <FaCheck />}
                    </div>
                </label>

                <label className={`import-option ${spotifySelections.playlists ? 'selected' : ''}`}>
                    <input
                        type="checkbox"
                        checked={spotifySelections.playlists}
                        onChange={(e) => setSpotifySelections(s => ({ ...s, playlists: e.target.checked }))}
                    />
                    <div className="option-icon playlists">
                        <FaList />
                    </div>
                    <div className="option-info">
                        <span className="option-title">Playlists</span>
                        <span className="option-count">{spotifySummary?.playlists || 0} playlists</span>
                    </div>
                    <div className="option-check">
                        {spotifySelections.playlists && <FaCheck />}
                    </div>
                </label>

                <label className={`import-option ${spotifySelections.albums ? 'selected' : ''}`}>
                    <input
                        type="checkbox"
                        checked={spotifySelections.albums}
                        onChange={(e) => setSpotifySelections(s => ({ ...s, albums: e.target.checked }))}
                    />
                    <div className="option-icon albums">
                        <FaCompactDisc />
                    </div>
                    <div className="option-info">
                        <span className="option-title">Álbumes Guardados</span>
                        <span className="option-count">{spotifySummary?.albums || 0} álbumes</span>
                    </div>
                    <div className="option-check">
                        {spotifySelections.albums && <FaCheck />}
                    </div>
                </label>

                <label className={`import-option ${spotifySelections.artists ? 'selected' : ''}`}>
                    <input
                        type="checkbox"
                        checked={spotifySelections.artists}
                        onChange={(e) => setSpotifySelections(s => ({ ...s, artists: e.target.checked }))}
                    />
                    <div className="option-icon artists">
                        <FaUser />
                    </div>
                    <div className="option-info">
                        <span className="option-title">Artistas Seguidos</span>
                        <span className="option-count">{spotifySummary?.artists || 0} artistas</span>
                    </div>
                    <div className="option-check">
                        {spotifySelections.artists && <FaCheck />}
                    </div>
                </label>
            </div>

            <button
                className="import-action-btn"
                onClick={handlePreImport}
                disabled={!Object.values(spotifySelections).some(v => v)}
            >
                <HiSparkles />
                {spotifySelections.playlists ? 'Siguiente: Seleccionar playlists' : 'Importar Selección'}
            </button>

            <p className="import-disclaimer">
                Solo leeremos los datos seleccionados. No tenemos acceso a tu contraseña ni podemos modificar tu cuenta de Spotify.
            </p>
        </div>
    );

    const renderSpotifyPlaylistSelection = () => (
        <div className="import-step playlist-select">
            <div className="import-header">
                <button className="back-btn" onClick={() => setStep(IMPORT_STEPS.SPOTIFY_SELECT)}>
                    <FaArrowLeft />
                </button>
                <h1>Selecciona Playlists</h1>
            </div>

            <div className="playlist-selection-controls">
                <span>{selectedPlaylistIds.length} seleccionadas</span>
                <button className="select-all-btn" onClick={toggleAllPlaylists}>
                    {selectedPlaylistIds.length === userPlaylists.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                </button>
            </div>

            <div className="playlist-grid">
                {userPlaylists.map(playlist => (
                    <div
                        key={playlist.id}
                        className={`playlist-select-card ${selectedPlaylistIds.includes(playlist.id) ? 'selected' : ''}`}
                        onClick={() => togglePlaylistSelection(playlist.id)}
                    >
                        <div className="playlist-card-image">
                            {playlist.image ? (
                                <img {...getArtworkImageProps(playlist, { size: 500, sizes: '(max-width: 600px) 42vw, 220px' })} alt={playlist.name} loading="lazy" />
                            ) : (
                                <div className="playlist-card-placeholder"><FaList /></div>
                            )}
                            <div className="playlist-card-overlay">
                                {selectedPlaylistIds.includes(playlist.id) && <FaCheck />}
                            </div>
                        </div>
                        <div className="playlist-card-details">
                            <h4>{playlist.name}</h4>
                            <p>{playlist.trackCount} canciones</p>
                        </div>
                    </div>
                ))}
            </div>

            <button
                className="import-action-btn"
                onClick={handleSpotifyImport}
                disabled={selectedPlaylistIds.length === 0 && !spotifySelections.likedSongs && !spotifySelections.albums && !spotifySelections.artists}
            >
                <HiSparkles />
                Importar {selectedPlaylistIds.length} playlists
            </button>
        </div>
    );

    const renderYouTubeInput = () => (
        <div className="import-step youtube-input">
            <div className="import-header">
                <button className="back-btn" onClick={() => setStep(IMPORT_STEPS.SELECT_PLATFORM)}>
                    <FaArrowLeft />
                </button>
                <h1>Importar de YouTube</h1>
            </div>

            <div className="youtube-hero">
                <FaYoutube />
                <h2>Pega el enlace de tu playlist</h2>
                <p>Funciona con playlists públicas de YouTube</p>
            </div>

            <div className="youtube-input-container">
                <input
                    type="text"
                    placeholder="https://youtube.com/playlist?list=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleYouTubeImport()}
                />
                <button
                    className="import-action-btn"
                    onClick={handleYouTubeImport}
                    disabled={!youtubeUrl.trim()}
                >
                    Importar Playlist
                </button>
            </div>

            <div className="youtube-help">
                <h4>¿Cómo obtener el enlace?</h4>
                <ol>
                    <li>Ve a YouTube y abre la playlist que deseas importar</li>
                    <li>Copia la URL de la barra de direcciones</li>
                    <li>Pégala aquí y haz clic en "Importar"</li>
                </ol>
            </div>
        </div>
    );

    const renderImporting = () => {
        const progressPercent = progress.total > 0
            ? Math.round((progress.current / progress.total) * 100)
            : 0;

        return (
            <div className="import-step importing">
                <div className="importing-animation">
                    <div className="music-waves">
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>

                <h2>
                    {progress.phase === 'fetching' && 'Obteniendo tu música...'}
                    {progress.phase === 'matching' && 'Reconstruyendo tu biblioteca...'}
                    {progress.phase === 'parsing' && 'Analizando canciones...'}
                    {progress.phase === 'starting' && 'Iniciando...'}
                </h2>

                <div className="progress-bar-container">
                    <div
                        className="progress-bar-fill"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

                <p className="progress-text">
                    {progress.current} de {progress.total} {progress.type === 'likedSongs' ? 'canciones' : 'items'}
                </p>

                {progress.lastMatched && (
                    <div className="current-track">
                        <FaMusic />
                        <span>"{progress.lastMatched.title}" - {progress.lastMatched.artist}</span>
                    </div>
                )}
            </div>
        );
    };

    const renderResults = () => {
        if (!importResult) return null;

        const stats = importResult.stats;
        const matchRate = ImportService.calculateMatchRate(stats);

        // Determinar título según estado de guardado
        const getResultTitle = () => {
            if (!isSaving && !saveProgress.phase) return '¡Importación Completa!';

            switch (saveProgress.phase) {
                case 'preparing': return 'Preparando guardado...';
                case 'saving': return 'Guardando en tu biblioteca...';
                case 'saving_favorites': return 'Guardando favoritos...';
                case 'saving_playlist': return `Guardando: ${saveProgress.currentPlaylist}`;
                case 'saving_youtube': return 'Guardando playlist de YouTube...';
                case 'saving_albums': return 'Guardando álbumes...';
                case 'saving_artists': return 'Guardando artistas...';
                case 'completed': return '✅ ¡Guardado exitosamente!';
                case 'partial': return '⚠️ Guardado parcial';
                case 'error': return '❌ Error al guardar';
                default: return '¡Importación Completa!';
            }
        };

        // Determinar icono según estado
        const getResultIcon = () => {
            if (isSaving) return <FaSync className="spin" />;
            if (saveProgress.phase === 'completed') return <FaCheck />;
            if (saveProgress.phase === 'partial') return <FaExclamationTriangle />;
            if (saveProgress.phase === 'error') return <FaTimes />;
            return <FaCheck />;
        };

        // Clase CSS según estado
        const getIconClass = () => {
            if (saveProgress.phase === 'partial') return 'results-icon warning';
            if (saveProgress.phase === 'error') return 'results-icon error';
            return 'results-icon success';
        };

        return (
            <div className="import-step results">
                <div className={getIconClass()}>
                    {getResultIcon()}
                </div>

                <h2>{getResultTitle()}</h2>

                {/* Mostrar stats de guardado si está en progreso o completado */}
                {saveProgress.stats && (saveProgress.phase === 'partial' || saveProgress.phase === 'completed') && (
                    <div className="save-stats">
                        {saveProgress.stats.favorites.saved > 0 && (
                            <div className="save-stat success">
                                <FaCheck /> {saveProgress.stats.favorites.saved} favoritos guardados
                            </div>
                        )}
                        {saveProgress.stats.playlists.saved > 0 && (
                            <div className="save-stat success">
                                <FaCheck /> {saveProgress.stats.playlists.saved} playlists creadas
                            </div>
                        )}
                        {saveProgress.stats.albums.saved > 0 && (
                            <div className="save-stat success">
                                <FaCheck /> {saveProgress.stats.albums.saved} álbumes guardados
                            </div>
                        )}
                        {saveProgress.stats.artists.saved > 0 && (
                            <div className="save-stat success">
                                <FaCheck /> {saveProgress.stats.artists.saved} artistas guardados
                            </div>
                        )}
                        {/* Errores */}
                        {saveProgress.stats.errors?.length > 0 && (
                            <div className="save-errors">
                                <h4>Errores durante el guardado:</h4>
                                {saveProgress.stats.errors.map((err, i) => (
                                    <div key={i} className="save-stat error">
                                        <FaTimes /> {err.type}: {err.message}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Stats de importación (solo si no se ha guardado) */}
                {!saveProgress.phase && (
                    <>
                        <div className="results-summary">
                            <div className="match-rate">
                                <span className="rate-number">{matchRate}%</span>
                                <span className="rate-label">coincidencia</span>
                            </div>

                            <div className="results-breakdown">
                                <div className="result-item matched">
                                    <FaCheck />
                                    <span>{stats.matched} encontradas</span>
                                </div>
                                {stats.partial > 0 && (
                                    <div className="result-item partial">
                                        <FaExclamationTriangle />
                                        <span>{stats.partial} parciales</span>
                                    </div>
                                )}
                                {stats.failed > 0 && (
                                    <div className="result-item failed">
                                        <FaTimes />
                                        <span>{stats.failed} no encontradas</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Import details */}
                        <div className="import-details">
                            {importResult.likedSongs?.length > 0 && (
                                <div className="detail-row">
                                    <FaHeart />
                                    <span>{importResult.likedSongs.filter(t =>
                                        t.matchStatus === MATCH_STATUS.MATCHED || t.matchStatus === MATCH_STATUS.PARTIAL
                                    ).length} canciones listas para guardar</span>
                                </div>
                            )}
                            {importResult.playlists?.length > 0 && (
                                <div className="detail-row">
                                    <FaList />
                                    <span>{importResult.playlists.length} playlists</span>
                                </div>
                            )}
                            {importResult.albums?.length > 0 && (
                                <div className="detail-row">
                                    <FaCompactDisc />
                                    <span>{importResult.albums.length} álbumes</span>
                                </div>
                            )}
                            {importResult.artists?.length > 0 && (
                                <div className="detail-row">
                                    <FaUser />
                                    <span>{importResult.artists.length} artistas</span>
                                </div>
                            )}
                            {importResult.playlist && (
                                <div className="detail-row">
                                    <FaYoutube />
                                    <span>Playlist: {importResult.playlist.name} ({importResult.playlist.tracks?.filter(t =>
                                        t.matchStatus === MATCH_STATUS.MATCHED || t.matchStatus === MATCH_STATUS.PARTIAL
                                    ).length || 0} tracks)</span>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Barra de progreso durante guardado */}
                {isSaving && saveProgress.total > 0 && (
                    <div className="save-progress">
                        <div className="progress-bar-container">
                            <div
                                className="progress-bar-fill"
                                style={{ width: `${(saveProgress.current / saveProgress.total) * 100}%` }}
                            />
                        </div>
                        <p>{saveProgress.current} / {saveProgress.total} operaciones</p>
                    </div>
                )}

                {/* Botones de acción */}
                {saveProgress.phase !== 'completed' && (
                    <button
                        className={`save-library-btn ${saveProgress.phase === 'error' || saveProgress.phase === 'partial' ? 'retry' : ''}`}
                        onClick={saveToLibrary}
                        disabled={isSaving && saveProgress.phase !== 'error' && saveProgress.phase !== 'partial'}
                    >
                        {isSaving && saveProgress.phase !== 'error' && saveProgress.phase !== 'partial' ? (
                            <>
                                <FaSync className="spin" />
                                Guardando...
                            </>
                        ) : saveProgress.phase === 'error' || saveProgress.phase === 'partial' ? (
                            <>
                                <FaSync />
                                Reintentar Guardar
                            </>
                        ) : (
                            <>
                                <HiSparkles />
                                Guardar en mi Biblioteca
                            </>
                        )}
                    </button>
                )}

                {saveProgress.phase === 'completed' && (
                    <button
                        className="save-library-btn success"
                        onClick={() => navigate('/library')}
                    >
                        <FaCheck />
                        Ir a mi Biblioteca
                    </button>
                )}

                <button
                    className="secondary-btn"
                    onClick={() => setStep(IMPORT_STEPS.SELECT_PLATFORM)}
                    disabled={isSaving}
                >
                    Importar más música
                </button>

                {/* Errores de importación */}
                {importResult.errors?.length > 0 && (
                    <div className="import-errors">
                        <h4>Errores durante la importación:</h4>
                        {importResult.errors.map((err, i) => (
                            <p key={i}>
                                <strong>{err.type}:</strong> {err.message || err.error}
                            </p>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderError = () => (
        <div className="import-step error-state">
            <div className="error-icon">
                <FaExclamationTriangle />
            </div>
            <h2>Algo salió mal</h2>
            <p>{error}</p>
            <button
                className="retry-btn"
                onClick={() => {
                    setError(null);
                    setStep(IMPORT_STEPS.SELECT_PLATFORM);
                }}
            >
                <FaSync />
                Intentar de nuevo
            </button>
        </div>
    );

    // ==========================================================================
    // MAIN RENDER
    // ==========================================================================

    if (!user) {
        return (
            <div className="import-page unauthenticated">
                <h2>Inicia sesión para importar tu música</h2>
                <button onClick={() => navigate('/login')}>Ir al Login</button>
            </div>
        );
    }

    return (
        <div className="import-page">
            <div className="import-container">
                {step === IMPORT_STEPS.SELECT_PLATFORM && renderPlatformSelection()}
                {step === IMPORT_STEPS.SPOTIFY_AUTH && renderSpotifyAuth()}
                {step === IMPORT_STEPS.SPOTIFY_SELECT && renderSpotifySelect()}
                {step === IMPORT_STEPS.SPOTIFY_PLAYLIST_SELECTION && renderSpotifyPlaylistSelection()}
                {step === IMPORT_STEPS.YOUTUBE_URL && renderYouTubeInput()}
                {step === IMPORT_STEPS.IMPORTING && renderImporting()}
                {step === IMPORT_STEPS.RESULTS && renderResults()}
                {step === IMPORT_STEPS.ERROR && renderError()}
            </div>
        </div>
    );
}
