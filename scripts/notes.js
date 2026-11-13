// Journal sync helpers (2026-11-13), kept free of Foundry so they can be tested in Node.
// A journal entry becomes one set of session notes on Aether Observer: its title is the entry's name (with the folder path
// in front when a whole folder is sent, so the structure survives: "Season 2 / Session 12"), and its text pages become the
// body, each under its own "## Page name" heading when there is more than one. The entry's Foundry id travels with it, so
// sending it again updates the same notes on the site instead of making a copy.

/** The most entries the site takes in one send; a bigger folder goes in several sends. */
export const NOTES_PER_SEND = 30;
/** The site's limits (`SESSION_NOTES_MAX_LENGTH` and the title column). */
export const MAX_BODY = 20000;
export const MAX_TITLE = 200;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** Foundry's journal HTML as plain text: headings kept as "#" lines, paragraphs and list items on their own lines, links to
 *  other documents (@UUID[...]{Name}) as just their name, everything else (tags, pictures, styles) dropped. */
export function htmlToText(html) {
  let text = String(html ?? "");
  text = text.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/@\w+\[[^\]]*\]\{([^}]*)\}/g, "$1").replace(/@\w+\[([^\]]*)\]/g, "$1");
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level, inner) => `\n\n${"#".repeat(Math.min(Number(level) + 1, 6))} ${inner}\n\n`);
  text = text.replace(/<li[^>]*>/gi, "\n- ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|li|ul|ol|blockquote|tr|table|section|h[1-6])>/gi, "\n\n");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, code) => {
    const key = code.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key];
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2), 16));
    if (key.startsWith("#")) return String.fromCodePoint(parseInt(key.slice(1), 10));
    return m;
  });
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Text pages in the order Foundry shows them. */
export function textPages(entry) {
  return [...(entry.pages ?? [])]
    .filter((p) => (p.type ?? "text") === "text")
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name)));
}

/** One journal entry as the notes the site takes: { ref, title, body }. `path` is the folder names above it, when a folder
 *  was sent. */
export function entryToNote(entry, path = []) {
  const name = String(entry.name ?? "").trim() || "Untitled";
  const title = [...path, name].join(" / ").slice(0, MAX_TITLE);
  const pages = textPages(entry);
  const parts = pages.map((page) => {
    const text = htmlToText(page.text?.content ?? "");
    const heading = String(page.name ?? "").trim();
    // One page named like its entry needs no heading of its own.
    if (pages.length === 1 && (!heading || heading === name)) return text;
    return heading ? `## ${heading}\n\n${text}` : text;
  });
  let body = parts.filter(Boolean).join("\n\n");
  if (body.length > MAX_BODY) body = `${body.slice(0, MAX_BODY - 40).trimEnd()}\n\n(cut short: too long to send)`;
  return { ref: String(entry.id), title, body };
}

/** One page of an entry as the notes the site takes (2026-11-13: send a single page, not the whole entry). Titled
 *  "Entry / Page" (with the folder path in front when given); its own ref is "<entry id>.<page id>", so it never
 *  collides with the whole entry's notes. A page that isn't text (a picture, a PDF) has no text to send. */
export function pageToNote(entry, page, path = []) {
  const entryName = String(entry.name ?? "").trim() || "Untitled";
  const pageName = String(page.name ?? "").trim() || "Untitled page";
  const title = [...path, entryName, pageName].join(" / ").slice(0, MAX_TITLE);
  let body = htmlToText(page.text?.content ?? "");
  if (body.length > MAX_BODY) body = `${body.slice(0, MAX_BODY - 40).trimEnd()}\n\n(cut short: too long to send)`;
  return { ref: `${entry.id}.${page.id}`, title, body };
}

/** Everything in a folder and its subfolders, in the order Foundry shows them, each with its path from the folder sent.
 *  `entriesIn(folder)` and `foldersIn(folder)` return the direct contents. */
export function folderNotes(folder, entriesIn, foldersIn, path = [folder.name]) {
  const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.name).localeCompare(String(b.name));
  const out = [...entriesIn(folder)].sort(bySort).map((entry) => entryToNote(entry, path));
  for (const child of [...foldersIn(folder)].sort(bySort)) out.push(...folderNotes(child, entriesIn, foldersIn, [...path, child.name]));
  return out;
}

/** Splits a long list into sends the site accepts. */
export function inSends(notes, size = NOTES_PER_SEND) {
  const sends = [];
  for (let i = 0; i < notes.length; i += size) sends.push(notes.slice(i, i + size));
  return sends;
}

/** Adds up the site's answers: how many were made, updated, unchanged, and the ones left alone with why. */
export function summarise(results) {
  const count = { created: 0, updated: 0, unchanged: 0 };
  const skipped = [];
  for (const r of results) {
    if (r.outcome in count) count[r.outcome] += 1;
    else skipped.push(r);
  }
  return { ...count, skipped };
}

const esc = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const paragraphs = (text) =>
  String(text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

/** The "last time" handout page (2026-11-13) from the site's recap: the latest published record, then the open quests.
 *  Everything from the server is escaped: a record or quest name can never become markup in Foundry. `words` holds the
 *  module's own wording (headings, the "read the rest" line). */
export function recapHtml(recap, words) {
  const parts = [];
  const rec = recap?.record;
  if (rec) {
    const heading = [rec.title ? esc(rec.title) : `${esc(words.record)} ${esc(rec.number)}`, rec.simulated_date ? esc(rec.simulated_date) : ""]
      .filter(Boolean)
      .join(" &middot; ");
    parts.push(`<h2>${heading}</h2>`, paragraphs(rec.text));
    if (rec.cut) parts.push(`<p><em>${esc(words.cut)}</em></p>`);
  } else {
    parts.push(`<p>${esc(words.noRecord)}</p>`);
  }
  const quests = recap?.quests ?? [];
  if (quests.length) {
    parts.push(`<h2>${esc(words.quests)}</h2><ul>`);
    for (const q of quests) {
      const stuck = q.status === "stuck" ? ` <em>(${esc(words.stuck)})</em>` : "";
      const about = q.description ? `: ${esc(q.description)}` : "";
      parts.push(`<li><strong>${esc(q.name)}</strong>${stuck}${about}</li>`);
    }
    parts.push("</ul>");
  }
  return parts.join("");
}
