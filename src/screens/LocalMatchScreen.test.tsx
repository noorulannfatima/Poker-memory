import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { createSeededRandom } from '../game/deck';
import { DIFFICULTIES, GAME_CONFIG } from '../game/gameConfig';

const MEDIUM = DIFFICULTIES.medium;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const slot = (position: number) => screen.getByTestId(`grid-slot-${position}`);
const score = () => screen.getByTestId('scoreboard');

function startLocal(names: [string, string] = ['Ana', 'Ben']) {
  render(<App random={createSeededRandom(5)} />);
  fireEvent.click(screen.getByRole('radio', { name: /^Two players/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Player 1' }), { target: { value: names[0] } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Player 2' }), { target: { value: names[1] } });
  fireEvent.click(screen.getByRole('button', { name: 'Start medium game for two' }));
}

function takeTurn(name: string, a: number, b: number) {
  fireEvent.click(screen.getByRole('button', { name: `I'm ${name}, start my turn` }));
  fireEvent.click(slot(a));
  fireEvent.click(slot(b));
  fireEvent.click(screen.getByRole('button', { name: 'Lock in picks' }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Two players, one device', () => {
  it('describes the mode in the lobby', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /^Two players/ }));
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }));
    expect(screen.getByText(/Pass the device between turns/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Player 1' })).toBeInTheDocument();
  });

  it('plays a round: memorize together, take turns with a handoff, compare hands', () => {
    startLocal();
    expect(score()).toHaveAccessibleName('Score: Ana 0, Ben 0, 0 ties');
    expect(screen.getAllByTestId(/grid-slot-/)).toHaveLength(16);

    advance(MEDIUM.memorizeSeconds * 1000);
    expect(screen.getByRole('heading', { name: 'Ana picks first' })).toBeInTheDocument();
    expect(screen.queryByTestId('grid-slot-0')).not.toBeInTheDocument();

    // No timer runs during a handoff.
    advance(MEDIUM.selectSeconds * 1000 * 2);
    expect(screen.getByRole('heading', { name: 'Ana picks first' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "I'm Ana, start my turn" }));
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Select: ${MEDIUM.selectSeconds} seconds left`);
    fireEvent.click(slot(0));
    fireEvent.click(slot(1));
    fireEvent.click(screen.getByRole('button', { name: 'Lock in picks' }));

    expect(screen.getByRole('heading', { name: 'Pass to Ben' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "I'm Ben, start my turn" }));
    // Ben gets a full timer and can't see Ana's picks.
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Select: ${MEDIUM.selectSeconds} seconds left`);
    screen.getAllByTestId(/grid-slot-/).forEach((s) => {
      expect(s).toHaveAttribute('aria-pressed', 'false');
      expect(s).toHaveAccessibleName(/face-down card$/);
    });
    fireEvent.click(slot(2));
    fireEvent.click(slot(3));
    fireEvent.click(screen.getByRole('button', { name: 'Lock in picks' }));
    advance(GAME_CONFIG.revealMs);

    expect(screen.getByRole('heading', { name: /Ana wins the round|Ben wins the round|It's a tie/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ana’s five-card hand' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ben’s five-card hand' })).toBeInTheDocument();
    const [ana, ben, ties] = (score().getAttribute('aria-label')?.match(/\d+/g) ?? []).map(Number);
    expect((ana ?? 0) + (ben ?? 0) + (ties ?? 0)).toBe(1);
  });

  it('a timed-out turn passes the device on, and the next round starts with the other player', () => {
    startLocal();
    advance(MEDIUM.memorizeSeconds * 1000);
    fireEvent.click(screen.getByRole('button', { name: "I'm Ana, start my turn" }));
    advance(MEDIUM.selectSeconds * 1000);

    expect(screen.getByRole('heading', { name: 'Pass to Ben' })).toBeInTheDocument();
    takeTurn('Ben', 2, 3);
    advance(GAME_CONFIG.revealMs);
    expect(screen.getByRole('heading', { name: 'Ben wins the round' })).toBeInTheDocument();
    expect(score()).toHaveAccessibleName('Score: Ana 0, Ben 1, 0 ties');

    fireEvent.click(screen.getByRole('button', { name: 'Next round' }));
    advance(MEDIUM.memorizeSeconds * 1000);
    expect(screen.getByRole('heading', { name: 'Ben picks first' })).toBeInTheDocument();
  });

  it('blank names fall back to Player 1 and Player 2', () => {
    startLocal(['', '  ']);
    expect(score()).toHaveAccessibleName('Score: Player 1 0, Player 2 0, 0 ties');
  });

  it('leaving returns to the lobby and stops every timer', () => {
    startLocal();
    advance(MEDIUM.memorizeSeconds * 1000);
    fireEvent.click(screen.getByRole('button', { name: "I'm Ana, start my turn" }));
    advance(1000); // mid-turn: select timer and countdown interval are live
    fireEvent.click(screen.getByRole('button', { name: 'Exit to lobby' }));
    advance(60_000);
    expect(screen.getByRole('button', { name: 'Start medium game for two' })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
});
