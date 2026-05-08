/* ============================================================
   Slide components — 10 slides matching the LO10 design.
   Exposes window.SLIDES (array of components) and window.SLIDE_TITLES.
   ============================================================ */

const { useState } = React;

/* ---------- Reusable footer for content slides ---------- */
function SlideFooter({ index, total }) {
  return (
    <div className="footer">
      <div><strong style={{ color: "#0d2438" }}>LO10</strong>  •  Database Locking Techniques</div>
      <div>{index} / {total}</div>
    </div>
  );
}

/* ---------- 1. Title ---------- */
function SlideTitle() {
  return (
    <section className="slide title">
      <div className="left">
        <div className="eyebrow">DCIT 55</div>
        <h1>Database Locking<br/>Techniques</h1>
        <div className="lede">Transactions, data types, large datasets, and locks</div>
        <div className="rule" />
        <p className="desc">
          Use different locking techniques in database tables to ensure data
          integrity and concurrency.
        </p>
        <div className="meta">Prepared by Godwin Llabres  •  May 2026</div>
      </div>
      <div className="right">
        <svg viewBox="0 0 220 260" width="280" height="320" aria-hidden="true">
          <path d="M65,118 V90 a45,45 0 0 1 90,0 V118"
                fill="none" stroke="#f5b932" strokeWidth="18" strokeLinecap="round" />
          <rect x="40" y="118" width="140" height="120" rx="14" fill="#f5b932" />
          <circle cx="110" cy="170" r="14" fill="#0d2438" />
          <rect x="103" y="178" width="14" height="34" rx="3" fill="#0d2438" />
        </svg>
      </div>
    </section>
  );
}

/* ---------- 2. Agenda ---------- */
function SlideAgenda(props) {
  const items = [
    { n: "01", t: "Database Transactions", d: "ACID properties and the role of transactions in keeping data consistent." },
    { n: "02", t: "Different Data Types",   d: "Numeric, string, date/time, and binary types you'll meet in real tables." },
    { n: "03", t: "Processing Large Datasets", d: "Batching, indexing, and pagination for high-volume operations." },
    { n: "04", t: "Locking in Transactions", d: "Lock modes, granularity, isolation levels, and avoiding deadlocks." },
  ];
  return (
    <section className="slide">
      <div className="eyebrow">Agenda</div>
      <h1>What we'll cover</h1>
      <div className="agenda-grid">
        {items.map(it => (
          <div className="agenda-card" key={it.n}>
            <div className="num">{it.n}</div>
            <h3>{it.t}</h3>
            <p>{it.d}</p>
          </div>
        ))}
      </div>
      <SlideFooter index={props.index} total={props.total} />
    </section>
  );
}

/* ---------- 3. Database Transactions ---------- */
function SlideTransactions(props) {
  return (
    <section className="slide">
      <div className="eyebrow">Part 1</div>
      <h1>Database Transactions</h1>
      <div className="two-col">
        <div className="panel">
          <h2>What is a transaction?</h2>
          <p>
            A transaction is a single logical unit of work made up of one or more
            SQL statements that must succeed or fail together.
          </p>
          <p style={{ marginTop: 18 }}>
            <span className="kw">BEGIN</span> starts the transaction<br/>
            <span className="kw">COMMIT</span> saves all changes<br/>
            <span className="kw">ROLLBACK</span> undoes everything on failure
          </p>
        </div>
        <div>
          <h2 style={{ marginBottom: 14 }}>ACID Properties</h2>
          <div className="acid-list">
            {[
              ["A", "Atomicity",   "All steps complete, or none do."],
              ["C", "Consistency", "DB moves between valid states only."],
              ["I", "Isolation",   "Concurrent transactions don't interfere."],
              ["D", "Durability",  "Committed data survives crashes."],
            ].map(([l, t, d]) => (
              <div className="acid-item" key={l}>
                <div className="acid-letter">{l}</div>
                <div className="text">
                  <strong>{t}</strong>
                  <span>{d}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <SlideFooter index={props.index} total={props.total} />
    </section>
  );
}

/* ---------- 4. Data Types ---------- */
function SlideDataTypes(props) {
  const cards = [
    { c: "t-num",  t: "Numeric",          codes: "INT, BIGINT, DECIMAL(p,s), FLOAT, DOUBLE", ex: "IDs, counts, prices, scientific values" },
    { c: "t-str",  t: "Character / String", codes: "CHAR(n), VARCHAR(n), TEXT, NCHAR",        ex: "Names, addresses, descriptions" },
    { c: "t-date", t: "Date / Time",       codes: "DATE, TIME, DATETIME, TIMESTAMP",          ex: "Created/updated timestamps, schedules" },
    { c: "t-bool", t: "Boolean / Logical", codes: "BOOLEAN, BIT",                              ex: "Flags, switches, true/false states" },
    { c: "t-bin",  t: "Binary / BLOB",     codes: "BINARY, VARBINARY, BLOB",                   ex: "Images, files, encrypted data" },
    { c: "t-spec", t: "Special",           codes: "JSON, UUID, ENUM, GEOGRAPHY",               ex: "Modern apps, identifiers, geo data" },
  ];
  return (
    <section className="slide">
      <div className="eyebrow">Part 2</div>
      <h1>Different Data Types</h1>
      <p style={{ fontStyle: "italic", color: "var(--muted)" }}>
        Choosing the right data type keeps tables fast, accurate, and storage-efficient.
      </p>
      <div className="types-grid">
        {cards.map(card => (
          <div className={"type-card " + card.c} key={card.t}>
            <h3>{card.t}</h3>
            <div className="codes">{card.codes}</div>
            <div className="ex">{card.ex}</div>
          </div>
        ))}
      </div>
      <SlideFooter index={props.index} total={props.total} />
    </section>
  );
}

/* ---------- 5. Large Datasets ---------- */
function SlideLargeDatasets(props) {
  return (
    <section className="slide">
      <div className="eyebrow">Part 3</div>
      <h1>Processing Large Datasets</h1>
      <div className="two-col">
        <div className="tile left">
          <h2>The challenge</h2>
          <ul>
            <li>Slow queries on millions of rows</li>
            <li>High memory and CPU usage</li>
            <li>Long-running locks block other users</li>
            <li>Network or disk I/O bottlenecks</li>
            <li>Hard to recover from mid-process failures</li>
          </ul>
        </div>
        <div className="tile right">
          <h2>Techniques that help</h2>
          <div className="h">Batching</div>
          <div className="d">Process N rows per pass instead of all at once.</div>
          <div className="h">Indexing</div>
          <div className="d">Add the right indexes to speed up filters and joins.</div>
          <div className="h">Pagination</div>
          <div className="d">Use LIMIT / OFFSET or keyset paging for queries.</div>
          <div className="h">Bulk operations</div>
          <div className="d">INSERT, UPDATE in sets; minimise round trips.</div>
          <div className="h">Partitioning</div>
          <div className="d">Split tables by date or range to scan less data.</div>
        </div>
      </div>
      <SlideFooter index={props.index} total={props.total} />
    </section>
  );
}

/* ---------- 6. Locking in Transactions ---------- */
function SlideLockingIntro(props) {
  return (
    <section className="slide">
      <div className="eyebrow">Part 4</div>
      <h1>Locking in Database Transactions</h1>
      <div className="callout">
        <h2>What is locking?</h2>
        <p>
          Locking is the mechanism the database uses to control concurrent access
          to data so that two transactions don't corrupt each other's work. A lock
          is placed on a resource (row, page, or table) and released when the
          transaction ends.
        </p>
      </div>
      <h2 style={{ marginTop: 26 }}>Problems locking helps prevent</h2>
      <div className="problems-grid">
        <div className="problem-card"><h3>Lost Updates</h3><p>Two writes overwrite each other.</p></div>
        <div className="problem-card"><h3>Dirty Reads</h3><p>Reading data that may roll back.</p></div>
        <div className="problem-card"><h3>Inconsistent Reads</h3><p>Same query gives different results.</p></div>
      </div>
      <SlideFooter index={props.index} total={props.total} />
    </section>
  );
}

/* ---------- 7. Lock Modes (with demo launcher) ---------- */
function SlideLockModes(props) {
  const cards = [
    { c: "s-shared", t: "Shared Lock (S)",   d: "Multiple transactions can read the same data, but none can write while held." },
    { c: "s-excl",   t: "Exclusive Lock (X)", d: "Only one transaction can read or write. Used for INSERT/UPDATE/DELETE." },
    { c: "s-update", t: "Update Lock (U)",   d: "Held while deciding to update; upgrades to exclusive. Prevents deadlocks." },
    { c: "s-intent", t: "Intent Lock (IS/IX)", d: "Signals intent to take S or X locks at a finer level. Used in hierarchies." },
    { c: "s-opt",    t: "Optimistic Locking", d: "No locks held; check a version/timestamp at commit time." },
    { c: "s-pess",   t: "Pessimistic Locking", d: "Lock the row up front and hold it until the transaction ends." },
  ];
  return (
    <section className="slide">
      <div className="eyebrow">Lock Modes</div>
      <h1>Common Locking Techniques</h1>
      <div className="demo-launch">
        <button className="demo-cta" onClick={props.onOpenDemo}>
          ▶ Open Live Demo
        </button>
      </div>
      <div className="locks-grid">
        {cards.map(c => (
          <div key={c.t} className={"lock-card " + c.c}>
            <span className="dot"></span>
            <h3>{c.t}</h3>
            <p>{c.d}</p>
          </div>
        ))}
      </div>
      <SlideFooter index={props.index} total={props.total} />
    </section>
  );
}

/* ---------- 8. Granularity ---------- */
function SlideGranularity(props) {
  return (
    <section className="slide">
      <div className="eyebrow">What gets locked</div>
      <h1>Lock Granularity</h1>
      <p style={{ fontStyle: "italic", color: "var(--muted)" }}>
        Trade-off: finer locks = more concurrency but more overhead.
      </p>
      <div className="gran-grid">
        <div className="gran-card row">
          <div className="head"><h3>Row-level</h3><div className="l">Lowest level</div></div>
          <div className="body">Locks one row. Highest concurrency, highest overhead.</div>
        </div>
        <div className="gran-card page">
          <div className="head"><h3>Page-level</h3><div className="l">Middle level</div></div>
          <div className="body">Locks a page (group of rows). A practical balance.</div>
        </div>
        <div className="gran-card table">
          <div className="head"><h3>Table-level</h3><div className="l">Highest level</div></div>
          <div className="body">Locks the whole table. Simple but blocks everyone.</div>
        </div>
      </div>
      <div className="iso-bar">
        <span className="label">Isolation levels:</span>
        <span>Read Uncommitted</span><span className="sep">•</span>
        <span>Read Committed</span><span className="sep">•</span>
        <span>Repeatable Read</span><span className="sep">•</span>
        <span>Serializable</span>
      </div>
      <SlideFooter index={props.index} total={props.total} />
    </section>
  );
}

/* ---------- 9. Deadlock ---------- */
function SlideDeadlock(props) {
  return (
    <section className="slide">
      <div className="eyebrow">Watch out</div>
      <h1>Deadlocks &amp; How to Avoid Them</h1>
      <div className="dl-grid">
        <div className="panel dl-left">
          <h2>What is a deadlock?</h2>
          <p>Two transactions each hold a lock the other one wants — neither can move forward.</p>
          <div className="dl-graph">
            <svg viewBox="0 0 580 260" width="100%" height="220">
              <circle cx="100" cy="130" r="58" fill="#1e6091" />
              <text x="100" y="138" textAnchor="middle" fill="#fff" fontWeight="800" fontSize="28">T1</text>
              <circle cx="480" cy="130" r="58" fill="#1e6091" />
              <text x="480" y="138" textAnchor="middle" fill="#fff" fontWeight="800" fontSize="28">T2</text>

              <rect x="220" y="80"  width="140" height="34" rx="6" fill="#0d2438" />
              <text x="290" y="102" textAnchor="middle" fill="#fff" fontSize="14">Row A</text>
              <rect x="220" y="146" width="140" height="34" rx="6" fill="#0d2438" />
              <text x="290" y="168" textAnchor="middle" fill="#fff" fontSize="14">Row B</text>

              {/* T1 holds A (solid), waits for B (dashed) */}
              <line x1="158" y1="100" x2="220" y2="100" stroke="#1e6091" strokeWidth="3" />
              <line x1="158" y1="160" x2="220" y2="160" stroke="#c1185f" strokeWidth="3" strokeDasharray="6 6" />
              {/* T2 holds B (solid), waits for A (dashed) */}
              <line x1="360" y1="160" x2="422" y2="160" stroke="#1e6091" strokeWidth="3" />
              <line x1="360" y1="100" x2="422" y2="100" stroke="#c1185f" strokeWidth="3" strokeDasharray="6 6" />
            </svg>
            <div style={{ color: "var(--muted)", fontStyle: "italic", fontSize: 14 }}>
              Solid = holds, dashed = waits for
            </div>
          </div>
        </div>
        <div className="panel dl-right" style={{ borderLeftColor: "var(--green)" }}>
          <h2>Prevention strategies</h2>
          <ul>
            <li>Always lock resources in the same order</li>
            <li>Keep transactions short and focused</li>
            <li>Use the lowest isolation level that's safe</li>
            <li>Set lock timeouts and retry on deadlock</li>
            <li>Use indexes — they reduce locked rows</li>
            <li>Prefer optimistic locking for low-contention reads</li>
          </ul>
        </div>
      </div>
      <SlideFooter index={props.index} total={props.total} />
    </section>
  );
}

/* ---------- 10. Wrap-up ---------- */
function SlideWrap(props) {
  return (
    <section className="slide wrap">
      <div className="top-bar" />
      <div className="inner">
        <div className="eyebrow">Key Takeaways</div>
        <h1>Wrap-up</h1>
        <div className="wrap-grid">
          {[
            ["1", "Transactions enforce ACID", "Group statements so they succeed or fail as one."],
            ["2", "Pick data types carefully", "Right type = faster queries and smaller storage."],
            ["3", "Scale with batching",       "Process big data in chunks and use proper indexes."],
            ["4", "Lock smart, not hard",      "Match lock mode and granularity to the workload."],
          ].map(([n, t, d]) => (
            <div className="wrap-card" key={n}>
              <div className="n">{n}</div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
        <div className="thanks">Thank you!</div>
        <div style={{ alignSelf: "flex-end", color: "#9bb1c5", fontSize: 14 }}>
          {props.index} / {props.total}
        </div>
      </div>
    </section>
  );
}

/* ---------- Export to global ---------- */
window.SLIDES = [
  SlideTitle,
  SlideAgenda,
  SlideTransactions,
  SlideDataTypes,
  SlideLargeDatasets,
  SlideLockingIntro,
  SlideLockModes,
  SlideGranularity,
  SlideDeadlock,
  SlideWrap,
];

window.SLIDE_TITLES = [
  "Title — Database Locking Techniques",
  "Agenda",
  "Database Transactions",
  "Different Data Types",
  "Processing Large Datasets",
  "Locking in Database Transactions",
  "Common Locking Techniques",
  "Lock Granularity",
  "Deadlocks & How to Avoid Them",
  "Wrap-up",
];
