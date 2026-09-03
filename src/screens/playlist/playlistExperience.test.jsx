// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const playTrackMock = vi.fn();
const updatePlaylistMock = vi.fn(async () => true);
const addTrackToPlaylistMock = vi.fn(async () => true);
const removeTrackFromPlaylistMock = vi.fn(async () => true);
const searchGlobalMock = vi.fn();

const nativePlaylist = {
    id: 'native-1',
    name: 'Mi playlist',
    description: 'Canciones para probar',
    isNative: true,
    tracks: [{
        id: 'saved-1',
        name: 'Canción guardada',
        artist: 'Artista Uno',
        album: 'Álbum Uno',
        duration: 180,
        image: '',
    }],
};

const userContextMock = {
    isPlaylistSaved: () => false,
    toggleSavePlaylist: vi.fn(),
    user: { displayName: 'Stefano' },
    playlists: [nativePlaylist],
    removeTrackFromPlaylist: removeTrackFromPlaylistMock,
    updatePlaylist: updatePlaylistMock,
    addTrackToPlaylist: addTrackToPlaylistMock,
    deletePlaylist: vi.fn(async () => true),
};

vi.mock('../../context/playerContext', () => ({
    usePlayer: () => ({ playTrack: playTrackMock }),
}));

vi.mock('../../context/userContext', () => ({
    useUser: () => userContextMock,
}));

vi.mock('../../services/unifiedService', () => ({
    playlistGetInfo: vi.fn(),
    searchGlobal: (...args) => searchGlobalMock(...args),
    artistGetTopTracks: vi.fn(async () => ({ toptracks: { track: [] } })),
    getRelatedArtists: vi.fn(async () => []),
}));

vi.mock('../../services/genrePlaylistService', () => ({
    getGenrePlaylist: vi.fn(),
    isGenrePlaylistId: () => false,
}));

import Playlist from './playlist';

const renderPlaylist = () => render(
    <MemoryRouter initialEntries={['/playlist/native-1']}>
        <Routes>
            <Route path="/playlist/:playlistId" element={<Playlist />} />
        </Routes>
    </MemoryRouter>
);

describe('Playlist: edición y acciones móviles', () => {
    beforeEach(() => {
        playTrackMock.mockReset();
        updatePlaylistMock.mockClear();
        addTrackToPlaylistMock.mockClear();
        removeTrackFromPlaylistMock.mockClear();
        searchGlobalMock.mockResolvedValue([]);
    });

    afterEach(() => cleanup());

    it('expone reproducción, aleatorio y añadir como controles utilizables', async () => {
        renderPlaylist();

        expect(await screen.findByRole('button', { name: 'Reproducir playlist' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Reproducción aleatoria' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Añadir canciones' })).toBeEnabled();
    });

    it('guarda el nombre editado después de confirmar la persistencia', async () => {
        const user = userEvent.setup();
        renderPlaylist();

        await user.click(await screen.findByRole('button', { name: 'Opciones de playlist' }));
        await user.click(screen.getByRole('button', { name: /Editar playlist/i }));
        const titleInput = screen.getByPlaceholderText('Nombre de la playlist');
        await user.clear(titleInput);
        await user.type(titleInput, 'Favoritas nocturnas');
        await user.click(screen.getByRole('button', { name: 'Guardar' }));

        await waitFor(() => expect(updatePlaylistMock).toHaveBeenCalledWith('native-1', expect.objectContaining({
            name: 'Favoritas nocturnas',
        })));
        expect(await screen.findByRole('heading', { name: 'Favoritas nocturnas' })).toBeInTheDocument();
    });

    it('permite añadir varias canciones sin cerrar el selector', async () => {
        const user = userEvent.setup();
        const result = { id: 'new-1', name: 'Tema nuevo', artist: 'Artista Dos', duration: 210 };
        searchGlobalMock.mockResolvedValue([result]);
        renderPlaylist();

        await user.click(await screen.findByRole('button', { name: 'Añadir canciones' }));
        const search = screen.getByRole('textbox', { name: 'Buscar canciones para añadir' });
        await user.type(search, 'Tema nuevo');
        const addButton = await screen.findByRole('button', { name: 'Añadir Tema nuevo' }, { timeout: 1800 });
        await user.click(addButton);

        await waitFor(() => expect(addTrackToPlaylistMock).toHaveBeenCalledWith('native-1', result));
        expect(screen.getByRole('dialog', { name: 'Añadir canciones' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Tema nuevo ya está añadida' })).toBeDisabled();
    });
});
