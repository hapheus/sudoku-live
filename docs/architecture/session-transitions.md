# Session transition ownership (#73)

This is an incremental extraction. Join-request state now has one implementation
owner, `services/join-transitions.js`. Other session state still uses controlled
React setters and the existing async callback mirror; this change does not complete
#73 or resolve the concurrency limits in #68.

## Existing behavior and responsibilities

| Transition | Orchestrator | State and effects |
| --- | --- | --- |
| Solo start / saved Solo restore | `useOnlineSession.startNewSoloGame` | Engine generation or stored hydration, preferences, background, host identity; retain an occupied room on replacement; persist and optionally publish |
| Setup play / resume / back | `useNavigationAndSetup` | Confirmation, selection and focus; host room publication; detach a guest when leaving |
| Watch entry / exit | Both session and navigation hooks | Cancel pending admission, clear visual state, load cached snapshot, join spectator channel or lobby, update URL |
| Request / approval / rejection / cancellation | `join-transitions` for request state; hook and router for effects | One pending request and timeout, queued host requests, consume before callbacks/publication; hook retains room, routing and feedback effects |
| Host departure / continue Solo | Presence callbacks and `useNavigationAndSetup.detachCoopToSolo` | Accepted membership, mini-game departure, retain board, explicit host continuation and persistence |
| Rematch request / acceptance / cancellation | Navigation hook and remote event router | Existing protocol and engine replacement, background, hints and selection resets, persistence and publication |
| Reconnect / cached-page restore | Online client and session lifecycle effect | Reuse transport/subscriptions and policy; history/recovery and presence refresh; no new puzzle or application timer |

The map describes current ownership, including remaining duplication. The board
engine stays independent of React, storage, DOM, audio and broker transport. Room
authority, peer compatibility and causal snapshot acceptance stay in their
existing services and run before remote transition callbacks.

## Join command boundary

`createJoinTransitions` takes live state/client/timer refs and only the two request
setters. Its commands are `begin`, `finish`, `cancel`, `enqueue`, `remove`,
`clearQueue` and `respondNext`. The remote router receives this command object;
it no longer receives request setters or the timeout ref. Navigation imports
shared cancellation/policy-drain operations from the service instead of importing
the online hook.

State is consumed in the live ref before notifying React or publishing a response.
Two callbacks in the same turn therefore see the consumed request even before a
React render. A repeated cancel sends no second cancellation. A completion with a
request ID cannot clear a replacement request or its timer. Queue deduplication
preserves the existing request-ID/requester-ID rule. Membership changes remove
only that requester's queued requests. Draining a queue clears it before any
response is sent. These are local ordering guarantees, not distributed admission
or delivery guarantees.

The hook retains the 30-second timeout, its existing timeout feedback and Watch
routing. A response or cancellation clears that timer; the timeout checks its
captured request ID before acting. Unmount retains its existing timer cleanup.
No persistence key, saved representation, URL, room admission policy, protocol
field, focus rule or transport lifecycle is changed.

## Why a command module first

A local reducer could make session transitions explicit, but reducer dispatch alone
would not update the live values needed by synchronous broker callbacks. Adding a
second reducer mirror while the existing setters remain would add another state
representation. The command module instead centralizes an existing invariant and
removes cross-hook imports without adding a state framework or changing render
ownership. A future session-wide state owner should migrate the remaining identity,
board and navigation transitions together with their behavior tests; do not claim
the present request extraction removes App's render-time mirror.

## Verification boundary

Request tests cover stale completions, replacement timers, repeated cancellation,
queue deduplication across callers and reentrant policy changes. Existing router,
hook and navigation tests characterize approval, rejection, timeout and Watch
behavior. Headless application/broker checks cover live admission and lifecycle.
These checks do not replace native-device acceptance in #59/#72 or the remaining
convergence scenarios in #68.
