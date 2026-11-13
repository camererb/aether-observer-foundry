# Aether Observer (Foundry VTT module)

The one Foundry module for [Aether Observer](https://aetherobserver.com). What it does:

- **Vision** (now): battle maps and hex maps for your table, as Foundry scenes. Details below.
- **Session notes** (new, 0.5.0): send your Foundry journal entries, or a whole folder of them, to your Aether Observer game log as session notes.

## Vision

Free battle maps and hex maps for your table, inside Foundry.

- **Free, no account:** press **Import sample maps** in the Scenes tab to bring in eight ready-made scenes (picture, grid, walls,
  doors and lights): the Ashvale (a 10 by 10 hex region, with a town, a cave and some ruins on it), the town of Coldharbour,
  the Blue Lantern inn, Greyfang Cave and the Ruins of Old Harrow (each with its lower level as a scene of its own) and a
  river crossing. The same maps come with a free Aether Observer game log.
- **Your own maps:** make them by voice or typing on [Vision](https://aetherobserver.com/aether-vision) (part of
  [Aether Observer](https://aetherobserver.com), a persistent world journal where the world remembers every event). Aether
  Vision itself is free; linking your own maps to Foundry is part of Aether Observer's paid plans.
- The module is free and open source (MIT).

Brings the map you made in Vision into a Foundry scene: the picture, the grid and its scale, walls, doors and
torch lights. 

Works with Foundry **v13** (written for it) and **v12**, self-hosted or on **The Forge**. This is a new module: if something doesn't work in your
Foundry, please open an issue.

## Import the sample maps (free, no account)

The module ships with eight ready-made scenes, so you can try it without an Aether Observer account or a link.

1. Install the module and turn it on in your world (Game Settings, Manage Modules, tick **Aether Observer**, save).
2. Open the **Scenes** tab (the map icon in the sidebar). As the GM you will see two buttons under *Create Scene*: **Sync
   from Vision** and **Import sample maps**.
3. Press **Import sample maps**. The scenes appear in the Scenes tab, in a **Vision** folder (the samples in a **Sample maps** folder inside it), and the first one (the hex region) opens. Maps you bring in from your own Vision link go in the **Vision** folder too.

The eight scenes: **The Ashvale** (a 10 by 10 hex region, with a town, a cave and some ruins on it), **Coldharbour** (the town),
**The Blue Lantern** (the inn), **Greyfang Cave** and **Ruins of Old Harrow** (and **Greyfang Cave: Below** and **Ruins of Old Harrow: Below**, their lower levels: Foundry has no levels in a scene, so each level is its own scene, and the stairs on the picture say where they go) and **Ambush at the Ford** (a river crossing).

Good to know:
- Importing takes a moment and about 16 MB of pictures are copied into your Foundry's data folder.
- It is safe to press again. A sample that is already there is skipped, so nothing doubles up, and your own changes to a
  scene (tokens, notes, hand-drawn walls) are left alone.
- The scenes are not added to the navigation bar at the top of the screen; open them from the Scenes tab.
- The folders are found by a hidden mark, so you can rename them or move a scene to another folder: a scene you have moved stays where you put it when it is updated. A scene made by an earlier version of the module is filed in the folder once.
- Delete a scene you do not want. It will not come back unless you press **Import sample maps** again.
- Only the GM sees the button.

## Install

From Foundry: Install Module, paste the manifest link from the latest release on this repo's Releases page
(`.../releases/latest/download/module.json`). Or install by hand:

## Install by hand (self-hosted)

1. Copy this whole folder (`aether-observer`, with `module.json` inside it) into Foundry's user data folder, under
   `Data/modules/`. So you end up with `Data/modules/aether-observer/module.json`.
2. Restart Foundry. In your world: Game Settings, Manage Modules, tick **Aether Observer**, save.

On The Forge, a module is installed from a manifest address, which needs the module hosted on the web first (a later
step). Until then, use it self-hosted.

## Use

1. On Aether Observer, open the story's **Settings** (there is a link on the Vision tab and on Session notes), open **Foundry link** and press **Make a Foundry link**. Copy the
   link (it is only shown once; "Make a new link" replaces it and the old one stops working).
2. In Foundry: Game Settings, Configure Settings, **Aether Observer**, paste it into **Vision link**. It is
   kept on this computer only, so players never get it.
3. **Room maps:** on Vision, open the scene tab you want and pick **Map ▾, Send to Foundry**. Foundry brings it in
   within 5 seconds (or press **Sync from Vision** in the Scenes tab to do it at once and open the scene).
4. **Hex areas:** in the Hex areas tab, open **More** and tick **Keep Foundry up to date**, or press **Send to Foundry**.
   Only what your players see is sent: no hidden hexes, hidden things or encounters. While it is ticked, each change you
   make is sent a moment after you stop, and Foundry swaps the new picture in within 5 seconds. A change only you can see
   (a hidden thing, an encounter) sends nothing.

Each tab and each area gets its own Foundry scene, made the first time and updated after that. The automatic check only
updates scenes; it never opens one, so it can't pull you or your players away from the scene you are on. The button opens
the scene it brought in.

**Keep this Foundry window visible.** The check runs in the GM's browser, and a browser slows a hidden tab right down.
The setting **Check for new maps every 5 seconds** turns it off.

**A map stays in Foundry** until you delete the scene there. On Aether Observer, the Foundry link panel lists every map
sent, each with a **Remove** button: that takes it off the list so it stops updating, and leaves the scene in Foundry.
So players can always go back to an area you sent earlier.

Hex scenes are gridless (the picture has its own faint hex grid) and measured in miles: one hex across is one hex size
(1, 6 or 24 miles), so Foundry's ruler reads the distance across the map.

From a macro: `game.modules.get("aether-observer").api.sync()`.

## What it changes, and what it never touches

- A hex area has no walls, doors, lights or darkness at all. It makes and replaces only the walls and lights it made itself (they carry the module's flag). Walls you draw, your
  own lights, tokens, notes and drawings stay as they are.
- On a re-sync it updates the picture, the size and the grid. The scene's name, darkness, vision and fog are set only
  when the scene is first made, so your own changes stay.
- Every door arrives closed. Secret doors arrive as ordinary doors (change them to secret in Foundry if you want).
- Windows are solid walls. Furniture does not block sight.
- The picture (WebP, or JPEG) is saved into Foundry (`Data/aether-vision/`, or the Assets Library on The Forge), a new file for
  each update of a map. They add up on a long session (a hex picture is about 1 to 2 MB): delete the `aether-vision` folder
  now and then, from Foundry's file browser, when no scene needs it. If saving fails, the scene uses the picture straight from
  Aether Observer, which stops showing if you turn the link off.

## Files

- `module.json`: the manifest (minimum v12, verified v13).
- `scripts/aether-observer.js`: the button, the setting and the sync. Foundry-only code.
- `scripts/convert.js`: the map to Foundry walls, doors and lights. Plain code, tested with
  `node --test scripts/convert.test.mjs`.
- `lang/en.json`: the module's wording.
- `samples/`: the free sample maps (`index.json` lists them; each is a map file plus its picture).

The map file Vision sends is a Universal VTT file (a picture, walls, doors and lights), read with the link you paste.

## Updates keep what you did, and ignoring lighting (v0.2.1)

- **An update is a merge.** Walls and lights that haven't changed are left alone (a door you opened stays open); only new ones
  are added and gone ones removed. Your fog setting, tokens, notes, drawings and hand-drawn walls are kept. If the map grows
  to the north or west (the picture's corner moves), the tokens, notes, drawings, walls and lights already in the scene move
  with it. Foundry's explored-area record is not moved, so the newly shifted part may look unexplored. Not yet tried inside a
  real Foundry.
- **Live room maps:** on the Vision page, turn on **Keep Foundry up to date** in the Map menu and each change to the map
  is sent a few seconds after you make it; the module's automatic check (every 5 seconds) then brings it in.
- **Ignore lighting (global illumination)** (Configure Settings; off by default; room maps only): every update keeps global
  illumination on and darkness at 0, so torches and the dim ambient make no difference; walls still block sight.
- **Glowing mushrooms and crystals give light** (Configure Settings; on by default): in caves, mushrooms (soft green) and crystals
  (cold blue) on the map give a small, steady light of their own. Turn it off to leave them out. Cave systems now put
  crystals in the Crystal Grotto, the Deep Cavern and sometimes the Lair.

## Session notes from Foundry journals

1. On Aether Observer, open the story's **Settings**, **Foundry link**, and tick **Also let Foundry send session notes**. The same Vision link
   is used; nothing new to paste.
2. In Foundry, right-click a journal entry and pick **Send to Aether Observer**, or press the same button at the top of an open entry.
   Right-click a journal folder and pick **Send folder to Aether Observer** to send every entry in it and its subfolders.
3. Each entry becomes one set of session notes on the story, named as in Foundry. A folder keeps its structure in the names
   ("Season 2 / Session 12"). An entry with several pages gets a heading for each page. Text only: pictures are left out.
4. Send again after you edit: the same notes are updated, not copied. Notes already published as a record, or open on the site
   right now, are left alone and Foundry tells you so.

From a macro: `game.modules.get("aether-observer").api.sendEntry(entry)` or `.sendFolder(folder)`.
