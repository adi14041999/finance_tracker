'use client';

/**
 * Shows which data you're looking at, and switches it.
 *
 * The lit segment is the indicator — it is rendered on the server from the same
 * `source` every page reads, so it cannot disagree with the numbers beneath it.
 * Clicking the other segment sets a cookie and reloads.
 *
 * Deliberately a plain `document.cookie` write and a full `location.reload()`
 * rather than an API route plus `router.refresh()`. Every figure in this app is
 * rendered on the server, and a soft refresh has too many ways to quietly serve
 * the previous render — which is exactly what the first version of this control
 * did. A hard reload has none: the server renders again and reads the cookie.
 */
export default function DataSource({
  source, configured,
}: {
  source: 'sheet' | 'sample';
  configured: boolean;
}) {
  const live = source === 'sheet';

  function choose(mode: 'live' | 'sample') {
    if ((mode === 'sample') === !live) return;
    document.cookie = `data-mode=${mode === 'sample' ? 'sample' : 'live'}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.reload();
  }

  // With no sheet connected there is nothing to switch to, so this collapses to
  // the indicator alone rather than offering a choice it can't honour.
  if (!configured) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs text-ink-secondary"
        title="No sheet is connected, so there is only sample data to show."
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
        Sample data
      </span>
    );
  }

  return (
    <div className="inline-flex rounded-lg border border-hairline bg-sunken p-0.5" role="group" aria-label="Data source">
      {([
        { key: 'live', label: 'Live sheet', on: live, dot: 'bg-delta-good' },
        { key: 'sample', label: 'Sample', on: !live, dot: 'bg-warning' },
      ] as const).map((b) => (
        <button
          key={b.key}
          onClick={() => choose(b.key)}
          aria-pressed={b.on}
          className={[
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
            b.on ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-secondary hover:text-ink',
          ].join(' ')}
        >
          {/* The dot marks the live one; the word carries the meaning, so this
              reads the same in greyscale and to a screen reader. */}
          {b.on && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${b.dot}`} />}
          {b.label}
        </button>
      ))}
    </div>
  );
}
