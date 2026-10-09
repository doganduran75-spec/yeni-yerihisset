// Meta (Instagram/Facebook) katalog beslemesi — Google Merchant beslemesiyle aynı içerik/format
// (Meta, Google RSS formatını kabul eder). Commerce Manager › Veri kaynakları › Planlı besleme.
import type { NextRequest } from "next/server";
import { GET as googleFeed } from "../google-merchant/route";

export async function GET(request: NextRequest) {
  return googleFeed(request);
}
