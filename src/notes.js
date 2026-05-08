/* Presenter notes for each slide.
   Edit freely — these are spoken-script style, not bullet points. */

window.SLIDE_NOTES = [
  // 1 — Title
  `Welcome — this is Learning Outcome 10: Database Locking Techniques.
Today we'll connect four ideas: transactions, data types, processing large datasets, and how locks keep concurrent work consistent.

Talking points:
• Re-introduce ACID quickly so locking has context.
• Mention that every example we'll show ties to a real SQL statement (BEGIN, SELECT FOR UPDATE, COMMIT).
• Tell the audience there's a live demo on the "Common Locking Techniques" slide — they will see two transactions racing.`,

  // 2 — Agenda
  `Walk through the four parts so the audience knows what's coming.
Emphasize the flow: a transaction wraps SQL → those SQL statements use specific data types → at scale, the way we batch matters → locking is what makes all of that safe under concurrency.

Tip: keep this slide ~30 seconds. Don't read every card — just headline each part.`,

  // 3 — Database Transactions
  `Define a transaction in plain words: a unit of work that succeeds together or fails together.
Walk through ACID with one short example each:
  • Atomicity: bank transfer — debit + credit must both happen.
  • Consistency: constraints (FK, NOT NULL, CHECK) hold before and after.
  • Isolation: concurrent transactions feel like they ran one at a time.
  • Durability: once COMMIT returns, the change survives a crash.

Show the BEGIN / COMMIT / ROLLBACK keywords. Mention SAVEPOINT briefly if asked.`,

  // 4 — Different Data Types
  `Choosing the right type is a correctness AND performance decision.
Quick anchors per category:
  • Numeric: use DECIMAL(p,s) for money — never FLOAT.
  • Strings: VARCHAR(n) for variable, CHAR(n) only for true fixed-length.
  • Date/Time: store TIMESTAMP in UTC; convert at the edge.
  • Boolean: prefer BOOLEAN; BIT is database-specific.
  • Binary/BLOB: store the bytes in DB or in object storage + a path — discuss trade-off.
  • Special: JSON for semi-structured, UUID for distributed IDs, ENUM for closed sets, GEOGRAPHY for maps.`,

  // 5 — Processing Large Datasets
  `The challenge is the same five things every time: slow scans, memory, lock duration, I/O, and recovery.
Then the techniques map directly:
  • Batching breaks long transactions into short ones — shorter locks, easier retries.
  • Indexing turns table scans into seeks — and reduces the rows that get locked.
  • Pagination: prefer keyset (WHERE id > ?) over OFFSET on large tables.
  • Bulk operations cut network round-trips dramatically.
  • Partitioning lets you scan only the slice you need (e.g. last month's logs).

Tie it back: long transactions hold locks longer → the next slide on locking is why this matters.`,

  // 6 — Locking in Database Transactions
  `Define locking: the database's coordination mechanism.
Three concurrency anomalies locks prevent:
  • Lost updates — both Alice and Bob read balance 100, both write 80, one update is lost.
  • Dirty reads — reading data another transaction will roll back.
  • Inconsistent reads / non-repeatable reads — same SELECT returns different rows.

Mention isolation level controls how aggressively the DB locks/snapshots to prevent these.`,

  // 7 — Common Locking Techniques  *** DEMO SLIDE ***
  `Press D (or click "Open Demo") to launch the interactive sandbox.

In the demo, walk the class through each technique:
  • Shared (S): two SELECTs can both hold S — show no conflict.
  • Exclusive (X): one UPDATE blocks everyone — show T2 waiting.
  • Update (U): held during read-then-write — converts to X to prevent deadlock.
  • Intent (IS/IX): hierarchy signal — mention briefly, mostly conceptual at row/page level.
  • Optimistic: show version mismatch → retry.
  • Pessimistic: show SELECT FOR UPDATE → T2 waits until COMMIT.

Speak the trade-off out loud: optimism wins when conflict is rare; pessimism wins when conflict is common.`,

  // 8 — Lock Granularity
  `Granularity is the second dial after lock mode.
  • Row-level: best concurrency, most overhead. Postgres default.
  • Page-level: groups of rows; SQL Server uses this when row count is high.
  • Table-level: simple, blunt; useful for DDL or bulk loads.

Then transition to isolation levels — the standard four. Quick mapping:
  • Read Uncommitted → dirty reads allowed (rare in practice).
  • Read Committed → default in Postgres/Oracle.
  • Repeatable Read → MySQL InnoDB default; prevents non-repeatable reads.
  • Serializable → strictest; the DB pretends transactions run one at a time.`,

  // 9 — Deadlocks
  `Define a deadlock with the two-circle picture: T1 holds Row A and waits for Row B; T2 holds Row B and waits for Row A.
The DB detects the cycle and aborts one — the loser must retry.

Prevention checklist (same as the slide):
  1. Lock order discipline — always acquire in the same order.
  2. Keep transactions short.
  3. Use the lowest isolation level that's still safe.
  4. Set lock timeouts and a retry policy.
  5. Use indexes — fewer rows scanned means fewer rows locked.
  6. Optimistic locking when contention is rare.

Audience question: "Why would the DB pick which transaction to abort?" → it picks the one with the least work done (the victim).`,

  // 10 — Wrap-up
  `Recap in 60 seconds:
  1. Transactions enforce ACID — group statements so they pass or fail together.
  2. Pick data types carefully — correctness, speed, and storage all depend on it.
  3. At scale, batch and index — short transactions hold locks for less time.
  4. Lock smart, not hard — match mode and granularity to the workload, and prefer optimistic locking when conflict is rare.

Thanks — open floor for questions.`,
];
