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

// Снимает каскадные слои: `@layer имя{…}` заменяется содержимым, объявления `@layer a,b;` удаляются.
// Причина: в Яндекс Браузере базовые правила (сброс стилей заголовков, ссылок, кнопок, полей)
// перебивали оформление из слоя utilities — заголовки становились мелкими, пропадали цвета и отступы.
// Без слоёв порядок тот же, что и был: сброс идёт раньше оформления, а селекторы сброса слабее классов.
function unlayer(css) {
  let out = "";
  let i = 0;
  let n = 0;
  const re = /@layer [a-z0-9_, -]+(\{|;)/g;
  for (;;) {
    re.lastIndex = i;
    const m = re.exec(css);
    if (!m) break;
    const at = m.index;
    if (m[1] === ";") {
      out += css.slice(i, at);
      i = at + m[0].length;
      n++;
      continue;
    }
    let depth = 1;
    let j = at + m[0].length;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    // содержимое слоя может само содержать слои — обрабатываем рекурсивно
    out += css.slice(i, at) + unlayer(css.slice(at + m[0].length, j - 1)).css;
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
      const a = unwrap(readFileSync(p, "utf8"));
      const b = unlayer(a.css);
      if (a.n || b.n) {
        writeFileSync(p, b.css);
        console.log(`unwrap-supports: ${p} — снято обёрток @supports: ${a.n}, слоёв: ${b.n}`);
      }
    }
  }
}

walk("out");
