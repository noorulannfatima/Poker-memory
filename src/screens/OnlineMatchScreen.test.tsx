import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { loadSession, saveSession } from '../app/onlineSession';
import { DIFFICULTIES } from '../game/gameConfig';
import { matchReducer, type MatchAction } from '../game/match';
import { BOTH_CONNECTED, JOINED, ROOM_CODE, fakeSockets, serverMatch, stateMessage } from '../test/online';

const MEDIUM = DIFFICULTIES.medium;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderApp() {
  const fake = fakeSockets();
  render(<App createSocket={fake.factory} />);
  return fake;
}

function chooseOnline(name = 'Ana') {
  fireEvent.click(screen.getByRole('radio', { name: /^Online/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your name' }), { target: { value: name } });
}

/** Create a room as Ana and get to the memorizing phase of round 1. */
function inMatch() {
  const fake = renderApp();
  chooseOnline();
  fireEvent.click(screen.getByRole('button', { name: 'Create medium room' }));
  const socket = fake.latest();
  socket.open();
  socket.receive(JOINED);
  socket.receive(stateMessage(serverMatch()));
  return { fake, socket };
}

const memorizeOver = (): MatchAction => ({ type: 'PHASE_TIMEOUT', phase: 'memorizing', roundId: 1, now: Date.now() });
const pick = (playerId: string, position: number): MatchAction => ({ type: 'TOGGLE_POSITION', playerId, position });
const lockIn = (playerId: string): MatchAction => ({ type: 'SUBMIT_SELECTION', playerId, now: Date.now() });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Online play', () => {
  it('the lobby offers create and join, and cleans up typed room codes', () => {
    renderApp();
    chooseOnline();
    expect(screen.getByRole('button', { name: 'Create medium room' })).toBeEnabled();
    const join = screen.getByRole('button', { name: 'Join room' });
    expect(join).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Room code' }), { target: { value: 'k-q p z9' } });
    expect(screen.getByRole('textbox', { name: 'Room code' })).toHaveValue('KQPZ');
    expect(join).toBeEnabled();
    expect(screen.getByText(/Your opponent picks at the same time on their own device/)).toBeInTheDocument();
  });

  it('Cancel while connecting goes back to the lobby and closes the socket', () => {
    const fake = renderApp();
    chooseOnline();
    fireEvent.click(screen.getByRole('button', { name: 'Create medium room' }));
    const socket = fake.latest();
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('radio', { name: /^Online/ })).toBeInTheDocument();
    expect(socket.closed).toBe(true);
  });

  it('shows the room code until an opponent joins, then plays a round', () => {
    const fake = renderApp();
    chooseOnline();
    fireEvent.click(screen.getByRole('button', { name: 'Create medium room' }));
    const socket = fake.latest();
    expect(screen.getByText('Connecting…')).toBeInTheDocument();

    socket.open();
    expect(socket.sent).toEqual([{ type: 'create', name: 'Ana', difficulty: 'medium' }]);
    socket.receive(JOINED);
    socket.receive(stateMessage(null, [{ id: 'p1', name: 'Ana', presence: 'connected' }]));
    expect(screen.getByTestId('room-code')).toHaveTextContent(ROOM_CODE);
    expect(screen.getByText('Waiting for an opponent to join…')).toBeInTheDocument();

    socket.receive(stateMessage(serverMatch()));
    expect(screen.getAllByTestId(/grid-slot-/)).toHaveLength(16);
    expect(screen.getByTestId('scoreboard')).toHaveAccessibleName('Score: Ana 0, Ben 0, 0 ties');

    socket.receive(stateMessage(serverMatch([memorizeOver()])));
    fireEvent.click(screen.getByTestId('grid-slot-0'));
    expect(socket.sent.at(-1)).toEqual({ type: 'toggle', position: 0 });

    socket.receive(stateMessage(serverMatch([memorizeOver(), pick('p1', 0), pick('p1', 1)])));
    fireEvent.click(screen.getByRole('button', { name: 'Lock in picks' }));
    expect(socket.sent.at(-1)).toEqual({ type: 'submit' });

    const results = serverMatch([
      memorizeOver(),
      pick('p1', 0),
      pick('p1', 1),
      lockIn('p1'),
      pick('p2', 2),
      pick('p2', 3),
      lockIn('p2'),
      { type: 'PHASE_TIMEOUT', phase: 'revealing', roundId: 1, now: Date.now() },
    ]);
    socket.receive(stateMessage(results));
    expect(screen.getByRole('heading', { name: /You win the round|Ben wins the round|It's a tie/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next round' }));
    expect(socket.sent.at(-1)).toEqual({ type: 'nextRound' });
    socket.receive(stateMessage(matchReducer(results, { type: 'NEXT_ROUND', playerId: 'p1' })));
    expect(screen.getByRole('button', { name: 'Waiting for Ben…' })).toBeDisabled();
  });

  it('shows the countdown on this device’s clock when the server clock differs', () => {
    const { socket } = inMatch();
    const serverNow = Date.now() - 60_000;
    socket.receive(stateMessage(serverMatch([], serverNow), BOTH_CONNECTED, false, serverNow));
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Memorize: ${MEDIUM.memorizeSeconds} seconds left`);
  });

  it('a join error returns to the lobby with a message', () => {
    const fake = renderApp();
    chooseOnline('Ben');
    fireEvent.change(screen.getByRole('textbox', { name: 'Room code' }), { target: { value: 'ABCD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
    fake.latest().open();
    expect(fake.latest().sent).toEqual([{ type: 'join', roomCode: 'ABCD', name: 'Ben' }]);

    fake.latest().receive({ type: 'error', code: 'room-not-found', message: 'No room with that code.' });
    expect(screen.getByRole('alert')).toHaveTextContent('No room with that code.');
    expect(screen.getByRole('button', { name: 'Join room' })).toBeInTheDocument();
  });

  it('shows connection banners for either side and resumes after a drop', () => {
    const { fake, socket } = inMatch();
    socket.drop();
    expect(screen.getByTestId('connection-banner')).toHaveTextContent('Connection lost. Reconnecting…');

    advance(1000);
    const again = fake.latest();
    again.open();
    expect(again.sent).toEqual([{ type: 'resume', roomCode: ROOM_CODE, token: 'token-ana' }]);
    again.receive(JOINED);
    again.receive(stateMessage(serverMatch()));
    expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument();

    again.receive(
      stateMessage(serverMatch(), [
        { id: 'p1', name: 'Ana', presence: 'connected' },
        { id: 'p2', name: 'Ben', presence: 'reconnecting' },
      ]),
    );
    expect(screen.getByTestId('connection-banner')).toHaveTextContent(/Ben lost connection/);
  });

  it('when the opponent leaves, says so and goes back to the lobby', () => {
    const { socket } = inMatch();
    socket.receive(
      stateMessage(
        serverMatch(),
        [
          { id: 'p1', name: 'Ana', presence: 'connected' },
          { id: 'p2', name: 'Ben', presence: 'left' },
        ],
        true,
      ),
    );
    expect(screen.getByRole('heading', { name: 'Ben left the game' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to lobby' }));
    expect(screen.getByRole('button', { name: 'Create medium room' })).toBeInTheDocument();
  });

  it('leaving mid-match tells the server, forgets the room and stops every timer', () => {
    const { socket } = inMatch();
    fireEvent.click(screen.getByRole('button', { name: 'Exit to lobby' }));
    expect(socket.sent.at(-1)).toEqual({ type: 'leave' });
    expect(socket.closed).toBe(true);
    expect(loadSession()).toBeNull();
    advance(60_000);
    expect(screen.getByRole('button', { name: 'Create medium room' })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a reload resumes the saved room', () => {
    saveSession({ roomCode: ROOM_CODE, token: 'token-ana' });
    const fake = renderApp();
    fake.latest().open();
    expect(fake.latest().sent).toEqual([{ type: 'resume', roomCode: ROOM_CODE, token: 'token-ana' }]);
  });
});
