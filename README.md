# HFB Racing

A 3D kart racer that runs in the browser. Eight built-in courses, a Normal and a Chaos race mode (obstacles and rockets), import your own track from Blender, a live minimap, engine sounds, and online races with friends.

No build step: it is plain HTML and JavaScript.

## Play it

Open `index.html` through any web server (browsers block some features on `file://`). For example:

```
python3 -m http.server 8000
```

then visit http://localhost:8000.

**Controls:** arrow keys or WASD to drive, Space or Shift to drift (release in a corner for a boost), M to mute, R to respawn, F to fire a rocket (Chaos race only). Pick a course from the dropdown on the menu. On phones and tablets there are on-screen buttons.

## Put it online with GitHub Pages

1. Create a repository and upload everything in this folder (keep the folder layout).
2. In the repository go to **Settings, Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute your game is at `https://<your-username>.github.io/<repository-name>/`.

Pages serves over HTTPS, which online racing needs.

## Built-in courses

Kerb Circuit, Harbour Hairpins and Ridgeback are short (about 1 km, 3 laps). Pine Summit, Canyon Rush, Harvest Valley, Coast Highway and Moonlit Ridge are 3 to 4 km long (2 laps) with their own scenery: snowy pines and cabins, cacti and mesas, barns and hay bales, palms, villas and lighthouses, and street lamps at night. They are defined in the `COURSES` list in `game.js`; `tools/gen_courses.js` is the script that searched for their layouts (it checks corner tightness, road spacing and slope; run `npm install` in `tests` first).

## Normal race and Chaos race

The menu has two start buttons. **Normal race** is the plain race. **Chaos race** adds:

- **Obstacles** placed at random along the road: rocks, groups of barrels, blocks of ice and smouldering burnt-out cars. They are solid walls. Hitting one head-on takes most of your speed and swings you round it; a glancing hit costs little. The layout is random each race, and there is always room to get past (at least 5.5 m on every stretch). Bots steer around them, and back out if they get wedged.
- **Rockets:** every car carries three per race (press **F**, or the Fire button). A rocket flies in a straight line along the car's heading at 324 km/h until it has been off the course for 5 seconds, then disappears. It explodes on rocks, barrels, ice and wrecks. A car it hits explodes, stays out for 3 seconds, then comes back on the road centre close to where it blew up, protected from rockets for 1.5 seconds. Cars that have finished the race cannot be hit. Bots fire too: while they still have rockets they line up behind the nearest car ahead.

Online, the host picks the mode in the lobby. Everyone gets the same obstacles (the host sends a random seed). Each player's own browser decides whether its car was hit, and tells the others.

The numbers are constants at the top of the *chaos mode* section of `game.js`: `ROCKETS`, `ROCKET_SPEED`, `ROCKET_OFF_SECS`, `BLAST_SECS`, `SAFE_SECS`, and `ROCKETS_STOPPED_BY_OBSTACLES` (set it to `false` to let rockets fly straight through obstacles). The obstacle spacing is in `buildObstacles()`.

## Sounds

Engine sounds for every kart (they rise with speed and fade with distance), a bell chime each time you complete a lap, a short fanfare if you finish first, and (in Chaos races) rocket launches, explosions and thumps when you hit an obstacle. M or the Sound button mutes everything. Browsers only allow sound after your first click or key press.

## Rules worth knowing

- **Checkpoints:** laps only count if you pass every checkpoint in order, within the road width plus a small margin. Cutting across the infield or skipping ahead shows MISSED CHECKPOINT and puts you back on the last checkpoint you really passed after about 1.5 seconds. Staying more than 18 m off the road, or driving on the grass for more than 6 seconds, shows OFF COURSE and does the same (far from the road you also crawl at 27 km/h meanwhile).
- **Respawn:** press **R** (or the Respawn button) to jump back to your last checkpoint at a gentle speed. It never gains you ground, and works again after a second.
- **Grass** limits you to about 60 km/h.
- **Boost** fades out over about 1.5 seconds. To tune it, change `FALLOFF_BASE` and `FALLOFF_RATE` just above `step()` in `game.js` (lower numbers give a longer fade). The number of checkpoints is `GATES` near the top of `game.js`.

## Online racing

Click **Race online**, enter a name, then either **Create room** (you get a 5-letter code) or join with a friend's code. Up to 6 players; empty places are filled by bots run on the host's computer.

It uses [PeerJS](https://peerjs.com) (WebRTC):

- The free PeerJS broker (`0.peerjs.com`) only introduces players to each other. Race data goes directly between browsers.
- The room lasts only while the creator's tab stays open. If the creator leaves, everyone returns to the menu.
- Most home and mobile networks work. Some strict networks (corporate firewalls, some mobile carriers) need a TURN relay. Add one to `ICE` at the top of `net.js`.
- To avoid depending on the public broker you can run your own ([peerjs-server](https://github.com/peers/peerjs-server)) and set `BROKER` in `net.js`.
- If PeerJS fails to load, the **Race online** button stays hidden and the rest of the game works normally.
- The room creator is the referee. Other players can only change their own name and kart position; they cannot start races or change courses.

## Adding courses

Drop a Blender `.glb` into `courses/` and add one entry to `courses/courses.json`:

```json
{
  "id": "lakeside",
  "file": "lakeside-sprint.glb",
  "name": "Lakeside Sprint",
  "blurb": "One line shown under the course name.",
  "sky": "#5b86b0",
  "ground": "#4f7a4a",
  "half": 9,
  "laps": 3
}
```

Only `file` is required. `id` is a short unique name, `sky` and `ground` are colours, and `half` is half the road width in metres (leave it out to measure it from the `Road` mesh), and `laps` is the race length (default 3). The course then appears in the course dropdown (under "From the courses folder") and in the online lobby, and everyone in a room loads the same file. Reload the page after changing the folder.

- `courses/lakeside-sprint.glb` is a working example. `tools/make_course_example.py` is the script that made it: edit its `CPS` list to reshape the track, run `python3 tools/make_course_example.py courses/my-track.glb`, and add it to the manifest.
- Courses load only when the game is served over http(s). Opening `index.html` straight from disk shows the built-in courses only.
- A bad entry (missing file, unreadable file, fewer than 4 `CP` empties, duplicate id) is skipped and a note goes to the browser console.
- Players in an online room need the same courses. If someone's browser could not load the room's course they are returned to the menu with a message.
- Built-in courses are drawn with kerbs, trees and embankments; file courses show exactly the mesh you made, so give your road mesh whatever look you want.

## Your own tracks (Blender)

1. In Blender open the **Scripting** tab and run `tools/make_kart_track.py`. It makes a `Road` mesh and numbered `CP` empties along it.
2. Move the `CP` empties around the track in driving order (`CP`, `CP.001`, `CP.002`...). Optionally add `Pad` objects for boost pads.
3. Export as **glTF Binary (.glb)**.
4. In the game click **Import .glb track**, or drop the file onto the page.

`examples/hillside-loop.glb` is a ready-made sample.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page, styles and menus |
| `game.js` | The game: courses, physics, bots, minimap, sound, online flow |
| `net.js` | PeerJS room adapter used for online racing |
| `courses/` | Course files and the `courses.json` list |
| `tools/make_kart_track.py` | Blender helper script that sets up a track |
| `tools/make_course_example.py` | Generates the example course from a list of points |
| `examples/` | Sample track to try with the import button |
| `tests/` | Headless regression tests (see below) |

Libraries are loaded from public CDNs: three.js r128 and PeerJS 1.5.4 (both MIT licensed). Add your own `LICENSE` file for the game itself.

## Updating the live site

GitHub Pages and browsers cache files, so players can end up with an old `game.js` after you push a change. The script tags in `index.html` end in `?v=...`; change that value (and `VERSION` at the top of `game.js`) whenever you publish, and everyone's browser fetches the new files. The menu shows the version, and the online lobby warns when players are on different versions.

## Tests

The tests run the real game code in Node with a stubbed browser, plus a simulated PeerJS network.

```
cd tests
npm install
node sim.js ../game.js ../examples/hillside-loop.glb nocp-test.glb   # courses, courses/ folder, import, stopping, audio
node msim_p2p.js ../game.js ../net.js                                                 # online racing over PeerJS
node chaos_sim.js ../game.js                                                          # Chaos: obstacles, rockets, explosions, full races on all 8 courses
node mchaos_p2p.js ../game.js ../net.js                                               # Chaos races online over PeerJS
```

`msim.js` and `mchaos.js` test the alternative room transport used on Claude's artifact pages and are not needed for GitHub Pages.
