import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  if (!q) return NextResponse.json({ data: [] });

  const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`);
  const data = await res.json();
  return NextResponse.json(data);
}
