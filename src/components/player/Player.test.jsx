// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../../context/feedbackContext';

const toggleFavoriteMock = vi.fn();
const addTrackToPlaylistMock = vi.fn(async () => true);

const currentTrack = {
  id: 'track-1',
  name: 'Canción honesta',
  artist: 'Artista Demo',
  album: 'Álbum Demo',
  image: '',
  duration: 180,
};

vi.mock('../../context/playerContext', () => ({
  usePlayer: () => ({
    currentTrack,
    isPlaying: false,
    isLoading: false,
    isBuffering: false,
    errorMsg: null,
    played: 0,
    duration: 180,
    queue: [currentTrack],
    currentIndex: 0,
    isShuffle: false,
    repeatMode: 0,
    togglePlay: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    seekTo: vi.fn(),
    toggleShuffle: vi.fn(),
    toggleRepeat: vi.fn(),
    playTrack: vi.fn(),
  }),
}));

vi.mock('../../context/userContext', () => ({
  useUser: () => ({
    toggleFavorite: toggleFavoriteMock,
    isFavorite: () => false,
    playlists: [{ id: 'playlist-1', name: 'Favoritas para probar', tracks: [] }],
    addTrackToPlaylist: addTrackToPlaylistMock,
  }),
}));

vi.mock('../../services/unifiedService', () => ({
  fetchLyrics: vi.fn(async () => null),
  getArtistInfo: vi.fn(async () => null),
  getAlbumDetails: vi.fn(async () => null),
  artistGetTopTracks: vi.fn(async () => []),
}));

import Player from './Player';

describe('Favoritos y playlists desde el reproductor', () => {
  beforeEach(() => {
    toggleFavoriteMock.mockReset();
    addTrackToPlaylistMock.mockReset();
    addTrackToPlaylistMock.mockResolvedValue(true);
  });
  afterEach(() => cleanup());

  const renderPlayer = () => render(
    <MemoryRouter>
      <FeedbackProvider><Player /></FeedbackProvider>
    </MemoryRouter>,
  );

  it('permite marcar la canción actual como favorita', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await user.click(screen.getByRole('button', { name: 'Me gusta' }));
    expect(toggleFavoriteMock).toHaveBeenCalledWith(currentTrack);
  });

  it('añade la canción a una playlist y confirma el resultado', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await user.click(screen.getByRole('button', { name: 'Más opciones' }));
    await user.click(screen.getByRole('button', { name: /Añadir a playlist/i }));
    await user.click(screen.getByRole('button', { name: /Favoritas para probar/i }));
    expect(addTrackToPlaylistMock).toHaveBeenCalledWith('playlist-1', currentTrack);
    expect(await screen.findByRole('status')).toHaveTextContent('Añadida a Favoritas para probar');
  });
});

