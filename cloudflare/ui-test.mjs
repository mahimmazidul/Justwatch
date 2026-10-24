/**
 * Interaction tests. verify.py checks what the server sends; this checks what a
 * person can actually do with it, in a real browser, with the client bundle
 * running and CSS applied.
 *
 * It exists because of a bug that verify.py could not see: the hero autocomplete
 * rendered correctly and every one of its results was present in the HTML, but a
 * sibling element painted over the top of the open dropdown and swallowed the
 * clicks. Status codes, headers and markup were all fine. Only clicking found it.
 *
 *   node ui-test.mjs [baseUrl]        default http://127.0.0.1:8787
 *
 * Needs `npx playwright install chromium` once. Exits non-zero on any failure.
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/, "");
const QUERY = "dune";

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
}

/**
 * The assertion that caught the bug. Rendered and visible are not the same as
 * clickable: something else can be painted on top. elementFromPoint reports the
 * element that would actually receive the click at that coordinate.
 */
async function clickTargetIsClear(page, locator, label) {
  const info = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    return {
      inViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0,
      topTag: top ? `${top.tagName}.${(top.className || "").toString().split(" ")[0]}` : null,
      clear: top ? el.contains(top) || el === top : false,
      text: (el.textContent || "").trim().slice(0, 40),
    };
  });
  check(`${label} is clickable, not painted over`, info.clear,
    info.inViewport
      ? `${info.text || "element"} is covered by ${info.topTag}`
      : `${info.text || "element"} is outside the viewport (${info.topTag})`);
  return info.clear;
}

/**
 * A blocked click makes Playwright throw. Left uncaught that kills the whole run
 * and hides every later result, so each click is recorded as a failure instead
 * and the suite continues to report the rest.
 */
async function tryClick(locator, label) {
  try {
    await locator.click({ timeout: 8000 });
    return true;
  } catch (e) {
    check(`${label} accepted a click`, false, e.message.split("\n")[0]);
    return false;
  }
}

async function typeAndWait(page, term) {
  const input = page.locator('input[aria-label="Search titles"]').first();
  await input.click();
  await input.fill(term);
  // Suggestions are debounced 180ms and then hit the JustWatch API.
  await page.waitForSelector(".autocomplete-shadow ul li button", { timeout: 20000 });
  await page.waitForTimeout(400);
  return input;
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });

try {
  // ── 1. Hero autocomplete on / ───────────────────────────────────────────────
  console.log("\nHomepage: selecting a title from the autocomplete");
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
    // Let the .rise intro animations finish; they affect paint order while running.
    await page.waitForTimeout(1800);

    await typeAndWait(page, QUERY);
    const items = page.locator(".autocomplete-shadow ul li button");
    const count = await items.count();
    check("autocomplete renders suggestions", count > 0, `got ${count}`);

    // Every visible row must be clickable, not just the first.
    const visible = await items.evaluateAll((els) =>
      els.filter((e) => {
        const r = e.getBoundingClientRect();
        return r.bottom <= window.innerHeight && r.top >= 0;
      }).length);
    check("the whole suggestion list fits in the viewport", visible === count,
      `${visible} of ${count} rows reachable without scrolling the page`);

    for (let i = 0; i < Math.min(count, 3); i++) {
      await clickTargetIsClear(page, items.nth(i), `suggestion ${i + 1}`);
    }

    const before = page.url();
    await tryClick(items.first(), "a suggestion");
    await page.waitForURL("**/title/**", { timeout: 15000 }).catch(() => {});
    check("clicking a suggestion opens that title", page.url() !== before && page.url().includes("/title/"),
      `stayed at ${page.url()}`);
    check("the title page rendered its heading",
      await page.locator("h1").first().isVisible().catch(() => false));
    check("no client-side errors on / or /title", errors.length === 0, errors.slice(0, 3).join(" | "));
    await page.close();
  }

  // ── 2. "All results" footer row, and keyboard selection ─────────────────────
  console.log("\nHomepage: the all-results row and the keyboard path");
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1800);
    await typeAndWait(page, QUERY);

    const all = page.locator(".autocomplete-shadow > button").last();
    await clickTargetIsClear(page, all, '"all results" row');
    await tryClick(all, 'the "all results" row');
    await page.waitForURL("**/search?**", { timeout: 15000 }).catch(() => {});
    check('"all results" navigates to the search page', page.url().includes("/search?"),
      `landed on ${page.url()}`);
    await page.close();
  }
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1800);
    const input = await typeAndWait(page, QUERY);
    await input.press("ArrowDown");
    await input.press("ArrowDown");
    await input.press("Enter");
    await page.waitForURL("**/title/**", { timeout: 15000 }).catch(() => {});
    check("arrow keys plus Enter select the highlighted suggestion",
      page.url().includes("/title/"), `landed on ${page.url()}`);
    await page.close();
  }

  // ── 3. The search results page ──────────────────────────────────────────────
  console.log("\n/search: the results grid, the film/series filters, sorting");
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/search?q=${QUERY}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);

    const cards = page.locator('a[href^="/title/"]');
    const cardCount = await cards.count();
    check("the results grid lists titles", cardCount > 0, `got ${cardCount}`);
    if (cardCount > 0) {
      await clickTargetIsClear(page, cards.first(), "first result card");
      const href = await cards.first().getAttribute("href");
      await tryClick(cards.first(), "a result card");
      await page.waitForURL("**/title/**", { timeout: 15000 }).catch(() => {});
      check("clicking a result card opens that title", page.url().includes("/title/"),
        `expected ${href}, landed on ${page.url()}`);
    }

    await page.goto(`${BASE}/search?q=${QUERY}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1200);
    const films = page.locator('a.chip', { hasText: "Films" }).first();
    const series = page.locator('a.chip', { hasText: "Series" }).first();
    check("the Films filter is clickable", await films.isVisible().catch(() => false));
    await tryClick(films, 'the "Films" filter');
    await page.waitForTimeout(1500);
    check('selecting "Films" narrows to movies', page.url().includes("type=movie"),
      `url is ${page.url()}`);
    const filmsActive = await page.locator('a.chip[data-active="true"]').first().innerText().catch(() => "");
    check("the Films filter shows as the active one", /film/i.test(filmsActive), `active chip reads "${filmsActive}"`);

    await tryClick(series, 'the "Series" filter');
    await page.waitForTimeout(1500);
    check('selecting "Series" narrows to shows', page.url().includes("type=show"),
      `url is ${page.url()}`);

    // Sorting is client-side state, so only a real click can tell whether it works.
    const titles = page.locator('a[href^="/title/"] span.truncate');
    const beforeSort = await titles.allInnerTexts().catch(() => []);
    await tryClick(page.locator('button.chip', { hasText: "Title A–Z" }).first(), "a sort chip");
    await page.waitForTimeout(600);
    const afterSort = await titles.allInnerTexts().catch(() => []);
    check("sorting by title reorders the grid",
      afterSort.length > 1 && JSON.stringify(beforeSort) !== JSON.stringify(afterSort),
      beforeSort.length === afterSort.length ? "order unchanged" : "grid did not render");
    check("no client-side errors on /search", errors.length === 0, errors.slice(0, 3).join(" | "));
    await page.close();
  }

  // ── 4. The compact search bar, which lives in different markup ──────────────
  console.log("\n/search: the compact autocomplete is not painted over either");
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/search?q=${QUERY}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1200);
    await typeAndWait(page, "inception");
    const items = page.locator(".autocomplete-shadow ul li button");
    check("compact autocomplete renders suggestions", await items.count() > 0);
    await clickTargetIsClear(page, items.first(), "compact suggestion 1");
    const before = page.url();
    await tryClick(items.first(), "a suggestion");
    await page.waitForURL("**/title/**", { timeout: 15000 }).catch(() => {});
    check("clicking a compact suggestion opens that title", page.url() !== before && page.url().includes("/title/"),
      `stayed at ${page.url()}`);
    await page.close();
  }

  // ── 5. Mobile viewport, where the layout reflows ────────────────────────────
  console.log("\n390x844 viewport: the same selection still works");
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1800);
    await typeAndWait(page, QUERY);
    const items = page.locator(".autocomplete-shadow ul li button");
    check("suggestions render on a narrow viewport", await items.count() > 0);
    if (await items.count() > 0) {
      await clickTargetIsClear(page, items.first(), "narrow-viewport suggestion 1");
      await tryClick(items.first(), "a suggestion");
      await page.waitForURL("**/title/**", { timeout: 15000 }).catch(() => {});
      check("clicking a suggestion works on a narrow viewport", page.url().includes("/title/"),
        `stayed at ${page.url()}`);
    }
    await page.close();
  }
} catch (e) {
  // Anything unexpected still has to show up as a failure rather than a crash
  // that skips the summary.
  check("the suite ran to completion", false, String(e && e.message ? e.message : e).split("\n")[0]);
} finally {
  await browser.close();
}

console.log("\n" + "=".repeat(62));
console.log(`  ${passed} passed, ${failures.length} failed`);
console.log("=".repeat(62));
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
