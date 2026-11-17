# Causal snapshot recovery (issue #68)

## Authority and revision contract

Room admission and snapshot permissions remain defined in
[multiplayer-trust.md](multiplayer-trust.md). This change does not turn the broker
into a state authority. Hosts and approved guests publish edits; the host's
heartbeat is the preferred reconciliation snapshot when both players know the
same edits. A guest heartbeat can recover a host only when it advances known
changes in an online game. Solo hosts retain their existing recovery policy.

Each client instance creates a random `stateActor`, independent of the persisted
logical player ID. Existing envelope `seq` numbers identify mutations within
that instance. Recreating a client with the same player ID therefore cannot
reuse the previous instance's revision space. A snapshot includes `stateVector`,
a map from actors to the last mutation known when the snapshot was constructed.
Cursor updates, heartbeat sequence numbers, wall clocks and elapsed game time
are not mutation revisions. No saved-state key or serialized Sudoku field changes.

Mutations include initialization, cell values/notes, full sync (including undo
and shifts), accepted rematches, and rematch request/cancellation. A rematch
is a causally ordered full snapshot, not a timer reset used as a revision.
Vectors retain knowledge across puzzle changes and reconnects in the same room.
Changing rooms creates a fresh recovery guard. Mutation tracking happens before
publishing an optimistic local edit, including when publication subsequently
fails; remote recovery cannot silently erase that edit.

## Delivery and recovery

A full snapshot must include every mutation already known locally. Missing or
older components reject the entire snapshot before background, mini-game or
Sudoku callbacks. The check runs for both live and historical snapshots. An
accepted snapshot carries its knowledge into subsequent outgoing snapshots.
Historical deltas already covered by that knowledge are ignored even after the
bounded event-ID cache has evicted their IDs. An unsafe historical snapshot
cannot truncate the preceding recoverable events when choosing a replay start.
Heartbeats and rematch cancellations are recoverable history entries as well.
History still requires compatible, authorized membership evidence.

The router compares notes (including clearing them) and cell ownership in addition
to the existing board, givens, status and timer fields. Recovery works with a
paused puzzle clock in both 6x6 and 9x9 games. Existing hydration derives counts,
conflicts and solved state and resets undo history when replacing a full snapshot;
this patch does not change that established full-snapshot behavior.

## Compatibility and limits that keep #68 open

Protocol version remains 2. Revision fields are optional schema additions; legacy
clients ignore them. A legacy snapshot can initialize an otherwise unknown room,
but cannot safely replace a client that already knows mutations. Unsequenced
legacy mutations also disable subsequent snapshot adoption: their inclusion
cannot be proved. Mixed-version recovery therefore fails closed rather than
claiming complete compatibility. Ordinary legacy deltas retain their prior path.
Network vectors reject malformed entries and more than 256 actors. Long-lived
rooms exceeding that wire limit need an agreed compaction/rejoin policy; no
unsafe eviction of revision evidence is introduced here.

These are causal inclusion checks, not proof that an anonymous publisher's board
actually represents its claimed vector. Existing trust limitations still apply.
They prevent **snapshots missing known changes** from rolling back that knowledge;
they do not solve arbitrary conflicting simultaneous full snapshots, deterministic
ordering of concurrent same-cell edits, or delayed pre-rematch deltas from an
actor that has not yet been observed. Concurrent incompatible snapshots are
rejected and may require an explicit restart rather than automatic merging.
An explicit puzzle-generation token and a complete conflict-resolution contract
remain needed before claiming the broader convergence acceptance criteria in #68.
Do not close #68 based on this implementation alone.

## Reproducible verification

- `npx vitest run tests/state-recovery.test.js tests/remote-event-router.test.js tests/online-game-client.test.js`
  covers paused note/ownership recovery in both variants, stale snapshot rejection
  after moves/sync/rematch, cross-sender inclusion, replay races, historical event-ID
  eviction, new client actors, malformed metadata and legacy limits.
- `CENTRIFUGO_E2E=1 npx playwright test tests/qa/snapshot-recovery.spec.ts`
  uses the isolated local Centrifugo broker on port 8081 with separate browser
  contexts. It suppresses a patch at the application callback to model missed
  application delivery, recovers notes/clearing/ownership via heartbeat without
  advancing time, and proves that a higher-sequence stale heartbeat is rejected.
  This is browser/backend evidence, not physical-device or packet-loss evidence.
- Full unit/coverage, lint, typecheck, production build and existing backend and
  browser-lifecycle suites remain required candidate checks. Native suspension,
  physical device QA and the remaining conflict/history-exhaustion matrix stay in
  #59/#68/#72.
