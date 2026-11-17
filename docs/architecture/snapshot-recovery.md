# Multiplayer convergence and recovery — issue #68

## Authority and ordering contract

[Room admission and anonymous trust limits](multiplayer-trust.md) remain unchanged.
Hosts and approved guests can edit; spectators cannot write Sudoku state. The
broker binds transport identities but does not calculate the authoritative board.
No new framework, server database or application dependency is introduced.

Every updated client instance has a random `stateActor` independent of the saved
logical player ID. Its `seq` identifies publication order; `stateClock` is a
Lamport clock, incremented locally and advanced by received revisions. Neither
wall time nor elapsed puzzle time is a state revision. Only Sudoku mutations and
snapshots advance received recovery clocks; spectator hints/reactions cannot poison
them or smuggle an unvalidated board through an ancillary event. Causally later operations
have larger clocks. Concurrent operations use lexicographic actor-ID ordering to
break equal-clock ties consistently on all clients.

Numeric value and ownership share one cell register; notes have a separate
register. A note-only `value: null` retains its no-numeric-edit meaning. It cannot
suppress a concurrent numeric move, and an older note array cannot overwrite a
newer explicit clear. Domain-derived peer note removal is tracked as well. Grid
conflicts, counts and solved state continue to be derived by the existing Sudoku
engine; givens and solution data come from the accepted puzzle/checkpoint.

Init, undo/full sync and shifts establish complete-board checkpoints. Concurrent
checkpoints have one deterministic winner. Cell revisions after that checkpoint
are retained during recovery, provided their target remains editable. An edit
whose target became a given in the winning shift cannot overwrite that clue.
This explicitly defines concurrent shift/move behavior rather than relying on
arrival order. A losing concurrent intent can be superseded; this is different
from replacing a newer accepted revision with an older snapshot.

## Wire metadata and bounded state

| Field | Meaning |
| --- | --- |
| `stateActor`, `stateClock` | Client incarnation and logical operation order |
| `seq`, `eventId` | Existing transport identity/order and deduplication |
| `puzzleGeneration` | Accepted rematch event ID, initially null |
| `puzzleRevision` | Ordered revision that established that generation |
| `stateVector` | Per-generation knowledge of accepted/superseded actor sequences |
| `stateRevisions` | Checkpoint/latest revision, per-cell numeric/note revisions and rematch request/cancel decision |

The network boundary validates finite safe integers, bounded actor/token strings,
unique cell indexes and board-size bounds. Metadata has at most 81 cell entries
and 256 actor entries. A generation change retires old register/vector evidence;
old-generation packets cannot replay into the new puzzle. No saved-game key or
serialized Sudoku-domain representation changes. Metadata is transport state,
not a new persistent application-state store.

## Snapshot recovery

The transport retains a domain-only cached board from accepted local and remote
operations. Outgoing heartbeats use this board, avoiding a stale React mirror
being stamped with newer revision metadata. The live UI remains owned by the
existing hooks; this is not the broader session-ownership refactor in #73.

A modern heartbeat with genuinely new knowledge can merge independent cell
registers over the winning checkpoint instead of rejecting incompatible vectors
forever or replacing the whole local board. The union vector describes the merged
state. Accepted explicit note clears, numeric ownership and rematch decisions are
retained by their revisions. Equal derived state can reconcile to the host's
heartbeat, preserving the existing host preference. An older heartbeat with no
new knowledge cannot discard locally known changes. Elapsed time uses the maximum
within a generation; a new puzzle can reset its clock normally.

A tagged rematch must name its own event ID. Concurrent rematches use their
ordered generation revisions; a later heartbeat carries that revision so a
client can recover even after the rematch has fallen out of broker history.
New-generation recovery supersedes old offline intents rather than applying them
to a different puzzle. Delayed old snapshots and edits are rejected, including
edits from actors not previously observed by the receiver.

Modern history replays every validated entry in the bounded 25-publication window.
Selecting only the last broker snapshot could omit an earlier, higher-priority
concurrent checkpoint. Per-cell/checkpoint revisions suppress already covered or
losing entries even after the event-ID cache evicts their IDs. Legacy unversioned
history keeps its previous replay-start behavior. Live and historical delivery
still pass schema, peer compatibility, broker identity and room authority checks
before modifying recovery or UI state.

## Failed publication and lifecycle

Unacknowledged optimistic mutations retain their original envelope in an in-memory
queue. Resubscription announces the same participant and retries pending packets
with the same event ID, sequence, clock and generation. Receiver deduplication and
revision guards prevent duplicate effects. Acknowledged work is removed; work
superseded by a newer puzzle is discarded. Changing rooms or explicitly closing
the client clears pending work. Suspend/resume retains the same subscriptions,
queue, generation and revisions; no new polling interval or retry timer is added.

This queue is not durable across process termination. Existing local saved-board
restoration remains supported; it does not claim exactly-once delivery across
process destruction. Native lifecycle/device acceptance remains in #59/#72.
Complete snapshot adoption retains the established hydration/undo-history reset;
ordinary local/remote cell and shift operations keep the existing domain history
behavior. Domain generation, uniqueness, givens and saved-state code are unchanged.

## Compatibility and security limits

Wire version remains 2; fields are optional additions. Existing legacy initial
rooms retain their previous path. Untagged traffic after a known tagged rematch
fails closed. Deterministic convergence requires updated writers carrying the
revision contract; arbitrary mixtures with old clients cannot provide the new
guarantees. The existing legacy null-note sentinel is preserved.

These checks do not authenticate anonymous humans or prove that a modified host
reports truthful content/revisions. A trusted participant can already publish an
arbitrary complete board. Authenticated room capabilities, resource-abuse controls
and hostile-peer consensus are separate architecture work. The 256-actor limit
applies within one puzzle generation; pathological long-lived generations beyond
that bound need an explicit restart rather than unsafe evidence eviction.

## Reproducible verification

```bash
npm run quality
npm run build
# Dedicated local broker, independent of application/development containers:
docker compose -p sudoku-convergence-qa run --no-deps --detach --name sudoku-convergence-qa -p 127.0.0.1:17881:8080 centrifugo
curl --fail --retry 20 --retry-delay 1 --retry-all-errors http://127.0.0.1:17881/health
SYNC_E2E=1 npx playwright test --config playwright.sync.config.ts
docker rm -f sudoku-convergence-qa
docker compose -p sudoku-convergence-qa down --remove-orphans
```

The existing CI Playwright job now runs this dedicated broker matrix, so these
regressions are exercised on pull requests. Tests always run headlessly.

| Scenario | Evidence |
| --- | --- |
| Same-cell numeric and concurrent numeric/note edits | Both variants, real broker, host/guest/spectator convergence |
| Actual row/column shifts and simultaneous full snapshots | Both variants, real broker; domain/unit invariants remain covered |
| Simultaneous accepted rematches | Both variants, deterministic generation and board winner |
| Added/cleared notes and ownership-only value-stable change | Both variants, paused-clock real-broker checks and router regression tests |
| Bidirectional missed deltas plus exhausted history | Both writers suppress incoming deltas, real disconnect/resubscribe, 30 intervening broker publications, explicit proof that the 25-entry window no longer has the edits; heartbeats merge both edits |
| Failed publish | Injected publish rejection, real resubscription/retry, unchanged event ID, one spectator application |
| Missed rematch and late viewer | Generation recovery after history exhaustion, additional spectator joins and receives current progress |
| Delayed/reordered old snapshot and old edit | Valid sender with advanced transport sequence, stale puzzle generation rejected after a delivery barrier |
| Host departure | Approved guest continues as solo host in the same room; spectators receive subsequent moves |
| Broader application behavior | Full unit/coverage, visual/accessibility, peer-compatibility, browser-lifecycle and real co-op/Tic Tac Toe suites |

Suppression/rejected publication is controlled test injection, not claimed
physical packet-loss measurement. Broker retention, transport reconnection,
admission, history and subsequent delivery use real isolated Centrifugo instances.
This report does not represent physical iPhone/iPad/Duo or native network-switch
QA. Those release checks remain separate in #59 and do not close automatically.

## Candidate results

- Full headless functional, visual, accessibility and real-broker suite: **105 passed**,
  no skipped tests, no snapshot updates or new masks. Both auto/confirmed co-op,
  offline/reconnect, Tic Tac Toe and browser page restoration remain covered.
- Full unit/component coverage, typecheck and lint: **91.1/100**, **88.8%** line
  coverage, **1.47%** duplication, zero lint errors or warnings. Formula, scopes,
  assertions and required minimum were not weakened.
- Production build, Compose configurations and Capacitor CLI check passed. The
  latter reports that listing web plugins is not possible; no native build/device
  validation is inferred from it.
- **42 bot-consumer tests passed on Node 22.23.4.** The hint-clear fixture assigns
  separate guest/watcher logical identities so process-wide sessionStorage on newer
  Node releases cannot accidentally alias the test's two participants.
- The CI broker startup command was exercised locally. Startup readiness retries
  transient empty/refused HTTP responses; a healthy `/health` response is still
  required before executing tests. Only the dedicated QA container/network is stopped.
