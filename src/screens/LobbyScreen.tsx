import type { CSSProperties } from 'react';
import { GAME_CONFIG, GRID_SIZE } from '../game/gameConfig';
import { CATEGORY_LABEL, type HandCategory } from '../game/pokerEvaluator';

interface LobbyScreenProps {
  onStart: () => void;
}

const STEPS = [
  {
    title: 'Memorize',
    time: `${GAME_CONFIG.memorizeSeconds}s`,
    body: `${GRID_SIZE} cards are dealt face-up in a ${GAME_CONFIG.gridColumns}×${GAME_CONFIG.gridRows} grid. Remember where they are.`,
  },
  {
    title: 'The board',
    time: null,
    body: `The grid flips face-down and ${GAME_CONFIG.communityCount} community cards are revealed.`,
  },
  {
    title: 'Select',
    time: `${GAME_CONFIG.selectSeconds}s`,
    body: `Pick ${GAME_CONFIG.picksRequired} face-down grid positions from memory. You can change your mind until you lock in.`,
  },
  {
    title: 'Reveal',
    time: null,
    body: `The grid flips back. Your ${GAME_CONFIG.picksRequired} picks plus the ${GAME_CONFIG.communityCount} community cards make your five-card hand.`,
  },
];

const RANKING: Array<[HandCategory, string]> = [
  ['royal-flush', 'A K Q J 10, same suit'],
  ['straight-flush', 'Five in a row, same suit'],
  ['four-of-a-kind', 'Four cards of one rank'],
  ['full-house', 'Three of a kind + a pair'],
  ['flush', 'Five of the same suit'],
  ['straight', 'Five in a row (A can be low: A-2-3-4-5)'],
  ['three-of-a-kind', 'Three cards of one rank'],
  ['two-pair', 'Two different pairs'],
  ['pair', 'Two cards of one rank'],
  ['high-card', 'None of the above'],
];

export function LobbyScreen({ onStart }: LobbyScreenProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6 sm:py-16">
      <div className="fade-up text-center">
        <LogoMark />
        <h1 className="mt-6 font-display text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
          Memory <span className="text-gold">Poker</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted">
          {GRID_SIZE} cards. {GAME_CONFIG.memorizeSeconds} seconds to memorize. Pick{' '}
          {GAME_CONFIG.picksRequired} from memory to build the best poker hand you can.
        </p>
        <button
          type="button"
          onClick={onStart}
          autoFocus
          className="mt-8 rounded-2xl bg-gold px-10 py-4 text-lg font-semibold text-night shadow-[0_12px_32px_-12px_rgb(216_180_106/0.8)] transition hover:bg-gold-bright active:translate-y-px"
        >
          Start game
        </button>
      </div>

      <section aria-labelledby="how-heading" className="fade-up mt-14" style={{ '--delay': '120ms' } as CSSProperties}>
        <h2 id="how-heading" className="text-center text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-gold">
          How a round works
        </h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4 rounded-2xl border border-line bg-charcoal/70 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-gold/40 font-display text-base font-semibold text-gold">
                {i + 1}
              </span>
              <div>
                <h3 className="flex items-baseline gap-2 font-semibold text-ink">
                  {step.title}
                  {step.time && (
                    <span className="rounded-full bg-felt px-2 py-0.5 text-xs font-semibold tabular-nums text-gold-bright">
                      {step.time}
                    </span>
                  )}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-2xl border border-line bg-charcoal/40 p-4 text-sm leading-relaxed text-muted">
          <p>
            <strong className="font-semibold text-ink">Exactly five cards count:</strong> your{' '}
            {GAME_CONFIG.picksRequired} picks + the {GAME_CONFIG.communityCount} community cards.
          </p>
          <p className="mt-2">
            <strong className="font-semibold text-ink">If time runs out:</strong> whatever you’ve chosen is
            locked in. With fewer than {GAME_CONFIG.picksRequired} picks there’s no five-card hand, so the round
            scores as an <em>incomplete hand</em>.
          </p>
        </div>

        <details className="group mt-4 rounded-2xl border border-line bg-charcoal/40 p-4 text-sm">
          <summary className="cursor-pointer select-none font-semibold text-ink marker:text-gold">
            Hand rankings, strongest first
          </summary>
          <ol className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {RANKING.map(([category, hint]) => (
              <li key={category} className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
                <span className="font-medium text-ink">{CATEGORY_LABEL[category]}</span>
                <span className="text-right text-subtle">{hint}</span>
              </li>
            ))}
          </ol>
        </details>
      </section>
    </main>
  );
}

/** Original mark: two fanned cards, one face-down, one showing a spade. */
function LogoMark() {
  return (
    <div className="relative mx-auto h-24 w-24" aria-hidden="true">
      <div className="absolute left-2 top-2 w-14 -rotate-12">
        <div className="playing-card" data-face="down">
          <div className="playing-card__inner">
            <div className="playing-card__face" />
            <div className="playing-card__back" />
          </div>
        </div>
      </div>
      <div className="absolute right-2 top-1 w-14 rotate-[8deg]">
        <div className="playing-card" data-face="up">
          <div className="playing-card__inner">
            <div className="playing-card__face">
              <div className="playing-card__corner playing-card__corner--tl">
                <span className="playing-card__corner-rank">A</span>
                <span className="playing-card__corner-suit">♠</span>
              </div>
              <div className="playing-card__pip">♠</div>
            </div>
            <div className="playing-card__back" />
          </div>
        </div>
      </div>
    </div>
  );
}
