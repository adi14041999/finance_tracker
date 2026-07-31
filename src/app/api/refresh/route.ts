import { NextResponse } from 'next/server';
import { invalidate } from '@/lib/load';

/** Drops the server-side cache so the next render re-reads the sheet. */
export async function POST() {
  invalidate();
  return NextResponse.json({ ok: true });
}
