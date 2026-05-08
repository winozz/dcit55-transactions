/* ============================================================
   App shell — navigation, slide stage, presenter notes (synced),
   keyboard shortcuts, separate presenter window.
   ============================================================ */

const { useState, useEffect, useMemo, useRef, useCallback } = React;

/* ---------- Auto-scale the 1280x720 stage to fit any window ---------- */
function useStageScale(deps = []) {
  const ref = useRef(null);
  // Re-fit when any of the deps change (e.g. notes panel toggled)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    const fit = () => {
      const pad = 28;
      const sx = (parent.clientWidth  - pad) / 1280;
      const sy = (parent.clientHeight - pad) / 720;
      const s  = Math.min(sx, sy, 1.4);
      if (isFinite(s) && s > 0) el.style.transform = `scale(${s})`;
    };
    // run twice across two frames so the layout has settled (grid relayout
    // after notes toggle can take a frame to commit)
    requestAnimationFrame(() => { fit(); requestAnimationFrame(fit); });

    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(fit);
      ro.observe(parent);
    }
    window.addEventListener("resize", fit);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

function App() {
  const slides = window.SLIDES || [];
  const titles = window.SLIDE_TITLES || [];
  const notes  = window.SLIDE_NOTES  || [];
  const total  = slides.length;

  const [idx, setIdx]            = useState(0);          // current slide
  const [previewIdx, setPreview] = useState(0);          // notes panel slide (when unsynced)
  const [showNotes, setShowNotes] = useState(true);
  const [synced, setSynced]      = useState(true);       // ★ the sync toggle
  const [demoOpen, setDemoOpen]  = useState(false);

  const stageRef = useStageScale([showNotes]);

  /* Keep preview in lock-step when synced */
  useEffect(() => { if (synced) setPreview(idx); }, [idx, synced]);

  /* Broadcast to a separate presenter window via localStorage */
  useEffect(() => {
    try {
      localStorage.setItem("lo10:slide", JSON.stringify({ idx, ts: Date.now() }));
    } catch {}
  }, [idx]);

  const goTo  = useCallback((i) => {
    const n = Math.max(0, Math.min(i, total - 1));
    setIdx(n);
  }, [total]);
  const next  = useCallback(() => setIdx(i => Math.min(i + 1, total - 1)), [total]);
  const prev  = useCallback(() => setIdx(i => Math.max(i - 1, 0)), []);
  const first = useCallback(() => setIdx(0), []);
  const last  = useCallback(() => setIdx(total - 1), [total]);

  const previewNext = () => setPreview(p => Math.min(p + 1, total - 1));
  const previewPrev = () => setPreview(p => Math.max(p - 1, 0));

  /* Touch / swipe navigation on the stage (mobile) */
  useEffect(() => {
    const stageEl = stageRef.current && stageRef.current.parentElement;
    if (!stageEl) return;
    let startX = 0, startY = 0, startT = 0, tracking = false;
    const onStart = (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startT = Date.now();
    };
    const onEnd = (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startT;
      // Horizontal swipe, fast enough, dominant over vertical movement
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
        if (dx < 0) next();
        else        prev();
      }
    };
    stageEl.addEventListener("touchstart", onStart, { passive: true });
    stageEl.addEventListener("touchend",   onEnd,   { passive: true });
    return () => {
      stageEl.removeEventListener("touchstart", onStart);
      stageEl.removeEventListener("touchend",   onEnd);
    };
  }, [next, prev]);

  /* Listen for goto commands from the presenter popup window */
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== "lo10:cmd" || !e.newValue) return;
      try {
        const cmd = JSON.parse(e.newValue);
        if (cmd.type === "goto" && Number.isInteger(cmd.idx)) goTo(cmd.idx);
        else if (cmd.type === "next") next();
        else if (cmd.type === "prev") prev();
        else if (cmd.type === "first") first();
        else if (cmd.type === "last") last();
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [goTo, next, prev, first, last]);

  /* Keyboard shortcuts */
  useEffect(() => {
    const onKey = (e) => {
      if (demoOpen) {
        if (e.key === "Escape") setDemoOpen(false);
        return;
      }
      const tag = e.target && e.target.tagName;
      const isTextInput = tag === "INPUT" || tag === "TEXTAREA";

      // Slide navigation always works, even when focus is on an input/button.
      // Blur the active input so the cursor doesn't get "stuck" there.
      const blurIfInput = () => { if (isTextInput) e.target.blur(); };
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
          e.preventDefault(); blurIfInput(); next();  return;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault(); blurIfInput(); prev();  return;
        case "Home":
          e.preventDefault(); blurIfInput(); first(); return;
        case "End":
          e.preventDefault(); blurIfInput(); last();  return;
        default: break;
      }

      // Letter-key + Space shortcuts: only when NOT typing.
      if (isTextInput) return;
      switch (e.key) {
        case " ":              e.preventDefault(); next();  break;
        case "n": case "N":    setShowNotes(v => !v);       break;
        case "s": case "S":    setSynced(v => !v);          break;
        case "d": case "D":    setDemoOpen(true);           break;
        case "p": case "P":    openPresenterWindow();       break;
        case "f": case "F":
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen?.();
          break;
        default: break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, first, last, demoOpen]);

  /* Open a second window that mirrors AND controls the current slide */
  const openPresenterWindow = () => {
    const w = window.open("", "lo10_presenter",
      "width=620,height=780,resizable=yes,scrollbars=yes");
    if (!w) { alert("Popup blocked - allow popups for this page."); return; }

    // Stash data the popup needs as window globals
    w.LO10_TOTAL  = total;
    w.LO10_TITLES = titles;
    w.LO10_NOTES  = notes;

    w.document.title = "Presenter view - LO10";
    w.document.body.style.margin = "0";
    w.document.body.style.fontFamily = "Inter, Segoe UI, system-ui, sans-serif";
    w.document.body.innerHTML = `
      <style>
        :root{color-scheme:dark}
        body{background:#0d2438;color:#e7eef5}
        #pv{height:100vh;padding:18px 22px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px}
        .eyebrow{font-size:11px;letter-spacing:.16em;color:#f5b932;text-transform:uppercase}
        h2{margin:2px 0 6px;color:#fff;font-size:22px}
        .nav{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
             background:#102d44;border:1px solid #1e4868;border-radius:10px;padding:8px 10px}
        .nav button{background:#143049;color:#e6eef6;border:1px solid #1e4868;
                    padding:6px 10px;border-radius:8px;cursor:pointer;font:inherit}
        .nav button:hover{background:#1a3d5b}
        .nav button[disabled]{opacity:.4;cursor:not-allowed}
        .nav .num{display:flex;align-items:center;gap:6px;
                  background:#0d2438;border:1px solid #1e4868;border-radius:8px;padding:4px 8px}
        .nav input{width:48px;background:#0d2438;color:#fff;border:none;
                   font:inherit;text-align:center;outline:none}
        .nav .total{color:#8aa3bb}
        .nav .titles{margin-left:auto;color:#8aa3bb;font-size:13px;
                     overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}
        .body{flex:1;overflow-y:auto;white-space:pre-wrap;
              font:15px/1.55 Inter,sans-serif;color:#e7eef5;margin:0;
              background:#0a1d2f;border:1px solid #16314a;border-radius:10px;padding:14px 16px}
        .foot{font-size:12px;color:#8aa3bb;display:flex;justify-content:space-between}
      </style>
      <div id="pv">
        <div class="eyebrow">Presenter view</div>
        <h2 id="pv-title"></h2>
        <div class="nav">
          <button id="pv-first" title="First slide">&#9198;</button>
          <button id="pv-prev"  title="Previous slide">&#9664;</button>
          <span class="num">
            <input id="pv-jump" type="number" min="1" />
            <span class="total" id="pv-total"></span>
          </span>
          <button id="pv-next" title="Next slide">&#9654;</button>
          <button id="pv-last" title="Last slide">&#9197;</button>
          <span class="titles" id="pv-titlehint"></span>
        </div>
        <pre class="body" id="pv-body"></pre>
        <div class="foot">
          <span id="pv-foot"></span>
          <span style="color:#6da3c4">Use the buttons or type a number + Enter to change slides on the main deck.</span>
        </div>
      </div>`;

    const $ = (id) => w.document.getElementById(id);

    // Run the command directly in the main window (closures call main-window
    // setIdx). Also mirror through localStorage from the POPUP'S window so
    // any other open windows receive a storage event.
    const sendCmd = (cmd) => {
      // 1) Direct call - closures from main window
      if (cmd.type === "next")  next();
      else if (cmd.type === "prev")  prev();
      else if (cmd.type === "first") first();
      else if (cmd.type === "last")  last();
      else if (cmd.type === "goto" && Number.isInteger(cmd.idx)) goTo(cmd.idx);
      // 2) Mirror via popup's own localStorage so other windows hear about it
      try {
        w.localStorage.setItem("lo10:cmd", JSON.stringify({ ...cmd, ts: Date.now() }));
      } catch {}
    };

    const render = () => {
      try {
        const cur = JSON.parse(localStorage.getItem("lo10:slide") || "{}");
        const i = cur.idx ?? 0;
        $("pv-title").textContent =
          "Slide " + (i + 1) + " / " + w.LO10_TOTAL + " - " + (w.LO10_TITLES[i] || "");
        $("pv-body").textContent = w.LO10_NOTES[i] || "(no notes)";
        $("pv-jump").value = i + 1;
        $("pv-jump").max = w.LO10_TOTAL;
        $("pv-total").textContent = "/ " + w.LO10_TOTAL;
        $("pv-titlehint").textContent = w.LO10_TITLES[i] || "";
        $("pv-foot").textContent =
          "Auto-syncs with main window. Last update: " +
          new Date(cur.ts || Date.now()).toLocaleTimeString();
        $("pv-first").disabled = i === 0;
        $("pv-prev").disabled  = i === 0;
        $("pv-next").disabled  = i === w.LO10_TOTAL - 1;
        $("pv-last").disabled  = i === w.LO10_TOTAL - 1;
      } catch {}
    };

    $("pv-first").onclick = () => sendCmd({ type: "first" });
    $("pv-prev").onclick  = () => sendCmd({ type: "prev"  });
    $("pv-next").onclick  = () => sendCmd({ type: "next"  });
    $("pv-last").onclick  = () => sendCmd({ type: "last"  });
    $("pv-jump").addEventListener("change", (e) => {
      const n = parseInt(e.target.value, 10);
      if (!Number.isNaN(n)) sendCmd({ type: "goto", idx: n - 1 });
    });
    $("pv-jump").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const n = parseInt(e.target.value, 10);
        if (!Number.isNaN(n)) sendCmd({ type: "goto", idx: n - 1 });
      }
    });
    // Forward arrow keys from popup -> main deck.
    // Bind on BOTH window and document to catch focus quirks; ignore only when
    // typing into the slide-number input.
    const onKey = (e) => {
      if (e.target && e.target.id === "pv-jump") return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
        e.preventDefault(); sendCmd({ type: "next" });
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault(); sendCmd({ type: "prev" });
      } else if (e.key === "Home") { e.preventDefault(); sendCmd({ type: "first" }); }
      else if (e.key === "End")    { e.preventDefault(); sendCmd({ type: "last"  }); }
    };
    w.addEventListener("keydown", onKey);
    w.document.addEventListener("keydown", onKey);
    // Make sure the popup is focused so keystrokes are captured immediately
    setTimeout(() => { try { w.focus(); w.document.body.focus(); } catch {} }, 50);
    w.document.body.tabIndex = 0; // make body focusable

    render();
    const handler = (e) => { if (e.key === "lo10:slide") render(); };
    w.addEventListener("storage", handler);
    w.addEventListener("beforeunload", () =>
      w.removeEventListener("storage", handler));
  };

  const SlideComp = slides[idx] || (() => null);
  const noteIdx = synced ? idx : previewIdx;

  const progressPct = Math.round(((idx + 1) / total) * 100);

  return (
    <div className={"app" + (showNotes ? " with-notes" : "")}>
      {/* Mobile-only LMS-style header (hidden on desktop via CSS) */}
      <header className="mobile-header">
        <div className="mh-top">
          <div className="mh-id">
            <span className="mh-tag">LO10</span>
            <span className="mh-course">Database Locking Techniques</span>
          </div>
          <button
            className="mh-menu"
            onClick={() => setShowNotes(v => !v)}
            aria-label="Toggle notes"
            title="Toggle notes"
          >
            {showNotes ? "📖" : "📝"}
          </button>
        </div>
        <div className="mh-progress" aria-label={`Progress: ${progressPct}%`}>
          <div className="mh-bar" style={{ width: progressPct + "%" }} />
        </div>
        <div className="mh-meta">
          <span className="mh-lesson">Lesson {idx + 1} of {total}</span>
          <span className="mh-section">{titles[idx]}</span>
        </div>
      </header>

      {/* Stage */}
      <div className="stage">
        <div className="stage-inner" ref={stageRef}>
          <SlideComp
            index={idx + 1}
            total={total}
            onOpenDemo={() => setDemoOpen(true)}
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="left">
          <button className="btn" onClick={first} disabled={idx === 0}>⏮</button>
          <button className="btn" onClick={prev}  disabled={idx === 0}>◀</button>
          <span className="counter">{idx + 1} / {total}</span>
          <button className="btn" onClick={next}  disabled={idx === total - 1}>▶</button>
          <button className="btn" onClick={last}  disabled={idx === total - 1}>⏭</button>
          <span style={{ marginLeft: 12, color: "#8aa3bb" }}>
            {titles[idx]}
          </span>
        </div>

        <div className="center">
          <button
            className={"btn " + (idx === 6 ? "primary" : "")}
            onClick={() => setDemoOpen(true)}
            title="Open the live transaction demo (D)"
          >
            ▶ Demo
          </button>
          <button
            className="btn"
            onClick={() => setShowNotes(v => !v)}
            title="Toggle presenter notes (N)"
          >
            {showNotes ? "🗎 Hide notes" : "🗎 Show notes"}
          </button>
          <button className="btn" onClick={openPresenterWindow} title="Open presenter window (P)">
            ⎘ Presenter view
          </button>
          <button
            className="btn"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen?.();
            }}
            title="Fullscreen (F)"
          >
            ⛶ Fullscreen
          </button>
        </div>

        <div className="right">
          <span className="kbd">←</span><span className="kbd">→</span>
          <span style={{ color: "#8aa3bb" }}>navigate</span>
          <span className="kbd">N</span>
          <span style={{ color: "#8aa3bb" }}>notes</span>
          <span className="kbd">D</span>
          <span style={{ color: "#8aa3bb" }}>demo</span>
          <span className="kbd">F</span>
          <span style={{ color: "#8aa3bb" }}>fullscreen</span>
        </div>
      </div>

      {/* Mobile-only sticky bottom nav (LMS-style) */}
      <nav className="mobile-nav">
        <button
          className="mn-btn mn-prev"
          onClick={prev}
          disabled={idx === 0}
          aria-label="Previous lesson"
        >
          <span className="mn-arrow">◀</span>
          <span className="mn-label">Previous</span>
        </button>
        <button
          className="mn-btn mn-lab"
          onClick={() => setDemoOpen(true)}
          aria-label="Open Lab / Demo"
        >
          <span className="mn-icon">⚡</span>
          <span className="mn-label">Lab</span>
        </button>
        <button
          className="mn-btn mn-next"
          onClick={next}
          disabled={idx === total - 1}
          aria-label="Next lesson"
        >
          <span className="mn-label">Next</span>
          <span className="mn-arrow">▶</span>
        </button>
      </nav>

      {/* Presenter notes panel */}
      {showNotes && (
        <aside className={"notes-panel" + (synced ? "" : " unsynced")}>
          <h3>Presenter notes</h3>
          <div className="sub">
            Slide {noteIdx + 1} / {total} —{" "}
            <strong style={{ color: "#fff" }}>{titles[noteIdx]}</strong>
          </div>

          {/* Jump-to-slide controls (always change the LIVE deck) */}
          <div className="jumpbar">
            <button className="btn" onClick={first} disabled={idx === 0} title="First">⏮</button>
            <button className="btn" onClick={prev}  disabled={idx === 0} title="Previous">◀</button>
            <span className="jump">
              <input
                type="number"
                min="1"
                max={total}
                value={idx + 1}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isNaN(n)) goTo(n - 1);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.target.blur();
                }}
              />
              <span className="of">/ {total}</span>
            </span>
            <button className="btn" onClick={next} disabled={idx === total - 1} title="Next">▶</button>
            <button className="btn" onClick={last} disabled={idx === total - 1} title="Last">⏭</button>
          </div>

          <div className="body">{notes[noteIdx] || "(no notes for this slide)"}</div>

          <div className="controls">
            <label title="When ON, notes follow the current slide. When OFF, browse other slides' notes without changing the deck.">
              <input
                type="checkbox"
                checked={synced}
                onChange={(e) => {
                  setSynced(e.target.checked);
                  if (e.target.checked) setPreview(idx);
                }}
              />
              Sync with current slide
            </label>
            {!synced && (
              <>
                <button className="btn" onClick={previewPrev} disabled={previewIdx === 0}>◀ preview</button>
                <button className="btn" onClick={previewNext} disabled={previewIdx === total - 1}>preview ▶</button>
                <button className="btn ghost" onClick={() => { setSynced(true); setPreview(idx); }}>
                  Re-sync
                </button>
              </>
            )}
          </div>
        </aside>
      )}

      {/* Demo overlay */}
      {demoOpen && React.createElement(window.TransactionDemo, { onClose: () => setDemoOpen(false) })}
    </div>
  );
}

/* ---------- Mount ---------- */
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
