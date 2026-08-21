import React, { useState } from 'react';
import { useUser } from '../../context/userContext';
import { libraryGenerator } from '../../services/libraryGenerator';
import { feedGenerator } from '../../services/feedGenerator';
import { getGenrePlaylist } from '../../services/genrePlaylistService';

const DebugPlayground = () => {
    const userContext = useUser();
    const [logs, setLogs] = useState([]);
    const [vibeInput, setVibeInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);

    const log = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    const handleLibraryGen = async () => {
        setLoading(true);
        setResult(null);
        try {
            log(`Generando playlist para vibe: "${vibeInput}"...`);

            // Construir contexto simulado
            const contextData = userContext.getVibeMatchingData ? userContext.getVibeMatchingData() : {
                user: userContext.user,
                favorites: userContext.favorites || [],
                listeningHistory: [], // Fallback if not available directly
            };

            const playlist = await libraryGenerator.generate(vibeInput, contextData);
            setResult(playlist);
            log(`Generado con éxito: ${playlist.title} (${playlist.tracks.length} tracks)`);
        } catch (e) {
            log(`Error: ${e.message}`);
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleFeedGen = async () => {
        setLoading(true);
        setResult(null);
        try {
            log('Generando recomendaciones de Feed...');

            const contextData = userContext.getVibeMatchingData ? userContext.getVibeMatchingData() : {
                user: userContext.user,
                favorites: userContext.favorites || [],
                listeningHistory: [],
            };

            const feed = await feedGenerator.generateFeedRecommendations(contextData);
            setResult(feed);
            log(`Generadas ${feed.length} secciones de feed.`);
        } catch (e) {
            log(`Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleGenreFetch = async (genreId) => {
        setLoading(true);
        setResult(null);
        try {
            log(`Buscando playlist de género: ${genreId}...`);
            const data = await getGenrePlaylist(genreId);
            setResult(data);
            log(data ? `Encontrada: ${data.name}` : 'No encontrada.');
        } catch (e) {
            log(`Error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const saveResultToLibrary = async () => {
        if (!result || !result.tracks) return;
        try {
            log('Guardando en biblioteca...');
            if (Array.isArray(result)) {
                log('No se puede guardar un feed entero, selecciona una playlist individual del JSON.');
                return;
            }
            await userContext.createPlaylistWithTracks(result.title, result.description, result.tracks);
            log('✅ Guardado correctamente en tu biblioteca real.');
        } catch (e) {
            log(`Error guardando: ${e.message}`);
        }
    };

    return (
        <div style={{ padding: '20px', background: '#0d1117', color: '#c9d1d9', minHeight: '100vh', fontFamily: 'monospace' }}>
            <h1 style={{ borderBottom: '1px solid #30363d', paddingBottom: '10px' }}>🛠️ Playlist Logic Debugger</h1>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>

                {/* CONTROLES */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>

                    {/* Library Generator */}
                    <div style={cardStyle}>
                        <h3>🔮 Library Generator (Vibe/Genre)</h3>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input
                                type="text"
                                value={vibeInput}
                                onChange={(e) => setVibeInput(e.target.value)}
                                placeholder='"Party", "Rock", "Gym"...'
                                style={inputStyle}
                            />
                            <button onClick={handleLibraryGen} disabled={loading || !vibeInput} style={buttonStyle}>
                                {loading ? '...' : 'Generar'}
                            </button>
                        </div>
                        <p style={{ fontSize: '12px', color: '#8b949e', marginTop: '5px' }}>
                            Prueba con palabras clave o géneros estrictos definidos en GENRE_RULES.
                        </p>
                    </div>

                    {/* Feed Generator */}
                    <div style={cardStyle}>
                        <h3>📰 Feed Generator</h3>
                        <button onClick={handleFeedGen} disabled={loading} style={buttonStyle}>
                            Simular Generación de Feed
                        </button>
                    </div>

                    {/* Genre Service */}
                    <div style={cardStyle}>
                        <h3>💾 Genre Service (Firebase)</h3>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            {['genre_pop', 'genre_rock', 'genre_lofi'].map(g => (
                                <button key={g} onClick={() => handleGenreFetch(g)} style={secondaryButtonStyle}>
                                    Get {g}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* LOGS */}
                    <div style={{ ...cardStyle, flex: 1, overflowY: 'auto', maxHeight: '300px' }}>
                        <h3>📝 Logs</h3>
                        {logs.map((l, i) => <div key={i} style={{ fontSize: '12px', marginBottom: '4px' }}>{l}</div>)}
                    </div>

                </div>

                {/* RESULTADOS */}
                <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>📄 Result JSON</h3>
                        {result && !Array.isArray(result) && (
                            <button onClick={saveResultToLibrary} style={{ ...buttonStyle, background: '#238636' }}>
                                Guardar como Real
                            </button>
                        )}
                    </div>
                    <pre style={{
                        background: '#161b22',
                        padding: '10px',
                        borderRadius: '6px',
                        overflow: 'auto',
                        flex: 1,
                        fontSize: '11px',
                        border: '1px solid #30363d'
                    }}>
                        {result ? JSON.stringify(result, null, 2) : '// Waiting for output...'}
                    </pre>
                </div>
            </div>
        </div>
    );
};

const cardStyle = {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: '6px',
    padding: '15px'
};

const inputStyle = {
    background: '#0d1117',
    border: '1px solid #30363d',
    color: 'white',
    padding: '8px',
    borderRadius: '4px',
    flex: 1
};

const buttonStyle = {
    background: '#1f6feb',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold'
};

const secondaryButtonStyle = {
    ...buttonStyle,
    background: '#30363d',
    fontSize: '12px',
    padding: '5px 10px'
};

export default DebugPlayground;
