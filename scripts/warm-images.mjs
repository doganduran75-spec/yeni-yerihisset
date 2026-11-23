// Deploy sonrası görsel ısıtma (src/lib/warm-images.ts). Kullanım: node scripts/warm-images.mjs
import { warmImages } from "../src/lib/warm-images.ts";

const t = Date.now();
const r = await warmImages("http://localhost:3000");
console.log(`görsel ısıtma: ${r.ok}/${r.total} hazır (${Math.round((Date.now() - t) / 1000)} sn)`);
