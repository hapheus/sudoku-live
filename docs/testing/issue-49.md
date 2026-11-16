# Issue #49 — Observable solo continuation

The remaining guest explicitly choosing Continue Solo becomes the host of the same room. The existing host-session path re-subscribes the game and lobby with solo metadata; spectators remain on their original channel and authoritative presence refreshes their counts. Back-to-setup still detaches rather than publishing an inactive game. The solo snapshot retains the room ID and background separately.

Regression first failed because continuation discarded the room ID. Navigation and real session-hook integration tests now verify promotion, room identity, unchanged board, persisted snapshot, solo lobby metadata, and spectator presence after re-subscription.

Checks: 217 tests / 42 files pass; targeted hook tests pass; build passes; lint has 0 errors / 27 pre-existing warnings; `npx cap ls`, `docker compose config -q`, and diff checks pass. No UI markup/styles changed. No live-server or physical-device test performed. Quality >=90 and pre-existing browser snapshot debt remain tracked separately (#51 / QA report).

Resume follow-up: continuation keeps the Solo root URL while retaining the observable room in state/snapshot. This ensures reload restores the current Solo snapshot rather than entering the old co-op/guest resume route. A regression first failed on the room URL and passes with the established Solo route retained.
