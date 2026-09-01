import { NextResponse } from "next/server";

/**
 * Kupon kodunu kullanıcının kendisinin eklemesi (claim) devre dışı bırakıldı.
 * Kuponlar yalnızca admin tarafından atanır veya üye olunca otomatik tanımlanır.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Kupon kodu ekleme kapalıdır. Kuponlar hesabınıza otomatik tanımlanır." },
    { status: 403 }
  );
}
