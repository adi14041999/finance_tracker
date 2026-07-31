'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const PAGES = [
  { href: '/expenses', label: 'Expenses & Budgeting' },
  { href: '/net-worth', label: 'Net Worth' },
  { href: '/robinhood', label: 'Robinhood' },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1" aria-label="Main">
      {PAGES.map((page) => {
        const active = pathname === page.href;
        return (
          <Link
            key={page.href}
            href={page.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-sunken font-semibold text-ink'
                : 'text-ink-secondary hover:bg-sunken hover:text-ink',
            ].join(' ')}
          >
            {page.label}
          </Link>
        );
      })}
    </nav>
  );
}
