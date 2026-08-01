/**
 * Says which data you are looking at, and nothing else.
 *
 * Deliberately not a control. Where the data comes from is decided by whether
 * credentials and a sheet ID are present, so a button offering to change it
 * would be offering something it does not own — and a switch that appears to
 * do nothing is worse than a label that plainly states the fact.
 *
 * Rendered on the server from the same value every page reads, so it cannot
 * disagree with the numbers beneath it.
 */
export default function DataSourceBadge({
  source, fetchedAt,
}: {
  source: 'sheet' | 'sample';
  fetchedAt: string;
}) {
  const live = source === 'sheet';
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
          ? `Read from your Google Sheet at ${new Date(fetchedAt).toLocaleTimeString()}.`
          : 'No sheet connected, or the last read failed. These numbers are invented.'
      }
    >
      {/* The dot is decoration; the words carry the meaning, so this reads the
          same in greyscale and to a screen reader. */}
      <span
        aria-hidden
        className={[
          'h-1.5 w-1.5 rounded-full',
          live ? 'bg-delta-good' : 'bg-warning',
        ].join(' ')}
      />
      {live ? 'Live sheet' : 'Sample data'}
    </span>
  );
}
