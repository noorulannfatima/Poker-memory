import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaitingRoom } from './WaitingRoom';

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}

afterEach(() => {
  if (original) Object.defineProperty(navigator, 'clipboard', original);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

const renderRoom = () => render(<WaitingRoom code="KQPZ" levelLabel="Medium" reconnecting={false} onLeave={() => {}} />);

describe('WaitingRoom copy button', () => {
  it('is hidden when the clipboard is unavailable', () => {
    setClipboard(undefined);
    renderRoom();
    expect(screen.queryByRole('button', { name: 'Copy code' })).not.toBeInTheDocument();
  });

  it('shows Copied after a successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    renderRoom();
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await screen.findByText('Copied ✓')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('KQPZ');
  });

  it('says so when the copy fails', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    renderRoom();
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await screen.findByText('Couldn’t copy')).toBeInTheDocument();
  });
});
