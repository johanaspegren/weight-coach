// Minimal PWA shell: dashboard, weight entry, nightly check-in, push subscription.

const todayISO = () => new Date().toISOString().slice(0, 10);

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

function fmtKcal(n) {
  if (n === null || n === undefined) return "—";
  const sign = n < 0 ? "−" : n > 0 ? "+" : "";
  return `${sign}${Math.abs(n).toLocaleString()} kcal`;
}

function fmtPlain(n) {
  if (n === null || n === undefined) return "—";
  return `${Math.round(n).toLocaleString()} kcal`;
}

function miniTile(label, value, suffix = "", isText = false) {
  const has = value !== null && value !== undefined && value !== "";
  const shown = has ? (isText ? String(value) : `${Math.round(Number(value) * 10) / 10}${suffix}`) : "—";
  return `<div class="mini"><div class="lbl">${label}</div><div class="mini-val">${shown}</div></div>`;
}

function kcalClass(n) {
  if (n === null || n === undefined) return "";
  return n < 0 ? "deficit" : n > 0 ? "surplus" : "";
}

async function view_home() {
  const today = todayISO();
  const [s, meals, workouts, det] = await Promise.all([
    fetchJSON("/daily/summary"),
    fetchJSON(`/meals?date=${today}`).catch(() => []),
    fetchJSON(`/workouts?date=${today}`).catch(() => []),
    fetchJSON(`/daily/detail?date=${today}`).catch(() => null),
  ]);

  const o = det?.oura || {};
  const readingsCard = `
    <div class="card">
      <a href="#detail/${today}" style="text-decoration:none;color:inherit;display:block">
        <h2 style="display:flex;justify-content:space-between">
          <span>Today's readings</span>
          <span class="muted" style="font-size:11px">tap for detail →</span>
        </h2>
        <div class="mini-grid">
          ${miniTile("Readiness", o.readiness)}
          ${miniTile("Sleep", o.sleep_score)}
          ${miniTile("HRV", o.hrv_avg)}
          ${miniTile("vO₂ max", o.vo2_max)}
          ${miniTile("Stress hi", o.stress_high_min, " min")}
          ${miniTile("Resilience", o.resilience_level, "", true)}
        </div>
      </a>
      ${!det?.oura ? `<div class="muted" style="margin-top:10px">No Oura data for today yet.</div>` : ""}
      <button id="btn-oura-sync" class="ghost small" style="margin-top:10px">Sync Oura now</button>
      <span class="muted" id="oura-msg" style="margin-left:10px"></span>
    </div>`;

  const mealsCard = meals.length
    ? `<div class="card"><h2>Meals today</h2>${meals
        .map((m) => `
          <div class="meal-row">
            <div>
              <div>${escapeHTML(m.category)} — ${escapeHTML(m.raw_text || "")}</div>
              <div class="muted">${m.source === "pending" ? "⏳ estimating…" : `${m.kcal ?? "—"} kcal${m.protein_g ? " · " + m.protein_g + "g P" : ""}`}</div>
            </div>
          </div>`)
        .join("")}</div>`
    : "";

  const workoutsCard = workouts.length
    ? `<div class="card"><h2>Workouts today</h2>${workouts
        .map((w) => `
          <div class="meal-row">
            <div>
              <div>${escapeHTML(w.kind)} · ${w.duration_min} min${w.kcal_burn ? " · " + w.kcal_burn + " kcal" : ""}</div>
              ${w.notes ? `<div class="muted">${escapeHTML(w.notes)}</div>` : ""}
            </div>
          </div>`)
        .join("")}</div>`
    : "";

  return `
    <h1>weight-coach</h1>
    <div class="card">
      <h2>Weight</h2>
      <div class="stat">
        <div>
          <div class="lbl">Today</div>
          <div class="big">${s.today_weight_kg != null ? s.today_weight_kg + " kg" : "—"}</div>
        </div>
        <div>
          <div class="lbl">Latest reading${s.latest_weight_date && s.latest_weight_date !== today ? ` (${s.latest_weight_date})` : ""}</div>
          <div class="big">${s.latest_weight_kg != null ? s.latest_weight_kg + " kg" : "—"}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Today</h2>
      <div class="stat stat-3">
        <div>
          <div class="lbl">In</div>
          <div class="big">${fmtPlain(s.today_kcal_in)}</div>
        </div>
        <div>
          <div class="lbl">Out</div>
          <div class="big">${fmtPlain(s.today_kcal_out)}</div>
        </div>
        <div>
          <div class="lbl">Net</div>
          <div class="big ${kcalClass(s.today_deficit_kcal)}">${fmtKcal(s.today_deficit_kcal)}</div>
        </div>
      </div>
      <div class="muted" style="margin-top:10px">This week net: <span class="${kcalClass(s.week_deficit_kcal)}">${fmtKcal(s.week_deficit_kcal)}</span></div>
    </div>
    ${readingsCard}
    ${workoutsCard}
    ${mealsCard}
    <div class="card">
      <h2>Cumulative (${s.days} days)</h2>
      <div class="stat">
        <div>
          <div class="lbl">Deficit total</div>
          <div class="big ${kcalClass(s.cumulative_deficit_kcal)}">${fmtKcal(s.cumulative_deficit_kcal)}</div>
        </div>
        <div>
          <div class="lbl">Predicted vs actual</div>
          <div class="big">${(s.predicted_kg_lost * -1).toFixed(1)} kg</div>
          <div class="muted">actual: ${s.actual_kg_change ?? "—"} kg</div>
        </div>
      </div>
    </div>

    <div class="row">
      <a class="card" href="#weight" style="text-decoration:none;color:inherit">
        <h2>Log weight</h2>
        <div class="muted">Morning, before coffee</div>
      </a>
      <a class="card" href="#meal" style="text-decoration:none;color:inherit">
        <h2>Log meal</h2>
        <div class="muted">Quick add with kcal</div>
      </a>
      <a class="card" href="#workout" style="text-decoration:none;color:inherit">
        <h2>Log workout</h2>
        <div class="muted">X-trainer, run, walk…</div>
      </a>
      <a class="card" href="#checkin" style="text-decoration:none;color:inherit">
        <h2>Nightly check-in</h2>
        <div class="muted">What did you eat today?</div>
      </a>
      <a class="card" href="#data" style="text-decoration:none;color:inherit">
        <h2>Data</h2>
        <div class="muted">Export or import backups</div>
      </a>
    </div>

    <div class="card">
      <h2>Notifications</h2>
      <button id="btn-sub" class="ghost">Enable 23:00 push</button>
      <div class="muted" id="sub-status"></div>
    </div>
  `;
}

function view_weight() {
  return `
    <a class="muted" href="#">← back</a>
    <h1>Log weight</h1>
    <div class="card">
      <label>Date</label>
      <input id="w-date" type="date" value="${todayISO()}">
      <label>Weight (kg)</label>
      <input id="w-kg" type="number" step="0.1" inputmode="decimal">
      <label>Waist (cm) — optional</label>
      <input id="w-waist" type="number" step="0.5" inputmode="decimal">
      <button id="w-save">Save</button>
      <div class="muted" id="w-msg"></div>
    </div>
  `;
}

function renderScale(scaleJson) {
  let s;
  try { s = JSON.parse(scaleJson); } catch { return ""; }
  const props = (s.properties || []).filter((p) => p.value !== null && p.value !== undefined && p.value !== 0 && p.value !== "");
  if (!props.length && !s.weight_kg) return "";
  return `
    <div class="card">
      <h2>Scale (read ${escapeHTML(s.read_at || "")})</h2>
      ${s.weight_kg ? `<div class="kv"><div class="k">Weight</div><div class="v">${s.weight_kg} kg</div></div>` : ""}
      ${props.map((p) => `
        <div class="kv"><div class="k">${escapeHTML(p.code || "")}</div><div class="v">${escapeHTML(String(p.value))}${p.type === "value" ? "" : ""}</div></div>
      `).join("")}
    </div>
  `;
}

async function view_detail(date) {
  let det;
  try {
    det = await fetchJSON(`/daily/detail?date=${date}`);
  } catch (e) {
    return `<a class="muted" href="#">← back</a><h1>${escapeHTML(date)}</h1><div class="card">Error: ${escapeHTML(e.message)}</div>`;
  }
  const d = det.daily || {};
  const o = det.oura || {};
  const rows = (obj, keys) => keys.filter(([k]) => obj[k] !== null && obj[k] !== undefined)
    .map(([k, label, suffix = ""]) => `
      <div class="kv"><div class="k">${label}</div><div class="v">${escapeHTML(String(obj[k]))}${suffix}</div></div>`)
    .join("") || `<div class="muted">no data</div>`;

  const mealTotal = det.meals.reduce((s, m) => s + (m.kcal || 0), 0);
  const workoutTotal = det.workouts.reduce((s, w) => s + (w.kcal_burn || 0), 0);

  return `
    <a class="muted" href="#">← back</a>
    <h1>${escapeHTML(date)}</h1>

    <div class="card">
      <h2>Daily rollup</h2>
      ${rows(d, [
        ["weight_kg", "Weight", " kg"],
        ["waist_cm", "Waist", " cm"],
        ["kcal_in_est", "kcal in", ""],
        ["kcal_out_est", "kcal out", ""],
      ])}
    </div>

    ${d.scale_json ? renderScale(d.scale_json) : ""}

    <div class="card">
      <h2>Oura</h2>
      ${rows(o, [
        ["readiness", "Readiness"],
        ["sleep_score", "Sleep score"],
        ["hrv_avg", "HRV balance"],
        ["total_burn", "Total burn", " kcal"],
        ["active_burn", "Active burn", " kcal"],
        ["stress_high_min", "High stress", " min"],
        ["recovery_high_min", "High recovery", " min"],
        ["resilience_level", "Resilience"],
        ["vo2_max", "vO₂ max"],
      ])}
      ${o.tags && o.tags.length ? `<div class="kv"><div class="k">Tags</div><div class="v">${o.tags.map((t) => escapeHTML(t.name || t.type || "")).join(", ")}</div></div>` : ""}
    </div>

    <div class="card">
      <h2>Meals — ${mealTotal} kcal</h2>
      ${det.meals.length ? det.meals.map((m) => `
        <div class="meal-row">
          <div>
            <div>${escapeHTML(m.category)} — ${escapeHTML(m.raw_text || "")}</div>
            <div class="muted">${m.source === "pending" ? "⏳ estimating…" : `${m.kcal ?? "—"} kcal${m.protein_g ? " · " + m.protein_g + "g P" : ""}${m.food_groups ? " · " + escapeHTML(m.food_groups) : ""}`}</div>
          </div>
        </div>`).join("") : `<div class="muted">nothing logged</div>`}
    </div>

    <div class="card">
      <h2>Workouts — ${workoutTotal} kcal</h2>
      ${det.workouts.length ? det.workouts.map((w) => `
        <div class="meal-row">
          <div>
            <div>${escapeHTML(w.kind)} · ${w.duration_min} min${w.kcal_burn ? " · " + w.kcal_burn + " kcal" : ""}${w.avg_hr ? " · " + w.avg_hr + " bpm" : ""}</div>
            ${w.notes ? `<div class="muted">${escapeHTML(w.notes)}</div>` : ""}
          </div>
        </div>`).join("") : `<div class="muted">none</div>`}
    </div>
  `;
}

async function view_meal() {
  const today = todayISO();
  let existing = [];
  try {
    existing = await fetchJSON(`/meals?date=${today}`);
  } catch (_) {}
  const list = existing.length
    ? `<div class="card"><h2>Today so far</h2>${existing
        .map(
          (m) => `
        <div class="meal-row">
          <div>
            <div>${escapeHTML(m.category)} — ${escapeHTML(m.raw_text || "")}</div>
            <div class="muted">
              ${m.source === "pending" ? "⏳ estimating…" : `${m.kcal ?? "—"} kcal${m.protein_g ? " · " + m.protein_g + "g P" : ""}`}
            </div>
          </div>
          <button class="ghost small" data-del="${m.id}">✕</button>
        </div>`
        )
        .join("")}</div>`
    : "";

  return `
    <a class="muted" href="#">← back</a>
    <h1>Log meal</h1>
    <div class="card">
      <div class="row">
        <div>
          <label>Date</label>
          <input id="m-date" type="date" value="${today}">
        </div>
        <div>
          <label>Category</label>
          <select id="m-cat">
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="snack">Snack</option>
            <option value="breakfast">Breakfast</option>
          </select>
        </div>
      </div>
      <label>What did you have?</label>
      <div class="row lookup-row">
        <input id="m-desc" placeholder="Chicken salad, feta, olive oil">
        <button id="m-lookup" class="ghost small">Look up</button>
      </div>
      <div class="muted" id="m-src"></div>
      <div class="row">
        <div><label>kcal</label><input id="m-kcal" type="number" inputmode="numeric"></div>
        <div><label>Protein (g) — optional</label><input id="m-p" type="number" step="0.1" inputmode="decimal"></div>
      </div>
      <div class="row">
        <div><label>Carbs (g) — optional</label><input id="m-c" type="number" step="0.1" inputmode="decimal"></div>
        <div><label>Fat (g) — optional</label><input id="m-f" type="number" step="0.1" inputmode="decimal"></div>
      </div>
      <label>Food groups — optional</label>
      <input id="m-fg" placeholder="protein, veg, dairy, fat">
      <button id="m-save">Add meal</button>
      <div class="muted" id="m-msg"></div>
    </div>
    ${list}
  `;
}

async function view_workout() {
  const today = todayISO();
  let recent = [];
  try {
    recent = await fetchJSON(`/workouts?limit=5`);
  } catch (_) {}
  const list = recent.length
    ? `<div class="card"><h2>Recent</h2>${recent
        .map(
          (w) => `
        <div class="meal-row">
          <div>
            <div>${escapeHTML(w.date)} — ${escapeHTML(w.kind)} · ${w.duration_min} min${w.kcal_burn ? " · " + w.kcal_burn + " kcal" : ""}</div>
            ${w.notes ? `<div class="muted">${escapeHTML(w.notes)}</div>` : ""}
          </div>
          <button class="ghost small" data-del="${w.id}">✕</button>
        </div>`
        )
        .join("")}</div>`
    : "";

  return `
    <a class="muted" href="#">← back</a>
    <h1>Log workout</h1>
    <div class="card">
      <div class="muted">Oura already counts activity burn — log here for the running plan and correlation views.</div>
      <div class="row">
        <div>
          <label>Date</label>
          <input id="wo-date" type="date" value="${today}">
        </div>
        <div>
          <label>Type</label>
          <select id="wo-kind">
            <option value="x-trainer">X-trainer</option>
            <option value="run">Run</option>
            <option value="walk">Walk</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div class="row">
        <div><label>Duration (min)</label><input id="wo-dur" type="number" inputmode="numeric"></div>
        <div><label>kcal — optional</label><input id="wo-kcal" type="number" inputmode="numeric"></div>
      </div>
      <div class="row">
        <div><label>Avg HR — optional</label><input id="wo-hr" type="number" inputmode="numeric"></div>
        <div><label>Notes</label><input id="wo-notes" placeholder="Level 8, felt OK"></div>
      </div>
      <button id="wo-save">Add workout</button>
      <div class="muted" id="wo-msg"></div>
    </div>
    ${list}
  `;
}

function view_checkin() {
  return `
    <a class="muted" href="#">← back</a>
    <h1>Nightly check-in</h1>
    <div class="card">
      <div class="muted">Freetext for now — LLM parsing arrives in Phase 2. Skip breakfast unless you actually had one.</div>
      <label>Date</label>
      <input id="c-date" type="date" value="${todayISO()}">
      <label>What did you eat today?</label>
      <textarea id="c-text" placeholder="Lunch: chicken salad w/ olive oil, feta.\nDinner: salmon, rice, broccoli.\nOne beer."></textarea>
      <button id="c-save">Save</button>
      <div class="muted" id="c-msg"></div>
    </div>
  `;
}

function view_data() {
  return `
    <a class="muted" href="#">← back</a>
    <h1>Data</h1>
    <div class="card">
      <h2>Export</h2>
      <a class="button-link" href="/data/export.json" download>Download JSON backup</a>
      <a class="button-link ghost" href="/data/export.csv.zip" download>Download CSV zip</a>
      <div class="muted" style="margin-top:10px">JSON is the restorable backup format. CSV is for spreadsheets and inspection.</div>
    </div>

    <div class="card">
      <h2>Import JSON</h2>
      <input id="import-file" type="file" accept="application/json,.json">
      <label style="display:flex;gap:8px;align-items:center;margin-top:12px">
        <input id="import-replace" type="checkbox" style="width:auto">
        <span>Replace existing imported tables first</span>
      </label>
      <button id="import-json">Import</button>
      <div class="muted" id="import-msg"></div>
    </div>
  `;
}

async function attachHandlers(root) {
  const hash = location.hash.replace("#", "");

  if (!hash) {
    const btn = root.querySelector("#btn-sub");
    if (btn) btn.onclick = () => subscribePush(root.querySelector("#sub-status"));
    const sync = root.querySelector("#btn-oura-sync");
    if (sync) {
      sync.onclick = async () => {
        const msg = root.querySelector("#oura-msg");
        sync.disabled = true;
        sync.textContent = "Syncing…";
        try {
          const r = await fetchJSON("/oura/sync", { method: "POST" });
          msg.textContent = `Synced ${r.days_written} day(s).`;
          renderApp(document.getElementById("app"));
        } catch (e) {
          msg.textContent = "Error: " + e.message;
        } finally {
          sync.disabled = false;
          sync.textContent = "Sync Oura now";
        }
      };
    }
  }

  if (hash === "weight") {
    root.querySelector("#w-save").onclick = async () => {
      const msg = root.querySelector("#w-msg");
      try {
        const body = {
          date: root.querySelector("#w-date").value,
          weight_kg: parseFloat(root.querySelector("#w-kg").value),
        };
        const waist = parseFloat(root.querySelector("#w-waist").value);
        if (!Number.isNaN(waist)) body.waist_cm = waist;
        await fetchJSON("/weight", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        msg.textContent = "Saved.";
      } catch (e) {
        msg.textContent = "Error: " + e.message;
      }
    };
  }

  if (hash === "meal") {
    const lookupBtn = root.querySelector("#m-lookup");
    lookupBtn.onclick = async () => {
      const desc = root.querySelector("#m-desc").value.trim();
      const src = root.querySelector("#m-src");
      if (!desc) { src.textContent = "Type a description first."; return; }
      lookupBtn.disabled = true;
      lookupBtn.textContent = "Looking up…";
      src.textContent = "";
      try {
        const est = await fetchJSON("/meals/estimate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ description: desc }),
        });
        const setIf = (id, v) => { if (v !== null && v !== undefined) root.querySelector(id).value = v; };
        setIf("#m-kcal", est.kcal);
        setIf("#m-p", est.protein_g);
        setIf("#m-c", est.carbs_g);
        setIf("#m-f", est.fat_g);
        setIf("#m-fg", est.food_groups);
        if (est.source === "template") {
          src.textContent = "From remembered meal (edit and save to update).";
        } else if (est.source === "pending" || est.kcal === null) {
          src.textContent = "No LLM available — save anyway and it'll be estimated later.";
        } else {
          src.textContent = `Estimated by ${est.model || "LLM"} — adjust if wrong.`;
        }
      } catch (e) {
        src.textContent = "Error: " + e.message;
      } finally {
        lookupBtn.disabled = false;
        lookupBtn.textContent = "Look up";
      }
    };

    root.querySelector("#m-save").onclick = async () => {
      const msg = root.querySelector("#m-msg");
      try {
        const kcalVal = parseInt(root.querySelector("#m-kcal").value, 10);
        const body = {
          date: root.querySelector("#m-date").value,
          category: root.querySelector("#m-cat").value,
          description: root.querySelector("#m-desc").value,
        };
        if (!Number.isNaN(kcalVal)) body.kcal = kcalVal;
        const p = parseFloat(root.querySelector("#m-p").value);
        const c = parseFloat(root.querySelector("#m-c").value);
        const f = parseFloat(root.querySelector("#m-f").value);
        if (!Number.isNaN(p)) body.protein_g = p;
        if (!Number.isNaN(c)) body.carbs_g = c;
        if (!Number.isNaN(f)) body.fat_g = f;
        const fg = root.querySelector("#m-fg").value.trim();
        if (fg) body.food_groups = fg;
        await fetchJSON("/meals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        renderApp(document.getElementById("app"));
      } catch (e) {
        msg.textContent = "Error: " + e.message;
      }
    };
    root.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async () => {
        await fetchJSON(`/meals/${b.dataset.del}`, { method: "DELETE" });
        renderApp(document.getElementById("app"));
      };
    });
  }

  if (hash === "workout") {
    root.querySelector("#wo-save").onclick = async () => {
      const msg = root.querySelector("#wo-msg");
      try {
        const body = {
          date: root.querySelector("#wo-date").value,
          kind: root.querySelector("#wo-kind").value,
          duration_min: parseInt(root.querySelector("#wo-dur").value, 10),
        };
        const k = parseInt(root.querySelector("#wo-kcal").value, 10);
        const hr = parseInt(root.querySelector("#wo-hr").value, 10);
        const notes = root.querySelector("#wo-notes").value.trim();
        if (!Number.isNaN(k)) body.kcal_burn = k;
        if (!Number.isNaN(hr)) body.avg_hr = hr;
        if (notes) body.notes = notes;
        await fetchJSON("/workouts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        renderApp(document.getElementById("app"));
      } catch (e) {
        msg.textContent = "Error: " + e.message;
      }
    };
    root.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async () => {
        await fetchJSON(`/workouts/${b.dataset.del}`, { method: "DELETE" });
        renderApp(document.getElementById("app"));
      };
    });
  }

  if (hash === "checkin") {
    root.querySelector("#c-save").onclick = async () => {
      const msg = root.querySelector("#c-msg");
      try {
        await fetchJSON("/checkin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            date: root.querySelector("#c-date").value,
            transcript: root.querySelector("#c-text").value,
          }),
        });
        msg.textContent = "Saved. Sleep well.";
      } catch (e) {
        msg.textContent = "Error: " + e.message;
      }
    };
  }

  if (hash === "data") {
    root.querySelector("#import-json").onclick = async () => {
      const msg = root.querySelector("#import-msg");
      const file = root.querySelector("#import-file").files[0];
      const replace = root.querySelector("#import-replace").checked;
      if (!file) {
        msg.textContent = "Choose a JSON export first.";
        return;
      }
      try {
        msg.textContent = "Importing…";
        const payload = JSON.parse(await file.text());
        const result = await fetchJSON(`/data/import?mode=${replace ? "replace" : "merge"}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const total = Object.values(result.imported || {}).reduce((sum, n) => sum + n, 0);
        const ignored = Object.keys(result.ignored_columns || {}).length;
        msg.textContent = `Imported ${total} row(s) in ${result.mode} mode${ignored ? `; ignored old/new columns in ${ignored} table(s)` : ""}.`;
      } catch (e) {
        msg.textContent = "Error: " + e.message;
      }
    };
  }
}

async function subscribePush(statusEl) {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      statusEl.textContent = "Push not supported in this browser.";
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      statusEl.textContent = "Permission denied.";
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const { key } = await fetchJSON("/push/vapid-key");
    if (!key) {
      statusEl.textContent = "VAPID key not configured on the server.";
      return;
    }
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    await fetchJSON("/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    statusEl.textContent = "Subscribed. You'll get a nudge at 23:00.";
  } catch (e) {
    statusEl.textContent = "Error: " + e.message;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export async function renderApp(root) {
  const hash = location.hash.replace("#", "");
  const [route, arg] = hash.split("/");
  const view =
    route === "weight" ? view_weight() :
    route === "meal" ? await view_meal() :
    route === "workout" ? await view_workout() :
    route === "checkin" ? view_checkin() :
    route === "data" ? view_data() :
    route === "detail" ? await view_detail(arg || todayISO()) :
    await view_home();
  root.innerHTML = view;
  await attachHandlers(root);
}
