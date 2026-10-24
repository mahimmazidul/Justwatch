import { NextRequest, NextResponse } from "next/server";
import { ensureAnonId } from "@/lib/anon";
import { addToWatchlist, listWatchlist, removeFromWatchlist } from "@/lib/store";
import type { JWTitleSummary } from "@/lib/justwatch";

export async function GET(req: NextRequest) {
  const { anonId, setCookieOn } = ensureAnonId(req);
  const items = await listWatchlist(anonId);
  return setCookieOn(NextResponse.json({ items }));
}

export async function POST(req: NextRequest) {
  const { anonId, setCookieOn } = ensureAnonId(req);
  let body: Partial<JWTitleSummary> | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (!body?.id || !body.title || !body.objectType) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }
  const ok = await addToWatchlist(anonId, {
    id: body.id,
    objectId: body.objectId ?? 0,
    objectType: body.objectType,
    title: String(body.title).slice(0, 200),
    fullPath: body.fullPath ?? "",
    year: body.year ?? null,
    releaseDate: null,
    runtimeMinutes: null,
    description: null,
    genres: [],
    genreCodes: [],
    imdbId: null,
    tmdbId: null,
    poster: body.poster ?? null,
    backdrop: null,
  });
  if (!ok) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const items = await listWatchlist(anonId);
  return setCookieOn(NextResponse.json({ items, saved: true }));
}

export async function DELETE(req: NextRequest) {
  const { anonId } = ensureAnonId(req);
  const nodeId = req.nextUrl.searchParams.get("nodeId");
  if (!nodeId) return NextResponse.json({ error: "nodeId required" }, { status: 400 });
  const ok = await removeFromWatchlist(anonId, nodeId);
  if (!ok) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const items = await listWatchlist(anonId);
  return NextResponse.json({ items, saved: false });
}
