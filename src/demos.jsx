/* ============================================================
   Interactive Transaction Demo
   Shows two concurrent transactions (T1 / T2) executing under
   different locking techniques, with live row-state, lock
   indicators, and a transaction log.
   Exposes window.TransactionDemo
   ============================================================ */

const { useState, useMemo, useEffect, useRef } = React;

/* ---------- Initial table state ---------- */
const initialRows = () => [
  { id: 1, name: "Juan",    balance: 1000, version: 1 },
  { id: 2, name: "Maria",   balance:  500, version: 1 },
  { id: 3, name: "Jose",    balance:  750, version: 1 },
];

/* ---------- Helpers ---------- */
const ts = () => {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
};

/* A "step" returns a function (state) -> newState.
   Each scenario is an ordered list of steps. */

function setRowLock(state, rowId, lock /* {mode, owners[]} | null */) {
  const locks = { ...state.locks };
  if (lock === null) delete locks[rowId];
  else locks[rowId] = lock;
  return { ...state, locks };
}

function appendLog(state, kind, text) {
  return { ...state, log: [...state.log, { ts: ts(), kind, text }] };
}

function setTx(state, tx, patch) {
  return { ...state, [tx]: { ...state[tx], ...patch } };
}

function markOp(tx, idx, status) {
  return (state) => {
    const ops = state[tx].ops.map((o, i) => i === idx ? { ...o, status } : o);
    return setTx(state, tx, { ops });
  };
}

function chain(...fns) {
  return (state) => fns.reduce((s, f) => f(s), state);
}

/* ============================================================
   Scenarios — one per locking technique
   ============================================================ */

function buildScenarios() {
  return {
    /* -------------------- 1. Shared (S) -------------------- */
    shared: {
      title: "Shared Lock (S) — concurrent reads",
      scenario:
        "Juan opens GCash and taps Check Balance on his phone. " +
        "At the same moment, a customer-service rep pulls up Juan's wallet " +
        "to verify his balance for a complaint ticket. Both are READS — " +
        "they coexist on the same row.",
      summary:
        "Both transactions SELECT the same wallet row. Both acquire shared " +
        "locks and read concurrently — no conflict.",
      viz: {
        t1: { theme: "gcash",   device: "phone",  actor: "Juan",        action: "Check Balance",                    rowId: 1 },
        t2: { theme: "support", device: "laptop", actor: "Liza (CS)",   action: "Verify wallet for ticket #4521",   rowId: 1, customer: "Juan" },
      },
      notes: [
        "T1 starts a transaction with BEGIN. No locks yet — BEGIN just marks the start of a unit of work so changes can be rolled back together.",
        "T1 issues SELECT and the DB grants a Shared (S) lock on Juan's row. S locks allow other reads to coexist but block any writes for the duration.",
        "T2 starts independently. Two transactions can be alive at once — that's normal.",
        "T2 also asks for an S lock on the same row. Because S+S is compatible, BOTH transactions now hold S simultaneously. This is the whole point of S locks: many concurrent readers, zero writers.",
        "T1 commits and releases its S lock. T2 still has its S lock — Juan's row is still 'busy' for any writer.",
        "T2 commits. All locks released. No waits, no conflicts — pure concurrent reads.",
      ],
      t1Ops: [
        { text: "-- App: 'Check Balance' tap" },
        { text: "BEGIN;" },
        { text: "SELECT balance FROM wallets WHERE id=1;  -- S lock" },
        { text: "COMMIT;" },
      ],
      t2Ops: [
        { text: "-- CS Portal: read wallet for ticket" },
        { text: "BEGIN;" },
        { text: "SELECT balance FROM wallets WHERE id=1;  -- S lock" },
        { text: "COMMIT;" },
      ],
      steps: [
        (s) => chain(
          markOp("t1", 0, "done"),
          markOp("t1", 1, "done"),
          (st) => setTx(st, "t1", { state: "run" }),
          (st) => appendLog(st, "info", "T1 (Juan's app): BEGIN"),
        )(s),
        (s) => chain(
          markOp("t1", 2, "done"),
          (st) => setRowLock(st, 1, { mode: "S", owners: ["T1"] }),
          (st) => appendLog(st, "ok", "T1: SELECT Juan → 1000  [acquired S on row 1]"),
        )(s),
        (s) => chain(
          markOp("t2", 0, "done"),
          markOp("t2", 1, "done"),
          (st) => setTx(st, "t2", { state: "run" }),
          (st) => appendLog(st, "info", "T2 (CS portal): BEGIN"),
        )(s),
        (s) => chain(
          markOp("t2", 2, "done"),
          (st) => {
            const cur = st.locks[1];
            const owners = cur ? [...cur.owners, "T2"] : ["T2"];
            return setRowLock(st, 1, { mode: "S", owners });
          },
          (st) => appendLog(st, "ok", "T2: SELECT Juan → 1000  [acquired S on row 1 — coexists with T1]"),
        )(s),
        (s) => chain(
          markOp("t1", 3, "done"),
          (st) => setTx(st, "t1", { state: "commit" }),
          (st) => {
            const cur = st.locks[1];
            const owners = (cur?.owners || []).filter(x => x !== "T1");
            return owners.length ? setRowLock(st, 1, { mode: "S", owners }) : setRowLock(st, 1, null);
          },
          (st) => appendLog(st, "ok", "T1: COMMIT — released S"),
        )(s),
        (s) => chain(
          markOp("t2", 3, "done"),
          (st) => setTx(st, "t2", { state: "commit" }),
          (st) => setRowLock(st, 1, null),
          (st) => appendLog(st, "ok", "T2: COMMIT — released S"),
        )(s),
      ],
    },

    /* -------------------- 2. Exclusive (X) -------------------- */
    exclusive: {
      title: "Exclusive Lock (X) — writer blocks everyone",
      scenario:
        "Juan scans a Pay-QR for groceries at SM (T1) at 6:00:00 PM. " +
        "At 6:00:00.05 PM, his Meralco auto-debit fires (T2). Both want to " +
        "deduct from the SAME wallet row — only one can write at a time.",
      summary:
        "T1 takes an X lock on Juan's row to deduct ₱200 for groceries. T2 " +
        "(auto-debit for the bill) also wants to write the same row and " +
        "must wait until T1 commits.",
      viz: {
        t1: { theme: "gcash-pay", device: "phone",  actor: "Juan",     merchant: "SM Hypermarket",  amount: 200, action: "Pay QR",     rowId: 1 },
        t2: { theme: "autodebit", device: "server", actor: "AutoBill", provider: "Meralco",         amount: 150, action: "Auto-debit", rowId: 1 },
      },
      notes: [
        "T1 (Juan's QR pay) starts a transaction. No locks held yet.",
        "T1 issues UPDATE — the DB grants an Exclusive (X) lock on Juan's row. X is incompatible with EVERY other lock mode: no reads, no writes, no other transactions touch this row until T1 finishes.",
        "T2 (the bill auto-debit) starts. It doesn't know about T1.",
        "T2 also tries to UPDATE Juan's row. Because T1 holds X, T2 enters a WAIT state — it's parked in the lock queue and uses no CPU. The user-facing app might show a small spinner.",
        "T1 commits. The DB releases T1's X lock and notifies the next waiter (T2). This 'wake up the queue' is what serializes conflicting writers.",
        "T2 finally gets X and re-runs its UPDATE. Crucially, it sees Juan's POST-T1 balance (800), not the original (1000). This is exactly how lost-update bugs are prevented — read+write happens atomically under the X lock.",
        "T2 commits. Both transfers stuck. Total time = T1 duration + T2 duration. Locks serialize conflicting writers — that's the cost of correctness.",
      ],
      t1Ops: [
        { text: "-- Juan pays QR at SM" },
        { text: "BEGIN;" },
        { text: "UPDATE wallets SET balance=balance-200 WHERE id=1;  -- X lock" },
        { text: "COMMIT;" },
      ],
      t2Ops: [
        { text: "-- Meralco auto-debit (₱150)" },
        { text: "BEGIN;" },
        { text: "UPDATE wallets SET balance=balance-150 WHERE id=1;  -- waits" },
        { text: "COMMIT;" },
      ],
      steps: [
        (s) => chain(
          markOp("t1", 0, "done"),
          markOp("t1", 1, "done"),
          (st) => setTx(st, "t1", { state: "run" }),
          (st) => appendLog(st, "info", "T1 (QR pay): BEGIN"),
        )(s),
        (s) => chain(
          markOp("t1", 2, "done"),
          (st) => setRowLock(st, 1, { mode: "X", owners: ["T1"] }),
          (st) => ({
            ...st,
            rows: st.rows.map(r => r.id === 1 ? { ...r, balance: 800 } : r),
          }),
          (st) => appendLog(st, "ok", "T1: UPDATE Juan -200 → 800  [acquired X]"),
        )(s),
        (s) => chain(
          markOp("t2", 0, "done"),
          markOp("t2", 1, "done"),
          (st) => setTx(st, "t2", { state: "run" }),
          (st) => appendLog(st, "info", "T2 (auto-debit): BEGIN"),
        )(s),
        (s) => chain(
          markOp("t2", 2, "cur"),
          (st) => setTx(st, "t2", { state: "wait" }),
          (st) => appendLog(st, "err", "T2: UPDATE Juan — BLOCKED, waiting for T1's X lock"),
        )(s),
        (s) => chain(
          markOp("t1", 3, "done"),
          (st) => setTx(st, "t1", { state: "commit" }),
          (st) => setRowLock(st, 1, null),
          (st) => appendLog(st, "ok", "T1: COMMIT — released X. T2 wakes up."),
        )(s),
        (s) => chain(
          markOp("t2", 2, "done"),
          (st) => setTx(st, "t2", { state: "run" }),
          (st) => setRowLock(st, 1, { mode: "X", owners: ["T2"] }),
          (st) => ({ ...st, rows: st.rows.map(r => r.id === 1 ? { ...r, balance: 650 } : r) }),
          (st) => appendLog(st, "ok", "T2: UPDATE Juan -150 → 650  [acquired X]"),
        )(s),
        (s) => chain(
          markOp("t2", 3, "done"),
          (st) => setTx(st, "t2", { state: "commit" }),
          (st) => setRowLock(st, 1, null),
          (st) => appendLog(st, "ok", "T2: COMMIT — released X"),
        )(s),
      ],
    },

    /* -------------------- 3. Update (U) -------------------- */
    update: {
      title: "Update Lock (U) — read-then-write, deadlock-safe",
      scenario:
        "Maria taps Send Money: the app first reads her balance to verify she " +
        "has enough, THEN deducts. Meanwhile her cashback for last week's load " +
        "purchase is being credited. The U lock makes the read-then-write safe " +
        "without the S→X upgrade deadlock.",
      summary:
        "T1 takes a U lock while the app validates Maria's balance, then " +
        "upgrades to X for the actual update. T2 (the cashback credit) " +
        "waits cleanly without an upgrade deadlock.",
      viz: {
        t1: { theme: "gcash-send", device: "phone",  actor: "Maria",   recipient: "Pedro", amount: 100, action: "Send Money", rowId: 2 },
        t2: { theme: "cashback",   device: "server", actor: "Rewards", source: "Last week's load",  amount: 50,  action: "Credit cashback", rowId: 2 },
      },
      notes: [
        "T1 (Send Money) begins. The app needs to: (1) read the balance, (2) check it's enough, (3) deduct. The U lock makes step 1+3 safe.",
        "T1 takes a U lock on Maria's row. U behaves like S for ANOTHER reader (compatible) but is INCOMPATIBLE with another U or any X. This asymmetry is what prevents the classic upgrade deadlock.",
        "T2 (cashback worker) begins. It also wants to read-then-write the same row.",
        "T2 asks for U on Maria's row. U+U is incompatible by design — T2 BLOCKS. (If both had taken S then tried to upgrade to X, both would deadlock — that's the bug U was invented to prevent.)",
        "T1 atomically upgrades U → X. The upgrade succeeds without waiting because no other lock conflicts. T1 writes the new balance.",
        "T1 commits, releases X. The DB queue wakes T2.",
        "T2 finally gets its U lock. It sees Maria's POST-T1 balance (400), not 500.",
        "T2 upgrades U → X and writes its credit (+50 cashback).",
        "T2 commits. Both writes applied in serial order. No retries, no deadlock.",
      ],
      t1Ops: [
        { text: "-- Maria: Send Money (validate first)" },
        { text: "BEGIN;" },
        { text: "SELECT balance FROM wallets WITH (UPDLOCK) WHERE id=2;  -- U lock" },
        { text: "UPDATE wallets SET balance=balance-100 WHERE id=2;       -- U → X" },
        { text: "COMMIT;" },
      ],
      t2Ops: [
        { text: "-- Cashback worker (credit ₱50)" },
        { text: "BEGIN;" },
        { text: "SELECT balance FROM wallets WITH (UPDLOCK) WHERE id=2;   -- waits" },
        { text: "UPDATE wallets SET balance=balance+50 WHERE id=2;" },
        { text: "COMMIT;" },
      ],
      steps: [
        (s) => chain(markOp("t1",0,"done"), markOp("t1",1,"done"),
          (st)=>setTx(st,"t1",{state:"run"}),
          (st)=>appendLog(st,"info","T1 (Send Money): BEGIN"))(s),
        (s) => chain(
          markOp("t1", 2, "done"),
          (st) => setRowLock(st, 2, { mode: "U", owners: ["T1"] }),
          (st) => appendLog(st, "ok", "T1: SELECT Maria (U) → 500  [acquired U]"),
        )(s),
        (s) => chain(markOp("t2",0,"done"), markOp("t2",1,"done"),
          (st)=>setTx(st,"t2",{state:"run"}),
          (st)=>appendLog(st,"info","T2 (Cashback): BEGIN"))(s),
        (s) => chain(
          markOp("t2", 2, "cur"),
          (st) => setTx(st, "t2", { state: "wait" }),
          (st) => appendLog(st, "err", "T2: SELECT Maria (U) — BLOCKED (U/U incompatible)"),
        )(s),
        (s) => chain(
          markOp("t1", 3, "done"),
          (st) => setRowLock(st, 2, { mode: "X", owners: ["T1"] }),
          (st) => ({ ...st, rows: st.rows.map(r => r.id === 2 ? { ...r, balance: 400 } : r) }),
          (st) => appendLog(st, "ok", "T1: UPDATE Maria -100 → 400  [U upgraded to X]"),
        )(s),
        (s) => chain(
          markOp("t1", 4, "done"),
          (st) => setTx(st, "t1", { state: "commit" }),
          (st) => setRowLock(st, 2, null),
          (st) => appendLog(st, "ok", "T1: COMMIT — released X. T2 wakes up."),
        )(s),
        (s) => chain(
          markOp("t2", 2, "done"),
          (st) => setTx(st, "t2", { state: "run" }),
          (st) => setRowLock(st, 2, { mode: "U", owners: ["T2"] }),
          (st) => appendLog(st, "ok", "T2: SELECT Maria (U) → 400  [acquired U]"),
        )(s),
        (s) => chain(
          markOp("t2", 3, "done"),
          (st) => setRowLock(st, 2, { mode: "X", owners: ["T2"] }),
          (st) => ({ ...st, rows: st.rows.map(r => r.id === 2 ? { ...r, balance: 450 } : r) }),
          (st) => appendLog(st, "ok", "T2: UPDATE Maria +50 → 450  [U → X]"),
        )(s),
        (s) => chain(
          markOp("t2", 4, "done"),
          (st) => setTx(st, "t2", { state: "commit" }),
          (st) => setRowLock(st, 2, null),
          (st) => appendLog(st, "ok", "T2: COMMIT"),
        )(s),
      ],
    },

    /* -------------------- 4. Intent (IS/IX) -------------------- */
    intent: {
      title: "Intent Lock (IS / IX) — hierarchy signaling",
      scenario:
        "DevOps is rolling out a schema change to the wallets table at " +
        "midnight (add a 'kyc_level' column). Meanwhile Jose is sending " +
        "money to a friend. Jose's row-level X is signaled by an IX on " +
        "the table — so the ALTER waits at the table level without scanning rows.",
      summary:
        "T1 (Jose's transfer) signals IX at table level before X-locking " +
        "row 3. T2 (the migration) needs a table-level X — blocked instantly " +
        "by T1's IX, no row scan needed.",
      viz: {
        t1: { theme: "gcash-send", device: "phone",  actor: "Jose",   recipient: "Friend", amount: 10, action: "Send Money", rowId: 3 },
        t2: { theme: "admin",      device: "laptop", actor: "DevOps", action: "ALTER TABLE wallets",  rowId: null, scope: "table",
              sql: "ALTER TABLE wallets\n  ADD COLUMN kyc_level INT;" },
      },
      notes: [
        "T1 (Jose's transfer) begins. About to write a single row.",
        "Before locking the row, the engine takes an Intent-Exclusive (IX) lock on the WHOLE TABLE. IX is a 'breadcrumb' that says: 'somewhere in this table, I have or will have an X lock'. It does NOT block other row-level work.",
        "T1 takes the actual X lock on Jose's row and writes. Multiple transactions could each have IX on the table at the same time (IX+IX is compatible) — the table-level lock only matters for whole-table operations.",
        "T2 (the schema migration) begins. It needs to ALTER TABLE — that requires an EXCLUSIVE table lock.",
        "T2 asks for table-X. The DB sees T1's IX on the table and BLOCKS T2 instantly — without scanning thousands of rows to check each one. That's the magic of intent locks: O(1) check at the table level instead of O(rows).",
        "T1 commits. Both its IX (table) and X (row) locks are released.",
        "T2 finally gets table-X. ALTER runs.",
        "T2 commits. The schema is updated. Migration done with minimal blocking — only conflicts with whole-table operations were blocked.",
      ],
      t1Ops: [
        { text: "-- Jose: send ₱10 to a friend" },
        { text: "BEGIN;" },
        { text: "-- Acquire IX on table 'wallets'" },
        { text: "UPDATE wallets SET balance=balance+10 WHERE id=3;  -- X on row 3" },
        { text: "COMMIT;" },
      ],
      t2Ops: [
        { text: "-- DevOps: add KYC column" },
        { text: "BEGIN;" },
        { text: "ALTER TABLE wallets ADD COLUMN kyc_level INT;  -- needs table X" },
        { text: "COMMIT;" },
      ],
      steps: [
        (s) => chain(markOp("t1",0,"done"), markOp("t1",1,"done"),
          (st)=>setTx(st,"t1",{state:"run"}),
          (st)=>appendLog(st,"info","T1 (transfer): BEGIN"))(s),
        (s) => chain(
          markOp("t1",2,"done"),
          (st) => ({ ...st, tableLock: { mode: "IX", owner: "T1" } }),
          (st) => appendLog(st,"ok","T1: acquired IX on table wallets"),
        )(s),
        (s) => chain(
          markOp("t1",3,"done"),
          (st) => setRowLock(st, 3, { mode: "X", owners: ["T1"] }),
          (st) => ({ ...st, rows: st.rows.map(r => r.id === 3 ? { ...r, balance: 760 } : r) }),
          (st) => appendLog(st,"ok","T1: X on Jose, UPDATE +10 → 760"),
        )(s),
        (s) => chain(markOp("t2",0,"done"), markOp("t2",1,"done"),
          (st)=>setTx(st,"t2",{state:"run"}),
          (st)=>appendLog(st,"info","T2 (migration): BEGIN"))(s),
        (s) => chain(
          markOp("t2",2,"cur"),
          (st) => setTx(st, "t2", { state: "wait" }),
          (st) => appendLog(st,"err","T2: ALTER TABLE needs X on table — BLOCKED by T1's IX"),
        )(s),
        (s) => chain(
          markOp("t1",4,"done"),
          (st) => setTx(st, "t1", { state: "commit" }),
          (st) => setRowLock(st, 3, null),
          (st) => ({ ...st, tableLock: null }),
          (st) => appendLog(st,"ok","T1: COMMIT — released IX + X"),
        )(s),
        (s) => chain(
          markOp("t2",2,"done"),
          (st) => ({ ...st, tableLock: { mode: "X", owner: "T2" } }),
          (st) => appendLog(st,"ok","T2: acquired X on table wallets"),
        )(s),
        (s) => chain(
          markOp("t2",3,"done"),
          (st) => setTx(st, "t2", { state: "commit" }),
          (st) => ({ ...st, tableLock: null }),
          (st) => appendLog(st,"ok","T2: COMMIT — schema updated"),
        )(s),
      ],
    },

    /* -------------------- 5. Optimistic -------------------- */
    optimistic: {
      title: "Optimistic Locking — version check at commit",
      scenario:
        "Juan is logged into GCash on his PHONE and on a tablet at the same " +
        "time. He buys a load on the phone and almost the same instant taps " +
        "Pay-bills on the tablet. The app uses a version column — only the " +
        "first writer wins; the second sees '0 rows affected' and retries.",
      summary:
        "Both clients read the row with its version. Whoever writes first " +
        "bumps the version. The slower writer's UPDATE WHERE version=old " +
        "matches 0 rows — the app re-reads the latest row and retries.",
      viz: {
        t1: { theme: "gcash-load", device: "phone",  actor: "Juan",       amount: 150, action: "Buy Load", rowId: 1 },
        t2: { theme: "gcash-web",  device: "tablet", actor: "Juan (web)", amount: 50,  action: "Pay Bill", recipient: "Globe", rowId: 1 },
      },
      notes: [
        "T1 (phone) reads Juan's wallet — balance=1000, version=1. NO lock taken. This is why optimistic is FAST: zero blocking on the read path.",
        "T2 (tablet) also reads. balance=1000, version=1. Both clients are working with stale data they don't yet know is stale.",
        "T1 sends an UPDATE that includes version=1 in the WHERE clause. The DB checks: row exists, version still 1 → write succeeds, version bumped to 2.",
        "T1 commits. Database now has version=2. T2 still thinks it's working with version=1.",
        "T2 sends its UPDATE WHERE version=1. The DB looks up the row — version is now 2, NOT 1. The WHERE matches 0 rows. The UPDATE silently affects nothing. The DB doesn't throw an error — the app must check 'rows affected'.",
        "T2 sees rowcount=0 → conflict. The app's job is to: re-SELECT to get the new balance/version, recompute the operation, and retry. Many apps do this transparently — user just sees 'processing…' for a moment.",
      ],
      t1Ops: [
        { text: "-- Juan's phone: buy ₱150 load" },
        { text: "SELECT balance, version FROM wallets WHERE id=1;  -- v=1" },
        { text: "UPDATE wallets SET balance=850, version=2 WHERE id=1 AND version=1;" },
        { text: "COMMIT;" },
      ],
      t2Ops: [
        { text: "-- Juan's tablet: pay ₱50 bill" },
        { text: "SELECT balance, version FROM wallets WHERE id=1;  -- v=1" },
        { text: "UPDATE wallets SET balance=950, version=2 WHERE id=1 AND version=1;" },
        { text: "-- 0 rows affected → re-read & retry" },
      ],
      steps: [
        (s) => chain(markOp("t1",0,"done"), markOp("t1",1,"done"),
          (st)=>setTx(st,"t1",{state:"run"}),
          (st)=>appendLog(st,"info","T1 (phone): SELECT Juan → balance=1000, version=1"))(s),
        (s) => chain(markOp("t2",0,"done"), markOp("t2",1,"done"),
          (st)=>setTx(st,"t2",{state:"run"}),
          (st)=>appendLog(st,"info","T2 (tablet): SELECT Juan → balance=1000, version=1"))(s),
        (s) => chain(
          markOp("t1",2,"done"),
          (st) => ({ ...st, rows: st.rows.map(r => r.id === 1 ? { ...r, balance: 850, version: 2 } : r) }),
          (st) => appendLog(st,"ok","T1: UPDATE WHERE version=1 — 1 row affected (load purchased)"),
        )(s),
        (s) => chain(markOp("t1",3,"done"),
          (st)=>setTx(st,"t1",{state:"commit"}),
          (st)=>appendLog(st,"ok","T1: COMMIT (version is now 2)"))(s),
        (s) => chain(
          markOp("t2",2,"fail"),
          (st) => appendLog(st,"err","T2: UPDATE WHERE version=1 — 0 rows affected (version moved to 2)"),
        )(s),
        (s) => chain(
          markOp("t2",3,"cur"),
          (st) => setTx(st,"t2",{state:"abort"}),
          (st) => appendLog(st,"info","T2 (tablet): app shows 'Try again', re-reads latest balance"),
        )(s),
      ],
    },

    /* -------------------- 6. Pessimistic -------------------- */
    pessimistic: {
      title: "Pessimistic Locking — SELECT … FOR UPDATE",
      scenario:
        "Maria is at a 7-Eleven CLiQQ counter cashing in to her wallet. The " +
        "cashier's POS issues SELECT … FOR UPDATE on her wallet row before " +
        "crediting the cash. While that's happening, the GCash app on her " +
        "phone tries to send money — it must wait until the counter commits.",
      summary:
        "T1 (the POS) explicitly locks Maria's wallet row up front with " +
        "SELECT … FOR UPDATE so nobody else can modify it during the cash-in. " +
        "T2 (her phone's Send Money) waits until COMMIT.",
      viz: {
        t1: { theme: "cliqq",      device: "pos",   actor: "7-Eleven", store: "Robinsons Galleria", txid: "POS-7E-19284", amount: 200, customer: "Maria", action: "Cash-in", rowId: 2 },
        t2: { theme: "gcash-send", device: "phone", actor: "Maria",    recipient: "Friend",         amount: 25, action: "Send Money", rowId: 2 },
      },
      notes: [
        "T1 (CLiQQ POS) starts a transaction at the counter as the cashier counts the cash.",
        "T1 issues SELECT … FOR UPDATE. The 'FOR UPDATE' clause is critical — instead of a normal S lock, the DB takes an X lock right at the read. No other transaction can touch this row until T1 commits.",
        "T2 (Maria's phone tapping Send Money) starts.",
        "T2 also tries SELECT … FOR UPDATE. Blocked by T1's X. Maria sees a small loading spinner on her phone while the cashier finishes.",
        "T1 runs its UPDATE — already holds X, so this is just a write under the existing lock. No new lock needed.",
        "T1 commits. X released. T2's wait ends.",
        "T2 takes its X lock. It now reads Maria's POST-cash-in balance (700, not 500). This is exactly the safety pessimistic locking buys you.",
        "T2 runs its UPDATE under its X lock.",
        "T2 commits. Both transfers applied in order. Pessimistic locking trades concurrency (one writer at a time) for predictability (no retries needed).",
      ],
      t1Ops: [
        { text: "-- 7-Eleven counter cash-in (₱200)" },
        { text: "BEGIN;" },
        { text: "SELECT balance FROM wallets WHERE id=2 FOR UPDATE;  -- X lock" },
        { text: "UPDATE wallets SET balance=balance+200 WHERE id=2;" },
        { text: "COMMIT;" },
      ],
      t2Ops: [
        { text: "-- Phone: Send ₱25 to a friend" },
        { text: "BEGIN;" },
        { text: "SELECT balance FROM wallets WHERE id=2 FOR UPDATE;  -- waits" },
        { text: "UPDATE wallets SET balance=balance-25 WHERE id=2;" },
        { text: "COMMIT;" },
      ],
      steps: [
        (s) => chain(markOp("t1",0,"done"), markOp("t1",1,"done"),
          (st)=>setTx(st,"t1",{state:"run"}),
          (st)=>appendLog(st,"info","T1 (CLiQQ counter): BEGIN"))(s),
        (s) => chain(
          markOp("t1",2,"done"),
          (st) => setRowLock(st,2,{mode:"X",owners:["T1"]}),
          (st) => appendLog(st,"ok","T1: SELECT Maria FOR UPDATE → 500  [X lock]"),
        )(s),
        (s) => chain(markOp("t2",0,"done"), markOp("t2",1,"done"),
          (st)=>setTx(st,"t2",{state:"run"}),
          (st)=>appendLog(st,"info","T2 (phone): BEGIN"))(s),
        (s) => chain(
          markOp("t2",2,"cur"),
          (st) => setTx(st,"t2",{state:"wait"}),
          (st) => appendLog(st,"err","T2: SELECT FOR UPDATE Maria — BLOCKED by counter's X"),
        )(s),
        (s) => chain(
          markOp("t1",3,"done"),
          (st) => ({ ...st, rows: st.rows.map(r => r.id===2 ? { ...r, balance: 700 } : r) }),
          (st) => appendLog(st,"ok","T1: UPDATE Maria +200 (cash-in) → 700"),
        )(s),
        (s) => chain(
          markOp("t1",4,"done"),
          (st) => setTx(st,"t1",{state:"commit"}),
          (st) => setRowLock(st,2,null),
          (st) => appendLog(st,"ok","T1: COMMIT — released X. T2 wakes up."),
        )(s),
        (s) => chain(
          markOp("t2",2,"done"),
          (st) => setTx(st,"t2",{state:"run"}),
          (st) => setRowLock(st,2,{mode:"X",owners:["T2"]}),
          (st) => appendLog(st,"ok","T2: SELECT Maria FOR UPDATE → 700  [X lock]"),
        )(s),
        (s) => chain(
          markOp("t2",3,"done"),
          (st) => ({ ...st, rows: st.rows.map(r => r.id===2 ? { ...r, balance: 675 } : r) }),
          (st) => appendLog(st,"ok","T2: UPDATE Maria -25 (send) → 675"),
        )(s),
        (s) => chain(
          markOp("t2",4,"done"),
          (st) => setTx(st,"t2",{state:"commit"}),
          (st) => setRowLock(st,2,null),
          (st) => appendLog(st,"ok","T2: COMMIT"),
        )(s),
      ],
    },

    /* -------------------- 7. Deadlock -------------------- */
    deadlock: {
      title: "Deadlock — circular wait detected",
      scenario:
        "Friday 6 PM payday: Juan sends ₱100 to Maria via Send Money. At the " +
        "exact same instant Maria sends ₱50 to Juan. Each transfer locks the " +
        "sender's row first, then tries to lock the receiver's — boom, cycle. " +
        "The DB detects it and rolls one transaction back; the app shows " +
        "'Try again' to that user.",
      summary:
        "T1 locks Juan, T2 locks Maria. Then each tries to lock the other's " +
        "row → cycle. The DB picks a victim and rolls it back so the other " +
        "transaction can finish.",
      viz: {
        t1: { theme: "gcash-send", device: "phone", actor: "Juan",  recipient: "Maria", amount: 100, action: "Send Money", rowId: 1, secondaryRowId: 2 },
        t2: { theme: "gcash-send", device: "phone", actor: "Maria", recipient: "Juan",  amount: 50,  action: "Send Money", rowId: 2, secondaryRowId: 1 },
      },
      notes: [
        "T1 starts: 'Send ₱100 from Juan to Maria'. Two row updates needed: debit Juan, credit Maria.",
        "T1 takes X on Juan's row and debits 100. So far so good — T1 holds 1 lock.",
        "T2 starts at the same instant: 'Send ₱50 from Maria to Juan'.",
        "T2 takes X on Maria's row and debits 50. Both transactions now hold one row each. THIS is where the race condition seeds itself — neither one knows about the other yet.",
        "T1 tries to lock Maria's row to credit her — but T2 holds X on Maria. T1 enters WAIT.",
        "T2 tries to lock Juan's row to credit him — but T1 holds X on Juan. T2 enters WAIT. Now BOTH are waiting for each other: a circular wait. This is the textbook deadlock.",
        "The DB's deadlock detector runs periodically (every ~1 second in Postgres, configurable). It builds a wait-for graph, finds the cycle, and chooses a VICTIM — usually the transaction with the least work or the lowest priority. T2 is rolled back: locks released, its debit on Maria undone.",
        "With T2 gone, T1's wait ends. Maria's row is free. T1 takes X on Maria and credits +100.",
        "T1 commits. Net effect: Juan→Maria succeeded; Maria→Juan failed. The app on Maria's side gets a 'deadlock detected' error and typically retries the transaction automatically. Lesson: always lock rows in a CONSISTENT ORDER (e.g., by lowest id first) to avoid these cycles.",
      ],
      t1Ops: [
        { text: "-- Juan: Send ₱100 to Maria" },
        { text: "BEGIN;" },
        { text: "UPDATE wallets SET balance=balance-100 WHERE id=1;  -- X on Juan" },
        { text: "UPDATE wallets SET balance=balance+100 WHERE id=2;  -- waits" },
        { text: "COMMIT;" },
      ],
      t2Ops: [
        { text: "-- Maria: Send ₱50 to Juan" },
        { text: "BEGIN;" },
        { text: "UPDATE wallets SET balance=balance-50 WHERE id=2;   -- X on Maria" },
        { text: "UPDATE wallets SET balance=balance+50 WHERE id=1;   -- waits" },
        { text: "ROLLBACK;  -- victim, app retries" },
      ],
      steps: [
        (s) => chain(markOp("t1",0,"done"), markOp("t1",1,"done"),
          (st)=>setTx(st,"t1",{state:"run"}),
          (st)=>appendLog(st,"info","T1 (Juan→Maria): BEGIN"))(s),
        (s) => chain(
          markOp("t1",2,"done"),
          (st) => setRowLock(st,1,{mode:"X",owners:["T1"]}),
          (st) => ({ ...st, rows: st.rows.map(r => r.id===1 ? { ...r, balance: r.balance-100 } : r) }),
          (st) => appendLog(st,"ok","T1: X on Juan, debited 100"),
        )(s),
        (s) => chain(markOp("t2",0,"done"), markOp("t2",1,"done"),
          (st)=>setTx(st,"t2",{state:"run"}),
          (st)=>appendLog(st,"info","T2 (Maria→Juan): BEGIN"))(s),
        (s) => chain(
          markOp("t2",2,"done"),
          (st) => setRowLock(st,2,{mode:"X",owners:["T2"]}),
          (st) => ({ ...st, rows: st.rows.map(r => r.id===2 ? { ...r, balance: r.balance-50 } : r) }),
          (st) => appendLog(st,"ok","T2: X on Maria, debited 50"),
        )(s),
        (s) => chain(
          markOp("t1",3,"cur"),
          (st) => setTx(st,"t1",{state:"wait"}),
          (st) => appendLog(st,"err","T1: wants X on Maria — BLOCKED by T2"),
        )(s),
        (s) => chain(
          markOp("t2",3,"cur"),
          (st) => setTx(st,"t2",{state:"wait"}),
          (st) => appendLog(st,"err","T2: wants X on Juan — BLOCKED by T1  ⚠ cycle detected"),
        )(s),
        (s) => chain(
          markOp("t2",3,"fail"),
          markOp("t2",4,"done"),
          (st) => setTx(st,"t2",{state:"abort"}),
          (st) => setRowLock(st,2,null),
          (st) => ({ ...st, rows: st.rows.map(r => r.id===2 ? { ...r, balance: r.balance+50 } : r) }),
          (st) => appendLog(st,"err","DB: deadlock → T2 chosen as victim, ROLLBACK (Maria's app shows 'Try again')"),
        )(s),
        (s) => chain(
          markOp("t1",3,"done"),
          (st) => setTx(st,"t1",{state:"run"}),
          (st) => setRowLock(st,2,{mode:"X",owners:["T1"]}),
          (st) => ({ ...st, rows: st.rows.map(r => r.id===2 ? { ...r, balance: r.balance+100 } : r) }),
          (st) => appendLog(st,"ok","T1: wakes up, credits Maria +100"),
        )(s),
        (s) => chain(
          markOp("t1",4,"done"),
          (st) => setTx(st,"t1",{state:"commit"}),
          (st) => ({ ...st, locks: {} }),
          (st) => appendLog(st,"ok","T1: COMMIT — Juan→Maria transfer complete"),
        )(s),
      ],
    },
  };
}

const TECHNIQUES = [
  { key: "shared",      label: "Shared Lock (S)",       sub: "Both readers OK" },
  { key: "exclusive",   label: "Exclusive Lock (X)",    sub: "Writer blocks all" },
  { key: "update",      label: "Update Lock (U)",       sub: "Read-then-write" },
  { key: "intent",      label: "Intent Lock (IS/IX)",   sub: "Hierarchy" },
  { key: "optimistic",  label: "Optimistic",            sub: "Version check" },
  { key: "pessimistic", label: "Pessimistic",           sub: "FOR UPDATE" },
  { key: "deadlock",    label: "Deadlock scenario",     sub: "Cycle + victim" },
];

/* ============================================================
   Visual scene — phone / laptop / POS mockups, one per transaction
   ============================================================ */

const TX_STATES = {
  idle:   { color: "#94a3b8", label: "Idle",       emoji: "○",   msg: "Waiting to start" },
  run:    { color: "#0ea5e9", label: "Processing", emoji: "◐",   msg: "Working..." },
  wait:   { color: "#e08826", label: "Blocked",    emoji: "⏳",  msg: "Waiting for the other transaction's lock" },
  commit: { color: "#10b981", label: "Done",       emoji: "✓",   msg: "Transaction committed" },
  abort:  { color: "#ef4444", label: "Rolled back", emoji: "✗",  msg: "Aborted — app will retry" },
};

/* ---------- App-themed screens ---------- */

const peso = (n) => "₱" + (n ?? 0).toLocaleString() + ".00";
const initial = (s) => (s || "").split(" ")[0][0]?.toUpperCase() || "?";

/* GCash mobile shell — used by all gcash-* themes */
function GCashScreen({ viz, balance, statusLine, body, accent }) {
  const c = accent || "#0066ff";
  return (
    <div className="gc">
      <div className="gc-bar">
        <span>9:41</span><span>● ●● 100%</span>
      </div>
      <div className="gc-head" style={{ background: `linear-gradient(135deg, ${c} 0%, #1488ff 100%)` }}>
        <span className="gc-logo">G<i>Cash</i></span>
        <span className="gc-bell">🔔</span>
      </div>
      <div className="gc-greet">
        <div className="gc-avatar" style={{ background: c }}>{initial(viz.actor)}</div>
        <div>
          <div className="gc-hi">Hi, <strong>{viz.actor}</strong>!</div>
          <div className="gc-sub">+63 9** *** ****</div>
        </div>
      </div>
      <div className="gc-bal">
        <small>AVAILABLE BALANCE</small>
        <div className="gc-amt">{peso(balance)}</div>
      </div>
      {body}
      {statusLine && <div className="gc-status">{statusLine}</div>}
      <div className="gc-tabs">
        <span>🏠</span><span>📥</span><span>💳</span><span>👤</span>
      </div>
    </div>
  );
}

/* GCash variants */
function GCashCheckScreen(p) {
  return <GCashScreen {...p} body={
    <div className="gc-quick">
      <span><i>💸</i>Cash In</span>
      <span><i>↗</i>Send</span>
      <span><i>📷</i>Pay QR</span>
      <span><i>🧾</i>Pay Bills</span>
      <span><i>📱</i>Buy Load</span>
      <span className="hl"><i>👁</i>Balance</span>
    </div>
  }/>;
}
function GCashPayScreen(p) {
  const { viz } = p;
  return <GCashScreen {...p} body={
    <div className="gc-tx">
      <div className="gc-tx-row"><small>To</small><strong>{viz.merchant}</strong></div>
      <div className="gc-tx-row"><small>Amount</small><strong style={{color:"#d32f2f"}}>– {peso(viz.amount)}</strong></div>
      <div className="gc-tx-row"><small>Type</small><strong>QR Pay</strong></div>
      <button className="gc-cta">Confirm Pay ▶</button>
    </div>
  }/>;
}
function GCashSendScreen(p) {
  const { viz } = p;
  return <GCashScreen {...p} body={
    <div className="gc-tx">
      <div className="gc-tx-row"><small>To</small><strong>{viz.recipient}</strong></div>
      <div className="gc-tx-row"><small>Amount</small><strong style={{color:"#d32f2f"}}>– {peso(viz.amount)}</strong></div>
      <div className="gc-tx-row"><small>Type</small><strong>Send Money</strong></div>
      <button className="gc-cta">Send Now ▶</button>
    </div>
  }/>;
}
function GCashLoadScreen(p) {
  const { viz } = p;
  return <GCashScreen {...p} body={
    <div className="gc-tx">
      <div className="gc-tx-row"><small>Promo</small><strong>GIGA WORK 99</strong></div>
      <div className="gc-tx-row"><small>Amount</small><strong style={{color:"#d32f2f"}}>– {peso(viz.amount)}</strong></div>
      <div className="gc-tx-row"><small>Type</small><strong>Buy Load</strong></div>
      <button className="gc-cta">Buy Load ▶</button>
    </div>
  }/>;
}

/* GCash Web (tablet) — wider variant */
function GCashWebScreen({ viz, balance, statusLine }) {
  return (
    <div className="gcw">
      <div className="gcw-top">
        <span className="gcw-logo">G<i>Cash</i> Web</span>
        <span className="gcw-user">👤 {viz.actor}</span>
      </div>
      <div className="gcw-grid">
        <div className="gcw-side">
          <div className="gcw-item active">💳 Pay Bills</div>
          <div className="gcw-item">↗ Send</div>
          <div className="gcw-item">💸 Cash In</div>
          <div className="gcw-item">🧾 History</div>
        </div>
        <div className="gcw-main">
          <div className="gcw-bal">
            <small>AVAILABLE BALANCE</small>
            <div className="gcw-amt">{peso(balance)}</div>
          </div>
          <div className="gcw-form">
            <div className="gcw-frow"><label>Biller</label><div>{viz.recipient || "Globe"}</div></div>
            <div className="gcw-frow"><label>Account #</label><div>0917 ••• ••••</div></div>
            <div className="gcw-frow"><label>Amount</label><div className="amt-red">– {peso(viz.amount)}</div></div>
            <button className="gcw-cta">Pay Bill ▶</button>
          </div>
          {statusLine && <div className="gcw-status">{statusLine}</div>}
        </div>
      </div>
    </div>
  );
}

/* CS Support Portal */
function SupportScreen({ viz, balance, statusLine }) {
  return (
    <div className="cs">
      <div className="cs-top">
        <span className="cs-logo">⊞ Wallet Ops Console</span>
        <span className="cs-user">{viz.actor}</span>
      </div>
      <div className="cs-row">
        <div className="cs-tag">TICKET #4521</div>
        <div className="cs-tag warn">OPEN</div>
      </div>
      <div className="cs-customer">
        <div className="cs-avatar">{initial(viz.customer)}</div>
        <div>
          <strong>{viz.customer}</strong>
          <small>customer ID: 1042</small>
        </div>
      </div>
      <div className="cs-card">
        <small>WALLET BALANCE</small>
        <div className="cs-amt">{peso(balance)}</div>
        <small className="cs-meta">currency: PHP · risk: low</small>
      </div>
      <div className="cs-actions">
        <button>📋 Copy</button>
        <button className="active">🔍 Verify</button>
        <button>📨 Notify</button>
      </div>
      {statusLine && <div className="cs-status">{statusLine}</div>}
    </div>
  );
}

/* Auto-debit job (server) */
function AutoDebitScreen({ viz, statusLine }) {
  return (
    <div className="ad">
      <div className="ad-top">
        <span className="ad-svc">⚙ {viz.actor} · cron</span>
        <span className="ad-time">06:00 PM PHT</span>
      </div>
      <div className="ad-card">
        <div className="ad-prov">{viz.provider}</div>
        <small>SCHEDULED BILL PAYMENT</small>
        <div className="ad-amt">– {peso(viz.amount)}</div>
        <div className="ad-meta">
          <span>account: 0931-•••-2210</span><span>due: today</span>
        </div>
      </div>
      <pre className="ad-log">
{`> connect db: ok
> open tx: ok
> UPDATE wallets WHERE id=1 ...`}
      </pre>
      {statusLine && <div className="ad-status">{statusLine}</div>}
    </div>
  );
}

/* Cashback worker */
function CashbackScreen({ viz, statusLine }) {
  return (
    <div className="cb">
      <div className="cb-top">
        <span className="cb-svc">🎁 {viz.actor} Engine</span>
      </div>
      <div className="cb-card">
        <small>CASHBACK REWARD</small>
        <div className="cb-amt">+ {peso(viz.amount)}</div>
        <div className="cb-src">from: <strong>{viz.source}</strong></div>
      </div>
      <pre className="cb-log">
{`> queue: 1 reward
> credit wallet id=2 ...`}
      </pre>
      {statusLine && <div className="cb-status">{statusLine}</div>}
    </div>
  );
}

/* CLiQQ POS */
function CliqqScreen({ viz, statusLine }) {
  return (
    <div className="cq">
      <div className="cq-top">
        <span className="cq-7">7-ELEVEN</span>
        <span className="cq-q">CLiQQ</span>
      </div>
      <div className="cq-store">{viz.store}</div>
      <div className="cq-receipt">
        <div className="cq-line"><span>Tx ID</span><span>{viz.txid}</span></div>
        <div className="cq-line"><span>Type</span><span>WALLET CASH-IN</span></div>
        <div className="cq-line"><span>Customer</span><span>{viz.customer}</span></div>
        <div className="cq-line"><span>Mobile</span><span>0917 ••• ••••</span></div>
        <div className="cq-line big"><span>Amount</span><span>+ {peso(viz.amount)}</span></div>
      </div>
      <button className="cq-cta">CONFIRM CASH-IN</button>
      {statusLine && <div className="cq-status">{statusLine}</div>}
    </div>
  );
}

/* Admin SQL studio (dark) */
function AdminScreen({ viz, statusLine }) {
  return (
    <div className="adm">
      <div className="adm-top">
        <span>● ● ●</span>
        <span className="adm-title">SQL Studio · production</span>
      </div>
      <div className="adm-tabs">
        <span className="active">migration_011.sql</span>
        <span>schema.sql</span>
      </div>
      <pre className="adm-code">
<span className="sql-c">-- {viz.actor}: add KYC level field</span>{"\n"}
<span className="sql-k">ALTER TABLE</span> <span className="sql-t">wallets</span>{"\n"}{"  "}
<span className="sql-k">ADD COLUMN</span> kyc_level <span className="sql-k">INT</span>;
      </pre>
      <div className="adm-foot">
        <span>db: <b>prod</b></span>
        <span>schema: <b>public</b></span>
      </div>
      {statusLine && <div className="adm-status">{statusLine}</div>}
    </div>
  );
}

const THEMES = {
  "gcash":      { Comp: GCashCheckScreen, label: "GCash" },
  "gcash-pay":  { Comp: GCashPayScreen,   label: "GCash · Pay QR" },
  "gcash-send": { Comp: GCashSendScreen,  label: "GCash · Send Money" },
  "gcash-load": { Comp: GCashLoadScreen,  label: "GCash · Buy Load" },
  "gcash-web":  { Comp: GCashWebScreen,   label: "GCash Web" },
  "support":    { Comp: SupportScreen,    label: "CS Console" },
  "autodebit":  { Comp: AutoDebitScreen,  label: "Auto-debit Job" },
  "cashback":   { Comp: CashbackScreen,   label: "Cashback Engine" },
  "cliqq":      { Comp: CliqqScreen,      label: "CLiQQ POS" },
  "admin":      { Comp: AdminScreen,      label: "Admin SQL Studio" },
};

function DeviceCard({ side, viz, txState, rowsById, locks, tableLock }) {
  const info = TX_STATES[txState] || TX_STATES.idle;
  const row  = rowsById[viz.rowId];
  const balance = row ? row.balance : null;
  const txName = side === "t1" ? "T1" : "T2";

  const lockOnRow = viz.rowId ? locks[viz.rowId] : null;
  const lockOnSecondary = viz.secondaryRowId ? locks[viz.secondaryRowId] : null;
  const isMine = (lock) => lock && lock.owners && lock.owners.includes(txName);

  const themeMeta = THEMES[viz.theme] || THEMES["gcash"];
  const Screen = themeMeta.Comp;

  // Compose the in-app status line shown by the theme
  const statusLine = (
    <div className={"in-app-status state-" + txState}>
      <span className="emoji">{info.emoji}</span>
      <span className="lbl">{info.label.toUpperCase()}</span>
      <span className="msg">{info.msg}</span>
    </div>
  );

  return (
    <div className={"device device-" + viz.device + " state-" + txState}>
      <div className="device-frame">
        <div className="device-screen">
          <Screen viz={viz} balance={balance} statusLine={statusLine} />

          {/* Lock pills overlayed beneath the app screen */}
          <div className="dv-locks">
            <span className="dv-tag">{txName} · {themeMeta.label}</span>
            {lockOnRow && isMine(lockOnRow) && (
              <span className={"lock-pill lock-" + lockOnRow.mode.toLowerCase()}>
                🔒 holds {lockOnRow.mode} on row {viz.rowId}
              </span>
            )}
            {lockOnRow && !isMine(lockOnRow) && txState === "wait" && (
              <span className="lock-pill lock-wait">
                ⏳ waiting on row {viz.rowId} (held by {lockOnRow.owners.join(",")})
              </span>
            )}
            {lockOnSecondary && !isMine(lockOnSecondary) && txState === "wait" && (
              <span className="lock-pill lock-wait">
                ⏳ wants row {viz.secondaryRowId} (held by {lockOnSecondary.owners.join(",")})
              </span>
            )}
            {tableLock && viz.scope === "table" && tableLock.owner === txName && (
              <span className="lock-pill lock-x">🔒 holds {tableLock.mode} on TABLE</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SceneVisualization({ tech, state }) {
  const viz = tech.viz;
  if (!viz) return null;
  const rowsById = state.rows.reduce((acc, r) => { acc[r.id] = r; return acc; }, {});
  return (
    <div className="scene">
      <DeviceCard
        side="t1"
        viz={viz.t1}
        txState={state.t1.state}
        rowsById={rowsById}
        locks={state.locks}
        tableLock={state.tableLock}
      />
      <div className="scene-bus">
        <div className="bus-line" />
        <div className="bus-label">accounts row{viz.t1.rowId === viz.t2.rowId ? "" : "s"} contended</div>
        <div className="bus-line" />
      </div>
      <DeviceCard
        side="t2"
        viz={viz.t2}
        txState={state.t2.state}
        rowsById={rowsById}
        locks={state.locks}
        tableLock={state.tableLock}
      />
    </div>
  );
}

/* ---------- The component ---------- */
function TransactionDemo({ onClose }) {
  const SCENARIOS = useMemo(() => buildScenarios(), []);
  const [techKey, setTechKey] = useState("exclusive");
  const tech = SCENARIOS[techKey];

  const initialState = (t) => ({
    rows: initialRows(),
    locks: {},
    tableLock: null,
    t1: { state: "idle", ops: t.t1Ops.map(o => ({ ...o, status: "pending" })) },
    t2: { state: "idle", ops: t.t2Ops.map(o => ({ ...o, status: "pending" })) },
    log: [{ ts: ts(), kind: "info", text: "Scenario: " + t.title }],
    cursor: 0,
  });

  const [state, setState] = useState(() => initialState(tech));
  const [auto, setAuto] = useState(false);
  const logRef = useRef(null);

  // Reset whenever technique changes
  useEffect(() => { setState(initialState(SCENARIOS[techKey])); setAuto(false); }, [techKey]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [state.log.length]);

  const step = () => {
    if (state.cursor >= tech.steps.length) return;
    const next = tech.steps[state.cursor](state);
    setState({ ...next, cursor: state.cursor + 1 });
  };

  const reset = () => { setState(initialState(tech)); setAuto(false); };

  // Auto-play
  useEffect(() => {
    if (!auto) return;
    if (state.cursor >= tech.steps.length) { setAuto(false); return; }
    const id = setTimeout(step, 900);
    return () => clearTimeout(id);
  }, [auto, state.cursor]);

  const lockClass = (rowId) => {
    const l = state.locks[rowId];
    if (!l) return "";
    if (l.mode === "X") return "locked-x";
    if (l.mode === "S") return "locked-s";
    if (l.mode === "U") return "locked-u";
    return "";
  };

  return (
    <div className="overlay" onClick={(e)=>{ if(e.target.classList.contains("overlay")) onClose(); }}>
      <div className="demo">
        <header>
          <span className="pill">LIVE DEMO</span>
          <h2>E-Wallet Transaction Sandbox  <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 14 }}>— GCash / Maya-style</span></h2>
          <button className="btn" onClick={reset}>↺ Reset</button>
          <button className="btn" onClick={onClose}>✕ Close</button>
        </header>

        <div className="body">
          <aside className="side">
            <h4>Locking technique</h4>
            {TECHNIQUES.map(t => (
              <div
                key={t.key}
                className={"technique" + (techKey === t.key ? " active" : "")}
                onClick={() => setTechKey(t.key)}
              >
                <strong>{t.label}</strong>
                <small>{t.sub}</small>
              </div>
            ))}
          </aside>

          <main className="work">
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ margin: "0 0 6px" }}>{tech.title}</h2>
              {tech.scenario && (
                <div style={{
                  background: "#fff7e6",
                  border: "1px solid #f1d28e",
                  borderLeft: "4px solid #e08826",
                  borderRadius: 8,
                  padding: "10px 14px",
                  margin: "8px 0 10px",
                  color: "#6b4400",
                  fontSize: 14.5,
                  lineHeight: 1.5,
                }}>
                  <strong style={{ color: "#9a5a00" }}>Real-world scenario:</strong>{" "}
                  {tech.scenario}
                </div>
              )}
              <p style={{ margin: 0, color: "var(--muted)" }}>{tech.summary}</p>
            </div>

            {/* Live device visualization */}
            <SceneVisualization tech={tech} state={state} />

            <div className="demo-row">
              {/* T1 */}
              <div className="tx-card t1">
                <div className="head">
                  <span className="name">Transaction T1</span>
                  <span className={"state " + state.t1.state}>{state.t1.state.toUpperCase()}</span>
                </div>
                <ul className="ops">
                  {state.t1.ops.map((o, i) => (
                    <li key={i} className={o.status}>{o.text}</li>
                  ))}
                </ul>
              </div>
              {/* T2 */}
              <div className="tx-card t2">
                <div className="head">
                  <span className="name">Transaction T2</span>
                  <span className={"state " + state.t2.state}>{state.t2.state.toUpperCase()}</span>
                </div>
                <ul className="ops">
                  {state.t2.ops.map((o, i) => (
                    <li key={i} className={o.status}>{o.text}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Per-step explanation: shows the most recent step's "why" */}
            <div className="step-explainer">
              <div className="hd">
                <span className="badge">
                  STEP {state.cursor === 0 ? "0" : state.cursor} / {tech.steps.length}
                </span>
                {state.cursor === 0 ? (
                  <span className="title">Click "Step" to walk through the scenario</span>
                ) : (
                  <span className="title">{
                    state.cursor >= tech.steps.length
                      ? "Scenario complete — try Reset or pick another technique"
                      : "Just happened:"
                  }</span>
                )}
              </div>
              <div className="body">
                {state.cursor === 0
                  ? <em style={{ color: "#5e7a91" }}>
                      Read the scenario above, then click <strong>Step</strong> (or <strong>Auto-play</strong>).
                      Each step explains what's happening and why.
                    </em>
                  : (tech.notes && tech.notes[state.cursor - 1])
                      || "(no explanation for this step)"}
              </div>
            </div>

            <div className="tx-controls" style={{ marginTop: 12 }}>
              <button
                className="btn primary"
                onClick={step}
                disabled={state.cursor >= tech.steps.length}
              >
                ▶ Step ({state.cursor}/{tech.steps.length})
              </button>
              <button
                className="btn"
                onClick={() => setAuto(a => !a)}
                disabled={state.cursor >= tech.steps.length}
              >
                {auto ? "⏸ Pause" : "⏵ Auto-play"}
              </button>
              <button className="btn ghost" onClick={reset}>↺ Reset scenario</button>
              {state.tableLock && (
                <span className="pill" style={{ background: "#fff5d8", color: "#8a6300", border: "1px solid #f0d56b", borderRadius: 999, padding: "4px 10px" }}>
                  Table lock: {state.tableLock.mode} ({state.tableLock.owner})
                </span>
              )}
            </div>

            <div className="table-vis">
              <header>
                <strong>wallets</strong>
                <span style={{ color: "var(--muted)" }}>(live row state — balance in ₱)</span>
                <div className="legend" style={{ marginLeft: "auto" }}>
                  <span className="lx">X — Exclusive</span>
                  <span className="ls">S — Shared</span>
                  <span className="lu">U — Update</span>
                </div>
              </header>
              <table>
                <thead>
                  <tr><th>id</th><th>name</th><th>balance</th><th>version</th></tr>
                </thead>
                <tbody>
                  {state.rows.map(r => (
                    <tr key={r.id} className={lockClass(r.id)}>
                      <td>{r.id}</td>
                      <td>{r.name}</td>
                      <td>{r.balance.toLocaleString()}</td>
                      <td>{r.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="log" ref={logRef}>
              {state.log.map((l, i) => (
                <div key={i}>
                  <span className="t">[{l.ts}]</span>{" "}
                  <span className={l.kind}>{l.text}</span>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

window.TransactionDemo = TransactionDemo;
