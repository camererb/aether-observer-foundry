// Run with: node --test scripts/folder.test.mjs
// The importer's folder behaviour, against a small stand-in for Foundry (the real thing is not available here): sample maps go in
// "Aether Vision / Sample maps", the folders are made once and found by a flag (so a rename is fine), a scene the GM moved stays
// where it was put, a scene made by an older version at the top level is filed once, and a failed folder never stops a map.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const dir = new URL("../samples/", import.meta.url);
const index = JSON.parse(readFileSync(new URL("index.json", dir), "utf8"));
const sampleFile = (name) => JSON.parse(readFileSync(new URL(name, dir), "utf8"));

/** A stand-in for the parts of Foundry the importer touches. Each test gets a fresh world. */
function world({ folderFails = false } = {}) {
  let ids = 0;
  const flagsOf = (doc) => (mod, key) => doc.flags?.[mod]?.[key];
  const merge = (target, patch) => {
    for (const [k, v] of Object.entries(patch)) {
      if (v && typeof v === "object" && !Array.isArray(v) && typeof target[k] === "object" && target[k]) merge(target[k], v);
      else target[k] = v;
    }
    return target;
  };
  const game = {
    user: { isGM: true },
    i18n: { localize: (k) => k, format: (k) => k },
    settings: { get: () => false },
    folders: [],
    scenes: [],
  };
  globalThis.game = game;
  globalThis.Hooks = { once() {}, on() {} };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.Folder = {
    async create(data) {
      if (folderFails) throw new Error("no folders here");
      const folder = { id: `folder${++ids}`, ...structuredClone(data) };
      folder.getFlag = flagsOf(folder);
      game.folders.push(folder);
      return folder;
    },
  };
  globalThis.Scene = {
    async create(data) {
      const scene = { id: `scene${++ids}`, ...structuredClone(data), walls: [], lights: [] };
      scene.getFlag = flagsOf(scene);
      scene.update = async (patch) => void merge(scene, structuredClone(patch));
      scene.createEmbeddedDocuments = async () => [];
      scene.deleteEmbeddedDocuments = async () => [];
      scene.view = async () => {};
      game.scenes.push(scene);
      return scene;
    },
  };
  // Files come from the real sample files; the pictures are not needed (the importer falls back to their address).
  globalThis.fetch = async (url) => {
    const name = String(url).split("/samples/")[1];
    if (name === "index.json") return { ok: true, json: async () => index };
    if (name?.endsWith(".json")) return { ok: true, json: async () => sampleFile(name) };
    return { ok: false, status: 404 };
  };
  return game;
}

const loaded = await (async () => {
  world();
  return import("./aether-observer.js");
})();

test("sample maps are filed in Aether Vision / Sample maps, the folders made once", async () => {
  const game = world();
  const made = await loaded.importSamples();
  assert.equal(made.length, index.maps.length);
  const root = game.folders.find((f) => f.getFlag("aether-observer", "folder") === "root");
  const samples = game.folders.find((f) => f.getFlag("aether-observer", "folder") === "samples");
  assert.ok(root && samples);
  assert.equal(root.name, "AETHER_OBSERVER.FolderName");
  assert.equal(samples.folder, root.id, "the samples folder is inside the Aether Vision folder");
  assert.equal(game.folders.length, 2);
  assert.ok(game.scenes.every((s) => s.folder === samples.id), "every sample is in the samples folder");
  // Pressing the button again changes nothing and makes no more folders.
  await loaded.importSamples();
  assert.equal(game.folders.length, 2);
  assert.equal(game.scenes.length, index.maps.length);
});

test("a rename of the folders is fine: they are found by their mark", async () => {
  const game = world();
  await loaded.importSamples();
  for (const f of game.folders) f.name = "My maps";
  game.scenes.length = 0;
  await loaded.importSamples();
  assert.equal(game.folders.length, 2, "no new folders were made");
});

test("a scene the GM moved stays where it was put when the sample is updated", async () => {
  const game = world();
  await loaded.importSamples();
  const scene = game.scenes[0];
  scene.folder = "gm-own-folder";
  scene.flags["aether-observer"].version = -1; // an older version of the sample: it is updated
  await loaded.importSamples();
  assert.equal(game.scenes[0].folder, "gm-own-folder");
});

test("a scene made by an older version at the top level is filed once", async () => {
  const game = world();
  await loaded.importSamples();
  const scene = game.scenes[0];
  scene.folder = null;
  delete scene.flags["aether-observer"].foldered; // as an older version left it
  scene.flags["aether-observer"].version = -1;
  await loaded.importSamples();
  assert.ok(game.scenes[0].folder, "it was filed");
  const filed = game.scenes[0].folder;
  // The GM takes it out again: it is not filed a second time.
  game.scenes[0].folder = null;
  game.scenes[0].flags["aether-observer"].version = -2;
  await loaded.importSamples();
  assert.equal(game.scenes[0].folder, null);
  assert.ok(filed);
});

test("a failed folder never stops a map: the scene is made at the top level", async () => {
  const game = world({ folderFails: true });
  const made = await loaded.importSamples();
  assert.equal(made.length, index.maps.length);
  assert.ok(game.scenes.every((s) => s.folder === null));
});
