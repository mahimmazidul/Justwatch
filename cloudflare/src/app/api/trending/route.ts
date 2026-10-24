import { NextResponse } from "next/server";
import { getTrendingSearches } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const trending = await getTrendingSearches(10);
  return NextResponse.json({ trending });
}
