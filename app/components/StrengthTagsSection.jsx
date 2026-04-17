"use client";

import { useState, useRef, useEffect } from "react";
import { Btn, FocusInp, Lbl, StrBtn } from "./shared";

function focusAddInputNoScroll(ref) {
  requestAnimationFrame(() => {
    const el = ref.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  });
}

/** Project / employee modals: catalog pills + custom input; Edit shows red × for org-wide tag purge */
export function StrengthTagsPicker({
  label,
  catalog,
  selected,
  onSelectedChange,
  ensureCatalogTag,
  addPlaceholder,
  /** While Edit is on: × on each pill removes this tag from every project, employee, open shift, and the tag list */
  onPurgeTagGlobally,
}) {
  const [editMode, setEditMode] = useState(false);
  const [flash, setFlash] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (catalog.length === 0) setEditMode(false);
  }, [catalog.length]);

  function commitAdd(el) {
    const v = el.value.trim();
    if (!v) return;
    ensureCatalogTag?.(v);
    onSelectedChange((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setFlash(v);
    el.value = "";
    focusAddInputNoScroll(inputRef);
  }

  function onKeyDown(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    commitAdd(e.currentTarget);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 5 }}>
        <Lbl>{label}</Lbl>
        {catalog.length > 0 && (
          <Btn type="button" style={{ fontSize: 12, padding: "6px 12px" }} onClick={() => setEditMode((x) => !x)}>
            {editMode ? "Done" : "Edit"}
          </Btn>
        )}
      </div>
      {flash && (
        <div style={{ fontSize: 12, color: "#059669", marginBottom: 8 }}>
          Added “{flash}” — it appears in the grid below.
        </div>
      )}
      {editMode && typeof onPurgeTagGlobally === "function" && (
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.45 }}>
          <b>× on a tag</b> removes it from <b>every</b> project, employee, and open shift in the database, and drops it from this tag list (built-ins stay hidden until you reset browser data for this app).
        </p>
      )}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          padding: 10,
          border: "1.5px solid var(--border)",
          borderRadius: 8,
          background: "var(--bg-surface)",
        }}
      >
        {catalog.map((st) => (
          <div
            key={st}
            style={{ position: "relative", display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}
          >
            <StrBtn
              label={st}
              active={selected.includes(st)}
              onClick={() => {
                onSelectedChange((prev) =>
                  prev.includes(st) ? prev.filter((x) => x !== st) : [...prev, st]
                );
              }}
            />
            {editMode && typeof onPurgeTagGlobally === "function" && (
              <button
                type="button"
                aria-label={`Delete “${st}” from the entire organisation (all projects, employees, open shifts)`}
                title="Remove from every project, employee, open shift, and this tag list"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void onPurgeTagGlobally(st);
                }}
                style={{
                  position: "absolute",
                  top: -7,
                  right: -7,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  border: "1.5px solid var(--danger-border, #fecaca)",
                  background: "var(--danger-bg, #fef2f2)",
                  color: "var(--danger-text, #991b1b)",
                  fontSize: 15,
                  fontWeight: 700,
                  lineHeight: 1,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  zIndex: 3,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <FocusInp
          ref={inputRef}
          placeholder={addPlaceholder ?? "Add custom tag, press Enter"}
          style={{ flex: 1 }}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}
