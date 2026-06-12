# Modernize Svelte + Major Usability Pass (missionnaire.net)

## Goal & delivery

**Single PR, fully autonomous run.** All work (Part 1 runes migration + Part 2 UI/UX + i18n) lands on one branch (`svelte5-ui-overhaul`) as a series of logical commits, ending with one PR opened via `gh pr create` for the user to review in the morning. **Do not stop until every task in this plan is finished and verified** — work through build errors, test failures, and migration fallout autonomously; the only acceptable stopping point is the opened PR with all phases complete and the verification checklist passed. Intermediate "PR each" notes in Part 1 mean *commits*, not separate PRs.

## Context

The site already depends on **Svelte 5.55.1 (latest)** but all ~74 components run in legacy compatibility mode (Svelte 3/4 syntax: `export let` ×46 files, `$:` ×38, `on:click` ×40). The user wants (1) a full migration to modern Svelte 5 runes syntax, and (2) a usability overhaul for non-technical users covering feedback/error states, navigation & discovery, mobile touch comfort, accessibility, and a FR/EN language toggle (the site is ~95% hardcoded French; a homegrown i18n store at `src/i18n.ts` exists but is dead code).

**Order matters:** runes migration lands first so all new UI components are born in runes syntax. UI work follows, with i18n core early so new components use `$t()` from day one.

Verified facts that shape this plan:
- No `$$props`/`$$restProps`/named slots/`<svelte:component>` anywhere — migration is mostly mechanical.
- `flowbite-svelte` is imported in exactly 1 file (`+tableAudioList.svelte`, dead placeholder pagination) → remove the dep, don't upgrade it.
- `svelte-icons-pack` v2 (28 files) + `iconsax-svelte` alpha are Svelte-4-era → keep them; never set `runes: true` globally (it would force-compile node_modules); use `dynamicCompileOptions` to enforce runes for app code only.
- Feedback states are ~60% done already (musique/predications/videos/transcriptions have skeletons, retry cards, "Affichage X sur Z"). Gaps: `/live/rediffusions`, `+error.svelte`, search-result headings, jump-to-page, and the skeleton/error markup is copy-pasted per page.
- All four list APIs already support `?search=`/`?q=` → unified search endpoint is cheap.

---

## Part 1 — Svelte 5 runes migration

Branch: `svelte5-runes-migration`. Baseline first: `npm run check` (record error count), `npm run build`, `npm test`, `npm run lint`.

### 1.1 Remove flowbite blocker
- Rewrite `src/lib/components/+tableAudioList.svelte`: drop the flowbite `Pagination` import + dead `alert()` prev/next block + ~40 lines of commented-out markup (reuse local `src/lib/components/Pagination.svelte` if pagination is needed).
- `npm uninstall flowbite-svelte`. Verify `routes/musique/[slug]/+page.svelte` (sole consumer) renders.

### 1.2 Automigration
- `npx sv migrate svelte-5`, commit raw output immediately.
- **Revert the two players** to legacy for hand-migration later: `git checkout HEAD~1 -- src/lib/components/+audioPlayer.svelte src/lib/components/+liveRadioPlayer.svelte` (mixed mode is fully supported).
- Fix fallout: `npm run check && npm run build && npm test`; resolve every `@migration-task` comment.

### 1.3 Manual cleanups (leaf-first)
- **Dispatcher → callback props** (5 components): `+headerMenuLink.svelte` (`ontoggle`/`onclose` → consumers in `+navBar.svelte:143-144`), `+headerMenuLinkMobo.svelte`, `+songVideoCard.svelte` (`onplayPlaylist` → `routes/musique/videos/+page.svelte:407`), `SyncedLyrics.svelte` (`onseek` → `+liveTranscript.svelte` ×2, `+audioPlayer.svelte:2494`), `+thumbnailVideo.svelte` (dead `selectedVideo` event — delete).
- **Purge `svelte/legacy`**: move `e.stopPropagation()` (34 sites) / `preventDefault` (6) into handlers; convert each `run()` to `$effect`/`$effect.pre` deliberately. Guard-pattern blocks (e.g. `routes/musique/+page.svelte:362` request-key chains) need `untrack()` for bookkeeping writes.
- **Stores stay as-is**: keep `svelte/store` writables in `src/lib/stores/*` — `$store` syntax works identically in runes components; converting to rune classes is out of scope (playback-persistence regression risk).
- Order: leaf components → table items/cards → nav + layouts → route pages (`musique`, `predications`, `transcriptions` last — effectful `$:` chains).

### 1.4 Hand-migrate the two players (one PR each)
- `+liveRadioPlayer.svelte` first (1,352 lines, 11 `$:`): lines 138–165 pure → `$derived`; line 148 store write → `$effect`; reconnect/DVR logic is in functions/timers, migrates cleanly. Test against real stream.
- `+audioPlayer.svelte` last (3,599 lines, 28 `$:`). Known hazards: line 963 `audioSrc` reactive-ordering hack (guard same-src reload explicitly in the `$effect`), line 1304 listener-rebinding identity check, line 2252 media-session block, line 1430 `$isPlaying !== undefined` dependency-forcing idiom (rewrite intent, don't transliterate). Convert in passes: `$state` locals → pure `$derived` → one `$effect` at a time with smoke tests between.

### 1.5 Enforce runes for app code only
```js
// svelte.config.js
vitePlugin: {
  dynamicCompileOptions({ filename }) {
    if (!filename.includes('node_modules')) return { runes: true };
  }
}
```

### Dependency decisions
| Dep | Decision |
|---|---|
| flowbite-svelte | Remove (1.1) |
| svelte-icons-pack v2, iconsax-svelte | Keep; v3/replacement is a follow-up codemod PR |
| @tanstack/svelte-query 5 | Keep (store API fine under runes) |
| eslint 8 → 9 flat config + eslint-plugin-svelte 3 | Follow-up PR right after migration (plugin 2.46 lints runes poorly) |
| tailwind 4, vite 7, vitest 3, `$app/stores`→`$app/state` | Explicitly deferred — unrelated churn |

---

## Part 2 — UI/UX + i18n (after migration lands; all new code in runes)

### 2.1 i18n core (first — gates everything)
**Decision: extend the homegrown store in `src/i18n.ts`; no library.** Scope is ~150–250 UI-chrome keys; paraglide/sveltekit-i18n add compile pipelines or async loading for no benefit here. **Cookie-based toggle, no `/en/` routes**: SSR always renders FR (keeps SEO + service-worker cache simple — cached HTML is always FR, EN applies after hydration).
- Rewrite `src/i18n.ts`: `locale` writable default `'fr'`; typed keys (`keyof typeof fr`, `en.ts` as `Record<TranslationKey, string>` so missing keys fail svelte-check); `t` derived with `{placeholder}` interpolation; `setLocale()` writes cookie `mn_locale` + localStorage + `document.documentElement.lang`. Init from cookie in `+layout.svelte` onMount.
- Populate `src/translations/fr.ts` / `en.ts` with namespaced keys (`nav.*`, `player.*`, `list.*`, `errors.*`, `forms.*`, `search.*`, `pagination.*`). FR values = current hardcoded strings.
- FR/EN picker in `+navBar.svelte` (desktop) + mobile menu/MoreSheet; delete dead `langSwitch`/`showDropContents`/`dict.set` code.
- Surface `english_title`: picker links to "Prédications en anglais" (`/predications?language=english` — already supported by `api/sermons`).
- String-migration sweep happens **last** (2.7) so it covers all new components.

### 2.2 Feedback & error-state gaps
- New shared runes components, replacing per-page copy-paste in `/musique`, `/predications`, `/videos`, `/transcriptions`:
  - `src/lib/components/ListSkeleton.svelte` (reuse `skeleton-shimmer` classes in `app.css:237-270`; delete unused `+tableLoadingSkeltoon.svelte`)
  - `src/lib/components/ErrorCard.svelte` (`message`, `onRetry`)
  - `src/lib/components/ResultsSummary.svelte` — "Affichage X–Y sur Z" + "{n} résultats pour «{q}»", `aria-live="polite"`
- `/live/rediffusions/+page.svelte`: add skeleton + ErrorCard + empty state (currently just a pulsing label, line ~462).
- `src/routes/+error.svelte`: branded card (cream/orange, Cormorant), 404 vs 5xx copy, Réessayer + Retour à l'accueil + section quick links.
- `Pagination.svelte`: jump-to-page native `<select>` when pages > 7; mobile buttons `h-9` → `h-11`.

### 2.3 Accessibility
- New `src/lib/actions/focusTrap.ts` (trap Tab, Escape callback, restore focus). Apply to: mobile nav overlay, live thumbnail dialog (`+liveRadioPlayer.svelte:1240`), audioPlayer drawers/popovers, new MoreSheet + GlobalSearch.
- Alt text: `galerie/+page.svelte:70` (from image metadata), rediffusions thumbnails (`alt={recording.title}`), `+videoView.svelte:38` (`alt={$selectedVideo?.title}`); make `alt` a required prop on `BlurUpImage.svelte`.
- aria-labels on icon buttons: `+videoView.svelte:71` play, `SermonTableItem` PDF/play, `+audioTableItem` ×3, musique shuffle (line 1370).
- `role="alert"` on `questions/ask/+page.svelte:128` error / `role="status"` on success; download-error toasts.
- Scrubbers: `+liveRadioPlayer.svelte:1121` add `aria-valuetext` (reuse `behindLiveLabel`); `+audioPlayer.svelte:2516` progress div → `role="slider"` + aria-value* + `tabindex="0"` + arrow-key seek (seek fns exist at 1503/1511).

### 2.4 Mobile & touch comfort (≥44px)
- `SermonTableItem` / `+audioTableItem` action buttons (currently 32–40px) → `min-w-11 min-h-11`.
- `+liveRadioPlayer.svelte` "Revenir au direct" (~30px tall) → `min-h-11`; enlarge `.live-scrubber` thumb hit area on touch.
- `+audioPlayer.svelte` progress hit zone `h-8` → `h-11` on touch; verify close/lyrics/share buttons.

### 2.5 Navigation & discovery
- Breadcrumbs (`+breadcrumbs.svelte`, exists): add to `questions/[slug]`, `live/rediffusions/[id]`, `musique/videos`, `documents`, `literature`, `william-branham/biographie`.
- `/predications`: promote the existing `filterType` / "Retransmissions" chip (line 94) to explicit tabs with counts + "Retransmission" badge on blended rows (`RetransmissionTableItem.svelte`).
- New `src/lib/components/MoreSheet.svelte` (portaled via `src/lib/actions/portal.ts`): bottom-nav Menu tab opens a proper sheet (Questions, Galerie, Documents, Littérature, L'église, À propos + language toggle) instead of dispatching `missionnaire:toggle-mobile-nav`. Items derived from `NavigationLinkList.ts`.

### 2.6 Global search (largest new surface, last)
- New `src/routes/api/search/+server.ts`: `q` → query sermons/music/transcriptions/recordings repos directly (reuse repo functions in `src/middleware/repository/` + `src/lib/server/recordings.ts`), limit 5/group.
- New `src/lib/components/GlobalSearch.svelte` in navBar: desktop inline expand, mobile full-screen overlay; 300ms debounce (`src/utils/debounce.ts`); grouped results; "Voir tous les résultats" → `/predications?search=q` etc.; focusTrap + Escape + arrow keys.

### 2.7 i18n string sweep
Migrate hardcoded chrome strings to `$t()`: navBar, `NavigationLinkList.ts` (menuName → key), bottomNav, footer, Pagination, both players (control labels), table items, list-page filter/sort/empty/error strings, questions/ask, +error, breadcrumbs. Fix stray English: "views" (`+videoView.svelte:98`), "Play" (`+audioTableItem.svelte:143`).

---

## Verification

Automated after each phase: `npm run check` (0 new errors vs baseline), `npm run build`, `npm test`, `npm run lint`, `npm run preview`.

Manual browser smoke (the real safety net — no e2e in repo):
1. **Live radio**: play/pause, mute, DVR rewind → "Revenir au direct", network-drop reconnect, transcript sync, thumbnail dialog (Tab trapped, Escape closes, focus restored).
2. **Audio player**: play from musique, next/prev/shuffle/repeat, sleep timer, lyrics + seek-from-lyrics, lock-screen media session, reload mid-playback → resume.
3. **/musique**: search "gloire" → "N résultats pour «gloire»"; filters → skeletons; devtools-offline → ErrorCard → Réessayer recovers; pagination jump; `?play=` deep link.
4. **/predications**: tabs + badges, filters, pagination, [slug] playback; buttons ≥44px in touch emulation.
5. **Navigation**: desktop dropdown, mobile menu, bottom nav + MoreSheet (one-tap reach to Questions/Galerie/Documents), breadcrumbs on detail pages.
6. **Header search**: "amour" → grouped results; Escape restores focus; "Voir tous" lands with search prefilled; mobile overlay works.
7. **i18n**: toggle EN → chrome flips, content stays; reload → persists (brief FR flash from SW-cached HTML is expected); `<html lang>` correct; 404 page in EN.
8. **/questions/ask**: invalid submit → screen reader announces error.
9. **PWA**: install, update banner, offline indicator still work post-migration.

---

## Part 3 — Post-overhaul polish & resilience (added mid-run by user)

### 3.1 Visual polish
Cleaner look on /musique, /live, /predications and other main pages, designed for visitors with little web experience: clearer hierarchy, less visual noise, larger readable controls.

### 3.2 Background-playback resilience
Music sometimes stops (screen lock / app backgrounded) and the listener must open the phone to resume. Fix: synchronous ended→next playback (no awaits before play()), recover from OS interruptions (auto-resume when pause wasn't user-initiated and userWantsToPlay), media-session handler audit, preload=auto for the selected track.

### 3.3 Vercel cost safety + faster music loading
No deployment may spike function invocations or DB queries: cache headers (s-maxage + stale-while-revalidate) on hot read-only endpoints (/api/search etc.), verify polling/debounce budgets unchanged. Music loads faster from device storage: service-worker audio cache + next-track prefetch tuning.

### Continuity
If an API usage limit interrupts the run, resume automatically when the limit window resets and continue until the PR is open.
