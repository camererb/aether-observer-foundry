// Run with: node --test scripts/convert.test.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { cleanLink, DARKNESS_WITH_LIGHTS, escapeHtml, GRID_SIZE, GRID_TYPES, goneScenes, lightColour, lineSegments, pictureName, toFoundry } from "./convert.js";

const MAP = {
  story_key: "abcdef0123456789",
  source_id: "tab-first",
  scene_name: "The Old Inn!",
  feet_per_square: 5,
  version: 3,
  uvtt: {
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 14, y: 12 }, pixels_per_grid: 70 },
    // A room 10 x 8 drawn as four lines, and a curved wall of three points.
    line_of_sight: [
      [{ x: 2, y: 2 }, { x: 12, y: 2 }],
      [{ x: 12, y: 2 }, { x: 12, y: 10 }],
      [{ x: 2, y: 10 }, { x: 5, y: 10 }],
      [{ x: 2, y: 2 }, { x: 2, y: 10 }],
      [{ x: 3, y: 3 }, { x: 3.5, y: 3.25 }, { x: 4, y: 3 }],
    ],
    objects_line_of_sight: [],
    portals: [{ position: { x: 5.5, y: 10 }, bounds: [{ x: 5, y: 10 }, { x: 6, y: 10 }], rotation: 0, closed: true, freestanding: false }],
    environment: { baked_lighting: false, ambient_light: "ff8a8a9a" },
    lights: [{ position: { x: 7.5, y: 5.5 }, range: 4, intensity: 1, color: "ffffd27f", shadows: true }],
  },
};

test("the scene is the map's squares at Foundry's grid size, with the map's scale", () => {
  const out = toFoundry(MAP);
  assert.deepEqual(out.scene, { width: 14 * GRID_SIZE, height: 12 * GRID_SIZE, padding: 0, grid: { type: GRID_TYPES.SQUARE, size: GRID_SIZE, distance: 5, units: "ft" } });
  assert.equal(toFoundry({ ...MAP, feet_per_square: 10 }).scene.grid.distance, 10);
  // The server's newer field name wins over the old one.
  assert.equal(toFoundry({ ...MAP, feet_per_square: 5, grid_distance: 20 }).scene.grid.distance, 20);
});

test("walls are one segment per pair of points, in pixels, and block everything", () => {
  const out = toFoundry(MAP);
  assert.equal(out.walls.length, 6);
  assert.deepEqual(out.walls[0], { c: [200, 200, 1200, 200], move: 20, sight: 20, light: 20, sound: 20, door: 0 });
  assert.deepEqual(out.walls[4].c, [300, 300, 350, 325]);
});

test("a door is a closed door wall across its gap", () => {
  const [door] = toFoundry(MAP).doors;
  assert.deepEqual(door, { c: [500, 1000, 600, 1000], move: 20, sight: 20, light: 20, sound: 20, door: 1, ds: 0 });
});

test("lights reach their range in feet, half of it bright, in the torch colour", () => {
  const [light] = toFoundry(MAP).lights;
  assert.equal(light.x, 750);
  assert.equal(light.y, 550);
  assert.equal(light.config.dim, 20);
  assert.equal(light.config.bright, 10);
  assert.equal(light.config.color, "#ffd27f");
});

test("a map with lights is dark enough for them to show; one without is fully lit", () => {
  assert.equal(toFoundry(MAP).darkness, DARKNESS_WITH_LIGHTS);
  const unlit = { ...MAP, uvtt: { ...MAP.uvtt, lights: [], environment: { ambient_light: "ffffffff" } } };
  assert.equal(toFoundry(unlit).darkness, 0);
});

test("the real Foundry numbers are used when the module passes them", () => {
  const out = toFoundry(MAP, { consts: { NORMAL: 99, DOOR: 7, CLOSED: 5, NO_DOOR: 0 } });
  assert.equal(out.walls[0].sight, 99);
  assert.equal(out.doors[0].door, 7);
  assert.equal(out.doors[0].ds, 5);
});

test("a segment that rounds to nothing is dropped", () => {
  assert.deepEqual(lineSegments([[{ x: 1, y: 1 }, { x: 1.001, y: 1 }]]), []);
});

test("colours: AARRGGBB, RRGGBB and junk", () => {
  assert.equal(lightColour("ffff9a4a"), "#ff9a4a");
  assert.equal(lightColour("#FFD27F"), "#ffd27f");
  assert.equal(lightColour("nope"), "#ffd27f");
});

test("the pasted link is cleaned, and anything else is refused", () => {
  const key = "A".repeat(43);
  assert.equal(cleanLink(` https://api.aetherobserver.com/foundry-sync/${key}/ `), `https://api.aetherobserver.com/foundry-sync/${key}`);
  assert.equal(cleanLink(`https://api.aetherobserver.com/foundry-sync/${key}/scene`), `https://api.aetherobserver.com/foundry-sync/${key}`);
  assert.equal(cleanLink(`http://localhost:8000/foundry-sync/${key}`), `http://localhost:8000/foundry-sync/${key}`);
  // The key is a password: plain http only to a server on this computer.
  assert.equal(cleanLink(`http://example.com/foundry-sync/${key}`), null);
  assert.equal(cleanLink(`http://192.168.1.5:8000/foundry-sync/${key}`), null);
  assert.equal(cleanLink(`http://localhost.evil.com/foundry-sync/${key}`), null);
  assert.equal(cleanLink(`http://127.0.0.1:8000/foundry-sync/${key}`), `http://127.0.0.1:8000/foundry-sync/${key}`);
  assert.equal(cleanLink("https://aetherobserver.com/worlds/123/vision"), null);
  assert.equal(cleanLink("https://api.aetherobserver.com/foundry-sync/short"), null);
  assert.equal(cleanLink(""), null);
});

test("the picture's file name", () => {
  assert.equal(pictureName(MAP), "the-old-inn-abcdef-v3.webp");
  assert.equal(pictureName(MAP, "image/jpeg"), "the-old-inn-abcdef-v3.jpg");
  assert.equal(pictureName(MAP, "image/png"), "the-old-inn-abcdef-v3.png");
});

const HEX = {
  story_key: "abcdef0123456789",
  source_id: "area-1",
  kind: "hex",
  scene_name: "Hex area 1",
  grid_distance: 6,
  grid_units: "mi",
  version: 2,
  // 19.4 x 14.25 hexes across: not whole numbers.
  uvtt: { resolution: { map_origin: { x: 0, y: 0 }, map_size: { x: 19.4, y: 14.25 }, pixels_per_grid: 116 }, line_of_sight: [], objects_line_of_sight: [], portals: [], lights: [], environment: { ambient_light: "ffffffff" } },
};

test("a hex area is gridless, in miles, one hex across is 100 px, and has no walls, doors, lights or darkness", () => {
  const out = toFoundry(HEX);
  assert.deepEqual(out.scene, { width: 1940, height: 1425, padding: 0, grid: { type: GRID_TYPES.GRIDLESS, size: GRID_SIZE, distance: 6, units: "mi" } });
  assert.deepEqual([out.walls, out.doors, out.lights, out.darkness], [[], [], [], 0]);
});

test("a hex area never gets walls even if the file carried some", () => {
  const sneaky = { ...HEX, uvtt: { ...HEX.uvtt, line_of_sight: [[{ x: 1, y: 1 }, { x: 5, y: 1 }]], portals: [{ bounds: [{ x: 1, y: 1 }, { x: 2, y: 1 }] }], lights: [{ position: { x: 1, y: 1 }, range: 4 }] } };
  const out = toFoundry(sneaky);
  assert.equal(out.walls.length + out.doors.length + out.lights.length, 0);
});

import { lightKey, mergeManaged, originShift, shiftWall, wallKey } from "./convert.js";

test("a wall has the same key whichever way round its ends are", () => {
  assert.equal(wallKey([0, 0, 100, 0]), wallKey([100, 0, 0, 0]));
  assert.notEqual(wallKey([0, 0, 100, 0]), wallKey([0, 0, 200, 0]));
});

test("a merge keeps what is unchanged, removes what is gone and adds what is new", () => {
  const existing = [{ id: "a", key: "1" }, { id: "b", key: "2" }, { id: "c", key: "3" }];
  const desired = [{ key: "2", data: "two" }, { key: "3", data: "three" }, { key: "4", data: "four" }];
  assert.deepEqual(mergeManaged(existing, desired), { remove: ["a"], add: ["four"] });
  assert.deepEqual(mergeManaged(existing, existing.map((e) => ({ key: e.key, data: e.id }))), { remove: [], add: [] });
  assert.deepEqual(mergeManaged([{ id: "x", key: "1" }, { id: "y", key: "1" }], [{ key: "1", data: 1 }, { key: "1", data: 1 }]), { remove: ["y"], add: [] });
});

test("a light is the same light when it is in the same place and reaches as far", () => {
  assert.equal(lightKey({ x: 1, y: 2, config: { dim: 10 } }), lightKey({ x: 1, y: 2, config: { dim: 10, color: "#fff" } }));
});

test("a map that grows to the north or west moves what is already in the scene", () => {
  assert.deepEqual(originShift({ x: 0, y: 0 }, { x: -3, y: -5 }), { dx: 300, dy: 500 });
  assert.equal(originShift({ x: 2, y: 2 }, { x: 2, y: 2 }), null);
  assert.equal(originShift(null, { x: 1, y: 1 }), null);
  assert.deepEqual(shiftWall([0, 0, 100, 0], { dx: 300, dy: 500 }), [300, 500, 400, 500]);
});

test("ignoring lighting lights the whole scene and says so", () => {
  const room = { kind: "room", scene_name: "x", feet_per_square: 5, version: 1, uvtt: { resolution: { map_size: { x: 4, y: 4 } }, environment: { ambient_light: "ff8a8a9a" }, lights: [{ position: { x: 1, y: 1 }, range: 4, color: "ffffd27f" }], line_of_sight: [] } };
  assert.equal(toFoundry(room, { globalLight: true }).darkness, 0);
  assert.equal(toFoundry(room, { globalLight: true }).globalLight, true);
  assert.equal(toFoundry(room).darkness, DARKNESS_WITH_LIGHTS);
});

test("the map's corner comes through when the site sends it", () => {
  const room = { kind: "room", scene_name: "x", feet_per_square: 5, version: 1, uvtt: { resolution: { map_size: { x: 4, y: 4 } }, aether_origin: { x: -2, y: 4 } } };
  assert.deepEqual(toFoundry(room).origin, { x: -2, y: 4 });
  assert.equal(toFoundry({ ...room, uvtt: { resolution: room.uvtt.resolution } }).origin, null);
});

test("a cave's glowing lights are soft and pulse, and can be left out", () => {
  const cave = { kind: "room", scene_name: "x", feet_per_square: 5, version: 1, uvtt: { resolution: { map_size: { x: 4, y: 4 } }, environment: { ambient_light: "ff8a8a9a" }, lights: [
    { position: { x: 1, y: 1 }, range: 4, color: "ffffd27f" },
    { position: { x: 2, y: 2 }, range: 3, color: "ff7fffc8", glow: true },
  ] } };
  const both = toFoundry(cave);
  assert.equal(both.lights.length, 2);
  assert.equal(both.lights[0].config.animation.type, "torch");
  assert.equal(both.lights[1].config.animation.type, "pulse");
  assert.equal(both.lights[1].config.color, "#7fffc8");
  assert.equal(toFoundry(cave, { glowLights: false }).lights.length, 1);
});

// The free sample maps shipped in samples/ (made from Aether Vision's own sample set): each one is listed, has its
// picture, and turns into a scene with the size and walls its file says.
test("every sample map is listed, has its picture, and converts", () => {
  const dir = new URL("../samples/", import.meta.url);
  const { maps } = JSON.parse(readFileSync(new URL("index.json", dir), "utf8"));
  assert.ok(maps.length >= 8);
  const ids = new Set();
  for (const entry of maps) {
    assert.ok(!ids.has(entry.source_id), `${entry.source_id} is listed twice`);
    ids.add(entry.source_id);
    const data = JSON.parse(readFileSync(new URL(entry.file, dir), "utf8"));
    assert.equal(data.source_id, entry.source_id);
    assert.ok(Number.isInteger(data.version) && data.version > 0, "a sample has a whole-number version (a fingerprint of the map, so a remake is imported)");
    assert.ok(existsSync(new URL(data.image_path, dir)), `${data.image_path} is missing`);
    const made = toFoundry(data);
    assert.ok(made.scene.width > 0 && made.scene.height > 0, entry.scene_name);
    if (data.kind === "hex") {
      assert.equal(made.scene.grid.type, GRID_TYPES.GRIDLESS);
      assert.equal(made.walls.length, 0);
    } else {
      assert.equal(made.scene.grid.type, GRID_TYPES.SQUARE);
      assert.ok(made.walls.length > 0 || entry.source_id === "sample-crossing", `${entry.scene_name} has no walls`);
    }
  }
  assert.ok(ids.has("sample-area"), "the hex area is in the list");
  assert.ok(ids.has("sample-cave-below") && ids.has("sample-ruin-below"), "the lower levels are in the list");
  assert.equal(maps[0].source_id, "sample-area", "the hex area comes first");
});

test("names and errors are made safe before they go into a Foundry message", () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert('1')">&`), "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml("The Old Inn"), "The Old Inn");
});

test("only this story's own scenes that fell off the list are picked to delete", () => {
  const scenes = [
    { name: "kept", key: "story1:tab-a" },
    { name: "gone", key: "story1:tab-b" },
    { name: "other story", key: "story2:tab-b" },
    { name: "sample", key: "sample-cave" },
    { name: "by hand", key: undefined },
    { name: "odd", key: 42 },
  ];
  assert.deepEqual(goneScenes(scenes, "story1", [{ source_id: "tab-a" }]).map((x) => x.name), ["gone"]);
  // Everything removed on the site: only this story's scenes go.
  assert.deepEqual(goneScenes(scenes, "story1", []).map((x) => x.name), ["kept", "gone"]);
  // No story fingerprint, nothing is picked.
  assert.deepEqual(goneScenes(scenes, "", []), []);
  assert.deepEqual(goneScenes(scenes, undefined, []), []);
  // A key that merely starts with the same letters is another story.
  assert.deepEqual(goneScenes([{ name: "x", key: "story10:tab-a" }], "story1", []), []);
});
