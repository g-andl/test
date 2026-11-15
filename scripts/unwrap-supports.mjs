// После сборки убирает из CSS обёртки `@supports (color:color-mix(...)){…}`, оставляя их содержимое.
// Причина: Яндекс Браузер на такой обёртке внутри @layer теряет все правила, идущие после неё
// (пропадали отступы, цвета, жирность, компьютерная раскладка). Без обёртки результат тот же:
// перед каждым таким правилом Tailwind уже кладёт запасной цвет, а color-mix понимают все браузеры,
// на которые рассчитан сайт.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MARK = "@supports (color:color-mix(in lab, red, red)){";

function unwrap(css) {
  let out = "";
  let i = 0;
  let n = 0;
  for (;;) {
    const at = css.indexOf(MARK, i);
    if (at === -1) break;
    let depth = 1;
    let j = at + MARK.length;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    out += css.slice(i, at) + css.slice(at + MARK.length, j - 1);
    i = j;
    n++;
  }
  return { css: out + css.slice(i), n };
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".css")) {
      const { css, n } = unwrap(readFileSync(p, "utf8"));
      if (n) {
        writeFileSync(p, css);
        console.log(`unwrap-supports: ${p} — снято обёрток: ${n}`);
      }
    }
  }
}

walk("out");
