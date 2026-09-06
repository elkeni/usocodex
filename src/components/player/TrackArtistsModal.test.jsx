// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import TrackArtistsModal from './TrackArtistsModal';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('muestra los artistas y entrega la identidad del artista seleccionado', async () => {
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(<TrackArtistsModal artists={[{ id: 1, name: 'Bad Bunny' }, { id: 2, name: 'Rauw Alejandro' }]} onSelect={onSelect} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Artistas en la canción' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Rauw Alejandro Ver artista' }));
    expect(onSelect).toHaveBeenCalledWith({ id: 2, name: 'Rauw Alejandro' });
    fireEvent(screen.getByRole('dialog', { hidden: true }), new Event('cancel', { bubbles: false, cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
});
