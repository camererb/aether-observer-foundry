// Aether Vision map -> Foundry scene data. Plain functions, no Foundry globals, so they can be tested with `node --test`
// (convert.test.mjs) and work the same in Foundry v12 and v13.
//
// The map arrives as a Universal VTT file (Universal VTT): points in grid squares from the picture's
// top-left corner, walls as lines (`line_of_sight`), doors as `portals`, lights with a range in squares. Foundry wants
// pixels, so every point is multiplied by the scene's grid size. The picture is stretched to fill the scene, so its own
// pixels-per-square does not matter (Foundry needs a grid of at least 50 px, which a big town's picture can fall under).

/** Foundry pixels per square. Foundry's own default; big enough for any of our maps. */
export const GRID_SIZE = 100;

/** Foundry's wall numbers (CONST.WALL_SENSE_TYPES, WALL_MOVEMENT_TYPES, WALL_DOOR_TYPES, WALL_DOOR_STATES), the same in
 *  v12 and v13. The module passes the real CONST values in when it can; these are the fallback. */
export const WALL_CONSTS = { NORMAL: 20, DOOR: 1, CLOSED: 0, NO_DOOR: 0 };

/** Darkness for a map that has its own lights (our "dim ambient", `ambient_light` other than full white), so torches show. */
export const DARKNESS_WITH_LIGHTS = 0.7;

const round = (n) => Math.round(n);

/** "ffffd27f" (AARRGGBB, the Universal VTT form) -> "#ffd27f". Anything odd -> a warm torch colour. */
export function lightColour(argb) {
  const hex = String(argb ?? "").replace(/^#/, "");
  if (/^[0-9a-f]{8}$/i.test(hex)) return `#${hex.slice(2).toLowerCase()}`;
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
  return "#ffd27f";
}

/** Each line (a list of points) as wall segments in pixels; a segment that rounds to nothing is dropped. */
export function lineSegments(lines, size = GRID_SIZE) {
  const out = [];
  for (const line of lines ?? []) {
    for (let i = 0; i + 1 < line.length; i += 1) {
      const c = [round(line[i].x * size), round(line[i].y * size), round(line[i + 1].x * size), round(line[i + 1].y * size)];
      if (c[0] === c[2] && c[1] === c[3]) continue;
      out.push(c);
    }
  }
  return out;
}

/** Foundry's grid types (CONST.GRID_TYPES): the same in v12 and v13. */
export const GRID_TYPES = { GRIDLESS: 0, SQUARE: 1 };

/** A hex area (the players' view, picture only). Foundry's own hex grid would not line up with the drawn hexes, so the scene is
 *  gridless and measured in miles: one hex across is `grid_distance` miles, which is `size` pixels, so Foundry's ruler reads
 *  the distance across the map. No walls, doors or lights, and no darkness. */
function hexScene(data, size) {
  const uvtt = data.uvtt ?? {};
  const cells = uvtt.resolution?.map_size ?? { x: 1, y: 1 };
  const miles = Number(data.grid_distance) > 0 ? Number(data.grid_distance) : 6;
  return {
    scene: {
      width: Math.max(1, Math.round(cells.x * size)),
      height: Math.max(1, Math.round(cells.y * size)),
      padding: 0,
      grid: { type: GRID_TYPES.GRIDLESS, size, distance: miles, units: data.grid_units === "ft" ? "ft" : "mi" },
    },
    darkness: 0,
    walls: [],
    doors: [],
    lights: [],
  };
}

/**
 * The Foundry side of one map: the scene's own fields, its walls (doors included) and lights. Flags are added by the
 * module (they need its id). The scale comes from the map (5 ft a square indoors, more on a town map).
 */
export function toFoundry(data, { size = GRID_SIZE, consts = WALL_CONSTS, globalLight = false, glowLights = true } = {}) {
  if (data.kind === "hex") return hexScene(data, size);
  const uvtt = data.uvtt ?? {};
  const cells = uvtt.resolution?.map_size ?? { x: 1, y: 1 };
  const feetRaw = Number(data.grid_distance ?? data.feet_per_square);
  const feet = feetRaw > 0 ? feetRaw : 5;
  const sense = { move: consts.NORMAL, sight: consts.NORMAL, light: consts.NORMAL, sound: consts.NORMAL };

  const walls = [
    ...lineSegments(uvtt.line_of_sight, size),
    ...lineSegments(uvtt.objects_line_of_sight, size),
  ].map((c) => ({ c, ...sense, door: consts.NO_DOOR }));

  const doors = (uvtt.portals ?? []).flatMap((p) => {
    const [a, b] = p.bounds ?? [];
    if (!a || !b) return [];
    const c = [round(a.x * size), round(a.y * size), round(b.x * size), round(b.y * size)];
    if (c[0] === c[2] && c[1] === c[3]) return [];
    return [{ c, ...sense, door: consts.DOOR, ds: consts.CLOSED }];
  });

  // A cave's glowing mushrooms and crystals (`glow`) are left out when the GM turns that setting off. They give a small, steady,
  // gently pulsing light rather than a flickering torch.
  const lights = (uvtt.lights ?? []).filter((l) => glowLights || !l.glow).map((l) => {
    const dim = Math.max(5, Math.round((Number(l.range) || 4) * feet));
    return {
      x: round(l.position.x * size),
      y: round(l.position.y * size),
      config: {
        dim,
        bright: Math.round(dim / (l.glow ? 3 : 2)),
        color: lightColour(l.color),
        alpha: l.glow ? 0.3 : 0.4,
        animation: l.glow ? { type: "pulse", speed: 1, intensity: 2 } : { type: "torch", speed: 3, intensity: 3 },
      },
    };
  });

  const ambient = String(uvtt.environment?.ambient_light ?? "ffffffff").toLowerCase();
  return {
    scene: {
      width: Math.max(1, Math.round(cells.x)) * size,
      height: Math.max(1, Math.round(cells.y)) * size,
      padding: 0,
      grid: { type: GRID_TYPES.SQUARE, size, distance: feet, units: "ft" },
    },
    // Global illumination (the module's "ignore lighting" setting): the whole scene lit, so the map's lights make no difference.
    darkness: globalLight || ambient === "ffffffff" || lights.length === 0 ? 0 : DARKNESS_WITH_LIGHTS,
    globalLight: !!globalLight,
    origin: originOf(uvtt),
    walls,
    doors,
    lights,
  };
}

/** Where the picture's top-left corner is on the map, in squares (the site adds it as `aether_origin`). When a map grows to the
 *  north or west it moves, and what is already in the scene is shifted to match (`originShift`). Null when not given. */
function originOf(uvtt) {
  const o = uvtt?.aether_origin;
  return o && Number.isFinite(o.x) && Number.isFinite(o.y) ? { x: o.x, y: o.y } : null;
}

/** The link as pasted, cleaned: no spaces, no trailing slash, and without "/scene" if that was copied too. Null if it is
 *  not a web address with a key on the end. */
export function cleanLink(raw) {
  const link = String(raw ?? "").trim().replace(/\/+$/, "").replace(/\/(scene|image)$/, "");
  if (!/^https?:\/\/[^/\s]+\/(.+\/)?foundry-sync\/[A-Za-z0-9_-]{16,}$/.test(link)) return null;
  // The key in the link is a password, so it only travels over https. Plain http is for a server on this computer (testing).
  if (link.startsWith("http://") && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(link)) return null;
  return link;
}

/** Text made safe to put in a Foundry message (which shows HTML): names and errors from a map file or a server are never markup. */
export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** A file name for the picture: the map's name, the story fingerprint, the update number, and the extension for its type
 *  (the site sends WebP, or JPEG where the GM's browser can't make WebP). */
export function pictureName(data, type = "image/webp") {
  const slug = String(data.scene_name ?? "map").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "map";
  const ext = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }[String(type).split(";")[0].trim()] ?? "webp";
  return `${slug}-${String(data.story_key ?? "").slice(0, 6)}-v${data.version}.${ext}`;
}

// ---- Updates are merges: change a scene so what the GM has done at the table survives.

/** A wall's identity: its two ends, in either order, so the same wall always has the same key. */
export function wallKey(c) {
  const a = [c[0], c[1]];
  const b = [c[2], c[3]];
  const [first, second] = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? [a, b] : [b, a];
  return `${first.join(",")}|${second.join(",")}`;
}

/** A light's identity: where it is and how far it reaches. */
export function lightKey(l) {
  return `${l.x},${l.y},${l.config?.dim ?? 0}`;
}

/**
 * What to remove and what to add so the module's own things match the new map, leaving anything unchanged exactly as it is
 * (an opened door stays open). `existing` is `[{ id, key }]`; `desired` is `[{ key, data }]`. Duplicates count once.
 */
export function mergeManaged(existing, desired) {
  const want = new Map();
  for (const item of desired) if (!want.has(item.key)) want.set(item.key, item.data);
  const have = new Set();
  const remove = [];
  for (const item of existing) {
    if (want.has(item.key) && !have.has(item.key)) have.add(item.key);
    else remove.push(item.id);
  }
  const add = [];
  for (const [key, data] of want) if (!have.has(key)) add.push(data);
  return { remove, add };
}

/** How far to move what is already in a scene (in pixels) when the picture's corner moved from `oldOrigin` to `newOrigin`
 *  (both in map squares). Null when nothing moved or either is unknown. */
export function originShift(oldOrigin, newOrigin, size = GRID_SIZE) {
  if (!oldOrigin || !newOrigin) return null;
  const dx = round((oldOrigin.x - newOrigin.x) * size);
  const dy = round((oldOrigin.y - newOrigin.y) * size);
  return dx === 0 && dy === 0 ? null : { dx, dy };
}

/** A wall's ends moved by a shift. */
export function shiftWall(c, { dx, dy }) {
  return [c[0] + dx, c[1] + dy, c[2] + dx, c[3] + dy];
}
