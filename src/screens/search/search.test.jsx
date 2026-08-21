// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const playTrackMock = vi.fn();
const searchGlobalMock = vi.fn();

vi.mock('../../context/playerContext', () => ({
  usePlayerActions: () => ({ playTrack: playTrackMock }),
}));

vi.mock('../../context/userContext', () => ({
  useUser: () => ({
    toggleFavorite: vi.fn(),
    isFavorite: () => false,
    playlists: [],
    addTrackToPlaylist: vi.fn(),
  }),
}));

vi.mock('../../services/screenStateCache', () => ({
  default: { get: vi.fn(() => null), set: vi.fn() },
  useScrollPersistence: vi.fn(),
}));

vi.mock('../../services/unifiedService', () => ({
  searchGlobal: (...args) => searchGlobalMock(...args),
  fetchAudioUrl: vi.fn(async () => 'https://audio.example/test.mp3'),
  artistGetTopTracks: vi.fn(async () => ({ toptracks: { track: [] } })),
  getRelatedArtists: vi.fn(async () => []),
}));

import Search from './search';

const trackResult = {
  id: 'track-1',
  title: 'Luz de prueba',
  artist: { name: 'Artista Demo', picture_xl: '' },
  album: { title: 'Álbum Demo', cover_xl: '' },
  duration: 180,
  preview: 'https://audio.example/preview.mp3',
  rank: 100,
};

describe('Búsqueda y reproducción esenciales', () => {
  beforeEach(() => {
    localStorage.clear();
    playTrackMock.mockReset();
    searchGlobalMock.mockImplementation(async (_query, type) => type === 'track' ? [trackResult] : []);
  });
  afterEach(() => cleanup());

  it('busca y presenta resultados procedentes del servicio musical', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    await user.type(screen.getByPlaceholderText('¿Qué quieres escuchar?'), 'Luz');
    expect(await screen.findByText('Luz de prueba', {}, { timeout: 2500 })).toBeInTheDocument();
    expect(searchGlobalMock).toHaveBeenCalledWith('Luz', 'track', 12);
  });

  it('inicia la reproducción desde un resultado accesible', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Search /></MemoryRouter>);
    await user.type(screen.getByPlaceholderText('¿Qué quieres escuchar?'), 'Luz');
    const result = await screen.findByRole('button', { name: /Luz de prueba/i }, { timeout: 2500 });
    await user.click(result);
    await waitFor(() => expect(playTrackMock).toHaveBeenCalled());
    expect(playTrackMock.mock.calls[0][0]).toMatchObject({ name: 'Luz de prueba', artist: 'Artista Demo' });
  });
});

