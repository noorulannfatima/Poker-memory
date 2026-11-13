import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeededRandom } from '../game/deck';
import { dealRound } from '../game/deal';
import { GAME_CONFIG } from '../game/gameConfig';
import { scoreRound } from '../game/scoring';
import { App } from './App';

const SEED = 2024;
const CARD_NAME = /(Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Jack|Queen|King|Ace) of (spades|hearts|diamonds|clubs)/;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function slot(position: number) {
  return screen.getByTestId(`grid-slot-${position}`);
}

function startGame() {
  render(<App random={createSeededRandom(SEED)} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start game' }));
}

function finishMemorizing() {
  advance(GAME_CONFIG.memorizeSeconds * 1000);
  // Let the flip-down animation finish so faces leave the DOM.
  advance(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('App — single-player round', () => {
  it('shows the lobby with the configured phase durations', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Memory Poker');
    expect(screen.getByText(`${GAME_CONFIG.memorizeSeconds}s`)).toBeInTheDocument();
    expect(screen.getByText(`${GAME_CONFIG.selectSeconds}s`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start game' })).toBeEnabled();
  });

  it('deals 16 unique face-up cards that cannot be selected while memorizing', () => {
    startGame();
    const grid = screen.getByRole('group', { name: 'Card grid' });
    const slots = within(grid).getAllByRole('button');
    expect(slots).toHaveLength(16);
    const labels = slots.map((s) => s.getAttribute('aria-label')?.split(': ')[1]);
    expect(new Set(labels).size).toBe(16);
    labels.forEach((label) => expect(label).toMatch(CARD_NAME));
    slots.forEach((s) => expect(s).toBeDisabled());

    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Memorize: ${GAME_CONFIG.memorizeSeconds} seconds left`);
    advance(5000);
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(
      `Memorize: ${GAME_CONFIG.memorizeSeconds - 5} seconds left`,
    );

    // Community cards stay hidden while memorizing.
    expect(screen.getByText('Revealed after memorizing')).toBeInTheDocument();
  });

  it('flips the grid face-down, reveals community cards, and hides card values', () => {
    startGame();
    finishMemorizing();

    const grid = screen.getByRole('group', { name: 'Card grid' });
    expect(grid.textContent ?? '').not.toMatch(CARD_NAME);
    within(grid)
      .getAllByRole('button')
      .forEach((s) => {
        expect(s).toBeEnabled();
        expect(s).toHaveAccessibleName(/face-down card$/);
      });

    const community = screen.getByRole('region', { name: 'Community cards' });
    expect(within(community).getAllByText(CARD_NAME)).toHaveLength(GAME_CONFIG.communityCount);
    // finishMemorizing() waited one extra second for the flip animation.
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Select: ${GAME_CONFIG.selectSeconds - 1} seconds left`);
  });

  it('lets the player pick exactly two, change a pick, submit, and see a correct result', () => {
    startGame();
    finishMemorizing();
    const lockIn = screen.getByRole('button', { name: 'Lock in picks' });
    expect(lockIn).toBeDisabled();

    fireEvent.click(slot(0));
    fireEvent.click(slot(5));
    fireEvent.click(slot(9)); // ignored: already holding two
    expect(slot(0)).toHaveAttribute('aria-pressed', 'true');
    expect(slot(5)).toHaveAttribute('aria-pressed', 'true');
    expect(slot(9)).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(slot(0)); // release
    fireEvent.click(slot(9));
    expect(slot(0)).toHaveAttribute('aria-pressed', 'false');
    expect(slot(9)).toHaveAttribute('aria-pressed', 'true');

    expect(lockIn).toBeEnabled();
    fireEvent.click(lockIn);
    fireEvent.click(lockIn); // double submit is harmless

    // Selection is closed during the reveal.
    expect(slot(1)).toBeDisabled();
    advance(GAME_CONFIG.revealMs);

    const expected = scoreRound(dealRound(1, createSeededRandom(SEED)), { positions: [5, 9], reason: 'submitted' });
    if (expected.kind !== 'complete') throw new Error('expected complete hand');
    expect(screen.getByRole('heading', { name: expected.hand.label })).toBeInTheDocument();
    expect(screen.getByText(expected.hand.description)).toBeInTheDocument();
    expect(slot(5)).toHaveAccessibleName(/your pick$/);
    expect(slot(9)).toHaveAccessibleName(/your pick$/);
  });

  it('ends selection on timeout and scores a partial pick as an incomplete hand', () => {
    startGame();
    finishMemorizing();
    fireEvent.click(slot(3));
    advance(GAME_CONFIG.selectSeconds * 1000);

    fireEvent.click(slot(4)); // too late
    expect(slot(4)).toBeDisabled();
    advance(GAME_CONFIG.revealMs);

    expect(screen.getByRole('heading', { name: 'Incomplete hand' })).toBeInTheDocument();
    expect(screen.getByText(/Time ran out with 1 of 2 cards chosen/)).toBeInTheDocument();
  });

  it('play again deals a fresh round with reset timer and selections', () => {
    startGame();
    const firstLabels = screen.getAllByTestId(/grid-slot-/).map((s) => s.getAttribute('aria-label'));
    finishMemorizing();
    fireEvent.click(slot(1));
    fireEvent.click(slot(2));
    fireEvent.click(screen.getByRole('button', { name: 'Lock in picks' }));
    advance(GAME_CONFIG.revealMs);

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    const nextLabels = screen.getAllByTestId(/grid-slot-/).map((s) => s.getAttribute('aria-label'));
    expect(nextLabels).not.toEqual(firstLabels);
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Memorize: ${GAME_CONFIG.memorizeSeconds} seconds left`);
    screen.getAllByTestId(/grid-slot-/).forEach((s) => expect(s).not.toHaveAttribute('aria-pressed'));
  });

  it('back to lobby cancels the running timers', () => {
    startGame();
    fireEvent.click(screen.getByRole('button', { name: 'Exit to lobby' }));
    expect(screen.getByRole('button', { name: 'Start game' })).toBeInTheDocument();
    advance(GAME_CONFIG.memorizeSeconds * 1000 + 5000);
    expect(screen.getByRole('button', { name: 'Start game' })).toBeInTheDocument();
  });

  it('clears timers on unmount', () => {
    const { unmount } = render(<App random={createSeededRandom(SEED)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }));
    advance(500);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
