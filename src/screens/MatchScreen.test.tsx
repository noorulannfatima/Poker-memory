import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { createSeededRandom } from '../game/deck';
import { DIFFICULTIES, GAME_CONFIG } from '../game/gameConfig';

const MEDIUM = DIFFICULTIES.medium;
const COMPUTER_PICK = /Computer's pick/;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const slots = () => screen.getAllByTestId(/grid-slot-/);
const status = () => screen.getByTestId('opponent-status');
const score = () => screen.getByTestId('scoreboard');

function startVsComputer() {
  render(<App random={createSeededRandom(77)} />);
  fireEvent.click(screen.getByRole('radio', { name: /^Vs computer/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Start medium game vs computer' }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Vs computer', () => {
  it('describes the mode in the lobby', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /^Vs computer/ }));
    expect(screen.getByText(/The computer remembers most cards/)).toBeInTheDocument();
    expect(screen.getByText(/The computer secretly picks 2 at the same time/)).toBeInTheDocument();
  });

  it('plays a round: both lock in, picks are revealed together and the tally updates', () => {
    startVsComputer();
    expect(score()).toHaveAccessibleName('Score: You 0, Computer 0, 0 ties');
    expect(status()).toHaveTextContent('Computer is memorizing the same grid.');
    expect(slots()).toHaveLength(16);

    advance(MEDIUM.memorizeSeconds * 1000);
    expect(status()).toHaveTextContent('Computer is choosing…');

    fireEvent.click(screen.getByTestId('grid-slot-0'));
    fireEvent.click(screen.getByTestId('grid-slot-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Lock in picks' }));
    expect(screen.getByRole('heading', { name: 'Picks locked in' })).toBeInTheDocument();
    slots().forEach((slot) => expect(slot).toBeDisabled());
    // The computer's picks stay hidden until the reveal.
    slots().forEach((slot) => expect(slot).not.toHaveAccessibleName(COMPUTER_PICK));

    advance(1000); // the computer hurries once you have locked in
    expect(screen.getByRole('heading', { name: 'Revealing the grid…' })).toBeInTheDocument();
    advance(GAME_CONFIG.revealMs);

    expect(screen.getByRole('heading', { name: /You win the round|Computer wins the round|It's a tie/ })).toBeInTheDocument();
    expect(slots().some((slot) => COMPUTER_PICK.test(slot.getAttribute('aria-label') ?? ''))).toBe(true);
    expect(screen.getByRole('list', { name: 'Your five-card hand' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Computer’s five-card hand' })).toBeInTheDocument();
    const label = score().getAttribute('aria-label') ?? '';
    const [you, cpu, ties] = (label.match(/\d+/g) ?? []).map(Number);
    expect((you ?? 0) + (cpu ?? 0) + (ties ?? 0)).toBe(1);

    // Next round keeps the tally and deals a fresh grid.
    fireEvent.click(screen.getByRole('button', { name: 'Next round' }));
    expect(score()).toHaveAccessibleName(label);
    expect(status()).toHaveTextContent('Computer is memorizing the same grid.');
    slots().forEach((slot) => expect(slot).not.toHaveAttribute('aria-pressed'));
  });

  it('the computer can lock in first, still without revealing its picks', () => {
    startVsComputer();
    advance(MEDIUM.memorizeSeconds * 1000);
    advance(MEDIUM.selectSeconds * 1000 * 0.75);
    expect(status()).toHaveTextContent('Computer has locked in ✓');
    slots().forEach((slot) => {
      expect(slot).toBeEnabled();
      expect(slot).toHaveAccessibleName(/face-down card$/);
    });
  });

  it('a timed-out incomplete hand loses to the computer', () => {
    startVsComputer();
    advance(MEDIUM.memorizeSeconds * 1000);
    fireEvent.click(screen.getByTestId('grid-slot-4'));
    advance(MEDIUM.selectSeconds * 1000);
    advance(GAME_CONFIG.revealMs);

    expect(screen.getByRole('heading', { name: 'Computer wins the round' })).toBeInTheDocument();
    expect(screen.getByText('Incomplete hand')).toBeInTheDocument();
    expect(score()).toHaveAccessibleName('Score: You 0, Computer 1, 0 ties');
  });

  it('leaving returns to the lobby, stops the match timers and resets the tally', () => {
    startVsComputer();
    advance(MEDIUM.memorizeSeconds * 1000);
    advance(MEDIUM.selectSeconds * 1000);
    advance(GAME_CONFIG.revealMs);
    fireEvent.click(screen.getByRole('button', { name: 'Leave match' }));
    // No match timer survives leaving: time passing changes nothing and every timer drains.
    advance(60_000);
    expect(screen.getByRole('button', { name: 'Start medium game vs computer' })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Start medium game vs computer' }));
    expect(score()).toHaveAccessibleName('Score: You 0, Computer 0, 0 ties');
    expect(within(screen.getByRole('group', { name: 'Card grid' })).getAllByRole('button')).toHaveLength(16);
  });

  it('remembers the chosen mode', () => {
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /^Vs computer/ }));
    unmount();
    render(<App />);
    expect(screen.getByRole('radio', { name: /^Vs computer/ })).toBeChecked();
  });
});
