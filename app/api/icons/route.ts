import { NextRequest, NextResponse } from "next/server";
import { catalogIcon, getIconPack, iconCollections } from "@/lib/icon-catalog";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams;
    const collection = query.get("collection");
    if (!collection) return NextResponse.json({ collections: iconCollections });
    const pack = getIconPack(collection);
    const name = query.get("name");
    if (name) return NextResponse.json({ icon: catalogIcon(collection, name) });
    const search = (query.get("q") ?? "").slice(0, 100).toLowerCase();
    const page = Math.max(0, Math.min(10000, Number(query.get("page")) || 0)) | 0;
    const names = Object.keys(pack).filter((key) => typeof pack[key] === "function" && key.toLowerCase().includes(search)).sort();
    return NextResponse.json({ total: names.length, page, icons: names.slice(page * 60, page * 60 + 60).map((key) => catalogIcon(collection, key)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load icons" }, { status: 400 });
  }
}
