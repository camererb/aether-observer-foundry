// Run with: node --test scripts/notes.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";

import { entryToNote, folderNotes, htmlToText, inSends, pageToNote, recapHtml, summarise } from "./notes.js";

test("journal HTML becomes plain text with headings and lists kept", () => {
  const html =
    '<h2>The cave</h2><p>We met <strong>Mira</strong> &amp; @UUID[Actor.abc]{Old Tom}.</p><ul><li>Gold: 12</li><li>A key</li></ul><img src="x.png"><p>Line one<br>Line two</p>';
  assert.equal(htmlToText(html), "### The cave\n\nWe met Mira & Old Tom.\n\n- Gold: 12\n\n- A key\n\nLine one\nLine two");
});

test("an entry with one page is just its text; several pages each get a heading, in Foundry's order", () => {
  const one = entryToNote({ id: "e1", name: "Session 1", pages: [{ name: "Session 1", type: "text", text: { content: "<p>Hi</p>" } }] });
  assert.deepEqual(one, { ref: "e1", title: "Session 1", body: "Hi" });
  const many = entryToNote(
    {
      id: "e2",
      name: "Session 2",
      pages: [
        { name: "Loot", sort: 200, type: "text", text: { content: "<p>A sword</p>" } },
        { name: "Map", sort: 50, type: "image", src: "m.png" },
        { name: "Recap", sort: 100, type: "text", text: { content: "<p>We fought.</p>" } },
      ],
    },
    ["Season 1"],
  );
  assert.equal(many.title, "Season 1 / Session 2");
  assert.equal(many.body, "## Recap\n\nWe fought.\n\n## Loot\n\nA sword");
});

test("a folder keeps its structure: entries in order, subfolders after, each titled with its path", () => {
  const season = { id: "f1", name: "Season 1" };
  const arc = { id: "f2", name: "Arc 2", sort: 1 };
  const entries = {
    f1: [
      { id: "b", name: "Session 2", sort: 2, pages: [] },
      { id: "a", name: "Session 1", sort: 1, pages: [] },
    ],
    f2: [{ id: "c", name: "Session 3", sort: 1, pages: [] }],
  };
  const notes = folderNotes(season, (f) => entries[f.id] ?? [], (f) => (f.id === "f1" ? [arc] : []));
  assert.deepEqual(
    notes.map((n) => n.title),
    ["Season 1 / Session 1", "Season 1 / Session 2", "Season 1 / Arc 2 / Session 3"],
  );
});

test("long lists go in several sends, and the answers are added up", () => {
  assert.deepEqual(inSends([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  const s = summarise([
    { outcome: "created" },
    { outcome: "updated" },
    { outcome: "updated" },
    { outcome: "published", title: "Session 1", detail: "Already published" },
  ]);
  assert.equal(s.created, 1);
  assert.equal(s.updated, 2);
  assert.equal(s.skipped.length, 1);
});

test("one page becomes its own notes, titled Entry / Page, with a ref that can't clash with the whole entry", () => {
  const entry = { id: "e9", name: "Session 12" };
  const page = { id: "p3", name: "Loot", type: "text", text: { content: "<p>A sword</p>" } };
  assert.deepEqual(pageToNote(entry, page), { ref: "e9.p3", title: "Session 12 / Loot", body: "A sword" });
  assert.equal(pageToNote(entry, page, ["Season 2"]).title, "Season 2 / Session 12 / Loot");
  assert.notEqual(pageToNote(entry, page).ref, entryToNote({ ...entry, pages: [] }).ref);
  assert.equal(pageToNote(entry, { id: "p4", name: "", type: "image" }).body, "");
});

const WORDS = { record: "Record", cut: "Read the rest on Aether Observer.", noRecord: "Nothing published yet.", quests: "Open quests", stuck: "stuck" };

test("the handout shows the record and open quests, with everything from the server escaped", () => {
  const html = recapHtml(
    {
      record: { number: 4, title: "The <b>cave</b>", simulated_date: "Day 3", text: "We went in.\n\nIt was dark.", cut: true },
      quests: [
        { name: "Find the key", status: "underway", description: "In the <script>cave</script>" },
        { name: "Cross the river", status: "stuck", description: null },
      ],
    },
    WORDS,
  );
  assert.ok(html.startsWith("<h2>The &lt;b&gt;cave&lt;/b&gt; &middot; Day 3</h2><p>We went in.</p><p>It was dark.</p>"));
  assert.ok(html.includes("<em>Read the rest on Aether Observer.</em>"));
  assert.ok(html.includes("<li><strong>Find the key</strong>: In the &lt;script&gt;cave&lt;/script&gt;</li>"));
  assert.ok(html.includes("<li><strong>Cross the river</strong> <em>(stuck)</em></li>"));
  assert.ok(!html.includes("<script>") && !html.includes("<b>"));
});

test("a story with nothing published says so, and an untitled record is named by its number", () => {
  assert.equal(recapHtml({ record: null, quests: [] }, WORDS), "<p>Nothing published yet.</p>");
  assert.ok(recapHtml({ record: { number: 2, title: null, text: "x", cut: false }, quests: [] }, WORDS).startsWith("<h2>Record 2</h2>"));
});
