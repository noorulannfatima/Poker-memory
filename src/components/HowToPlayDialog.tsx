import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';
import { GAME_CONFIG, GAME_MODES, gridSize, type DifficultySettings, type GameMode } from '../game/gameConfig';
import { CATEGORY_LABEL, type HandCategory } from '../game/pokerEvaluator';

interface HowToPlayDialogProps {
  settings: DifficultySettings;
  mode: GameMode;
  onClose: () => void;
  /** Gets focus back when the dialog closes (clicking a button doesn't focus it in every browser). */
  returnFocusTo: RefObject<HTMLElement | null>;
}

function stepsFor(settings: DifficultySettings, mode: GameMode) {
  const versus = mode !== 'solo';
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
      body:
        mode === 'computer'
          ? `Pick ${picksRequired} face-down grid positions from memory. The computer secretly picks ${picksRequired} at the same time, and you may both pick the same card.`
          : mode === 'online'
            ? `Pick ${picksRequired} face-down grid positions from memory. Your opponent picks at the same time on their own device, and you may both pick the same card.`
            : mode === 'local'
              ? `Players take turns picking ${picksRequired} face-down grid positions, each with their own ${settings.selectSeconds}s. Pass the device between turns, and look away while the other player picks.`
              : `Pick ${picksRequired} face-down grid positions from memory. You can change your mind until you lock in.`,
    },
    {
      title: 'Reveal',
      time: null,
      body: versus
        ? `Both sets of picks are revealed. Each player's ${picksRequired} picks plus the ${communityCount} community cards make a five-card hand, and the higher hand wins the round.`
        : `The grid flips back. Your ${picksRequired} picks plus the ${communityCount} community cards make your five-card hand.`,
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

const FOCUSABLE = 'button, summary, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Modal with the round steps for the chosen level and mode, plus the hand rankings. */
export function HowToPlayDialog({ settings, mode, onClose, returnFocusTo }: HowToPlayDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const steps = stepsFor(settings, mode);

  useEffect(() => {
    const trigger = returnFocusTo.current;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      trigger?.focus();
    };
  }, [returnFocusTo]);

  // Escape closes; Tab stays inside the dialog.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-night/80 px-4 py-6 backdrop-blur-sm sm:items-center sm:py-10"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-heading"
        className="fade-up relative w-full max-w-3xl rounded-3xl border border-line bg-charcoal p-5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)] sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-gold">How to play</p>
            <h2 id="how-heading" className="mt-1 font-display text-2xl font-semibold text-ink sm:text-3xl">
              How a round works
            </h2>
            <p className="mt-1 text-sm text-muted">
              {settings.label} level · {GAME_MODES.find((m) => m.id === mode)?.label}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close how to play"
            className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-ink/80 transition hover:border-gold/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-bright"
          >
            <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <ol className="mt-5 grid gap-3 sm:grid-cols-2">
          {steps.map((step, i) => (
            <li key={step.title} className="flex gap-4 rounded-2xl border border-line bg-night/40 p-4">
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

        <div className="mt-4 rounded-2xl border border-line bg-night/30 p-4 text-sm leading-relaxed text-muted">
          <p>
            <strong className="font-semibold text-ink">Exactly five cards count:</strong> your{' '}
            {GAME_CONFIG.picksRequired} picks + the {GAME_CONFIG.communityCount} community cards.
          </p>
          <p className="mt-2">
            <strong className="font-semibold text-ink">If time runs out:</strong> whatever you’ve chosen is locked
            in. With fewer than {GAME_CONFIG.picksRequired} picks there’s no five-card hand, so the round scores as
            an <em>incomplete hand</em>.
          </p>
        </div>

        <details className="group mt-4 rounded-2xl border border-line bg-night/30 p-4 text-sm">
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
      </div>
    </div>
  );
}
