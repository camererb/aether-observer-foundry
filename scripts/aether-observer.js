// Aether Observer (phase 1, 2026-11-11): a "Sync from Aether Vision" button in the Scenes tab, for the GM only, and a check
// every few seconds for maps the GM sends. It reads every map sent with "Send to Foundry" on Aether Observer and makes or updates
// one Foundry scene for each: a room map (picture, grid and scale, walls, doors and lights) or a hex area (the players' view as a
// picture, gridless, measured in miles). A map stays in Foundry until the GM deletes the scene here: removing it on Aether Observer
// only stops it being updated.
//
// Rules this keeps:
// - Only walls and lights this module made (flag `aether-observer.managed`) are ever deleted or replaced. Hand-drawn
//   walls, lights, tokens, notes and drawings on the scene are left alone.
// - The link is a per-computer ("client") setting, so it is never sent to the players' browsers (it reads the GM's whole
//   map). It has to be pasted again on another computer.
// - Darkness, vision and fog are only set when the scene is first made, so the GM's own changes survive a re-sync. (The one
//   exception is the "ignore lighting" setting: while it is on, global illumination stays on.)
// - An update is a merge: a wall or light that has not changed is left exactly as it is (so a door the GM opened stays open),
//   and only walls and lights that are new or gone are added or removed. If the map grew to the north or west (the picture's
//   corner moved), what is already in the scene (tokens, notes, drawings, walls, lights) is moved to match. Foundry's own
//   explored-area record is not moved.
// - The automatic check only updates scenes (quietly, one line when something changed); it never opens a scene, so it cannot
//   pull the GM or the players away from the one they are on. The button opens the scene it brought in.
// - It runs in the GM's browser only, so keep the Foundry window visible (a browser slows a hidden tab right down).
//
// Versions: written for Foundry v13 and v12. The few places they differ are marked "v12/v13".
// Hosting: on The Forge the picture goes into the Assets Library ("forgevtt" source); self-hosted it goes into the Data
// folder. If saving the picture fails, the scene uses it straight from Aether Observer instead.

import { entryToNote, folderNotes, inSends, summarise } from "./notes.js";
import { cleanLink, escapeHtml, lightKey, mergeManaged, originShift, pictureName, shiftWall, toFoundry, wallKey, WALL_CONSTS } from "./convert.js";

const MOD = "aether-observer";
const PICTURE_DIR = "aether-vision";
/** How often the GM's browser looks for new maps. */
const CHECK_EVERY_MS = 5000;

const t = (key, data) => (data ? game.i18n.format(`AETHER_OBSERVER.${key}`, data) : game.i18n.localize(`AETHER_OBSERVER.${key}`));

Hooks.once("init", () => {
  game.settings.register(MOD, "link", {
    name: "AETHER_OBSERVER.LinkName",
    hint: "AETHER_OBSERVER.LinkHint",
    scope: "client",
    config: true,
    type: String,
    default: "",
  });
  game.settings.register(MOD, "welcomed", { scope: "world", config: false, type: Boolean, default: false });
  game.settings.register(MOD, "autoCheck", {
    name: "AETHER_OBSERVER.AutoName",
    hint: "AETHER_OBSERVER.AutoHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MOD, "glowLights", {
    name: "AETHER_OBSERVER.GlowName",
    hint: "AETHER_OBSERVER.GlowHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(MOD, "globalLight", {
    name: "AETHER_OBSERVER.GlobalLightName",
    hint: "AETHER_OBSERVER.GlobalLightHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
  });
});

Hooks.once("ready", () => {
  // For a macro, or if the button can't find its place in a future Foundry: game.modules.get("aether-observer").api.sync()
  const mod = game.modules.get(MOD);
  if (mod) mod.api = { sync, importSamples, sendEntry, sendFolder };
  // The GM's browser asks Aether Observer for new maps every few seconds (a small list, no pictures; a map is fetched only when
  // its update number changed).
  if (game.user?.isGM) {
    window.setInterval(checkForUpdates, CHECK_EVERY_MS);
    makeWelcomeJournal().catch((err) => console.warn(`${MOD} | welcome journal failed`, err));
  }
});

/** One welcome journal entry per world, made the first time a GM loads it. Deleting it is final: it is not made again. */
async function makeWelcomeJournal() {
  if (game.settings.get(MOD, "welcomed")) return;
  await game.settings.set(MOD, "welcomed", true);
  await JournalEntry.create({
    name: t("WelcomeTitle"),
    pages: [{ name: t("WelcomeTitle"), type: "text", text: { format: 1, content: t("WelcomeBody") } }],
    flags: { [MOD]: { welcome: true } },
  });
}

// v12 passes jQuery, v13 an HTMLElement. The button gets a row of its own under the Create Scene / Create Folder buttons,
// full width and on one line (squeezed in beside them it wrapped into a tall narrow block).
Hooks.on("renderSceneDirectory", (_app, html) => {
  if (!game.user?.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(`[data-${MOD}]`)) return;
  const row = document.createElement("div");
  row.dataset[camel(MOD)] = "1";
  row.style.cssText = "display:flex;flex:0 0 100%;width:100%;margin:4px 0;gap:4px;";
  const button = document.createElement("button");
  button.type = "button";
  button.style.cssText = "flex:1 1 auto;display:flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;";
  button.innerHTML = `<i class="fa-solid fa-map"></i><span>${t("Button")}</span>`;
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      await sync();
    } finally {
      button.disabled = false;
    }
  });
  row.append(button);
  const samples = document.createElement("button");
  samples.type = "button";
  samples.style.cssText = button.style.cssText;
  samples.innerHTML = `<i class="fa-solid fa-compass"></i><span>${t("SamplesButton")}</span>`;
  samples.addEventListener("click", async (event) => {
    event.preventDefault();
    samples.disabled = true;
    try {
      await importSamples();
    } finally {
      samples.disabled = false;
    }
  });
  row.append(samples);
  const actions = root.querySelector(".header-actions");
  if (actions) actions.after(row);
  else (root.querySelector(".directory-header") ?? root).prepend(row);
});

/**
 * Free sample maps: a few ready-made scenes shipped inside the module (samples/index.json), so nobody needs an account or a
 * link to try it. Each entry is { source_id, file } where `file` is a map file in the same shape the link serves, with
 * `image_path` relative to the samples folder. Safe to press again: a sample already imported at the same version is skipped.
 */
export async function importSamples() {
  if (!game.user?.isGM) return [];
  const base = `modules/${MOD}/samples`;
  let list;
  try {
    const res = await fetch(`${base}/index.json`, { cache: "no-store" });
    list = res.ok ? await res.json() : null;
  } catch (err) {
    console.warn(`${MOD} | sample list failed`, err);
  }
  const entries = Array.isArray(list?.maps) ? list.maps : [];
  if (!entries.length) {
    ui.notifications.warn(t("NoSamples"));
    return [];
  }
  const made = [];
  const folder = await sceneFolder("samples");
  for (const entry of entries) {
    try {
      const key = `samples:${entry.source_id}`;
      const res = await fetch(`${base}/${entry.file}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (sceneFor(key)?.getFlag(MOD, "version") === data.version) continue;
      made.push(await applyData(key, data, `${base}/${data.image_path}`, folder));
    } catch (err) {
      console.warn(`${MOD} | couldn't import sample ${entry?.source_id}`, err);
      ui.notifications.error(t("SampleFailed", { name: escapeHtml(entry?.scene_name ?? entry?.source_id ?? "?") }));
    }
  }
  if (made.length) {
    ui.notifications.info(t("SamplesDone", { names: escapeHtml(made.map((m) => m.data.scene_name).join(", ")), count: made.length }));
    await made[0].scene.view();
  } else {
    ui.notifications.info(t("SamplesUpToDate", { count: entries.length }));
  }
  return made.map((m) => m.scene);
}

function camel(id) {
  return id.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
}

/** Foundry's wall numbers, from CONST when they are there (v12/v13: same names). */
function wallConsts() {
  const C = globalThis.CONST ?? {};
  return {
    NORMAL: C.WALL_SENSE_TYPES?.NORMAL ?? WALL_CONSTS.NORMAL,
    DOOR: C.WALL_DOOR_TYPES?.DOOR ?? WALL_CONSTS.DOOR,
    CLOSED: C.WALL_DOOR_STATES?.CLOSED ?? WALL_CONSTS.CLOSED,
    NO_DOOR: C.WALL_DOOR_TYPES?.NONE ?? WALL_CONSTS.NO_DOOR,
  };
}

/** v13 moved FilePicker under foundry.applications; v12 has the global. */
function filePicker() {
  return globalThis.foundry?.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

/** Where pictures go: The Forge's Assets Library, or the Data folder when self-hosted. */
function pictureSource() {
  return globalThis.ForgeVTT?.usingTheForge ? "forgevtt" : "data";
}

/** Saves the picture into Foundry and returns its path, or null if that failed (no permission, no space). */
async function savePicture(blob, name) {
  const FP = filePicker();
  if (!FP?.upload) return null;
  const source = pictureSource();
  try {
    await FP.createDirectory(source, PICTURE_DIR, {});
  } catch {
    // Already there (or the host makes folders itself).
  }
  try {
    const file = new File([blob], name, { type: blob.type || "image/webp" });
    const saved = await FP.upload(source, PICTURE_DIR, file, {}, { notify: false });
    return saved?.path ?? null;
  } catch (err) {
    console.warn(`${MOD} | picture upload failed`, err);
    return null;
  }
}

async function readError(response, fallback) {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // Not JSON.
  }
  return fallback;
}

/** Fetches JSON from the link. Returns { ok, data, detail }: `detail` is the server's reason when it said no. */
async function getJson(url) {
  try {
    const response = await fetch(url, { cache: "no-store", credentials: "omit" });
    if (!response.ok) return { ok: false, status: response.status, detail: await readError(response, t("Unreachable")) };
    return { ok: true, data: await response.json() };
  } catch (err) {
    console.warn(`${MOD} | fetch failed`, err);
    return { ok: false, status: 0, detail: t("Unreachable") };
  }
}

/** The scene already made for a map, found by its flag (story and tab or area). */
const sceneFor = (key) => game.scenes.find((s) => s.getFlag(MOD, "key") === key) ?? null;

/** Moves what is already in a scene when the picture's corner moved (the map grew to the north or west), so tokens, notes,
 *  drawings and every wall and light keep their place on the map. */
async function shiftScene(scene, shift) {
  const move = (doc) => ({ _id: doc.id, x: doc.x + shift.dx, y: doc.y + shift.dy });
  const kinds = [["tokens", "Token"], ["notes", "Note"], ["drawings", "Drawing"], ["tiles", "Tile"], ["templates", "MeasuredTemplate"], ["lights", "AmbientLight"], ["sounds", "AmbientSound"]];
  for (const [collection, type] of kinds) {
    const docs = scene[collection];
    if (docs?.size) await scene.updateEmbeddedDocuments(type, docs.map(move));
  }
  if (scene.walls?.size) await scene.updateEmbeddedDocuments("Wall", scene.walls.map((w) => ({ _id: w.id, c: shiftWall(w.c, shift) })));
}

/** Brings one map into its scene: makes the scene, or updates the one made before. Returns the scene. */
async function applyMap(link, storyKey, info) {
  const got = await getJson(`${link}/maps/${encodeURIComponent(info.source_id)}`);
  if (!got.ok) throw new Error(got.detail);
  const data = got.data;
  return applyData(`${storyKey}:${data.source_id}`, data, `${link}/${data.image_path ?? "image"}`, await sceneFolder());
}

/**
 * The "Aether Vision" folder in the Scenes tab, made the first time it is needed, and (for `"samples"`) the "Sample maps"
 * folder inside it. Folders are found by a flag, not by name, so the GM can rename them. Returns the folder's id, or null when
 * a folder could not be made (the scene is then made at the top level, as before): nothing here is allowed to stop a map.
 */
async function sceneFolder(sub) {
  try {
    const find = (which) => game.folders.find((f) => f.type === "Scene" && f.getFlag(MOD, "folder") === which);
    let root = find("root");
    if (!root) root = await Folder.create({ name: t("FolderName"), type: "Scene", flags: { [MOD]: { folder: "root" } } });
    if (!sub) return root.id;
    let child = find(sub);
    if (!child) child = await Folder.create({ name: t("SamplesFolderName"), type: "Scene", folder: root.id, flags: { [MOD]: { folder: sub } } });
    return child.id;
  } catch (err) {
    console.warn(`${MOD} | couldn't make the scene folder`, err);
    return null;
  }
}

/** Makes or updates the scene for one map's data. Shared by a linked map and a bundled sample map. `folder` is where a new scene goes. */
async function applyData(key, data, imageUrl, folder = null) {
  let scene = sceneFor(key);

  // The picture: into Foundry if we can, otherwise straight from where it came from.
  let src = null;
  try {
    const picture = await fetch(imageUrl, { cache: "no-store", credentials: "omit" });
    if (picture.ok) {
      const blob = await picture.blob();
      src = await savePicture(blob, pictureName(data, blob.type));
    }
  } catch (err) {
    console.warn(`${MOD} | picture fetch failed`, err);
  }
  if (!src) {
    src = imageUrl;
    ui.notifications.warn(t("UploadFallback"));
  }

  const ignoreLighting = !!game.settings.get(MOD, "globalLight") && data.kind !== "hex";
  const made = toFoundry(data, { consts: wallConsts(), globalLight: ignoreLighting, glowLights: !!game.settings.get(MOD, "glowLights") });
  const flags = { [MOD]: { key, version: data.version, kind: data.kind, origin: made.origin ?? null } };
  const fields = { ...made.scene, background: { src }, flags };
  if (!scene) {
    const hex = data.kind === "hex";
    scene = await Scene.create({
      name: data.scene_name,
      ...fields,
      // A new scene goes in the Aether Vision folder (`foldered` remembers it was filed, so a move by the GM is kept).
      folder: folder ?? null,
      flags: { [MOD]: { ...flags[MOD], foldered: !!folder } },
      navigation: false,
      // A hex area has no walls to see round, so no token vision or fog; a room map starts with both on.
      tokenVision: !hex,
      fog: { exploration: !hex },
      // v12/v13: darkness lives under environment (v11 and older used a top-level `darkness`).
      environment: { darknessLevel: made.darkness, ...(ignoreLighting ? { globalLight: { enabled: true } } : {}) },
    });
  } else {
    // The map grew to the north or west: everything already here moves with the picture's corner.
    const shift = originShift(scene.getFlag(MOD, "origin"), made.origin, made.scene.grid.size);
    if (shift) await shiftScene(scene, shift);
    // The GM may have renamed the scene in Foundry, so the name is only set when it is made. Lighting is only touched here
    // while "ignore lighting" is on (the GM's choice); otherwise the GM's own darkness stays.
    await scene.update({ ...fields, ...(ignoreLighting ? { environment: { darknessLevel: 0, globalLight: { enabled: true } } } : {}) });
    // A scene made by an older version, still at the top level, is filed in the folder once; after that it stays where the GM puts it.
    if (folder && !scene.folder && !scene.getFlag(MOD, "foldered")) await scene.update({ folder, flags: { [MOD]: { foldered: true } } });
  }

  // Merge what this module made: leave unchanged walls and lights exactly as they are (an opened door stays open), remove the
  // ones that are gone, add the new ones. Hand-drawn ones are never looked at. A wall's key is its two ends and whether it is a
  // door, so one that turned into a door (or back) is replaced.
  const managed = { [MOD]: { managed: true } };
  const mine = (collection) => collection.filter((doc) => doc.getFlag(MOD, "managed"));
  const wallKeyOf = (w) => `${wallKey(w.c)}:${w.door ? "door" : "wall"}`;
  const wallMerge = mergeManaged(
    mine(scene.walls).map((w) => ({ id: w.id, key: wallKeyOf(w) })),
    [...made.walls, ...made.doors].map((w) => ({ key: wallKeyOf(w), data: { ...w, flags: managed } })),
  );
  if (wallMerge.remove.length) await scene.deleteEmbeddedDocuments("Wall", wallMerge.remove);
  if (wallMerge.add.length) await scene.createEmbeddedDocuments("Wall", wallMerge.add);
  const lightMerge = mergeManaged(
    mine(scene.lights).map((l) => ({ id: l.id, key: lightKey({ x: l.x, y: l.y, config: l.config }) })),
    made.lights.map((l) => ({ key: lightKey(l), data: { ...l, flags: managed } })),
  );
  if (lightMerge.remove.length) await scene.deleteEmbeddedDocuments("AmbientLight", lightMerge.remove);
  if (lightMerge.add.length) await scene.createEmbeddedDocuments("AmbientLight", lightMerge.add);
  return { scene, data, made };
}

/**
 * Looks at what the GM has sent and brings in every map that is new or changed. `manual` is the button: it says what it did
 * and opens a scene. Otherwise it is the automatic check: it says nothing unless something changed or went wrong (and a
 * problem only once, until it clears), and never opens a scene.
 * Returns the scenes it made or updated.
 */
export async function sync({ manual = true } = {}) {
  if (!game.user?.isGM) return [];
  const raw = game.settings.get(MOD, "link");
  if (!String(raw ?? "").trim()) {
    if (manual) ui.notifications.warn(t("NoLink"));
    return [];
  }
  const link = cleanLink(raw);
  if (!link) {
    if (manual) ui.notifications.error(t("BadLink"));
    return [];
  }

  if (manual) ui.notifications.info(t("Fetching"));
  const list = await getJson(`${link}/maps`);
  if (!list.ok) {
    // The automatic check says a problem once, not every five seconds.
    if (manual || lastProblem !== list.detail) ui.notifications.error(escapeHtml(list.detail));
    lastProblem = list.detail;
    return [];
  }
  lastProblem = null;
  const { story_key: storyKey, maps } = list.data;
  if (!maps.length) {
    if (manual) ui.notifications.warn(t("NothingSent"));
    return [];
  }

  const changed = [];
  for (const info of maps) {
    const existing = sceneFor(`${storyKey}:${info.source_id}`);
    if (existing && existing.getFlag(MOD, "version") === info.version) continue;
    try {
      const done = await applyMap(link, storyKey, info);
      changed.push(done);
      if (!manual) ui.notifications.info(t("Updated", { name: escapeHtml(done.data.scene_name), version: done.data.version }));
    } catch (err) {
      console.warn(`${MOD} | couldn't bring in ${info.scene_name}`, err);
      const detail = err?.message || t("Unreachable");
      if (manual || lastProblem !== detail) ui.notifications.error(`${escapeHtml(info.scene_name)}: ${escapeHtml(detail)}`);
      lastProblem = detail;
    }
  }

  if (manual) {
    if (changed.length === 0) {
      ui.notifications.info(t("AllUpToDate", { count: maps.length }));
      // Open the map sent most recently (the list is newest first).
      await sceneFor(`${storyKey}:${maps[0].source_id}`)?.view();
    } else {
      const walls = changed.reduce((n, c) => n + c.made.walls.length, 0);
      const doors = changed.reduce((n, c) => n + c.made.doors.length, 0);
      const lights = changed.reduce((n, c) => n + c.made.lights.length, 0);
      ui.notifications.info(t("Done", { names: escapeHtml(changed.map((c) => c.data.scene_name).join(", ")), count: changed.length, walls, doors, lights }));
      await changed[0].scene.view();
    }
  }
  return changed.map((c) => c.scene);
}

let lastProblem = null;
let checking = false;

/** The automatic check, every few seconds: GM only, off if the GM turned it off, and never two at once. */
async function checkForUpdates() {
  if (checking || !game.user?.isGM || !game.settings.get(MOD, "autoCheck")) return;
  if (!String(game.settings.get(MOD, "link") ?? "").trim()) return;
  checking = true;
  try {
    await sync({ manual: false });
  } catch (err) {
    console.warn(`${MOD} | automatic check failed`, err);
  } finally {
    checking = false;
  }
}


// ---------------------------------------------------------------- session notes to Aether Observer (2026-11-13)
//
// "Send to Aether Observer" on a journal entry (its window's header, and its right-click menu in the Journal tab) and on a
// journal folder (right-click). Each entry becomes one set of session notes on the story, named as in Foundry; a folder sends
// every entry inside it and its subfolders, titled with the folder path so the structure survives. Sending again updates the
// same notes. Uses the same Vision link, once the GM has turned on "Session notes from Foundry" for it on the site.

/** POSTs the notes as text/plain (no CORS preflight; the site reads it as JSON). */
async function postNotes(link, notes) {
  try {
    const response = await fetch(`${link}/notes`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ notes }),
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok) return { ok: false, detail: await readError(response, t("Unreachable")) };
    return { ok: true, results: (await response.json()).results ?? [] };
  } catch (err) {
    console.warn(`${MOD} | sending notes failed`, err);
    return { ok: false, detail: t("Unreachable") };
  }
}

async function sendNotes(notes) {
  if (!game.user?.isGM) return null;
  const raw = game.settings.get(MOD, "link");
  if (!String(raw ?? "").trim()) {
    ui.notifications.warn(t("NoLink"));
    return null;
  }
  const link = cleanLink(raw);
  if (!link) {
    ui.notifications.error(t("BadLink"));
    return null;
  }
  if (!notes.length) {
    ui.notifications.warn(t("NotesNothing"));
    return null;
  }
  ui.notifications.info(t("NotesSending", { count: notes.length }));
  const results = [];
  for (const batch of inSends(notes)) {
    const sent = await postNotes(link, batch);
    if (!sent.ok) {
      ui.notifications.error(sent.detail);
      break;
    }
    results.push(...sent.results);
  }
  const sum = summarise(results);
  if (results.length) ui.notifications.info(t("NotesDone", { created: sum.created, updated: sum.updated, unchanged: sum.unchanged }));
  for (const r of sum.skipped) ui.notifications.warn(`${r.title}: ${r.detail ?? r.outcome}`);
  return sum;
}

/** Sends one journal entry (an entry, or its id). */
export async function sendEntry(entryOrId) {
  const entry = typeof entryOrId === "string" ? game.journal.get(entryOrId) : entryOrId;
  if (!entry) return null;
  return sendNotes([entryToNote(entry)]);
}

/** Sends every entry in a journal folder and its subfolders, keeping the folder structure in the titles. */
export async function sendFolder(folderOrId) {
  const folder = typeof folderOrId === "string" ? game.folders.get(folderOrId) : folderOrId;
  if (!folder) return null;
  const entriesIn = (f) => game.journal.filter((j) => (j.folder?.id ?? j.folder) === f.id);
  const foldersIn = (f) => game.folders.filter((x) => x.type === "JournalEntry" && (x.folder?.id ?? x.folder) === f.id);
  return sendNotes(folderNotes(folder, entriesIn, foldersIn));
}

/** The id on a right-clicked row: v12 hands jQuery, v13 an HTMLElement; the attribute name changed between versions. */
function rowId(li, kind) {
  const el = li instanceof HTMLElement ? li : li?.[0];
  if (!el) return null;
  if (kind === "folder") {
    const holder = el.closest?.("[data-folder-id]") ?? el;
    return holder.dataset?.folderId ?? null;
  }
  return el.dataset?.entryId ?? el.dataset?.documentId ?? el.closest?.("[data-entry-id]")?.dataset?.entryId ?? null;
}

const entryOption = () => ({
  name: t("NotesButton"),
  icon: '<i class="fa-solid fa-feather"></i>',
  condition: () => game.user?.isGM,
  callback: (li) => sendEntry(rowId(li, "entry")),
});
const folderOption = () => ({
  name: t("NotesFolderButton"),
  icon: '<i class="fa-solid fa-feather"></i>',
  condition: () => game.user?.isGM,
  callback: (li) => sendFolder(rowId(li, "folder")),
});

// Right-click menus in the Journal tab. v12 names; v13 names (the app is passed first there).
Hooks.on("getJournalDirectoryEntryContext", (_html, options) => options.push(entryOption()));
Hooks.on("getJournalDirectoryFolderContext", (_html, options) => options.push(folderOption()));
Hooks.on("getJournalEntryContextOptions", (_app, options) => options.push(entryOption()));
Hooks.on("getFolderContextOptions", (app, options) => {
  // v13 uses one hook for every sidebar's folders; only the Journal tab's get the button.
  const name = app?.documentName ?? app?.constructor?.documentName;
  if (name && name !== "JournalEntry") return;
  options.push(folderOption());
});

// A button in an open journal entry's window header. v12: header buttons; v13: header controls.
Hooks.on("getJournalSheetHeaderButtons", (app, buttons) => {
  if (!game.user?.isGM) return;
  buttons.unshift({ label: t("NotesButton"), class: `${MOD}-send-notes`, icon: "fa-solid fa-feather", onclick: () => sendEntry(app.document ?? app.object) });
});
Hooks.on("getHeaderControlsJournalEntrySheet", (app, controls) => {
  if (!game.user?.isGM) return;
  controls.push({ label: t("NotesButton"), icon: "fa-solid fa-feather", action: `${MOD}-send-notes`, onClick: () => sendEntry(app.document) });
});
