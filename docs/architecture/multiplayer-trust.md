# Multiplayer input and room authority

The app uses an anonymous Centrifugo broker, public Watch rooms and client-side
Sudoku state. The broker supplies publication connection IDs; application role
fields do not authenticate a person or prove room ownership.

## Threat model and enforcement

All live game publications pass the same complete-object validation and authority
check before identity bookkeeping, event deduplication, sequence tracking or React
callbacks. The session hook validates again before mini-game updates/resets; the
router validates before state writes. Saved-state hydration remains a separate,
tolerant migration boundary. Invalid network values are rejected, not repaired
into a playable board. Accepted snapshots are hydrated to derive conflicts,
counts, status and empty undo history using the existing domain rules.

A room policy pins its first accepted host logical identity to a broker connection.
Other connections cannot become host merely by announcing that role. Guests need
an observed host approval for their own request, a host-carried approval list, or
the pinned host's explicit `auto` policy. A pending request is a spectator until
admission. Request IDs and cancellations belong to the requesting member.

| Action | Host | Approved guest | Pending requester / spectator |
| --- | --- | --- | --- |
| Initial snapshot, join decision/policy, Tic Tac Toe state | Yes | No | No |
| Board edits, notes, undo/shift snapshots, heartbeat | Yes | Yes | No |
| Cursor, active digit, hint highlight, fist bump, retro toggle | Yes | Yes | No |
| New-puzzle request, acceptance, cancellation | Yes | Yes | No |
| Tic Tac Toe shift/move for the sender's own player ID | Yes | Yes | No |
| Spectator hint and allowed reaction | Yes | Yes | Yes |
| Own join request/cancellation | Yes | Yes | Yes |

The publication's logical sender must match its accepted connection membership.
Role, cell-owner and mini-game player claims must match that member. Snapshot
metadata owned by the host (mini-game state, host cursor/digit/preview, host retro
state) is omitted when projecting a guest snapshot to the application. This also
allows existing clients that attach these optional fields to guest snapshots.
Co-op peers retain their existing ability to replace a board for shifts, undo and
accepted rematches. This is not a host-authoritative move protocol; state revision
and convergence remain tracked in issue #68.

The accepted membership list, rather than raw role claims, drives presence UI and
mini-game membership. An approved guest may explicitly continue as solo host after
the host leaves; the first accepted successor is pinned. Transport reconnects retain
room policy and approvals in the existing client instance. Returning to the same
room for spectator-to-guest transition retains that policy; a different room gets
a new policy. Missing announcement evidence fails closed until fresh presence.

## History and compatibility

History is sorted by broker offset. Every entry uses the live validation/authority
boundary against a separate policy/identity copy, including announcements and
join decisions preceding recoverable events. Only validated, authorized snapshots
can select the replay start. Historical connections never overwrite live identity
bindings. History deliberately bypasses wall-clock skew and live per-sender sequence
checks: it is broker-ordered recovery, not new live traffic. Accepted event IDs are
still deduplicated. Cross-sender ordering and stale replay racing live traffic are
not solved here (#68).

Protocol version remains 2 with supported legacy version 1. Optional metadata can
be absent, variant aliases remain accepted, and no saved-game key or representation
changes. Host presence adds optional `approvedGuestIds`; older clients ignore it.
Existing clients with no such field can establish guest approval through an
observed join exchange or auto policy. A late viewer with an exhausted history and
no approval evidence rejects guest deltas and waits for a fresh host snapshot; it
does not infer approval from a guest's claim. Per-peer compatibility and feature
negotiation remain separate work in #70. This policy does not claim mixed native
build/device verification.

## Residual risks and alternative

These are client-side session-integrity checks, not access control on the broker.
Anonymous subscribers can read history, publish, race the initial host claim,
consume resources, or claim a departed logical identity once its connection binding
is released. A fresh page/client instance has no authenticated record of prior room
ownership or approval. Browser storage and arbitrary modified clients are not
trusted proof of identity. Public spectators intentionally see board state,
including the solution already carried by existing snapshots. No production probes
or payload examples are part of this document.

Signed room capabilities or authenticated server-issued subscription/publication
tokens could establish stronger ownership, admission and reconnect identities.
They require a trusted issuer and broker enforcement, change deployment and
legacy-client compatibility, and need a separately scoped architecture decision.
They are not introduced by these client-only changes. Device lifecycle and release
acceptance stay in #59/#72; anonymous ownership and resource abuse must not be
represented as solved by the local tests.
