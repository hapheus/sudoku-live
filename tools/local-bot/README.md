# Local Sudoku Shift bots

This tool is built and run only on the operator's computer. It has its own npm
package, lockfile, dependencies and ignored `.build/` directory. App builds never
install this package, import its entry point, download its browser or start bots.
There is no bot launch control in the shipped app.

Use Node >=22.18 and run the following from the repository root:

```sh
npm ci
npm ci --prefix tools/local-bot
npm run bot                          # builds first; 3 independent bots, no windows
npm run bot -- --count 5
```

Start the app and Centrifugo separately. The default backend is
`ws://127.0.0.1:8081/connection/websocket`. Headless operation only needs Node;
it does not launch Chromium or require an app server. `npm run build:bot` builds
explicitly without starting sessions. `npm run bot -- --help` prints options.
The count is an integer from 1 to 10 and sets independent player slots. Slots
pause during player replacement, so fewer games can be active temporarily.
Invalid or repeated flags fail before build
or connection. CLI options take precedence over environment variables.

## Production WebSocket

A local worker can connect directly to the production backend using ordinary
client permissions. It needs no Docker network, admin API key or server process:

```sh
npm run bot -- --count 5 --ws-url wss://sudoku-ws.fraha.dev/connection/websocket
```

`CENTRIFUGO_URL` also sets the backend; `BOT_COUNT` sets the default count.
A production connection advertises real sessions to production Watch users.
Use the same backend as the humans who should watch or join. The normal app
transport policy upgrades public `ws://` addresses to `wss://`; loopback remains
plain WebSocket. TLS certificate verification stays enabled.

## Visible operation

Install the optional local browser once, then launch:

```sh
npx --prefix tools/local-bot playwright install chromium
npm run bot -- --headed --count 5 --app-url http://127.0.0.1:5173
# Or show production-connected bots through the production app:
npm run bot -- --headed --count 5 \
  --ws-url wss://sudoku-ws.fraha.dev/connection/websocket \
  --app-url https://sudoku.fraha.dev
```

`BOT_APP_URL` sets the app URL (default `http://127.0.0.1:5173`). One Chromium
browser opens one real Watch tab for each bot. Tabs follow the worker's actual
moves, notes, cursors, shifts and completion over the ordinary protocol; these
are spectator views of the Node workers. Each tab is configured to use exactly
the worker backend before the app starts. Replacement games replace their tabs.
Closing the browser stops all bots; Ctrl+C or SIGTERM closes the browser and
releases all game/lobby subscriptions. A missing browser, failed app load or
20-second connection startup deadline shuts down all started sessions. Browser
page loading has its own bounded timeout.

## Behavior and recovery

Each player gets a unique identity and ordinary generated name (for example
`CalmOtter`). At the start, the player randomly chooses 6x6 (the app's `2x3` box
layout) or 9x9 (`3x3`), Easy/Medium/Hard/Expert difficulty, and either Auto Accept
Joins (`auto`) or No Joins Allowed (`disabled`). Notes style and personal tempo
are also chosen once. This profile stays the same for a randomly chosen 1–3
completed puzzles. Each puzzle gets a fresh game ID; the player keeps their name
and identity across those puzzles. Intermediate puzzles show the completed board
for five seconds before the same player continues.

After the last puzzle the player disconnects. The slot stays offline for a random
10–30 seconds, then a new player starts with a fresh identity, a different ordinary
name and a newly sampled profile. Each slot does this independently. Stopping the
worker during a gap cancels future starts. Headed tabs close for departed games
and reopen for new games; a gap with no active game tabs keeps the browser alive.

Disabled joins are advertised in both presence and Watch and actually reject
join requests and guest edits. Spectating still works. Auto-accept players use
the ordinary co-op handshake. Puzzles and actual difficulty metadata come from
the current app generator, including its honest rating fallbacks. Autoplay prefers logical opportunities and uses the stored solution
when needed. Move timing is recalculated from the current technique, number of logical
opportunities, average candidate count, proximity to the previous move and recent
fluent moves. Obvious nearby placements come faster; difficult searches take
longer. Each player has an individual tempo, with occasional longer thinking
pauses and short runs of faster moves. The actual generated difficulty (including
an Expert rating) sets the initial pace. These are soft pace targets, so the last
cell never waits out an arbitrary whole-game duration. Search cursors, hesitation,
digit selection, notes, shifts and placements are actual protocol events visible
in Watch. Partner edits and shifts trigger fresh analysis. Hints and supported
co-op interactions reuse the source worker. Human edits protect givens; mistakes pause the bot
until corrected. Shifts pause while a partner is present.

Connection loss retains the board and IDs in RAM. Reconnect publishes current
snapshots; there is no offline catch-up burst. Restarting the process creates
fresh identities and games. Shutdown drains outstanding operations with a
10-second deadline. No durable storage or cross-process leader lock is provided.
This retains the app's existing anonymous client trust model.

## Local checks

```sh
npm --prefix tools/local-bot test
# Disposable backend on loopback port 18081; never point tests at production:
docker compose -p sudoku-shift-bot-integration -f tools/local-bot/compose.test.yml up -d --wait
npm --prefix tools/local-bot run test:integration
CENTRIFUGO_TEST_DOCKER_RECOVERY=true npm --prefix tools/local-bot run test:integration
docker compose -p sudoku-shift-bot-integration -f tools/local-bot/compose.test.yml down
```

All tests run headlessly, including browser-view and `--headed` flag coverage.
Tests inject a headless browser-view factory; they never launch the visible bot
entry point with `--headed`. The ordinary manual bot command still supports
visible windows when explicitly requested. Integration QA runs real workers,
a temporary Vite app and headless Chromium. Ports 15373 and 18081 must be free. Browser installation is
required for this QA. Unit tests use an explicitly mocked WebSocket boundary;
they separately cover notes, shifts, completion, co-op edits and departures.

The Vite application build rejects bot imports and embedded runtime markers.
The itch packager checks archive entries and output contents. Docker excludes
the entire tool from its build context and copies only app assets into nginx.
Capacitor copies the same guarded `dist/` tree to both mobile platforms. Inspect
copied output with:

```sh
npm run verify:bot-exclusion -- dist dist-itch ios/App/App/public android/app/src/main/assets/public
```

See [provenance](provenance.json) for exact source and destination base revisions.
The source worker's deployment files and vendored app engine were deliberately
replaced by local tooling and imports of the current application modules.
Required license notices are preserved in [LICENSE](LICENSE).
