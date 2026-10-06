"use client";

// FORM SPAM KORUMASI (istemci tarafı) — herkese açık formlara eklenir:
//   1) Bal küpü (honeypot): insanın görmediği gizli alan. Formu körlemesine dolduran bot
//      bunu da doldurur → sunucu sessizce yok sayar.
//   2) Süre: form açıldıktan gönderilene kadar geçen süre (ms). Botlar milisaniyeler içinde
//      gönderir → sunucu reddeder.
// Sunucu tarafı: src/lib/bot-guard.ts. Kullanım:
//   const bot = useBotTrap();  …  <form>{bot.trap} …</form>  …  body: JSON.stringify({ ...data, ...bot.fields() })
import { useEffect, useRef, useState } from "react";

export function useBotTrap() {
  const start = useRef(0);
  const [hp, setHp] = useState("");
  useEffect(() => { start.current = Date.now(); }, []);

  const trap = (
    <input
      type="text"
      name="yh_alt_contact"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      value={hp}
      onChange={(e) => setHp(e.target.value)}
      style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden", opacity: 0 }}
    />
  );

  return {
    trap,
    fields: () => ({ _hp: hp, _t: start.current ? Date.now() - start.current : 0 }),
  };
}
