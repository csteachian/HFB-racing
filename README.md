# HFB Racing

A 3D kart racer that runs in the browser. Three built-in courses, import your own track from Blender, a live minimap, engine sounds, and online races with friends.

No build step: it is plain HTML and JavaScript.

## Play it

Open `index.html` through any web server (browsers block some features on `file://`). For example:

```
python3 -m http.server 8000
```

then visit http://localhost:8000.

**Controls:** arrow keys or WASD to drive, Space or Shift to drift (release in a corner for a boost), M to mute. On phones and tablets there are on-screen buttons.

## Put it online with GitHub Pages

1. Create a repository and upload everything in this folder (keep the folder layout).
2. In the repository go to **Settings, Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
3. After a minute your game is at `https://<your-username>.github.io/<repository-name>/`.

Pages serves over HTTPS, which online racing needs.

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
  "half": 9
}
```

Only `file` is required. `id` is a short unique name, `sky` and `ground` are colours, and `half` is half the road width in metres (leave it out to measure it from the `Road` mesh). The course then shows up in the picker and in the online lobby, and everyone in a room loads the same file. Reload the page after changing the folder.

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

## Tests

The tests run the real game code in Node with a stubbed browser, plus a simulated PeerJS network.

```
cd tests
npm install
node sim.js ../game.js ../examples/hillside-loop.glb nocp-test.glb   # courses, courses/ folder, import, stopping, audio
node msim_p2p.js ../game.js ../net.js                                                 # online racing over PeerJS
```

`msim.js` tests the alternative room transport used on Claude's artifact pages and is not needed for GitHub Pages.
