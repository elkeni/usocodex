import React, { useState } from 'react';
import '../../shared/globalStyles.css';
import './library.css';
import './library-modal.css';
import { FaPlus, FaPlay, FaMusic, FaCompactDisc, FaTimes, FaTrash, FaHeart } from 'react-icons/fa';
import { MdLibraryMusic } from "react-icons/md";
import { usePlayer } from '../../context/playerContext';
import { useUser } from '../../context/userContext'; // <--- IMPORTAMOS CONTEXTO
import { useNavigate } from 'react-router-dom';


export default function Library() {
  const { playTrack } = usePlayer();
  const navigate = useNavigate();
  // Traemos playlists y funciones desde Firebase
  const { playlists, favorites, createPlaylist, deletePlaylist, loading } = useUser();

  const [activeTab, setActiveTab] = useState('playlists');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  // --- HANDLERS (Ahora asíncronos con Firebase) ---
  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;

    try {
      const playlistId = await createPlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());

      setShowCreateModal(false);
      setNewPlaylistName('');
      setNewPlaylistDesc('');

      // Navegar a la nueva playlist
      if (playlistId) navigate(`/playlist/${playlistId}`);

    } catch (error) {
      console.error('Error creando playlist:', error);
    }
  };

  const handleDeletePlaylist = async (playlistId, e) => {
    e.stopPropagation();
    if (window.confirm('¿Estás seguro de eliminar esta playlist permanentemente?')) {
      try {
        await deletePlaylist(playlistId);
      } catch (error) {
        console.error('Error eliminando playlist:', error);
      }
    }
  };

  const handlePlaylistClick = (playlistId) => {
    navigate(`/playlist/${playlistId}`);
  };

  // --- RENDER SECTIONS ---
  const renderPlaylists = () => (
    <div className="library-grid">
      {/* Create Card */}
      <div className="glass-lib-card create-card" onClick={() => setShowCreateModal(true)}>
        <div className="create-icon-wrapper"><FaPlus /></div>
        <div className="lib-card-title">Crear Playlist</div>
      </div>

      {/* User Playlists (Desde Firebase) */}
      {playlists.map((pl) => (
        <div key={pl.id} className="glass-lib-card" onClick={() => handlePlaylistClick(pl.id)}>
          <div className="lib-card-img-wrapper">
            {pl.image ? (
              <img src={pl.image} alt={pl.name} />
            ) : (
              <div className="playlist-img-fallback">
                <FaMusic size={40} />
              </div>
            )}
            <button
              className="glass-play-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (pl.tracks && pl.tracks.length > 0) {
                  playTrack(pl.tracks[0], pl.tracks);
                }
              }}
            >
              <FaPlay />
            </button>
            <button
              className="glass-delete-btn"
              onClick={(e) => handleDeletePlaylist(pl.id, e)}
              title="Borrar playlist"
            >
              <FaTrash />
            </button>
          </div>
          <div className="lib-card-title">{pl.name}</div>
          <div className="lib-card-sub">{pl.tracks?.length || 0} canciones</div>
        </div>
      ))}
    </div>
  );

  // Reutilizamos la lógica de Favoritos para la pestaña "Liked Songs"
  const renderSongs = () => (
    <div className="glass-songs-list">
      {favorites.length === 0 && <div style={{ padding: 20, color: '#aaa' }}>No tienes canciones favoritas aún.</div>}

      {favorites.map((song, i) => (
        <div key={i} className="glass-song-row" onClick={() => playTrack(song)}>
          <div className="song-img-col">
            <img src={song.image || 'default_cover.png'} alt={song.name} className="lib-song-img" />
          </div>
          <div className="song-text-col">
            <div className="song-title">{song.name}</div>
            <div className="song-artist">{song.artist}</div>
          </div>
          <div className="song-album">{song.album}</div>
          <div className="song-duration">{song.duration ? Math.floor(song.duration / 60) + ':' + (song.duration % 60).toString().padStart(2, '0') : ''}</div>
        </div>
      ))}
    </div>
  );

  // (Opcional) Puedes mantener los Mocks para Artists/Albums o crear colecciones reales luego
  const renderMockPlaceholders = (type) => (
    <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
      Próximamente podrás guardar {type} en tu base de datos.
    </div>
  );

  if (loading) return <div className="screen-container"><div className="glass-spinner" style={{ margin: '100px auto' }}></div></div>;

  return (
    <div className="screen-container library-container">
      <div className="library-main">
        {/* Glass Hero */}
        <div className="library-glass-hero">
          <div className="library-hero-icon-box">
            <MdLibraryMusic />
          </div>
          <div className="library-hero-content">
            <div className="library-hero-label">TU BIBLIOTECA</div>
            <h1 className="library-hero-title">Mi Música</h1>
            <div className="library-hero-stats">
              {playlists.length} Playlists • {favorites.length} Favoritas
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="library-neon-tabs">
          {[
            { id: 'playlists', label: 'Playlists', icon: <FaMusic /> },
            { id: 'songs', label: 'Me Gusta', icon: <FaHeart /> }, // Icono cambiado
            { id: 'albums', label: 'Álbumes', icon: <FaCompactDisc /> },
            { id: 'artists', label: 'Artistas', icon: <FaMusic /> }
          ].map(tab => (
            <button
              key={tab.id}
              className={`neon-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="library-content-area">
          {activeTab === 'playlists' && renderPlaylists()}
          {activeTab === 'songs' && renderSongs()}
          {activeTab === 'albums' && renderMockPlaceholders('álbumes')}
          {activeTab === 'artists' && renderMockPlaceholders('artistas')}
        </div>
      </div>

      {/* Modal - Mantenemos tu código visual, solo conectamos lógica arriba */}
      {showCreateModal && (
        <div className="playlist-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="playlist-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Nueva Playlist</h2>
              <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>
                <FaTimes />
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-field">
                <label>Nombre</label>
                <input
                  type="text"
                  placeholder="Ej. Para Codear"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                  autoFocus
                />
              </div>
              <div className="modal-field">
                <label>Descripción</label>
                <textarea
                  placeholder="¿De qué trata esta playlist?"
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-btn modal-btn-cancel" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </button>
              <button
                className="modal-btn modal-btn-create"
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim()}
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}