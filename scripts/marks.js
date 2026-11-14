// "How to mark your notes" card (2026-11-14): the marker words the site reads in session notes, with one example each.
// Plain code, kept free of Foundry so it can be tested in Node (`node --test scripts/*.test.mjs`).
//
// The marker words are the server's own list (the same words the Aether Observer map notes chat box reads; a test in the
// private project fails if they ever differ). A marked line starts with the word and
// a colon, and "Hex" also needs a column and a row. The site files these when a journal entry is sent:
//   Hex 04,07: text         a Table note on that hex
//   Loot: text              a card on the Loot tab
//   Quest: text             a card on the Quests tab
//   Lore: Name: text        a note on the Lore entry called Name
//   Question: text          stays in the notes, never used for chapters
// (This card replaced an older one that showed the "==To check, Name:==" highlight labels, 2026-11-14.)

import { escapeHtml } from "./convert.js";

/** The markers in the card's order: the label the site reads, and one example line. The examples are checked against the
 *  site's own rules in marks.test.mjs. */
export const MARK_EXAMPLES = [
  { id: "hex", label: "Hex", example: "Hex 04,07: The bridge is out." },
  { id: "loot", label: "Loot", example: "Loot: A silver locket, engraved with a crow." },
  { id: "quest", label: "Quest", example: "Quest: Find the key to the crypt." },
  { id: "lore", label: "Lore", example: "Lore: Old Tom: Runs the ferry." },
  { id: "question", label: "Question", example: "Question: Who burned the mill?" },
];

/** The card's HTML. `words` holds the module's wording: `title`, `intro`, `foot`, and one description per marker id
 *  (`hex`, `loot`, `quest`, `lore`, `question`). Everything is escaped, so the card can never become markup. */
export function markCardHtml(words) {
  const items = MARK_EXAMPLES.map(
    (m) => `<li><strong>${escapeHtml(m.label)}</strong>: ${escapeHtml(words[m.id])}<br><code>${escapeHtml(m.example)}</code></li>`,
  ).join("");
  return `<h2>${escapeHtml(words.title)}</h2><p>${escapeHtml(words.intro)}</p><ul>${items}</ul><p>${escapeHtml(words.foot)}</p>`;
}
