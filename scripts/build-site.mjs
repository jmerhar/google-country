#!/usr/bin/env node
/**
 * Build the GitHub Pages site into site-dist/: a promotional landing page plus privacy and support
 * pages that the Chrome Web Store listing can link to. The privacy page is rendered from the
 * canonical PRIVACY.md so the two never drift. Store artwork from store/ is reused for the icon,
 * screenshot, and social image.
 *
 * The release workflow's crx + updates.xml are added into the deployed site separately (see
 * .github/workflows/pages.yml), so the crx auto-update URL stays stable.
 *
 * Usage: node scripts/build-site.mjs   → site-dist/
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "site-dist");
const REPO = "https://github.com/jmerhar/google-country";
const STORE = "https://chromewebstore.google.com/detail/bhdgkkgclnmbbgaejncimldlfebalada";

/* ------------------------- tiny markdown → HTML ------------------------- */

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[^"=/])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2">$2</a>')
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function mdToHtml(md) {
  const out = [];
  let para = [];
  let list = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (list.length) { out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`); list = []; } };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    if (/^#\s+/.test(line)) { flushPara(); flushList(); out.push(`<h1>${inline(line.replace(/^#\s+/, ""))}</h1>`); }
    else if (/^##\s+/.test(line)) { flushPara(); flushList(); out.push(`<h2>${inline(line.replace(/^##\s+/, ""))}</h2>`); }
    else if (/^-\s+/.test(line)) { flushPara(); list.push(line.replace(/^-\s+/, "")); }
    else if (line === "") { flushPara(); flushList(); }
    else { flushList(); para.push(line); }
  }
  flushPara(); flushList();
  return out.join("\n");
}

/* ------------------------------- templates ------------------------------ */

const page = (title, description, body, { active = "" } = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="assets/marquee.jpg">
<meta property="og:type" content="website">
<link rel="icon" href="assets/icon.png">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="nav">
  <a class="brand" href="index.html"><img src="assets/icon.png" width="28" height="28" alt=""> Google Country Override</a>
  <nav>
    <a href="index.html"${active === "home" ? ' class="on"' : ""}>Home</a>
    <a href="support.html"${active === "support" ? ' class="on"' : ""}>Support</a>
    <a href="privacy.html"${active === "privacy" ? ' class="on"' : ""}>Privacy</a>
    <a href="${REPO}">GitHub</a>
  </nav>
</header>
<main>${body}</main>
<footer>
  <p>Google Country Override is an independent open-source project and is not affiliated with Google.</p>
  <p><a href="${STORE}">Chrome Web Store</a> · <a href="${REPO}">Source</a> · <a href="privacy.html">Privacy</a> · <a href="support.html">Support</a> · GPL-3.0-or-later</p>
</footer>
</body>
</html>`;

const landing = () => `
<section class="hero">
  <img class="hero-icon" src="assets/icon.png" width="96" height="96" alt="Google Country Override icon">
  <h1>Search Google from any country</h1>
  <p class="tag">See results the way they look abroad — while keeping them in your own language.</p>
  <div class="cta">
    <a class="btn primary" href="${STORE}">Add to Chrome</a>
    <a class="btn" href="${REPO}/releases/latest">Download (.zip / .crx)</a>
  </div>
</section>
<section class="shot"><img src="assets/screenshot.png" alt="The country dropdown open on a Google results page"></section>
<section class="features">
  <div><h3>Any country</h3><p>Pick from the full country list and your search re-runs as if you were there.</p></div>
  <div><h3>Language stays put</h3><p>Changing country never flips the page into another language.</p></div>
  <div><h3>Sticky</h3><p>Your choice carries across every search until you change it or pick “Auto”.</p></div>
  <div><h3>Favourites</h3><p>Star the countries you use most and keep them pinned to the top.</p></div>
  <div><h3>Strict mode</h3><p>Optionally restrict results to pages from the selected country.</p></div>
  <div><h3>Private</h3><p>No account, no tracking — nothing leaves your browser.</p></div>
</section>`;

const support = () => `
<article class="doc">
<h1>Support</h1>
<h2>Using the extension</h2>
<ul>
  <li>Open Google and run any search. A country pill appears in the bottom-right corner of the results.</li>
  <li>Click it, then pick a country — the search re-runs from there. Your language is unchanged.</li>
  <li>Click the star next to a country to pin it as a favourite.</li>
  <li>Turn on <strong>Strict</strong> to restrict results to pages from that country.</li>
  <li>Pick <strong>Auto (my location)</strong> to stop overriding and return to normal.</li>
</ul>
<h2>Does it change my language?</h2>
<p>No. The extension pins your interface language, so switching country keeps results in your language.</p>
<h2>Android / Kiwi Browser</h2>
<p>The extension also runs in Kiwi Browser on Android. If your build doesn't support the background
service worker, the country still applies via a fallback (one brief redirect per search).</p>
<h2>Something not working?</h2>
<p>Please open an issue at <a href="${REPO}/issues">${REPO}/issues</a>.</p>
</article>`;

/* --------------------------------- build -------------------------------- */

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "assets"), { recursive: true });
for (const f of ["icon.png", "screenshot.png", "marquee.jpg"]) {
  cpSync(join(ROOT, "store", f), join(OUT, "assets", f));
}

writeFileSync(join(OUT, "index.html"), page(
  "Google Country Override — search Google from any country",
  "Search Google as if you're in another country while keeping results in your language.",
  landing(), { active: "home" }));

writeFileSync(join(OUT, "support.html"), page(
  "Support — Google Country Override", "How to use Google Country Override and where to get help.",
  support(), { active: "support" }));

writeFileSync(join(OUT, "privacy.html"), page(
  "Privacy Policy — Google Country Override", "Google Country Override does not collect any personal data.",
  `<article class="doc">${mdToHtml(readFileSync(join(ROOT, "PRIVACY.md"), "utf8"))}</article>`,
  { active: "privacy" }));

writeFileSync(join(OUT, "style.css"), styleCss());
console.log(`Built site → ${OUT}`);

/* --------------------------------- style -------------------------------- */

// Function declaration so it can be called above its definition.
function styleCss() {
  return `:root{
  --bg:#fff; --fg:#202124; --muted:#5f6368; --border:#e0e3e7; --card:#f8f9fa;
  --accent:#1a73e8; --accent2:#1558d6;
}
@media (prefers-color-scheme: dark){:root{
  --bg:#17181a; --fg:#e8eaed; --muted:#9aa0a6; --border:#3c4043; --card:#202124;
  --accent:#8ab4f8; --accent2:#aecbfa;
}}
*{box-sizing:border-box}
body{margin:0;font-family:Roboto,-apple-system,Segoe UI,Arial,sans-serif;color:var(--fg);background:var(--bg);line-height:1.6}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
code{background:var(--card);padding:1px 5px;border-radius:5px;font-size:.9em}
.nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 24px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.brand{display:inline-flex;align-items:center;gap:10px;font-weight:600;color:var(--fg)}
.nav nav{display:flex;gap:18px}
.nav nav a{color:var(--muted)}
.nav nav a.on,.nav nav a:hover{color:var(--fg)}
main{max-width:960px;margin:0 auto;padding:0 24px}
.hero{text-align:center;padding:64px 0 24px}
.hero-icon{border-radius:22px}
.hero h1{font-size:44px;margin:18px 0 8px;letter-spacing:-.02em}
.tag{font-size:20px;color:var(--muted);margin:0 auto;max-width:620px}
.cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:26px}
.btn{display:inline-block;padding:12px 22px;border-radius:999px;border:1px solid var(--border);color:var(--fg);font-weight:500}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn:hover{text-decoration:none;filter:brightness(1.05)}
.shot{margin:36px 0}
.shot img{width:100%;border:1px solid var(--border);border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.12)}
.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;margin:24px 0 72px}
.features div{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px}
.features h3{margin:0 0 6px;font-size:18px}
.features p{margin:0;color:var(--muted)}
.doc{padding:32px 0 72px;max-width:720px}
.doc h1{font-size:34px;letter-spacing:-.02em}
.doc h2{font-size:22px;margin-top:32px}
footer{border-top:1px solid var(--border);padding:28px 24px;text-align:center;color:var(--muted);font-size:14px}
footer a{color:var(--muted)}
`;
}
