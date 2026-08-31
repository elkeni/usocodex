// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '../../context/feedbackContext';

const toggleFavoriteMock = vi.fn();
const addTrackToPlaylistMock = vi.fn(async () => true);
const togglePlayMock = vi.fn();
const nextMock = vi.fn();
const prevMock = vi.fn();
const seekToMock = vi.fn();
const toggleShuffleMock = vi.fn();
const toggleRepeatMock = vi.fn();
const playTrackMock = vi.fn();
const removeFromQueueMock = vi.fn();
const clearQueueMock = vi.fn();

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
    playbackContext: { name: 'Radio de prueba' },
    togglePlay: togglePlayMock,
    next: nextMock,
    prev: prevMock,
    seekTo: seekToMock,
    toggleShuffle: toggleShuffleMock,
    toggleRepeat: toggleRepeatMock,
    playTrack: playTrackMock,
    removeFromQueue: removeFromQueueMock,
    clearQueue: clearQueueMock,
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
    togglePlayMock.mockReset();
    nextMock.mockReset();
    prevMock.mockReset();
    seekToMock.mockReset();
    toggleShuffleMock.mockReset();
    toggleRepeatMock.mockReset();
    playTrackMock.mockReset();
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
    await user.click(screen.getByRole('button', { name: /Abrir reproductor/i }));
    await user.click(screen.getByRole('button', { name: 'Me gusta' }));
    expect(toggleFavoriteMock).toHaveBeenCalledWith(currentTrack);
  });

  it('añade la canción a una playlist y confirma el resultado', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await user.click(screen.getByRole('button', { name: /Abrir reproductor/i }));
    await user.click(screen.getByRole('button', { name: 'Más opciones' }));
    await user.click(screen.getByRole('button', { name: /Añadir a playlist/i }));
    await user.click(screen.getByRole('button', { name: /Favoritas para probar/i }));
    expect(addTrackToPlaylistMock).toHaveBeenCalledWith('playlist-1', currentTrack);
    expect(await screen.findByRole('status')).toHaveTextContent('Añadida a Favoritas para probar');
  });

  it('conecta los cinco controles principales con el reproductor', async () => {
    const user = userEvent.setup();
    const { container } = renderPlayer();
    await user.click(screen.getByRole('button', { name: /Abrir reproductor/i }));
    const controls = container.querySelector('.ytm-controls');

    await user.click(within(controls).getByRole('button', { name: 'Activar aleatorio' }));
    await user.click(within(controls).getByRole('button', { name: 'Anterior' }));
    await user.click(within(controls).getByRole('button', { name: 'Reproducir' }));
    await user.click(within(controls).getByRole('button', { name: 'Siguiente' }));
    await user.click(within(controls).getByRole('button', { name: 'Activar repetición' }));

    expect(toggleShuffleMock).toHaveBeenCalledOnce();
    expect(prevMock).toHaveBeenCalledOnce();
    expect(togglePlayMock).toHaveBeenCalledOnce();
    expect(nextMock).toHaveBeenCalledOnce();
    expect(toggleRepeatMock).toHaveBeenCalledOnce();
  });

  it('permite ajustar el progreso con teclado y anuncia su valor', async () => {
    const user = userEvent.setup();
    renderPlayer();
    await user.click(screen.getByRole('button', { name: /Abrir reproductor/i }));
    const slider = screen.getByRole('slider', { name: 'Progreso de la canción' });

    expect(slider).toHaveAttribute('aria-valuetext', '0:00 de 3:00');
    slider.focus();
    await user.keyboard('{ArrowRight}');
    expect(seekToMock).toHaveBeenCalledWith(5 / 180);
  });

  it('abre una cola informativa desde una acción integrada, no flotante', async () => {
    const user = userEvent.setup();
    const { container } = renderPlayer();
    await user.click(screen.getByRole('button', { name: /Abrir reproductor/i }));
    await user.click(screen.getByRole('button', { name: /Cola/i }));

    expect(screen.getByRole('dialog', { name: 'Cola de reproducción' })).toBeVisible();
    expect(container.querySelector('.ytm-queue-fab')).not.toBeInTheDocument();
  });
});
