import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeededRandom } from '../game/deck';
import { dealRound } from '../game/deal';
import { DIFFICULTIES, GAME_CONFIG } from '../game/gameConfig';
import { scoreRound } from '../game/scoring';
import { App } from './App';

const SEED = 2024;
const MEDIUM = DIFFICULTIES.medium;
const START = /^Start .*game$/;
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
  fireEvent.click(screen.getByRole('button', { name: START }));
}

function finishMemorizing() {
  advance(MEDIUM.memorizeSeconds * 1000);
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
    expect(screen.getByText(`${MEDIUM.memorizeSeconds}s`)).toBeInTheDocument();
    expect(screen.getByText(`${MEDIUM.selectSeconds}s`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: START })).toBeEnabled();
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

    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Memorize: ${MEDIUM.memorizeSeconds} seconds left`);
    advance(5000);
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(
      `Memorize: ${MEDIUM.memorizeSeconds - 5} seconds left`,
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
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Select: ${MEDIUM.selectSeconds - 1} seconds left`);
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

    const expected = scoreRound(dealRound(1, createSeededRandom(SEED), 'medium'), { positions: [5, 9], reason: 'submitted' });
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
    advance(MEDIUM.selectSeconds * 1000);

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
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Memorize: ${MEDIUM.memorizeSeconds} seconds left`);
    screen.getAllByTestId(/grid-slot-/).forEach((s) => expect(s).not.toHaveAttribute('aria-pressed'));
  });

  it('back to lobby cancels the running timers', () => {
    startGame();
    fireEvent.click(screen.getByRole('button', { name: 'Exit to lobby' }));
    expect(screen.getByRole('button', { name: START })).toBeInTheDocument();
    advance(MEDIUM.memorizeSeconds * 1000 + 5000);
    expect(screen.getByRole('button', { name: START })).toBeInTheDocument();
  });

  it('clears timers on unmount', () => {
    const { unmount } = render(<App random={createSeededRandom(SEED)} />);
    fireEvent.click(screen.getByRole('button', { name: START }));
    advance(500);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('App — difficulty levels', () => {
  function chooseLevel(label: string) {
    fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${label}`) }));
  }

  it('defaults to medium and offers easy, medium and difficult', () => {
    render(<App />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(screen.getByRole('radio', { name: /^Medium/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Start medium game' })).toBeInTheDocument();
  });

  it('easy: 3×3 grid, longer timers, community cards hidden until the grid flips', () => {
    const easy = DIFFICULTIES.easy;
    render(<App random={createSeededRandom(SEED)} />);
    chooseLevel('Easy');
    fireEvent.click(screen.getByRole('button', { name: 'Start easy game' }));

    expect(screen.getAllByTestId(/grid-slot-/)).toHaveLength(9);
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Memorize: ${easy.memorizeSeconds} seconds left`);
    expect(screen.getByText('Revealed after memorizing')).toBeInTheDocument();
    expect(screen.getByText('Level:', { exact: false }).parentElement).toHaveTextContent('Easy');

    advance(easy.memorizeSeconds * 1000);
    const community = screen.getByRole('region', { name: 'Community cards' });
    expect(within(community).getAllByText(CARD_NAME)).toHaveLength(GAME_CONFIG.communityCount);
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Select: ${easy.selectSeconds} seconds left`);
    fireEvent.click(slot(0));
    fireEvent.click(slot(8));
    fireEvent.click(screen.getByRole('button', { name: 'Lock in picks' }));
    advance(GAME_CONFIG.revealMs);

    // Play again keeps the level.
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(screen.getAllByTestId(/grid-slot-/)).toHaveLength(9);
  });

  it('difficult: 5×4 grid with shorter timers', () => {
    const hard = DIFFICULTIES.difficult;
    render(<App random={createSeededRandom(SEED)} />);
    chooseLevel('Difficult');
    fireEvent.click(screen.getByRole('button', { name: 'Start difficult game' }));

    expect(screen.getAllByTestId(/grid-slot-/)).toHaveLength(20);
    expect(screen.getByText('Revealed after memorizing')).toBeInTheDocument();
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Memorize: ${hard.memorizeSeconds} seconds left`);
    advance(hard.memorizeSeconds * 1000);
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Select: ${hard.selectSeconds} seconds left`);
    fireEvent.click(slot(19));
    expect(slot(19)).toHaveAttribute('aria-pressed', 'true');
    advance(hard.selectSeconds * 1000);
    advance(GAME_CONFIG.revealMs);
    expect(screen.getByRole('heading', { name: 'Incomplete hand' })).toBeInTheDocument();
  });

  it('remembers the chosen level', () => {
    const { unmount } = render(<App />);
    chooseLevel('Difficult');
    unmount();
    render(<App />);
    expect(screen.getByRole('radio', { name: /^Difficult/ })).toBeChecked();
  });
});
