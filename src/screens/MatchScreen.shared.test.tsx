import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MatchActions } from '../app/matchActions';
import { DIFFICULTIES } from '../game/gameConfig';
import type { Round } from '../game/gameTypes';
import { createMatch, matchReducer, sharedScreenViewer, viewFor, type MatchAction, type MatchState } from '../game/match';
import { hand } from '../test/cards';
import { MatchScreen } from './MatchScreen';

const T0 = Date.now();

// Community 9♥ 9♣ 2♦. Positions 0,1 = 9♠ 9♦ (quads), 2,3 = A♥ K♣ (pair of nines).
const fixed: Round = {
  id: 1,
  settings: DIFFICULTIES.medium,
  community: hand('9h 9c 2d'),
  grid: hand('9s 9d Ah Kc 3s 4s 5s 6d 7d 8c Tc Jh Qh Ks 2h 3d'),
};

function play(actions: MatchAction[]): MatchState {
  const start = createMatch({
    players: [
      { id: 'p1', name: 'Ana' },
      { id: 'p2', name: 'Ben' },
    ],
    difficulty: 'medium',
    turnMode: 'sequential',
  });
  const opening: MatchAction[] = [
    { type: 'START_ROUND', round: fixed, now: T0 },
    { type: 'PHASE_TIMEOUT', phase: 'memorizing', roundId: fixed.id, now: T0 },
  ];
  return [...opening, ...actions].reduce(matchReducer, start);
}

const turn = (playerId: string, a: number, b: number): MatchAction[] => [
  { type: 'BEGIN_TURN', playerId, now: T0 },
  { type: 'TOGGLE_POSITION', playerId, position: a },
  { type: 'TOGGLE_POSITION', playerId, position: b },
  { type: 'SUBMIT_SELECTION', playerId, now: T0 },
];

function renderShared(state: MatchState) {
  const actions: MatchActions = { toggle: vi.fn(), submit: vi.fn(), nextRound: vi.fn(), beginTurn: vi.fn() };
  const onLeave = vi.fn();
  render(<MatchScreen view={viewFor(state, sharedScreenViewer(state))} actions={actions} onLeave={onLeave} />);
  return { actions, onLeave };
}

describe('MatchScreen on a shared device', () => {
  it('the first handoff says who picks first, hides the grid and starts the turn on request', () => {
    const { actions } = renderShared(play([]));
    expect(screen.getByRole('heading', { name: 'Ana picks first' })).toBeInTheDocument();
    expect(screen.getByText(/Ben, look away while Ana picks/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Card grid' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "I'm Ana, start my turn" }));
    expect(actions.beginTurn).toHaveBeenCalledOnce();
  });

  it('between turns asks to pass the device, and can leave', () => {
    const { onLeave } = renderShared(play(turn('p1', 0, 1)));
    expect(screen.getByRole('heading', { name: 'Pass to Ben' })).toBeInTheDocument();
    expect(screen.getByText(/Ana.s turn is over/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Card grid' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave match' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('during a turn shows who picks next and marks the active player', () => {
    renderShared(play(turn('p1', 0, 1).slice(0, 1)));
    expect(screen.getByTestId('opponent-status')).toHaveTextContent('Ben picks next.');
    expect(screen.getByTestId('scoreboard')).toHaveAccessibleName('Score: Ana 0, Ben 0, 0 ties, Ana to pick');
    expect(screen.getByTestId('grid-slot-0')).toBeEnabled();
  });

  it('keeps the scoreboard in a fixed order on Ben’s turn', () => {
    renderShared(play([...turn('p1', 0, 1), { type: 'BEGIN_TURN', playerId: 'p2', now: T0 }]));
    expect(screen.getByTestId('scoreboard')).toHaveAccessibleName('Score: Ana 0, Ben 0, 0 ties, Ben to pick');
    expect(screen.getByTestId('opponent-status')).toHaveTextContent('Ana has locked in ✓');
  });

  it('results name both players instead of saying "you"', () => {
    renderShared(
      play([...turn('p1', 0, 1), ...turn('p2', 2, 3), { type: 'PHASE_TIMEOUT', phase: 'revealing', roundId: 1, now: T0 }]),
    );
    expect(screen.getByRole('heading', { name: 'Ana wins the round' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ana’s five-card hand' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ben’s five-card hand' })).toBeInTheDocument();
    expect(screen.getByTestId('grid-slot-0')).toHaveAccessibleName(/Ana's pick$/);
    expect(screen.getByTestId('grid-slot-2')).toHaveAccessibleName(/Ben's pick$/);
  });
});
