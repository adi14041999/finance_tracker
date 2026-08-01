import { NextResponse } from 'next/server';

/**
 * Switches the whole app between the live sheet and the sample data.
 *
 * A cookie rather than component state, because the data is read in server
 * components — the client cannot simply hold a flag and expect the server to
 * honour it. The cookie is read on every render, so one toggle changes every
 * page at once and survives navigation and reload.
 */
export async function POST(request: Request) {
  const { mode } = (await request.json()) as { mode?: string };
  const value = mode === 'sample' ? 'sample' : 'live';

  const response = NextResponse.json({ ok: true, mode: value });
  response.cookies.set('data-mode', value, {
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
