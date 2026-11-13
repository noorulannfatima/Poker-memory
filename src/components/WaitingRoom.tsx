import { useState } from 'react';

interface WaitingRoomProps {
  code: string;
  levelLabel: string;
  /** This device lost its connection and is trying to get it back. */
  reconnecting: boolean;
  onLeave: () => void;
}

/** Online: the room exists, and its code is shown until an opponent joins. */
export function WaitingRoom({ code, levelLabel, reconnecting, onLeave }: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      <section className="fade-up rounded-2xl border border-line bg-charcoal/80 p-6" aria-labelledby="waiting-heading">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">{levelLabel} room</p>
        <h1 id="waiting-heading" className="mt-1 font-display text-3xl font-semibold text-ink">
          Share this code
        </h1>
        <p
          className="mt-4 font-display text-5xl font-semibold tracking-[0.3em] text-gold-bright"
          data-testid="room-code"
        >
          {code}
        </p>
        <button
          type="button"
          onClick={() => void copy()}
          className="mt-4 rounded-xl border border-gold/60 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10"
        >
          {copied ? 'Copied ✓' : 'Copy code'}
        </button>
        <p className="mt-5 text-ink/85" role="status">
          {reconnecting ? 'Connection lost. Reconnecting…' : 'Waiting for an opponent to join…'}
        </p>
        <button
          type="button"
          onClick={onLeave}
          className="mt-4 text-sm text-muted underline-offset-4 transition hover:text-ink hover:underline"
        >
          Leave room
        </button>
      </section>
    </main>
  );
}
