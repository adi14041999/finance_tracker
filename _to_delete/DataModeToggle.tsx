'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Live sheet / sample data, as a segmented control.
 *
 * Disabled entirely when no sheet is configured — there is nothing to switch
 * to, and a control that silently does nothing is worse than one that isn't
 * there. In that case the label says why rather than leaving you to guess.
 *
 * The flip goes through a cookie and a router refresh rather than client
 * state, because every figure in this app is rendered on the server.
 */
export default function DataModeToggle({
  source, configured,
}: {
  source: 'sheet' | 'sample';
  configured: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Optimistic, so the pressed segment moves immediately rather than waiting
  // out the round trip and re-render.
  const [optimistic, setOptimistic] = useState<'sheet' | 'sample' | null>(null);
  const active = optimistic ?? source;

  async function choose(mode: 'live' | 'sample') {
    const next = mode === 'sample' ? 'sample' : 'sheet';
    if (next === active) return;
    setOptimistic(next);
    await fetch('/api/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    startTransition(() => {
      router.refresh();
      setOptimistic(null);
    });
  }

  if (!configured) {
    return (
      <span
        className="rounded-lg border border-hairline px-2.5 py-1 text-xs text-ink-muted"
        title="No sheet is connected, so there is only sample data to show."
      >
        Sample data
      </span>
    );
  }

  return (
    <div
      className={[
        'inline-flex rounded-lg border border-hairline bg-sunken p-0.5 transition-opacity',
        pending ? 'opacity-60' : '',
      ].join(' ')}
      role="group"
      aria-label="Data source"
    >
      {([
        { key: 'live', label: 'Live', on: active === 'sheet' },
        { key: 'sample', label: 'Sample', on: active === 'sample' },
      ] as const).map((b) => (
        <button
          key={b.key}
          onClick={() => choose(b.key)}
          aria-pressed={b.on}
          className={[
            'rounded-md px-2.5 py-1 text-xs transition-colors',
            b.on ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
          ].join(' ')}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
