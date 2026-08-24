/**
 * Says which data this server is serving, and nothing else.
 *
 * Deliberately not a control any more. The mode is fixed when the process
 * starts — `npm run dev -- --sample` or `--live` — so there is nothing here to
 * switch. A button that silently did nothing, or worse restarted your server,
 * would be a lie either way.
 *
 * A server component with no client JavaScript at all: the value cannot change
 * without a restart, so there is nothing to hydrate.
 */
export default function DataSource({ mode }: { mode: 'sample' | 'live' }) {
  const live = mode === 'live';
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs',
        live
          ? 'border-hairline text-ink-secondary'
          : 'border-warning/40 bg-warning/10 text-ink-secondary',
      ].join(' ')}
      title={
        live
          ? 'Started with --live. Reading your Google Sheet.'
          : 'Started with --sample. These numbers are invented; your sheet is not read.'
      }
    >
      {/* The dot is decoration; the words carry the meaning, so this reads the
          same in greyscale and to a screen reader. */}
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-delta-good' : 'bg-warning'}`} />
      {live ? 'Live sheet' : 'Sample data'}
    </span>
  );
}
