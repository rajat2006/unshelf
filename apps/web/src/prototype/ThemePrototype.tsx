import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { ProgressRing } from "../trail/ProgressRing";

/**
 * THROWAWAY PROTOTYPE — Unshelf issue #55 (wayfinder:prototype).
 *
 * A theme moodboard: three radically different visual directions for the Unshelf
 * web app, each a full answer (personality, palette, type, spacing, light/dark)
 * rendered against the *real* app content — Add-item form, the All list, Stops,
 * and a slice of the Trail. Switch directions with the floating bar (or ← / →)
 * and flip light/dark per direction. Nothing is wired to the backend.
 *
 * Not production code: it has no tests, no error handling, and mocks all data.
 * Its job is to be reacted to, then thrown away (captured on this branch).
 */

type Mode = "light" | "dark";

interface Palette {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentH: string;
  onAccent: string;
  done: string;
  past: string;
  fieldBg: string;
  fieldLine: string;
  trailBg: string;
  trailGrid: string;
  radiusIn: string;
}

interface Fonts {
  display: string;
  h2: string;
  body: string;
  mono: string;
  displayWeight: number;
  displayTrack: string;
  h2Weight: number;
  h2Track: string;
  h2Transform: string;
  btnTrack: string;
  btnTransform: string;
}

interface Direction {
  key: string;
  name: string;
  persona: string;
  tags: string[];
  swatchDot: string;
  fonts: Fonts;
  typeNote: string;
  spacing: { base: string; steps: number[]; radius: number[] };
  stance: string;
  light: Palette;
  dark: Palette;
  defaultMode: Mode;
}

const DIRECTIONS: Direction[] = [
  {
    key: "A",
    name: "Reading Room",
    persona:
      "A quiet study you organise your learning in. Warm paper, ink, and a single scholarly accent — a well-set reading app, not a productivity dashboard.",
    tags: ["bookish", "warm", "calm", "editorial"],
    swatchDot: "#8A3B34",
    fonts: {
      display: '"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif',
      h2: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif',
      body: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
      mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
      displayWeight: 600,
      displayTrack: "0",
      h2Weight: 600,
      h2Track: "0",
      h2Transform: "none",
      btnTrack: "0",
      btnTransform: "none",
    },
    typeNote:
      "Display: a transitional/old-style <b>serif</b> for headings & the wordmark — ship candidate <code>Newsreader</code> or <code>Source Serif&nbsp;4</code> (one webfont). Body/UI: a humanist <b>sans</b> (system stack, no webfont). Generous 1.65 line-height, ~34rem reading measure.",
    spacing: { base: "8px base · airy", steps: [4, 8, 12, 20, 32, 52], radius: [6, 10, 14] },
    stance:
      'Light is home. Dark is a warm <b>"night reading"</b> dim — not a cold invert — so both ship, but light leads.',
    light: {
      bg: "#F4EEE1", surface: "#FCF8F0", ink: "#2A2620", muted: "#6B6353", line: "#E1D7C4",
      accent: "#8A3B34", accentH: "#6F2D28", onAccent: "#FBF6EE", done: "#4C6A47", past: "#8A6A2E",
      fieldBg: "#FFFDF8", fieldLine: "#D8CDB8",
      trailBg: "linear-gradient(150deg,#F1EADB,#E7DDC8)",
      trailGrid:
        "linear-gradient(rgba(120,100,60,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(120,100,60,0.05) 1px,transparent 1px)",
      radiusIn: "8px",
    },
    dark: {
      bg: "#201C17", surface: "#2A251E", ink: "#ECE3D3", muted: "#A79C89", line: "#3A342A",
      accent: "#E0938A", accentH: "#EBA9A1", onAccent: "#241F19", done: "#93B183", past: "#C9A85E",
      fieldBg: "#241F19", fieldLine: "#463E31",
      trailBg: "linear-gradient(150deg,#241F19,#1C1813)",
      trailGrid:
        "linear-gradient(rgba(220,200,150,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(220,200,150,0.05) 1px,transparent 1px)",
      radiusIn: "8px",
    },
    defaultMode: "light",
  },
  {
    key: "B",
    name: "Field Guide",
    persona:
      "The Trail metaphor, made literal across the whole app. Promotes the Trail canvas's own survey-chart palette (ADR-0010) up to every screen — a national-park wayfinding sign you capture into.",
    tags: ["map-like", "wayfinding", "outdoorsy", "signage"],
    swatchDot: "#356A5B",
    fonts: {
      display: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
      h2: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
      body: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
      mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
      displayWeight: 800,
      displayTrack: "0.02em",
      h2Weight: 800,
      h2Track: "0.08em",
      h2Transform: "uppercase",
      btnTrack: "0.04em",
      btnTransform: "uppercase",
    },
    typeNote:
      "Headings are <b>signage</b>: heavy, letter-spaced, uppercase — ship candidate a geometric-humanist like <code>Archivo</code>/<code>Söhne</code> (or system-ui bold, no webfont). Waypoint labels & the N/M counts use a <b>mono</b> (system stack) for the map-marker feel. Body stays a plain sans.",
    spacing: { base: "8px base · gridded", steps: [4, 8, 16, 24, 40], radius: [4, 6, 8] },
    stance:
      'Light-primary parchment. Dark is <b>"dusk on the trail"</b> — the canvas already ships a dark-ish warm ground, so both are in scope and cohere with the Trail out of the box.',
    light: {
      bg: "#EEE7D6", surface: "#FAF6EC", ink: "#35301F", muted: "#857A5F", line: "#DBD0B5",
      accent: "#A85A16", accentH: "#8F4E12", onAccent: "#FBF6EC", done: "#356A5B", past: "#9C7328",
      fieldBg: "#FFFDF6", fieldLine: "#D2C6A6",
      trailBg: "linear-gradient(155deg,#F3EFE4 0%,#ECE6D7 55%,#E3DCC9 100%)",
      trailGrid:
        "linear-gradient(rgba(120,100,60,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(120,100,60,0.06) 1px,transparent 1px)",
      radiusIn: "6px",
    },
    dark: {
      bg: "#22201A", surface: "#2B2820", ink: "#E9E1CD", muted: "#A99E82", line: "#3A362B",
      accent: "#D98B3C", accentH: "#E8A254", onAccent: "#241F18", done: "#5E9C86", past: "#C6A15A",
      fieldBg: "#242017", fieldLine: "#463F30",
      trailBg: "linear-gradient(155deg,#26231C,#1E1B15)",
      trailGrid:
        "linear-gradient(rgba(220,200,150,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(220,200,150,0.05) 1px,transparent 1px)",
      radiusIn: "6px",
    },
    defaultMode: "light",
  },
  {
    key: "C",
    name: "Quiet Focus",
    persona:
      "“Enable, don't automate” taken to its visual conclusion: a calm, near-neutral surface that gets out of the way. Modern grotesque throughout, one cool accent, low visual noise.",
    tags: ["modern", "minimal", "neutral", "dark-first"],
    swatchDot: "#4B57C4",
    fonts: {
      display: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
      h2: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
      body: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
      mono: "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace",
      displayWeight: 700,
      displayTrack: "-0.02em",
      h2Weight: 650,
      h2Track: "-0.01em",
      h2Transform: "none",
      btnTrack: "0",
      btnTransform: "none",
    },
    typeNote:
      "One <b>grotesque</b> family for everything — ship candidate <code>Inter</code>, or the native system stack for <b>zero webfont cost</b> (this direction is the cheapest to ship on the current <code>system-ui</code> base). Tight tracking on headings, tabular-nums for counts.",
    spacing: { base: "4px base · dense-airy", steps: [4, 8, 12, 16, 24, 40], radius: [6, 8, 10] },
    stance:
      "Dark is <b>first-class</b>, not an afterthought — a true dark ground, designed alongside light. Both ship as peers.",
    light: {
      bg: "#FAFAFB", surface: "#FFFFFF", ink: "#16181D", muted: "#676C76", line: "#E6E8EC",
      accent: "#4B57C4", accentH: "#3B46A8", onAccent: "#FFFFFF", done: "#1F9D63", past: "#767C88",
      fieldBg: "#FFFFFF", fieldLine: "#D9DCE2",
      trailBg: "#F4F5F7",
      trailGrid:
        "linear-gradient(rgba(20,22,30,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(20,22,30,0.04) 1px,transparent 1px)",
      radiusIn: "8px",
    },
    dark: {
      bg: "#0E0F13", surface: "#16181D", ink: "#ECEEF3", muted: "#8B909B", line: "#24272E",
      accent: "#7C88FF", accentH: "#99A2FF", onAccent: "#0E0F13", done: "#35C081", past: "#868C98",
      fieldBg: "#1A1C22", fieldLine: "#2C2F38",
      trailBg: "#121319",
      trailGrid:
        "linear-gradient(rgba(255,255,255,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.035) 1px,transparent 1px)",
      radiusIn: "8px",
    },
    defaultMode: "dark",
  },
];

const ROLES: Array<[keyof Palette, string]> = [
  ["bg", "Page"],
  ["surface", "Surface"],
  ["ink", "Text"],
  ["muted", "Muted"],
  ["line", "Hairline"],
  ["accent", "Accent"],
  ["done", "Done"],
  ["past", "Past-target"],
];

function tokensFor(dir: Direction, mode: Mode): CSSProperties {
  const p = mode === "dark" ? dir.dark : dir.light;
  const f = dir.fonts;
  const tokens: Record<string, string | number> = {
    "--bg": p.bg, "--surface": p.surface, "--ink": p.ink, "--muted": p.muted, "--line": p.line,
    "--accent": p.accent, "--accent-h": p.accentH, "--on-accent": p.onAccent, "--done": p.done, "--past": p.past,
    "--field-bg": p.fieldBg, "--field-line": p.fieldLine, "--radius-in": p.radiusIn,
    "--trail-bg": p.trailBg, "--trail-grid": p.trailGrid,
    "--font-display": f.display, "--font-h2": f.h2, "--font-body": f.body, "--font-mono": f.mono,
    "--display-weight": f.displayWeight, "--display-track": f.displayTrack,
    "--h2-weight": f.h2Weight, "--h2-track": f.h2Track, "--h2-transform": f.h2Transform,
    "--btn-track": f.btnTrack, "--btn-transform": f.btnTransform,
  };
  return tokens as CSSProperties;
}

/** Small helper: some copy carries inline <b>/<code> emphasis. Prototype-only. */
function Rich({ html, className }: { html: string; className?: string }) {
  return <p className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

function Swatches({ dir, mode }: { dir: Direction; mode: Mode }) {
  const p = mode === "dark" ? dir.dark : dir.light;
  return (
    <div className="swatches">
      {ROLES.map(([k, label]) => (
        <div className="sw" key={k}>
          <div className="sw-chip" style={{ background: p[k] }} />
          <div className="sw-meta">
            <div className="sw-role">{label}</div>
            <div className="sw-hex">{p[k].toUpperCase()}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Scale({ dir }: { dir: Direction }) {
  const s = dir.spacing;
  return (
    <>
      <p className="type-note" style={{ marginTop: 0, marginBottom: "0.7rem" }}>{s.base}</p>
      {s.steps.map((n) => (
        <div className="scale-row" key={n}>
          <div className="scale-key">{n}</div>
          <div className="scale-bar" style={{ width: `${n * 2.6}px` }} />
        </div>
      ))}
      <p className="spec-h" style={{ marginTop: "1rem" }}>Corner radius</p>
      <div className="radii">
        {s.radius.map((r) => (
          <div className="radius-chip" style={{ borderRadius: `${r}px` }} key={r}>{r}</div>
        ))}
      </div>
    </>
  );
}

function ThemedApp() {
  return (
    <div className="app">
      <div className="app-bar">
        <span className="app-word">Unshelf</span>
        <span className="app-avatar" title="Your account" />
      </div>
      <div className="app-body">
        <form onSubmit={(e) => e.preventDefault()}>
          <h2 className="h2">Add an item</h2>
          <label className="field"><span>Title</span><input className="input" placeholder="What did you find?" /></label>
          <label className="field">
            <span>Type</span>
            <select className="select" defaultValue="">
              <option value="" disabled>Choose a type…</option>
              <option>Course</option>
              <option>Book</option>
            </select>
          </label>
          <label className="field">
            <span>Source <span className="opt">(optional link)</span></span>
            <input className="input" placeholder="Paste a link, or leave blank for an offline item" />
          </label>
          <button className="btn" type="button">Add to All</button>
        </form>

        <section>
          <h2 className="h2">All</h2>
          <ul className="items">
            <li className="item">
              <div className="item-title">Refactoring UI</div>
              <div className="item-type">Book</div>
              <div className="ctl-row">
                <span className="ctl"><span className="status-dot" style={{ background: "var(--accent)" }} /><span className="cap">Status</span> In progress</span>
                <span className="ctl"><span className="cap">Target</span> 30 Jul</span>
                <span className="src offline">Offline — no link</span>
              </div>
            </li>
            <li className="item">
              <div className="item-title">CSS Grid — Wes Bos playlist</div>
              <div className="item-type">Playlist</div>
              <div className="ctl-row">
                <span className="ctl"><span className="status-dot" style={{ background: "var(--muted)" }} /><span className="cap">Status</span> Not started</span>
                <span className="ctl"><span className="cap">Target</span> 10 Jul</span>
                <span className="past">Past target</span>
                <span className="src">youtube.com/playlist?list=…</span>
              </div>
            </li>
            <li className="item">
              <div className="item-title">The Pragmatic Programmer</div>
              <div className="item-type">Book</div>
              <div className="ctl-row">
                <span className="ctl"><span className="status-dot" style={{ background: "var(--done)" }} /><span className="cap">Status</span> Done</span>
                <button className="btn ghost" type="button">Add to a stop</button>
              </div>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="h2">Stops</h2>
          <ul className="stops">
            <li className="stop"><button type="button">Build the API</button></li>
            <li className="stop"><button type="button">Learn CSS</button></li>
          </ul>
        </section>

        <section>
          <h2 className="h2">Trail</h2>
          <div className="trail">
            <div className="trail-grid" />
            <div className="waypoints">
              <div className="seg" style={{ left: "12%", width: "26%", background: "var(--done)" }} />
              <div
                className="seg"
                style={{
                  left: "62%",
                  width: "26%",
                  height: 3,
                  background: "repeating-linear-gradient(90deg,var(--muted) 0 2px,transparent 2px 10px)",
                }}
              />
              <div className="wp">
                <div className="wp-eyebrow" />
                <div className="seal" title="4 of 4 done" />
                <div className="wp-name done">Foundations</div>
              </div>
              <div className="wp">
                <div className="wp-eyebrow">You are here</div>
                <div className="medallion underway" title="2 of 5 done">
                  <ProgressRing
                    size={46}
                    stroke={5}
                    progress={0.4}
                    track="var(--line)"
                    fill="var(--accent)"
                    center={<span className="ring-num">2/5</span>}
                  />
                </div>
                <div className="wp-name">Build the API</div>
              </div>
              <div className="wp">
                <div className="wp-eyebrow" />
                <div className="medallion hollow" title="0 of 3 done">
                  <ProgressRing
                    size={46}
                    stroke={5}
                    progress={0}
                    track="var(--line)"
                    fill="var(--muted)"
                    center={<span className="ring-num">0/3</span>}
                  />
                </div>
                <div className="wp-name">Ship it</div>
              </div>
            </div>
            <Rich
              className="trail-caption"
              html='<b class="pine">Pine = completed</b> (and ground you’ve covered); <b class="ochre">accent = where you are now</b>. Sequence runs left → next, forks branch in parallel.'
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Board({ dir, mode }: { dir: Direction; mode: Mode }) {
  return (
    <article className="board" style={tokensFor(dir, mode)}>
      <header className="board-hero">
        <div className="board-kicker">Direction {dir.key}</div>
        <h2 className="board-name">{dir.name}</h2>
        <p className="board-persona">{dir.persona}</p>
        <div className="board-tags">
          {dir.tags.map((t) => <span className="board-tag" key={t}>{t}</span>)}
        </div>
      </header>

      <div className="grid two">
        <div>
          <p className="spec-h">Palette · {mode}</p>
          <Swatches dir={dir} mode={mode} />
          <p className="spec-h" style={{ marginTop: "1.5rem" }}>Spacing scale</p>
          <Scale dir={dir} />
        </div>
        <div className="spec-type">
          <p className="spec-h">Type</p>
          <h2 className="t-big">Unshelf</h2>
          <div className="t-h2">Add an item</div>
          <p className="t-body">
            Paste a link or type a title. Everything you capture lands in <em>All</em>, then you pull it
            onto the Trail when you're ready.
          </p>
          <div className="t-row">
            <span className="t-cap">Status · Not started</span>
            <span className="t-cap">Past target</span>
            <span className="t-num">2 / 5 done</span>
          </div>
          <Rich className="type-note" html={dir.typeNote} />
          <Rich className="stance" html={`Light &amp; dark — ${dir.stance}`} />
        </div>
      </div>

      <div className="grid">
        <div>
          <p className="spec-h">The app, themed</p>
          <ThemedApp />
        </div>
      </div>
    </article>
  );
}

function readVariant(): number {
  const key = new URLSearchParams(window.location.search).get("variant");
  const i = DIRECTIONS.findIndex((d) => d.key === key);
  return i >= 0 ? i : 0;
}

export function ThemePrototype() {
  const [current, setCurrent] = useState<number>(readVariant);
  const [modes, setModes] = useState<Mode[]>(DIRECTIONS.map((d) => d.defaultMode));

  const go = useCallback((i: number) => {
    const next = (i + DIRECTIONS.length) % DIRECTIONS.length;
    setCurrent(next);
    const params = new URLSearchParams(window.location.search);
    params.set("variant", DIRECTIONS[next].key);
    window.history.replaceState(null, "", `?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const toggleMode = useCallback(() => {
    setModes((prev) => prev.map((m, i) => (i === current ? (m === "dark" ? "light" : "dark") : m)));
  }, [current]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") go(current - 1);
      if (e.key === "ArrowRight") go(current + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, go]);

  const dir = DIRECTIONS[current];
  const mode = modes[current];

  return (
    <>
      <style>{CSS}</style>

      <div className="g-head">
        <p className="g-eyebrow">Unshelf · Issue #55 · wayfinder:prototype</p>
        <h1 className="g-title">Three theme directions to react to</h1>
        <p className="g-sub">
          Each direction is a full answer — personality, palette, type pairing, spacing, and a
          light/dark stance — shown against the <em>real</em> Unshelf app: the Add-item form, the All
          list, Stops, and a slice of the Trail. Flip between directions and toggle light/dark from the
          bar at the bottom (or use <b>←</b> / <b>→</b>). Pick one, or steal parts across them.
        </p>
      </div>

      <div className="g-legend" role="tablist" aria-label="Theme directions">
        {DIRECTIONS.map((d, i) => (
          <button
            key={d.key}
            className="g-tab"
            role="tab"
            aria-selected={i === current}
            onClick={() => go(i)}
          >
            <span className="g-dot" style={{ background: d.swatchDot }} />
            <b>{d.key}</b> {d.name}
          </button>
        ))}
      </div>

      <main className="stage">
        <Board dir={dir} mode={mode} />
      </main>

      <div className="foot">
        Throwaway moodboard for <b>Unshelf</b> issue&nbsp;#55 (theme direction). Type is shown via robust
        system font stacks — the "ship candidate" faces named per direction are the real recommendation.
        Colours are the actual proposed tokens. Nothing here is wired to the backend; it is a swatch to
        react to, not production code.
      </div>

      <div className="g-bar" role="group" aria-label="Prototype switcher">
        <button className="g-arrow" aria-label="Previous direction" onClick={() => go(current - 1)}>‹</button>
        <div className="g-label"><b>{dir.key}</b> — {dir.name}</div>
        <button className="g-arrow" aria-label="Next direction" onClick={() => go(current + 1)}>›</button>
        <div className="g-sep" />
        <button className="g-mode" aria-label="Toggle light or dark" onClick={toggleMode}>
          {mode === "dark" ? "☾ Dark" : "☀ Light"}
        </button>
      </div>
    </>
  );
}

const CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #ececee; color: #1c1d21; font-family: system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; -webkit-font-smoothing: antialiased; }
  @media (prefers-color-scheme: dark) { body { background: #101114; color: #e9eaef; } }

  .g-head { max-width: 62rem; margin: 0 auto; padding: 2rem 1.25rem 0.5rem; }
  .g-eyebrow { font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: #7b7d86; font-weight: 700; margin: 0 0 0.5rem; }
  .g-title { font-size: clamp(1.5rem, 4vw, 2.1rem); margin: 0 0 0.4rem; letter-spacing: -0.01em; text-wrap: balance; }
  .g-sub { color: #6c6e77; margin: 0; max-width: 44rem; line-height: 1.55; font-size: 0.98rem; }
  @media (prefers-color-scheme: dark) { .g-sub { color: #9a9ca6; } }

  .g-legend { max-width: 62rem; margin: 1rem auto 0; padding: 0 1.25rem; display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .g-tab { display: inline-flex; align-items: center; gap: 0.5rem; background: #fff; border: 1px solid #d7d8dc; color: #1c1d21; border-radius: 999px; padding: 0.4rem 0.85rem; font-size: 0.85rem; cursor: pointer; font-family: inherit; }
  @media (prefers-color-scheme: dark) { .g-tab { background: #202127; border-color: #292a30; color: #e9eaef; } }
  .g-tab b { font-size: 0.78rem; letter-spacing: 0.08em; }
  .g-tab[aria-selected="true"] { border-color: #3b46a8; box-shadow: inset 0 0 0 1px #3b46a8; }
  @media (prefers-color-scheme: dark) { .g-tab[aria-selected="true"] { border-color: #8b95ff; box-shadow: inset 0 0 0 1px #8b95ff; } }
  .g-tab .g-dot { width: 0.6rem; height: 0.6rem; border-radius: 50%; }

  .stage { max-width: 62rem; margin: 1.25rem auto 1.5rem; padding: 0 1.25rem; }

  .g-bar { position: fixed; left: 50%; bottom: 1.1rem; transform: translateX(-50%); display: flex; align-items: center; gap: 0.35rem; z-index: 60; background: rgba(20,21,26,0.92); color: #fff; border-radius: 999px; padding: 0.35rem 0.4rem; box-shadow: 0 10px 30px rgba(0,0,0,0.35); backdrop-filter: blur(6px); border: 1px solid rgba(255,255,255,0.1); }
  .g-arrow, .g-mode { appearance: none; border: none; cursor: pointer; color: #fff; font: inherit; background: rgba(255,255,255,0.1); border-radius: 999px; height: 2rem; display: inline-flex; align-items: center; justify-content: center; }
  .g-arrow { width: 2rem; font-size: 1rem; }
  .g-arrow:hover, .g-mode:hover { background: rgba(255,255,255,0.22); }
  .g-label { min-width: 11.5rem; text-align: center; font-size: 0.86rem; padding: 0 0.4rem; }
  .g-label b { letter-spacing: 0.06em; }
  .g-mode { padding: 0 0.85rem; gap: 0.4rem; font-size: 0.82rem; }
  .g-sep { width: 1px; height: 1.4rem; background: rgba(255,255,255,0.18); margin: 0 0.15rem; }

  .board { background: var(--bg); color: var(--ink); border-radius: 14px; border: 1px solid var(--line); overflow: hidden; font-family: var(--font-body); box-shadow: 0 1px 0 rgba(0,0,0,0.04), 0 18px 40px -24px rgba(0,0,0,0.35); }
  .board-hero { padding: clamp(1.25rem, 3.5vw, 2.25rem); display: grid; gap: 0.5rem; border-bottom: 1px solid var(--line); background: var(--surface); }
  .board-kicker { font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
  .board-name { font-family: var(--font-display); font-size: clamp(1.7rem, 5vw, 2.7rem); margin: 0; color: var(--ink); font-weight: var(--display-weight); letter-spacing: var(--display-track); line-height: 1.05; text-wrap: balance; }
  .board-persona { margin: 0.15rem 0 0; color: var(--muted); font-size: 1.02rem; line-height: 1.5; max-width: 40rem; }
  .board-tags { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.6rem; }
  .board-tag { font-size: 0.72rem; letter-spacing: 0.05em; padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); background: var(--bg); }

  .grid { padding: clamp(1.1rem, 3vw, 2rem); display: grid; gap: clamp(1.25rem, 3vw, 2rem); }
  @media (min-width: 52rem) { .grid.two { grid-template-columns: 1fr 1fr; } }

  .spec-h { font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); font-weight: 700; margin: 0 0 0.75rem; }

  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(6.2rem, 1fr)); gap: 0.55rem; }
  .sw { border-radius: 9px; overflow: hidden; border: 1px solid var(--line); background: var(--surface); }
  .sw-chip { height: 3.1rem; }
  .sw-meta { padding: 0.4rem 0.5rem 0.5rem; }
  .sw-role { font-size: 0.74rem; color: var(--ink); font-weight: 600; }
  .sw-hex { font-size: 0.68rem; color: var(--muted); font-family: var(--font-mono); letter-spacing: 0.02em; }

  .spec-type .t-big { font-family: var(--font-display); font-size: clamp(2rem, 6vw, 3rem); margin: 0; color: var(--ink); font-weight: var(--display-weight); letter-spacing: var(--display-track); line-height: 1.02; }
  .spec-type .t-h2 { font-family: var(--font-h2); font-size: 1.2rem; margin: 0.9rem 0 0; color: var(--ink); font-weight: var(--h2-weight); letter-spacing: var(--h2-track); text-transform: var(--h2-transform); }
  .spec-type .t-body { margin: 0.55rem 0 0; color: var(--ink); line-height: 1.65; max-width: 34rem; }
  .spec-type .t-row { margin-top: 0.7rem; display: flex; flex-wrap: wrap; gap: 0.6rem 1.2rem; align-items: baseline; }
  .spec-type .t-cap { font-size: 0.82rem; color: var(--muted); }
  .spec-type .t-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--accent); font-weight: 700; }
  .type-note { margin: 0.85rem 0 0; font-size: 0.8rem; color: var(--muted); line-height: 1.5; }
  .type-note code, .stance code { font-family: var(--font-mono); font-size: 0.92em; background: var(--bg); padding: 0.05rem 0.3rem; border-radius: 4px; border: 1px solid var(--line); }

  .scale-row { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 0.4rem; }
  .scale-key { width: 2.6rem; font-family: var(--font-mono); font-size: 0.72rem; color: var(--muted); text-align: right; }
  .scale-bar { height: 0.85rem; border-radius: 3px; background: var(--accent); opacity: 0.85; }
  .radii { display: flex; gap: 0.6rem; margin-top: 0.9rem; flex-wrap: wrap; }
  .radius-chip { width: 3rem; height: 3rem; background: var(--surface); border: 1px solid var(--accent); display: flex; align-items: flex-end; justify-content: center; font-size: 0.62rem; color: var(--muted); padding-bottom: 0.2rem; }

  .app { background: var(--bg); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
  .app-bar { display: flex; align-items: center; justify-content: space-between; padding: 0.9rem 1.1rem; border-bottom: 1px solid var(--line); background: var(--surface); }
  .app-word { font-family: var(--font-display); font-weight: var(--display-weight); font-size: 1.35rem; color: var(--ink); letter-spacing: var(--display-track); }
  .app-avatar { width: 2rem; height: 2rem; border-radius: 50%; background: linear-gradient(135deg, var(--accent), var(--done)); }
  .app-body { padding: 1.1rem; display: grid; gap: 1.6rem; }

  .h2 { font-family: var(--font-h2); font-size: 1.12rem; margin: 0 0 0.75rem; color: var(--ink); font-weight: var(--h2-weight); letter-spacing: var(--h2-track); text-transform: var(--h2-transform); }

  .field { display: grid; gap: 0.3rem; margin-bottom: 0.75rem; }
  .field > span { font-size: 0.85rem; color: var(--ink); }
  .field .opt { color: var(--muted); }
  .input, .select { font: inherit; font-size: 0.95rem; padding: 0.6rem 0.7rem; width: 100%; background: var(--field-bg); color: var(--ink); border: 1px solid var(--field-line); border-radius: var(--radius-in); }
  .input::placeholder { color: var(--muted); opacity: 0.85; }
  .btn { font: inherit; font-weight: 600; font-size: 0.95rem; cursor: pointer; padding: 0.62rem 1.1rem; border-radius: var(--radius-in); border: 1px solid transparent; background: var(--accent); color: var(--on-accent); justify-self: start; letter-spacing: var(--btn-track); text-transform: var(--btn-transform); }
  .btn:hover { background: var(--accent-h); }
  .btn.ghost { background: transparent; color: var(--accent); border-color: var(--field-line); }

  .items { list-style: none; margin: 0; padding: 0; }
  .item { padding: 0.85rem 0; border-top: 1px solid var(--line); display: grid; gap: 0.45rem; }
  .item:first-child { border-top: none; }
  .item-title { font-weight: 650; color: var(--ink); overflow-wrap: anywhere; }
  .item-type { font-size: 0.82rem; color: var(--muted); }
  .ctl-row { display: flex; flex-wrap: wrap; gap: 0.5rem 0.75rem; align-items: center; }
  .ctl { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; padding: 0.4rem 0.6rem; border-radius: var(--radius-in); background: var(--field-bg); border: 1px solid var(--field-line); color: var(--ink); }
  .ctl .cap { color: var(--muted); }
  .status-dot { width: 0.62rem; height: 0.62rem; border-radius: 50%; }
  .past { font-size: 0.82rem; color: var(--past); opacity: 0.9; }
  .src { font-size: 0.82rem; color: var(--accent); overflow-wrap: anywhere; }
  .src.offline { color: var(--muted); }

  .stops { list-style: none; margin: 0; padding: 0; }
  .stop { border-top: 1px solid var(--line); }
  .stop:first-child { border-top: none; }
  .stop button { width: 100%; text-align: left; background: none; border: none; font: inherit; font-weight: 650; color: var(--ink); padding: 0.8rem 0; cursor: pointer; }

  .trail { margin-top: 0.5rem; border-radius: 12px; padding: 1.4rem 1rem 1.1rem; background: var(--trail-bg); border: 1px solid var(--line); position: relative; overflow: hidden; }
  .trail-grid { position: absolute; inset: 0; background-image: var(--trail-grid); background-size: 26px 26px; pointer-events: none; }
  .waypoints { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 0.25rem; }
  .wp { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; width: 5.5rem; text-align: center; z-index: 2; }
  .wp-eyebrow { font-size: 0.56rem; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--past); height: 0.8rem; }
  .medallion { width: 3.4rem; height: 3.4rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .medallion.hollow { background: var(--surface); box-shadow: inset 0 0 0 1px var(--line); }
  .medallion.underway { background: var(--surface); box-shadow: inset 0 0 0 1.5px var(--accent); }
  .seal { width: 3.4rem; height: 3.4rem; border-radius: 50%; background: linear-gradient(160deg, var(--done), color-mix(in srgb, var(--done) 78%, #000)); box-shadow: 0 1px 3px rgba(0,0,0,0.3), inset 0 0 0 3px color-mix(in srgb, #fff 22%, transparent), inset 0 0 0 5px color-mix(in srgb, #000 14%, transparent); }
  .ring-num { font-size: 0.7rem; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
  .wp-name { font-size: 0.72rem; font-weight: 650; color: var(--ink); line-height: 1.15; }
  .wp-name.done { color: var(--done); }
  .seg { position: absolute; top: calc(0.8rem + 1.7rem - 2px); height: 4px; border-radius: 4px; z-index: 1; }
  .trail-caption { position: relative; margin: 0.9rem 0 0; font-size: 0.76rem; color: var(--muted); line-height: 1.5; }
  .trail-caption b.pine { color: var(--done); }
  .trail-caption b.ochre { color: var(--past); }

  .stance { margin-top: 1rem; padding: 0.85rem 1rem; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); font-size: 0.85rem; color: var(--ink); line-height: 1.55; }
  .stance b { color: var(--accent); }

  .foot { max-width: 62rem; margin: 0 auto; padding: 0 1.25rem 7rem; color: #7b7d86; font-size: 0.8rem; line-height: 1.6; }
`;
