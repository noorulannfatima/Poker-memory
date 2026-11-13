import type { CSSProperties } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  GAME_CONFIG,
  gridSize,
  type Difficulty,
  type DifficultySettings,
} from '../game/gameConfig';
import { CATEGORY_LABEL, type HandCategory } from '../game/pokerEvaluator';

interface LobbyScreenProps {
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onStart: () => void;
}

function stepsFor(settings: DifficultySettings) {
  const { communityCount, picksRequired } = GAME_CONFIG;
  return [
    {
      title: 'Memorize',
      time: `${settings.memorizeSeconds}s`,
      body: `${gridSize(settings)} cards are dealt face-up in a ${settings.gridColumns}×${settings.gridRows} grid. Remember where they are.`,
    },
    {
      title: 'The board',
      time: null,
      body: `The grid flips face-down and ${communityCount} community cards are revealed.`,
    },
    {
      title: 'Select',
      time: `${settings.selectSeconds}s`,
      body: `Pick ${picksRequired} face-down grid positions from memory. You can change your mind until you lock in.`,
    },
    {
      title: 'Reveal',
      time: null,
      body: `The grid flips back. Your ${picksRequired} picks plus the ${communityCount} community cards make your five-card hand.`,
    },
  ];
}

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

export function LobbyScreen({ difficulty, onDifficultyChange, onStart }: LobbyScreenProps) {
  const settings = DIFFICULTIES[difficulty];
  const steps = stepsFor(settings);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-10 sm:px-6 sm:py-16">
      <div className="fade-up text-center">
        <LogoMark />
        <h1 className="mt-6 font-display text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
          Memory <span className="text-gold">Poker</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted">
          Memorize a grid of cards, then pick {GAME_CONFIG.picksRequired} from memory to build the best poker
          hand you can.
        </p>

        <fieldset className="mx-auto mt-8 max-w-xl">
          <legend className="mx-auto mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-gold">
            Choose a level
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {DIFFICULTY_ORDER.map((id) => {
              const level = DIFFICULTIES[id];
              return (
                <label
                  key={id}
                  className="relative cursor-pointer rounded-2xl border border-line bg-charcoal/70 px-2 py-3 text-center transition hover:border-gold/50 has-[:checked]:border-gold has-[:checked]:bg-felt has-[:checked]:shadow-[0_0_0_1px_var(--color-gold),0_10px_30px_-12px_rgb(216_180_106/0.5)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-gold-bright sm:px-3"
                >
                  <input
                    type="radio"
                    name="difficulty"
                    value={id}
                    checked={difficulty === id}
                    onChange={() => onDifficultyChange(id)}
                    className="sr-only"
                  />
                  <span className="block font-display text-lg font-semibold text-ink sm:text-xl">{level.label}</span>
                  <span className="mt-1 block text-xs text-muted tabular-nums">
                    {level.gridColumns}×{level.gridRows} · {gridSize(level)} cards
                  </span>
                  <span className="mt-0.5 block text-xs text-subtle tabular-nums">
                    {level.memorizeSeconds}s / {level.selectSeconds}s
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mx-auto mt-3 min-h-[2.5rem] max-w-md text-sm leading-relaxed text-muted" aria-live="polite">
            {settings.summary}
          </p>
        </fieldset>

        <button
          type="button"
          onClick={onStart}
          autoFocus
          className="mt-5 rounded-2xl bg-gold px-10 py-4 text-lg font-semibold text-night shadow-[0_12px_32px_-12px_rgb(216_180_106/0.8)] transition hover:bg-gold-bright active:translate-y-px"
        >
          Start {settings.label.toLowerCase()} game
        </button>
      </div>

      <section aria-labelledby="how-heading" className="fade-up mt-14" style={{ '--delay': '120ms' } as CSSProperties}>
        <h2 id="how-heading" className="text-center text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-gold">
          How a round works
        </h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2">
          {steps.map((step, i) => (
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
