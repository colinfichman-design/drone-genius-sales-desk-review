const state = {
  data: null,
  loading: false,
  accountKey: "",
  accountData: null,
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value) {
  if (value === null || value === undefined || value === "") return "0";
  return new Intl.NumberFormat().format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "Never";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return escapeHtml(value);
  return dt.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAge(hours) {
  if (hours === null || hours === undefined || Number.isNaN(Number(hours))) return "unknown";
  const value = Number(hours);
  if (value < 1) return `${Math.round(value * 60)}m`;
  if (value < 48) return `${value.toFixed(value < 10 ? 1 : 0)}h`;
  return `${Math.round(value / 24)}d`;
}

function statusLabel(status) {
  const labels = {
    ok: "OK",
    warn: "Warning",
    danger: "Needs attention",
    paused: "Paused",
    unknown: "Unknown",
    missing: "Missing",
  };
  return labels[status] || status || "Unknown";
}

function statusPill(status, text) {
  return `<span class="pill ${escapeHtml(status || "unknown")}">${escapeHtml(text || statusLabel(status))}</span>`;
}

function isPublicReview() {
  return Boolean(state.data?.public_review);
}

function reviewButton(label) {
  return `<button type="button" class="small-link public-review-disabled" disabled>${escapeHtml(label)}</button>`;
}

const REPLY_PLANS = [
  {
    id: "need_details",
    label: "Need details",
    text: "Thanks for reaching out. Happy to help. Asks for location, dates, creative refs, deliverables, and usage.",
  },
  {
    id: "available",
    label: "Available",
    text: "Says you can take a look and asks for the core quote details.",
  },
  {
    id: "unavailable",
    label: "Not available",
    text: "Thanks them, says sorry you are not available for this one, leaves door open for future dates.",
  },
  {
    id: "thanks",
    label: "Thanks",
    text: "Short acknowledgement for simple positive replies or asset confirmations.",
  },
  {
    id: "quote_followup",
    label: "Quote next",
    text: "Acknowledges details and says you will put numbers together.",
  },
  {
    id: "call",
    label: "Ask call",
    text: "Asks what time works today or tomorrow.",
  },
];

function replyKeyForAction(action) {
  return action.prepare_reply_key || (action.dismiss_kind === "inbound" ? action.dismiss_key : "");
}

function replyPlanBox(key, suggested = "need_details", compact = false) {
  if (!key) return "";
  const plans = compact ? REPLY_PLANS.slice(0, 4) : REPLY_PLANS;
  return `
    <div class="reply-plan-box ${compact ? "compact" : ""}">
      <header>
        <div>
          <b>How to reply</b>
          <span>Pick the stance. Draft uses the full Gmail thread, keeps threading, Reply-To, and signature.</span>
        </div>
        ${statusPill("ok", suggested.replaceAll("_", " "))}
      </header>
      <div class="reply-plan-options">
        ${plans
          .map(
            (plan) => `
              <button
                type="button"
                class="small-link reply-plan-option prepare-reply ${plan.id === suggested ? "suggested" : ""}"
                data-reply-key="${escapeHtml(key)}"
                data-reply-variant="${escapeHtml(plan.id)}"
                ${isPublicReview() ? "disabled" : ""}
              >
                ${escapeHtml(plan.label)}
              </button>
            `,
          )
          .join("")}
      </div>
      ${compact ? "" : `<p>${escapeHtml((REPLY_PLANS.find((plan) => plan.id === suggested) || REPLY_PLANS[0]).text)}</p>`}
    </div>
  `;
}

function metric(title, value, detail, status = "ok") {
  return `
    <article class="metric ${escapeHtml(status)}">
      <span class="metric-title">${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail || "")}</small>
    </article>
  `;
}

function chips(counts) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '<span class="quiet">None</span>';
  return entries
    .map(([label, count]) => `<span class="chip"><b>${number(count)}</b>${escapeHtml(label)}</span>`)
    .join("");
}

function table(rows, columns, emptyText = "No records") {
  if (!rows || !rows.length) {
    return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  }
  const head = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("");
  const body = rows
    .map((row) => {
      const cells = columns
        .map((col) => {
          const raw = typeof col.value === "function" ? col.value(row) : row[col.key];
          return `<td>${raw === null || raw === undefined ? "" : raw}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function safeText(value, limit = 140) {
  const text = String(value ?? "").trim();
  if (text.length <= limit) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, limit - 1).trim())}...`;
}

function actionButtons(action) {
  const buttons = [];
  if (isPublicReview()) {
    if (action.prepare_reply_key || action.dismiss_kind === "inbound") buttons.push(reviewButton("Account"));
    if (action.prepare_reply_key) {
      buttons.push(reviewButton("Preview"));
      buttons.push(reviewButton(action.reply_draft_id ? "Open Draft" : "Draft Reply"));
    }
    if (action.retry_monday_key) {
      buttons.push(reviewButton("Retry CRM Sync"));
      buttons.push(reviewButton("Clear CRM Queue"));
    }
    if (action.gmail_url) buttons.push(reviewButton("Open Gmail"));
    if (action.dismiss_kind === "inbound" && action.dismiss_key) {
      buttons.push(reviewButton("Snooze 24h"));
      buttons.push(reviewButton("Waiting Client"));
      buttons.push(reviewButton("Monitor Calls"));
      buttons.push(reviewButton("Dead"));
    }
    if (action.dismissible) buttons.push(reviewButton("Dismiss"));
    return buttons.length ? `<div class="action-buttons">${buttons.join("")}</div>` : "";
  }
  const accountKey = action.prepare_reply_key || (action.dismiss_kind === "inbound" ? action.dismiss_key : "");
  if (accountKey) {
    buttons.push(`<button type="button" class="small-link account-detail" data-account-key="${escapeHtml(accountKey)}">Account</button>`);
  }
  if (action.retry_monday_key) {
    buttons.push(operatorButton("crm_sync", action.retry_monday_key, "retry", "Retry CRM Sync", "small-action done-action"));
    buttons.push(operatorButton("crm_sync", action.retry_monday_key, "clear", "Clear CRM Queue", "small-action dismiss-action"));
  }
  if (action.prepare_reply_key) {
    const label = action.reply_draft_id ? "Open Draft" : "Draft Reply";
    buttons.push(`<button type="button" class="small-link preview-reply" data-reply-key="${escapeHtml(action.prepare_reply_key)}">Preview</button>`);
    buttons.push(`<button type="button" class="small-action prepare-reply" data-reply-key="${escapeHtml(action.prepare_reply_key)}" data-gmail-url="${escapeHtml(action.gmail_url || "")}" data-draft-url="${escapeHtml(action.reply_draft_url || "")}" data-reply-draft-id="${escapeHtml(action.reply_draft_id || "")}">${label}</button>`);
  }
  if (action.gmail_url) {
    buttons.push(`<button type="button" class="small-link open-gmail" data-gmail-url="${escapeHtml(action.gmail_url)}">Open Gmail</button>`);
  }
  if (action.dismiss_kind === "inbound" && action.dismiss_key) {
    buttons.push(operatorButton("inbound", action.dismiss_key, "snooze", "Snooze 24h", "small-action snooze-action", 24));
    buttons.push(`<button type="button" class="small-action account-action" data-account-key="${escapeHtml(action.dismiss_key)}" data-account-action="waiting_on_client">Waiting Client</button>`);
    buttons.push(`<button type="button" class="small-action snooze-action account-action" data-account-key="${escapeHtml(action.dismiss_key)}" data-account-action="monitor_calls">Monitor Calls</button>`);
    buttons.push(`<button type="button" class="small-action dismiss-action account-action" data-account-key="${escapeHtml(action.dismiss_key)}" data-account-action="dead_for_now">Dead</button>`);
  }
  if (action.dismiss_kind === "approval" && action.dismiss_key) {
    buttons.push(operatorButton("approval", action.dismiss_key, "skip", "Skip", "small-action skip-action"));
  }
  if (action.dismiss_kind === "multichannel" && action.dismiss_key) {
    buttons.push(operatorButton("multichannel", action.dismiss_key, "done", "Done", "small-action done-action"));
    buttons.push(operatorButton("multichannel", action.dismiss_key, "snoozed", "Snooze 72h", "small-action snooze-action", 72));
  }
  if (action.dismissible) {
    buttons.push(dismissButton(action.dismiss_kind, action.dismiss_key, "small-action"));
  }
  if (!buttons.length) return "";
  return `<div class="action-buttons">${buttons.join("")}</div>`;
}

function dismissButton(kind, key, className = "small-action") {
  if (!kind || !key) return "";
  return `<button type="button" class="${escapeHtml(className)} dismiss-action" data-dismiss-kind="${escapeHtml(kind)}" data-dismiss-key="${escapeHtml(key)}">Dismiss</button>`;
}

function operatorButton(kind, key, action, label, className = "small-action", hours = "") {
  if (!kind || !key || !action) return "";
  return `<button type="button" class="${escapeHtml(className)} operator-action" data-action-kind="${escapeHtml(kind)}" data-action-key="${escapeHtml(key)}" data-action-name="${escapeHtml(action)}" data-action-hours="${escapeHtml(hours)}">${escapeHtml(label)}</button>`;
}

function systemToggleButton(key, paused, label) {
  const action = paused ? "resume" : "pause";
  const text = paused ? `Resume ${label}` : `Pause ${label}`;
  return operatorButton("system", key, action, text, paused ? "small-action done-action" : "small-action snooze-action");
}

function undoButton(row, className = "table-action") {
  if (!row?.undoable || !row?.kind || !row?.key || !row?.action) return "";
  return `<button type="button" class="${escapeHtml(className)} undo-action" data-event-id="${escapeHtml(row.id || "")}" data-undo-kind="${escapeHtml(row.kind)}" data-undo-key="${escapeHtml(row.key)}" data-undo-action="${escapeHtml(row.action)}">Undo</button>`;
}

function isLikelyVendorNoise(action) {
  const text = `${action.title || ""} ${action.detail || ""}`.toLowerCase();
  return [
    "bbb accreditation",
    "freelance video editor",
    "video editor from",
    "accreditation from",
    "seo ",
    "web design",
    "marketing services",
    "thank you for your purchase",
    "order confirmation",
    "purchase receipt",
    "payment receipt",
    "your receipt",
    "bark ",
  ].some((needle) => text.includes(needle));
}

function assistantTitle(action) {
  const detail = String(action.detail || "");
  if (action.category === "Inbound") {
    const subject = detail.split(" from ")[0].replace(/\.$/, "").trim();
    return subject ? `Reply: ${subject}` : action.title || "Reply to lead";
  }
  if (action.category === "Approval") {
    const company = String(action.title || "").replace(/^Review draft approval:\s*/i, "");
    return `Review draft: ${company}`;
  }
  if (action.category === "Radar") {
    return action.title || "Research prospect";
  }
  return action.title || "Sales task";
}

function assistantReason(action) {
  if (action.category === "Inbound") return "Someone is waiting on you. Replies beat new cold outreach.";
  if (action.category === "Approval") return "This is already drafted. Decide whether it is worth sending.";
  if (action.category === "Radar") return "The system found a project but needs a verified person before outreach.";
  return action.detail || "";
}

function assistantLabel(action) {
  if (action.category === "Inbound") {
    if (action.label === "marketplace_lead") return "Marketplace";
    if (action.label === "reply") return "Reply";
    return "Lead";
  }
  if (action.category === "Approval") return "Draft";
  if (action.category === "Radar") return action.label || "Research";
  return action.label || action.category || "Task";
}

function suggestedReplyPlan(action) {
  const text = `${action.title || ""} ${action.detail || ""} ${action.next_step || ""}`.toLowerCase();
  if (text.includes("thank") || text.includes("awesome") || text.includes("appreciate") || text.includes("confirmed")) return "thanks";
  if (text.includes("quote") || text.includes("proposal") || text.includes("rfp")) return "quote_followup";
  if (text.includes("call") || text.includes("meeting") || text.includes("phone")) return "call";
  if (text.includes("available") || text.includes("availability")) return "available";
  return "need_details";
}

function actionScore(action) {
  const severityScore = { danger: 0, warn: 1, paused: 2, unknown: 3, ok: 4 };
  return severityScore[action.severity] ?? 3;
}

function rankedActions(actions, categories = []) {
  const allowed = new Set(categories);
  return (actions || [])
    .filter((action) => !categories.length || allowed.has(action.category))
    .filter((action) => !(action.category === "Inbound" && isLikelyVendorNoise(action)))
    .sort((a, b) => actionScore(a) - actionScore(b))
    .slice(0, 5);
}

function researchRowToAction(row) {
  const target = row.target_account || row.company || row.project_name || "Radar account";
  return {
    category: "Radar",
    severity: "warn",
    label: row.target_role_label || "Research",
    title: `Research decision maker: ${target}`,
    detail: `${row.project_name || "Project"} / ${row.reason || "needs verified contact"}`,
    next_step: row.next_step || "Resolve the official domain and verified email before drafting.",
    entity: row.id || target,
    dismiss_kind: "radar",
    dismiss_key: row.id || target,
    dismissible: true,
    command: `~/.openclaw/run.sh contact_researcher ${target}`,
  };
}

function assistantCard(action, index) {
  const replyKey = replyKeyForAction(action);
  return `
    <article class="assistant-task ${escapeHtml(action.severity || "warn")}">
      <div class="assistant-task-rank">${index + 1}</div>
      <div class="assistant-task-body">
        <header>
          <strong>${safeText(assistantTitle(action), 180)}</strong>
          ${statusPill(action.severity || "warn", assistantLabel(action))}
        </header>
        <p>${safeText(assistantReason(action), 220)}</p>
        <div class="assistant-next">${safeText(action.next_step || "Handle this, then refresh.", 260)}</div>
        ${action.category === "Inbound" ? replyPlanBox(replyKey, suggestedReplyPlan(action)) : ""}
        ${actionButtons(action)}
      </div>
    </article>
  `;
}

function accountLaneCard(action) {
  const replyKey = replyKeyForAction(action);
  const title = action.category === "Approval"
    ? String(action.title || "").replace(/^Review draft approval:\s*/i, "") || "Draft approval"
    : assistantTitle(action);
  const detail = action.entity || action.detail || action.next_step || "";
  return `
    <article class="account-lane-card ${escapeHtml(action.severity || "warn")}">
      <header>
        <strong>${safeText(title, 110)}</strong>
        ${statusPill(action.severity || "warn", assistantLabel(action))}
      </header>
      <p>${safeText(detail, 140)}</p>
      <small>${safeText(action.next_step || assistantReason(action), 150)}</small>
      ${action.category === "Inbound" ? replyPlanBox(replyKey, suggestedReplyPlan(action), true) : ""}
      ${actionButtons(action)}
    </article>
  `;
}

function renderSalesAssistant(data) {
  const center = data.action_center || {};
  const summary = center.summary || {};
  const actions = center.top_actions || [];
  const radar = data.radar || {};
  const safety = data.safety || {};
  const monday = data.integrations?.monday || {};

  const inbound = actions.filter((action) => action.category === "Inbound" && !isLikelyVendorNoise(action));
  const approvals = actions.filter((action) => action.category === "Approval");
  const research = (radar.project_research_queue_latest || []).slice(0, 3).map(researchRowToAction);
  const vendorNoise = actions.filter((action) => action.category === "Inbound" && isLikelyVendorNoise(action));
  const blockers = [
    ...actions.filter((action) => ["Integration", "CRM Sync"].includes(action.category)),
    ...(center.decisions || []).filter((decision) => ["blocked", "paused"].includes(decision.status)).map((decision) => ({
      title: decision.title,
      detail: decision.detail,
      next_step: decision.recommendation,
      severity: decision.severity || "warn",
      label: decision.status,
      category: "Blocker",
    })),
  ].slice(0, 3);

  const doNow = [...inbound, ...approvals, ...research].slice(0, 5);
  const todaysAccounts = [...inbound, ...approvals, ...research, ...rankedActions(actions, ["CRM Sync", "Integration"])].slice(0, 6);
  const blockedCount = blockers.length + (monday.blocked ? 1 : 0);
  const headline = summary.inbound_waiting
    ? `${number(summary.inbound_waiting)} conversations need attention`
    : summary.pending_approvals
      ? `${number(summary.pending_approvals)} drafts need decisions`
      : research.length
        ? `${number(research.length)} prospects need research`
        : "Sales desk is clear";
  const subhead = summary.inbound_waiting
    ? "Start with real replies. The system will keep watching and stop reminders after you send."
    : "No urgent lead replies are at the top. Work approvals or prospect research next.";

  $("#assistantDesk").innerHTML = `
    <div class="operator-hero">
      <div>
        <span class="metric-title">Operator Focus</span>
        <h2>${escapeHtml(headline)}</h2>
        <p>${escapeHtml(subhead)}</p>
      </div>
      <div class="assistant-scoreboard">
        <span class="${summary.inbound_waiting ? "hot" : ""}"><b>${number(summary.inbound_waiting)}</b>Lead replies</span>
        <span class="${summary.pending_approvals ? "hot" : ""}"><b>${number(summary.pending_approvals)}</b>Draft decisions</span>
        <span class="${radar.project_research_queue_count ? "warm" : ""}"><b>${number(radar.project_research_queue_count)}</b>Research queue</span>
        <span class="${blockedCount ? "hot" : ""}"><b>${number(blockedCount)}</b>Blockers</span>
      </div>
    </div>
    <div class="operator-lanes">
      <section class="assistant-panel primary operator-lane">
        <div class="section-head">
          <h2>Needs You</h2>
          <span class="quiet">${number(doNow.length)} sales action(s)</span>
        </div>
        <div class="assistant-task-list">
          ${doNow.map((action, index) => assistantCard(action, index)).join("") || '<div class="empty">No sales actions are waiting right now.</div>'}
        </div>
      </section>
      <section class="assistant-panel operator-lane">
        <div class="section-head">
          <h2>Today's Accounts</h2>
          <span class="quiet">context before tasks</span>
        </div>
        <div class="account-lane-list">
          ${todaysAccounts.map(accountLaneCard).join("") || '<div class="empty">No active accounts for today.</div>'}
        </div>
      </section>
      <section class="assistant-panel operator-lane">
        <div class="section-head">
          <h2>Parked / System Handling</h2>
        </div>
        <div class="assistant-note-list">
          <article><b>Inbox tracking</b><span>Watching Gmail and reminding you until you reply.</span></article>
          <article><b>Project discovery</b><span>Finding high-rise projects, resolving companies, and queuing research when Apollo has no verified email.</span></article>
          <article><b>Email safety</b><span>${safety.live_send_enabled ? "Live send is enabled." : "Draft-only is on. Nothing cold sends without approval."}</span></article>
          <article><b>CRM sync</b><span>${monday.blocked ? `Monday is cooling down until ${formatDate(monday.blocked_until)}.` : "Monday is available for CRM writes."}</span></article>
        </div>
        <h3>Noise To Clear Later</h3>
        ${table(vendorNoise.slice(0, 3), [
          { label: "Item", value: (row) => safeText(assistantTitle(row), 130) },
          { label: "Action", value: (row) => `<div class="table-actions">${dismissButton(row.dismiss_kind, row.dismiss_key, "table-action")}</div>` },
        ], "No obvious vendor/noise items in the top queue")}
        <h3>Blockers</h3>
        ${table(blockers, [
          { label: "Status", value: (row) => statusPill(row.severity || "warn", row.label || "blocked") },
          { label: "Issue", value: (row) => `<b>${safeText(row.title, 120)}</b><small>${safeText(row.detail, 170)}</small>` },
        ], "No major blockers")}
      </section>
    </div>
  `;
}

function renderOfficeBrief(data) {
  const agents = data.agents || {};
  const office = data.virtual_office || {};
  const rooms = office.rooms || [];
  const workstreams = office.workstreams || [];
  const subagents = agents.subagents || [];
  const deterministic = agents.deterministic_agents || [];
  const events = agents.events || {};
  const heartbeats = events.heartbeats || [];
  const activeRooms = rooms.filter((room) => room.status === "ok").length;
  const issueRooms = rooms.length - activeRooms;

  $("#officeBrief").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Virtual Office</h2>
        <span class="quiet">${number(rooms.length)} rooms / ${number(deterministic.length)} deterministic agents / ${number(subagents.length)} subagent personas</span>
      </div>
      ${statusPill(issueRooms ? "warn" : "ok", issueRooms ? `${number(issueRooms)} room(s) need attention` : "Office active")}
    </div>
    <div class="office-command-grid">
      <section class="office-map">
        <h3>Rooms</h3>
        <div class="office-room-rail">
          ${rooms
            .slice(0, 6)
            .map(
              (room) => `
                <article class="office-room-mini ${escapeHtml(room.status || "unknown")}">
                  <header>
                    <strong>${safeText(room.room, 80)}</strong>
                    ${statusPill(room.status, statusLabel(room.status))}
                  </header>
                  <p>${safeText(room.purpose, 150)}</p>
                  <small>${safeText(room.next_action, 180)}</small>
                </article>
              `,
            )
            .join("") || '<div class="empty">No virtual office rooms found.</div>'}
        </div>
      </section>
      <section class="office-map">
        <h3>What Each Team Is Doing</h3>
        <div class="workstream-stack">
          ${workstreams
            .slice(0, 7)
            .map(
              (stream) => `
                <article class="workstream-row">
                  ${statusPill(stream.status, statusLabel(stream.status))}
                  <div>
                    <strong>${safeText(stream.name, 90)}</strong>
                    <small>${safeText(stream.handoff, 180)}</small>
                  </div>
                </article>
              `,
            )
            .join("") || '<div class="empty">No workstreams found.</div>'}
        </div>
      </section>
      <section class="office-map">
        <h3>Recent Heartbeats</h3>
        <div class="heartbeat-list">
          ${heartbeats
            .slice(0, 5)
            .map(
              (beat) => `
                <article>
                  <div>${statusPill(beat.status, beat.agent || statusLabel(beat.status))}<span>${formatDate(beat.at)}</span></div>
                  <p>${safeText(beat.detail || beat.last_event, 150)}</p>
                </article>
              `,
            )
            .join("") || '<div class="empty">No local agent heartbeats yet.</div>'}
        </div>
        <h3>Gaps</h3>
        <div class="gap-list compact">
          ${(office.gaps || [])
            .slice(0, 2)
            .map((gap) => `<article class="gap"><span></span><p>${safeText(gap, 220)}</p></article>`)
            .join("") || '<div class="empty">No office gaps recorded.</div>'}
        </div>
      </section>
    </div>
  `;
}

function renderOverview(data) {
  const safety = data.safety || {};
  const integrations = data.integrations || {};
  const health = data.health || {};
  const cron = data.cron || {};
  const drafts = data.drafts || {};
  const replies = data.pipeline?.replies || {};
  const bounces = data.pipeline?.bounces || {};
  const safetyText = safety.live_send_enabled ? "Live send" : "Draft-only";
  const safetyDetail = `dry ${safety.dry_run ?? "?"} / approved ${safety.send_approved ?? "?"}`;
  const projectPaused = safety.project_radar_dry_run !== "0";
  const permitPaused = safety.permit_radar_dry_run !== "0";
  const inboundPaused = safety.inbound_lead_dry_run !== "0";
  const apollo = integrations.apollo || {};
  const apolloBridge = integrations.apollo_bridge || {};
  const apolloMcp = integrations.apollo_mcp || {};
  const monday = integrations.monday || {};

  $("#overview").innerHTML = [
    metric("System Health", statusLabel(health.status), `${number(health.issue_count)} issue(s)`, health.status),
    metric("Safety Gates", safetyText, safetyDetail, safety.live_send_enabled ? "danger" : "ok"),
    metric("Monday API", monday.blocked ? "Cooling down" : statusLabel(monday.dashboard_status || "ok"), monday.blocked ? `until ${formatDate(monday.blocked_until)}` : `last ${formatDate(monday.last_success_at || monday.last_rate_limit_at)}`, monday.dashboard_status || "ok"),
    metric("Apollo", statusLabel(apollo.dashboard_status || "unknown"), apollo.status || "no health state", apollo.dashboard_status || "unknown"),
    metric(
      "Apollo Bridge",
      apolloBridge.automation_callable ? "REST active" : (apolloMcp.detected ? "MCP seen" : "Not wired"),
      apolloBridge.automation_callable ? `cron enrichment ready / ${number(apolloBridge.cache_count)} cached` : (apolloMcp.detected ? "MCP supervised only" : "missing bridge"),
      apolloBridge.dashboard_status || (apolloMcp.detected ? "warn" : "unknown")
    ),
    metric("Active Cron", number(cron.active_count), `${number(cron.paused_count)} paused`, "ok"),
    metric("Pending Approvals", number(drafts.approval_status_counts?.pending), `${number(drafts.approval_count)} total`, drafts.approval_status_counts?.pending ? "warn" : "ok"),
    metric("Gmail Poll", formatAge(replies.last_poll_age_hours), `${number(replies.seen_threads)} seen threads`, replies.last_poll_age_hours > 1 ? "warn" : "ok"),
    metric("Recent Bounces", number(bounces.recent_7d), `${number(bounces.total)} tracked`, bounces.recent_7d >= 5 ? "warn" : "ok"),
    `
      <article class="metric control-panel ${projectPaused || permitPaused || inboundPaused ? "warn" : "ok"}">
        <span class="metric-title">Write Controls</span>
        <strong>${projectPaused || permitPaused || inboundPaused ? "Some paused" : "Writes enabled"}</strong>
        <small>Local CRM/draft paths only. Live email gates stay separate.</small>
        <div class="action-buttons">
          ${systemToggleButton("project_radar_writes", projectPaused, "Project")}
          ${systemToggleButton("permit_radar_writes", permitPaused, "Permit")}
          ${systemToggleButton("inbound_monday_actions", inboundPaused, "Inbound")}
        </div>
      </article>
    `,
  ].join("");
}

function actionCard(action, index) {
  const severity = action.severity || "unknown";
  const meta = [
    action.category,
    action.owner,
    action.entity,
    action.age_hours !== null && action.age_hours !== undefined ? `${formatAge(action.age_hours)} old` : "",
  ].filter(Boolean);
  return `
    <article class="action-card ${escapeHtml(severity)}">
      <header>
        <span class="action-rank">P${index + 1}</span>
        <div>
          <strong>${safeText(action.title, 150)}</strong>
          <small>${meta.map((item) => escapeHtml(item)).join(" / ")}</small>
        </div>
        ${statusPill(severity, action.label || statusLabel(severity))}
      </header>
      <p>${safeText(action.detail, 260)}</p>
      <div class="action-next">
        <b>Next</b>
        <span>${safeText(action.next_step, 260)}</span>
      </div>
      ${actionButtons(action)}
      ${action.command ? `<code class="action-command">${escapeHtml(action.command)}</code>` : ""}
    </article>
  `;
}

function renderActionCenter(data) {
  const center = data.action_center || {};
  const summary = center.summary || {};
  const actions = center.top_actions || [];
  const decisions = center.decisions || [];
  const commands = center.commands || [];
  $("#actionCount").textContent = `${number(summary.open_actions)} open / ${number(summary.urgent_actions)} urgent`;
  $("#actionCenter").innerHTML = `
    <div class="action-layout">
      <div>
        <div class="mini-grid">
          ${metric("Urgent", number(summary.urgent_actions), "ranked P1/P2 work", summary.urgent_actions ? "warn" : "ok")}
          ${metric("Inbound", number(summary.inbound_waiting), "waiting on Colin", summary.inbound_waiting ? "warn" : "ok")}
          ${metric("Approvals", number(summary.pending_approvals), "draft decisions", summary.pending_approvals ? "warn" : "ok")}
          ${metric("Manual Channels", number(summary.multichannel_ready), "ready/research", summary.multichannel_ready ? "warn" : "ok")}
        </div>
        <h3>Top Actions</h3>
        <div class="action-list">
          ${actions.map((action, index) => actionCard(action, index)).join("") || '<div class="empty">No ranked actions right now.</div>'}
        </div>
      </div>
      <div>
        <h3>Decisions</h3>
        ${table(decisions, [
          { label: "Status", value: (row) => statusPill(row.severity || row.status, row.status || row.severity) },
          { label: "Decision", value: (row) => `<b>${safeText(row.title, 110)}</b><small>${safeText(row.detail, 180)}</small>` },
          { label: "Recommendation", value: (row) => safeText(row.recommendation, 220) },
        ], "No open decisions")}
        <h3>Operator Commands</h3>
        <div class="command-list">
          ${commands
            .map(
              (cmd) => `
                <article class="command-card">
                  <strong>${safeText(cmd.label, 120)}</strong>
                  <code>${escapeHtml(cmd.command)}</code>
                </article>
              `,
            )
            .join("") || '<div class="empty">No helper commands.</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderOperatorActivity(data) {
  const activity = data.operator_activity || {};
  const events = activity.latest || [];
  $("#activityCount").textContent = `${number(activity.event_count)} event(s) / ${number(activity.dismissed_count)} dismissed`;
  $("#operatorActivity").innerHTML = table(events, [
    { label: "When", value: (row) => formatDate(row.at) },
    { label: "Status", value: (row) => statusPill(row.undone_at ? "unknown" : row.status === "dismissed" || row.status === "skipped" || row.status === "snoozed" ? "warn" : "ok", row.undone_at ? "undone" : row.status || row.action) },
    { label: "Action", value: (row) => `<b>${safeText(row.action, 70)}</b><small>${safeText(row.kind, 70)}</small>` },
    { label: "Item", value: (row) => `<code>${safeText(row.key, 90)}</code>` },
    { label: "Detail", value: (row) => safeText(row.detail, 220) },
    { label: "Undo", value: (row) => undoButton(row, "table-action") },
  ], "No dashboard operator activity yet");
}

function renderHealth(data) {
  const health = data.health || {};
  $("#healthPill").className = `pill ${health.status || "unknown"}`;
  $("#healthPill").textContent = statusLabel(health.status);
  $("#issueCount").textContent = `${number(health.issue_count)} issue(s)`;

  const issues = health.issues || [];
  $("#issues").innerHTML = issues.length
    ? issues
        .map(
          (issue) => `
            <article class="issue ${escapeHtml(issue.severity)}">
              <div>${statusPill(issue.severity, issue.severity)}</div>
              <div>
                <strong>${escapeHtml(issue.title)}</strong>
                <p>${escapeHtml(issue.detail)}</p>
                <small>${escapeHtml(issue.source)}</small>
              </div>
            </article>
          `,
        )
        .join("")
    : '<div class="empty">No active issues in the generated snapshot.</div>';
}

function renderPipeline(data) {
  const pipeline = data.pipeline || {};
  const outreach = pipeline.outreach || {};
  const followups = pipeline.followups || {};
  const replies = pipeline.replies || {};
  const bounces = pipeline.bounces || {};
  const enrichment = pipeline.enrichment || {};
  const automation = pipeline.automation || {};

  $("#pipelineStamp").textContent = `Automation ${formatDate(automation.last_run)}`;
  $("#pipeline").innerHTML = `
    <div>
      <div class="mini-grid">
        ${metric("Sent Outreach", number(outreach.sent_count), `${number(outreach.send_count)} send counter`, outreach.future_timestamp_count ? "warn" : "ok")}
        ${metric("Follow-ups", number(followups.total), `${number(followups.stuck_count)} stuck`, followups.stuck_count ? "warn" : "ok")}
        ${metric("Replies", number(replies.reply_count), `${formatAge(replies.last_poll_age_hours)} poll age`, "ok")}
        ${metric("Bounces", number(bounces.total), `${number(bounces.recent_7d)} in 7d`, bounces.recent_7d >= 5 ? "warn" : "ok")}
        ${metric("Enriched", number(enrichment.processed_count), `${number(enrichment.apollo_credits_used)} Apollo credits`, "ok")}
        ${metric("Stalled", number(automation.last_stalled), `${number(automation.last_transitions)} transitions last run`, automation.last_stalled ? "warn" : "ok")}
      </div>
      <h3>Follow-up Steps</h3>
      <div class="chips">${chips(followups.by_step)}</div>
      <h3>Email Health</h3>
      <div class="chips">${chips(bounces.by_type)}${chips(bounces.by_status)}</div>
    </div>
    <div>
      <h3>Latest Replies</h3>
      ${table(replies.latest, [
        { label: "When", value: (row) => formatDate(row.detected_at) },
        { label: "Company", value: (row) => safeText(row.company || row.from_name || row.email, 80) },
        { label: "Intent", value: (row) => safeText(row.intent, 70) },
        { label: "Snippet", value: (row) => safeText(row.snippet, 120) },
      ])}
      <h3>Latest Outreach</h3>
      ${table(outreach.latest, [
        { label: "When", value: (row) => formatDate(row.sent_at) },
        { label: "Company", value: (row) => safeText(row.company, 90) },
        { label: "Subject", value: (row) => safeText(row.subject, 120) },
      ])}
    </div>
  `;
}

function renderDrafts(data) {
  const drafts = data.drafts || {};
  const pendingApprovals = drafts.approval_status_counts?.pending || 0;
  $("#draftCount").textContent = `${number(pendingApprovals)} pending / ${number(drafts.approval_count)} tracked`;
  $("#drafts").innerHTML = `
    <div class="chips spaced">${chips(drafts.approval_status_counts)}</div>
    <h3>Approval Queue</h3>
    ${table(drafts.approval_queue, [
      { label: "Status", value: (row) => statusPill(row.status === "pending" ? "warn" : "ok", row.status || "pending") },
      { label: "Drafted", value: (row) => formatDate(row.drafted_at) },
      { label: "ID", value: (row) => safeText(row.draft_id || row.id, 38) },
      { label: "To", value: (row) => safeText(row.to, 110) },
      { label: "Company", value: (row) => safeText(row.company, 130) },
      { label: "Subject", value: (row) => safeText(row.subject, 150) },
      { label: "Account", value: (row) => safeText(row.account, 90) },
      {
        label: "Action",
        value: (row) => row.status === "pending"
          ? `<div class="table-actions">${operatorButton("approval", row.draft_id || row.id, "skip", "Skip", "table-action skip-action")}${dismissButton("approval", row.draft_id || row.id, "table-action")}</div>`
          : "",
      },
    ], "No approval records")}
    <h3>Campaign Drafts</h3>
    ${table(drafts.campaign_drafts, [
      { label: "Drafted", value: (row) => formatDate(row.drafted_at) },
      { label: "Company", value: (row) => safeText(row.company, 120) },
      { label: "Subject", value: (row) => safeText(row.subject, 160) },
      { label: "Monday", value: (row) => safeText(row.monday_id, 40) },
    ], "No campaign drafts")}
  `;
}

function renderCron(data) {
  const cron = data.cron || {};
  $("#cronCount").textContent = `${number(cron.active_count)} active / ${number(cron.paused_count)} paused`;
  $("#cron").innerHTML = table(cron.jobs, [
    { label: "Status", value: (row) => statusPill(row.status, statusLabel(row.status)) },
    { label: "Job", value: (row) => `<b>${safeText(row.label, 80)}</b><small>${safeText(row.category, 50)}</small>` },
    { label: "Schedule", value: (row) => `<code>${escapeHtml(row.schedule)}</code>` },
    { label: "Last Log", value: (row) => formatDate(row.log?.modified_at) },
    { label: "Age", value: (row) => formatAge(row.log?.age_hours) },
    { label: "RC", value: (row) => row.log?.last_rc ?? "" },
    { label: "Command", value: (row) => `<code>${safeText(row.command, 220)}</code>` },
  ]);
}

function renderAgents(data) {
  const agents = data.agents || {};
  const office = data.virtual_office || {};
  const deterministic = agents.deterministic_agents || [];
  const subagents = agents.subagents || [];
  const events = agents.events || {};
  const rooms = office.rooms || [];
  const workstreams = office.workstreams || [];
  $("#agentCount").textContent = `${number(rooms.length)} rooms / ${number(deterministic.length)} agents / ${number(subagents.length)} subagents / ${number(events.event_count)} events`;
  $("#agents").innerHTML = `
    <h3>Virtual Office</h3>
    <div class="office-grid">
      ${rooms
        .map(
          (room) => `
            <article class="office-room ${escapeHtml(room.status || "unknown")}">
              <header>
                <div>
                  <strong>${safeText(room.room, 90)}</strong>
                  <small>${safeText(room.owner, 90)}</small>
                </div>
                ${statusPill(room.status, statusLabel(room.status))}
              </header>
              <p>${safeText(room.purpose, 190)}</p>
              <div class="room-metrics">
                ${(room.metrics || [])
                  .map((m) => `<span><b>${safeText(m.value, 40)}</b>${safeText(m.label, 70)}</span>`)
                  .join("")}
              </div>
              <div class="room-systems">
                ${(room.systems_detail || [])
                  .map((system) => `<span>${statusPill(system.status, system.label || system.name)}</span>`)
                  .join("") || '<span class="quiet">manual / state-only</span>'}
              </div>
              <small class="next-action">${safeText(room.next_action, 220)}</small>
            </article>
          `,
        )
        .join("") || '<div class="empty">No virtual office rooms found.</div>'}
    </div>
    <h3>Implementation Workstreams</h3>
    <div class="workstream-grid">
      ${workstreams
        .map(
          (stream) => `
            <article class="workstream">
              ${statusPill(stream.status, statusLabel(stream.status))}
              <strong>${safeText(stream.name, 90)}</strong>
              <small>${safeText(stream.handoff, 180)}</small>
            </article>
          `,
        )
        .join("") || '<div class="empty">No workstreams found.</div>'}
    </div>
    <h3>Agent Heartbeats</h3>
    ${table(events.heartbeats, [
      { label: "When", value: (row) => formatDate(row.at) },
      { label: "Agent", value: (row) => `<b>${safeText(row.agent, 90)}</b><small>${safeText(row.room, 90)}</small>` },
      { label: "Status", value: (row) => statusPill(row.status, statusLabel(row.status)) },
      { label: "Last Event", value: (row) => safeText(row.last_event, 90) },
      { label: "Detail", value: (row) => safeText(row.detail, 180) },
    ], "No local agent heartbeats yet")}
    <h3>Latest Agent Events</h3>
    ${table(events.latest, [
      { label: "When", value: (row) => formatDate(row.at) },
      { label: "Agent", value: (row) => safeText(row.agent, 90) },
      { label: "Room", value: (row) => safeText(row.room, 90) },
      { label: "Event", value: (row) => safeText(row.event, 90) },
      { label: "Detail", value: (row) => safeText(row.detail, 220) },
    ], "No local agent events yet")}
    <h3>What Is Still Missing</h3>
    <div class="gap-list">
      ${(office.gaps || [])
        .map((gap) => `<article class="gap"><span></span><p>${safeText(gap, 260)}</p></article>`)
        .join("") || '<div class="empty">No implementation gaps recorded.</div>'}
    </div>
    <h3>Deterministic Agents</h3>
    ${table(deterministic, [
      { label: "Status", value: (row) => statusPill(row.status, statusLabel(row.status)) },
      { label: "Agent", value: (row) => `<b>${safeText(row.label, 90)}</b><small>${safeText(row.name, 70)}</small>` },
      { label: "Local", value: (row) => formatDate(row.local_file?.modified_at) },
      { label: "Deployed", value: (row) => formatDate(row.deployed_file?.modified_at) },
      { label: "Log", value: (row) => row.log ? `${statusPill(row.log.status)} ${formatAge(row.log.age_hours)}` : "" },
    ])}
    <h3>Subagent Personas</h3>
    <p class="note">${safeText(agents.runtime_note, 260)}</p>
    <div class="subagent-grid">
      ${subagents
        .map(
          (agent) => `
            <article class="subagent">
              <div>${statusPill(agent.status, statusLabel(agent.status))}</div>
              <strong>${safeText(agent.name, 80)}</strong>
              <p>${safeText(agent.identity || agent.heartbeat || "Configured local subagent persona", 180)}</p>
              <small>${number(Object.keys(agent.files || {}).length)} config file(s)</small>
            </article>
          `,
        )
        .join("") || '<div class="empty">No subagent configs found.</div>'}
    </div>
  `;
}

function renderRadarInbound(data) {
  const radar = data.radar || {};
  const inbound = data.inbound || {};
  $("#radarCount").textContent = `${number(radar.project_radar_count)} projects / ${number(radar.permit_count)} permits / ${number(inbound.inbound_waiting_count)} waiting / ${number(inbound.inbound_monday_deferred_count)} CRM deferred`;
  $("#radarInbound").innerHTML = `
    <div>
      <div class="mini-grid">
        ${metric("Project Radar", number(radar.project_radar_count), `last ${formatDate(radar.project_radar_last_run)}`, radar.project_radar_count ? "ok" : "unknown")}
        ${metric("Source Coverage", number(radar.project_radar_source_count), `${number(radar.project_radar_social_profile_count)} social profiles tracked`, radar.project_radar_source_count ? "ok" : "unknown")}
        ${metric("Account Resolver", number(radar.account_resolver_domain_count), `${number(radar.project_research_queue_count)} research queued`, radar.project_research_queue_count ? "warn" : "ok")}
        ${metric("Developer Radar", number(radar.developer_radar?.row_count), "local TSV rows", "ok")}
        ${metric("Permit Radar", number(radar.permit_count || radar.permit_seen_count), `last ${formatDate(radar.permit_last_run)}`, radar.permit_count ? "ok" : "unknown")}
        ${metric("Multichannel Actions", number(radar.multichannel_action_count), `${number(radar.multichannel_ready_count)} ready/research`, radar.multichannel_action_count ? "warn" : "ok")}
      </div>
      <h3>Project Source Coverage</h3>
      ${table(radar.project_radar_sources, [
        { label: "Source", value: (row) => safeText(row.name, 120) },
        { label: "Market", value: (row) => safeText(row.market, 80) },
        { label: "Type", value: (row) => safeText(row.type, 40) },
        { label: "Social", value: (row) => safeText((row.social_profiles || []).join(", "), 180) },
      ], "No project radar sources configured")}
      <h3>New Project Radar</h3>
      ${table(radar.project_radar_latest, [
        { label: "Found", value: (row) => formatDate(row.found_at) },
        { label: "Tier", value: (row) => statusPill(row.tier === "Tier A" ? "ok" : row.tier === "Tier B" ? "warn" : "unknown", row.tier || "unknown") },
        { label: "Project", value: (row) => safeText(row.project_name || row.company, 150) },
        { label: "Target", value: (row) => safeText(row.target_account || row.company, 130) },
        { label: "Apollo", value: (row) => row.apollo_status ? statusPill(row.apollo_status === "contact_found" ? "ok" : "warn", row.apollo_status) : safeText(row.apollo_miss_reason || "", 120) },
        { label: "Market", value: (row) => safeText([row.city, row.state].filter(Boolean).join(", "), 80) },
        { label: "Stories", value: (row) => safeText(row.stories, 30) },
        { label: "Score", value: (row) => safeText(row.score, 30) },
      ], "No committed project radar finds yet")}
      <h3>Decision Maker Research Queue</h3>
      ${table(radar.project_research_queue_latest, [
        { label: "Queued", value: (row) => formatDate(row.last_seen || row.queued_at) },
        { label: "Target", value: (row) => safeText(row.target_account, 140) },
        { label: "Role", value: (row) => safeText(row.target_role_label || row.target_role, 90) },
        { label: "Domain", value: (row) => safeText(row.target_domain || "needs domain", 120) },
        { label: "Reason", value: (row) => safeText(row.reason, 180) },
        { label: "Project", value: (row) => safeText(row.project_name, 140) },
      ], "No unresolved radar account research")}
      <h3>Official Permit Radar</h3>
      ${table(radar.permit_latest, [
        { label: "Seen", value: (row) => formatDate(row.last_seen) },
        { label: "Tier", value: (row) => statusPill(row.tier === "Tier A" ? "ok" : row.tier === "Tier B" ? "warn" : "unknown", row.tier || "unknown") },
        { label: "Source", value: (row) => safeText(row.source, 100) },
        { label: "Company", value: (row) => safeText(row.company || row.address, 130) },
        { label: "Market", value: (row) => safeText(row.market, 70) },
        { label: "Score", value: (row) => safeText(row.score, 30) },
        { label: "Scope", value: (row) => safeText(row.scope, 160) },
      ], "No official permit candidates logged yet")}
      <h3>Legacy Radar Rows</h3>
      ${table(radar.developer_radar?.latest, [
        { label: "Found", value: (row) => formatDate(row.date_found) },
        { label: "Project", value: (row) => safeText(row.project || row.company, 150) },
        { label: "City", value: (row) => safeText(row.city, 70) },
        { label: "Score", value: (row) => safeText(row.score, 30) },
        { label: "Status", value: (row) => safeText(row.status, 50) },
      ])}
    </div>
    <div>
      <div class="mini-grid">
        ${metric("Inbound Waiting", number(inbound.inbound_waiting_count), `${number(inbound.inbound_snoozed_count)} snoozed / ${number(inbound.inbound_tracked_count)} tracked`, inbound.inbound_waiting_count ? "warn" : "ok")}
        ${metric("Monday Deferred", number(inbound.inbound_monday_deferred_count), "inbound CRM writes queued", inbound.inbound_monday_deferred_count ? "warn" : "ok")}
        ${metric("Resolved Inbound", number(inbound.inbound_resolved_count), `last ${formatDate(inbound.inbound_last_run)}`, "ok")}
        ${metric("Legacy Reminders", number(inbound.reminder_count), "follow-up reminder state", inbound.reminder_count ? "warn" : "ok")}
        ${metric("OpenPhone", number(inbound.openphone_conversation_count || inbound.openphone_seen_count), `last ${formatDate(inbound.openphone_last_poll || inbound.openphone_last_attempt)}`, inbound.openphone_last_error ? "warn" : "ok")}
      </div>
      <h3>Deferred Inbound CRM Writes</h3>
      ${table(inbound.inbound_monday_deferred_latest, [
        { label: "Controls", value: (row) => `<div class="table-actions">${operatorButton("crm_sync", row.key, "retry", "Retry", "table-action done-action")}${operatorButton("crm_sync", row.key, "clear", "Clear", "table-action dismiss-action")}${row.gmail_url ? `<button type="button" class="table-action open-gmail" data-gmail-url="${escapeHtml(row.gmail_url)}">Gmail</button>` : ""}${row.key ? `<button type="button" class="table-action account-detail" data-account-key="${escapeHtml(row.key)}">Account</button>` : ""}</div>` },
        { label: "Queued", value: (row) => formatDate(row.queued_at) },
        { label: "Attempts", value: (row) => safeText(row.attempts, 30) },
        { label: "Company", value: (row) => safeText(row.company || row.sender_email, 120) },
        { label: "Subject", value: (row) => safeText(row.subject, 150) },
        { label: "Last Error", value: (row) => safeText(row.last_error || row.last_action, 180) },
      ], "No inbound CRM writes are deferred")}
      <h3>Inbound Waiting On Colin</h3>
      ${table(inbound.inbound_waiting, [
        { label: "Account", value: (row) => `<button type="button" class="table-action account-detail" data-account-key="${escapeHtml(row.key || "")}">View</button>` },
        { label: "Reply", value: (row) => `<button type="button" class="table-action prepare-reply" data-reply-key="${escapeHtml(row.key || "")}" data-gmail-url="${escapeHtml(row.gmail_url || "")}" data-draft-url="${escapeHtml(row.reply_draft_url || "")}" data-reply-draft-id="${escapeHtml(row.reply_draft_id || "")}">${row.reply_draft_id ? "Open Draft" : "Draft"}</button>` },
        { label: "Snooze", value: (row) => operatorButton("inbound", row.key, "snooze", "24h", "table-action snooze-action", 24) },
        { label: "Dismiss", value: (row) => dismissButton("inbound", row.key, "table-action") },
        { label: "Age", value: (row) => formatAge(row.age_hours) },
        { label: "Class", value: (row) => safeText(row.classification, 70) },
        { label: "Company", value: (row) => safeText(row.company || row.sender_email, 120) },
        { label: "Subject", value: (row) => safeText(row.subject, 150) },
        { label: "Last Alert", value: (row) => formatDate(row.last_alert_at) },
      ], "No tracked inbound leads waiting")}
      <h3>Snoozed Inbound</h3>
      ${table(inbound.inbound_snoozed, [
        { label: "Returns", value: (row) => formatDate(row.snoozed_until) },
        { label: "Company", value: (row) => safeText(row.company || row.sender_email, 120) },
        { label: "Subject", value: (row) => safeText(row.subject, 150) },
        { label: "Class", value: (row) => safeText(row.classification, 70) },
      ], "No snoozed inbound leads")}
      <h3>Legacy Reminders</h3>
      ${table(inbound.oldest_reminders, [
        { label: "Item", value: (row) => safeText(row.item_id, 50) },
        { label: "Last Reminded", value: (row) => formatDate(row.last_reminded) },
        { label: "Age", value: (row) => formatAge(row.age_hours) },
      ], "No reminder records")}
      <h3>LinkedIn Queue</h3>
      ${table(radar.linkedin_latest, [
        { label: "Added", value: (row) => formatDate(row.added_at) },
        { label: "Company", value: (row) => safeText(row.company, 110) },
        { label: "Status", value: (row) => safeText(row.status, 70) },
      ], "No LinkedIn queue records")}
      <h3>Multichannel Action Queue</h3>
      ${table(radar.multichannel_actions, [
        { label: "ID", value: (row) => `<code>${safeText(row.id, 30)}</code>` },
        { label: "Actions", value: (row) => `<div class="table-actions">${operatorButton("multichannel", row.id, "done", "Done", "table-action done-action")}${operatorButton("multichannel", row.id, "snoozed", "72h", "table-action snooze-action", 72)}${dismissButton("multichannel", row.id, "table-action")}</div>` },
        { label: "Priority", value: (row) => safeText(row.priority, 30) },
        { label: "Status", value: (row) => statusPill(row.status, row.status || "ready") },
        { label: "Channel", value: (row) => safeText(row.channel, 70) },
        { label: "Company", value: (row) => safeText(row.company || row.email, 130) },
        { label: "Action", value: (row) => safeText(row.action_type, 120) },
        { label: "Next Step", value: (row) => safeText(row.next_step, 220) },
      ], "No multichannel actions generated")}
    </div>
  `;
}

function accountActionButton(action, label, className = "small-action", hours = "") {
  return `<button type="button" class="${escapeHtml(className)} account-action" data-account-key="${escapeHtml(state.accountKey || "")}" data-account-action="${escapeHtml(action)}" data-account-hours="${escapeHtml(hours)}">${escapeHtml(label)}</button>`;
}

function openAccountDrawerShell(title = "Loading account", subtitle = "") {
  const drawer = $("#accountDrawer");
  drawer.classList.remove("hidden");
  drawer.setAttribute("aria-hidden", "false");
  $("#accountDrawerTitle").textContent = title;
  $("#accountDrawerSubtitle").textContent = subtitle;
  $("#accountDrawerBody").innerHTML = '<div class="empty">Loading account context...</div>';
}

function closeAccountDrawer() {
  state.accountKey = "";
  state.accountData = null;
  const drawer = $("#accountDrawer");
  drawer.classList.add("hidden");
  drawer.setAttribute("aria-hidden", "true");
}

function accountStatusText(record) {
  if (record.waiting_on_colin) return "Reply owed";
  if (record.snoozed_until) return `Snoozed until ${formatDate(record.snoozed_until)}`;
  return record.disposition || record.resolution || "No reply owed";
}

function renderAccountDrawer(payload) {
  state.accountData = payload;
  const record = payload.record || {};
  const related = payload.related || {};
  const title = record.company || record.sender_name || record.sender_email || "Account";
  $("#accountDrawerTitle").textContent = title;
  $("#accountDrawerSubtitle").textContent = `${record.sender_email || "unknown email"} / ${record.subject || "no subject"}`;

  const draftControls = `
    <div class="action-buttons">
      ${record.waiting_on_colin ? `<button type="button" class="small-link preview-reply" data-reply-key="${escapeHtml(payload.key)}">Preview Reply</button>` : ""}
      ${record.waiting_on_colin ? `<button type="button" class="small-action prepare-reply" data-reply-key="${escapeHtml(payload.key)}" data-gmail-url="${escapeHtml(record.gmail_url || "")}" data-draft-url="${escapeHtml(record.reply_draft_url || "")}" data-reply-draft-id="${escapeHtml(record.reply_draft_id || "")}">${record.reply_draft_id ? "Open Draft" : "Draft Reply"}</button>` : ""}
      ${record.gmail_url ? `<button type="button" class="small-link open-gmail" data-gmail-url="${escapeHtml(record.gmail_url)}">Open Gmail</button>` : ""}
      ${accountActionButton("snooze", "Snooze 24h", "small-action snooze-action", 24)}
      ${accountActionButton("monitor_calls", "Monitor Calls", "small-action snooze-action")}
      ${accountActionButton("waiting_on_client", "Waiting Client")}
      ${accountActionButton("quote_sent", "Quote Sent", "small-action done-action")}
      ${accountActionButton("proposal_sent", "Proposal Sent", "small-action done-action")}
      ${accountActionButton("call_done", "Call Done", "small-action done-action")}
      ${accountActionButton("dead_for_now", "Dead For Now", "small-action dismiss-action")}
      ${!record.waiting_on_colin ? accountActionButton("revive", "Revive", "small-action") : ""}
    </div>
  `;

  const outline = payload.thread_outline || [];
  $("#accountDrawerBody").innerHTML = `
    <div class="account-summary-grid">
      ${metric("Status", accountStatusText(record), record.classification || "inbound", record.waiting_on_colin ? "warn" : "ok")}
      ${metric("Last External", formatDate(record.last_external_at), `started ${formatDate(record.wait_started_at)}`, record.waiting_on_colin ? "warn" : "ok")}
      ${metric("Draft", record.reply_draft_id ? "Exists" : "None", record.draft_context?.intent || "no draft context", record.reply_draft_id ? "ok" : "unknown")}
      ${metric("Monday", record.monday?.ok ? "Synced" : record.monday?.action || "Pending", record.monday?.error || "local state", record.monday?.ok ? "ok" : "warn")}
    </div>
    <section class="account-section">
      <h3>Actions</h3>
      ${draftControls}
      ${isPublicReview() ? '<p class="note">Public review mode: controls are visual only and no live systems are reachable.</p>' : ""}
      <p class="note">${safeText(record.next_action || "Set the correct disposition so this account returns only when action is actually needed.", 260)}</p>
    </section>
    <section class="account-section" id="replyPreviewSection">
      <h3>Reply Intelligence</h3>
      ${record.waiting_on_colin ? replyPlanBox(payload.key, record.draft_context?.reply_variant || "need_details") : ""}
      <div id="replyPreview" class="reply-preview empty">Preview the reply to see context, intent, and body before creating a Gmail draft.</div>
    </section>
    <section class="account-section">
      <h3>Current Thread</h3>
      <div class="thread-outline">
        ${outline.map((row) => `
          <article class="${row.role === "Colin" ? "internal" : "external"}">
            <header><b>${safeText(row.role, 80)}</b><span>${formatDate(row.at)}</span></header>
            <p>${safeText(row.body, 700)}</p>
          </article>
        `).join("") || `<div class="empty">${safeText(record.snippet || "No thread outline available yet.", 300)}</div>`}
      </div>
    </section>
    <section class="account-section">
      <h3>Related Account State</h3>
      <div class="related-grid">
        <div>
          <h3>Threads</h3>
          ${table(related.related_threads || [], [
            { label: "When", value: (row) => formatDate(row.last_external_at) },
            { label: "Status", value: (row) => statusPill(row.waiting_on_colin ? "warn" : "ok", row.resolution || row.classification || "thread") },
            { label: "Subject", value: (row) => safeText(row.subject, 120) },
          ], "No related threads")}
        </div>
        <div>
          <h3>Drafts</h3>
          ${table(related.approvals || [], [
            { label: "Status", value: (row) => statusPill(row.status === "pending" ? "warn" : "ok", row.status || "pending") },
            { label: "To", value: (row) => safeText(row.to || row.company, 110) },
            { label: "Subject", value: (row) => safeText(row.subject, 120) },
          ], "No related approvals")}
        </div>
      </div>
      <div class="related-grid">
        <div>
          <h3>Manual Channels</h3>
          ${table(related.multichannel || [], [
            { label: "Status", value: (row) => statusPill(row.status, row.status || "queued") },
            { label: "Channel", value: (row) => safeText(row.channel, 70) },
            { label: "Next", value: (row) => safeText(row.next_step || row.action_type, 170) },
          ], "No related manual-channel actions")}
        </div>
        <div>
          <h3>Radar</h3>
          ${table(related.radar || [], [
            { label: "Source", value: (row) => safeText(row.source, 80) },
            { label: "Project", value: (row) => safeText(row.project_name || row.company, 130) },
            { label: "Status", value: (row) => safeText(row.status || row.tier, 80) },
          ], "No related radar records")}
        </div>
      </div>
      <h3>Operator History</h3>
      ${table(related.events || [], [
        { label: "When", value: (row) => formatDate(row.at) },
        { label: "Action", value: (row) => safeText(row.action, 90) },
        { label: "Status", value: (row) => statusPill(row.status === "dismissed" ? "warn" : "ok", row.status || "done") },
        { label: "Detail", value: (row) => safeText(row.detail, 180) },
      ], "No account-level operator history")}
    </section>
  `;
}

async function openAccountDetail(key) {
  if (!key) return;
  state.accountKey = key;
  openAccountDrawerShell("Loading account", key);
  try {
    const response = await fetch(`/api/account-detail?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Account load failed");
    renderAccountDrawer(payload);
  } catch (error) {
    $("#accountDrawerBody").innerHTML = `<div class="empty">Could not load account: ${escapeHtml(error.message)}</div>`;
  }
}

function renderReplyPreview(payload) {
  const target = $("#replyPreview");
  if (!target) return;
  const context = payload.context || {};
  const flags = payload.voice_flags || [];
  target.className = "reply-preview";
  target.innerHTML = `
    <div class="reply-intel-grid">
      ${metric("Intent", context.intent || "unknown", `${number(context.message_count)} message(s)`, "ok")}
      ${metric("Age", formatAge(context.age_hours), context.age_bucket || "unknown", context.age_bucket === "stale" ? "warn" : "ok")}
      ${metric("Mode", payload.mode || "preview", context.segment || "segment unknown", "ok")}
      ${metric("Voice", payload.voice_ok ? "OK" : "Check", flags.join(", ") || "Best rule clean", payload.voice_ok ? "ok" : "warn")}
    </div>
    ${payload.reply_variant_label ? `<div class="assistant-next"><b>Reply plan</b><span>${escapeHtml(payload.reply_variant_label)}</span></div>` : ""}
    <div class="chips">${(context.signals || []).map((signal) => `<span class="chip">${escapeHtml(signal)}</span>`).join("") || '<span class="quiet">No special signals detected</span>'}</div>
    ${context.internal_after_external ? '<div class="issue warn"><div><span class="pill warn">warning</span></div><div><strong>Internal reply already detected after the latest external message.</strong><p>Check Gmail before sending another reply.</p></div></div>' : ""}
    <div class="draft-preview-box">
      <header>
        <b>${safeText(payload.subject, 180)}</b>
        <span>${payload.draft_created ? "Gmail draft" : "Preview only"}</span>
      </header>
      <pre>${escapeHtml(payload.body || "")}</pre>
    </div>
  `;
}

async function previewReply(key, trigger) {
  if (!key) return;
  if (!state.accountKey || state.accountKey !== key) {
    await openAccountDetail(key);
  }
  const originalText = trigger ? trigger.textContent : "";
  if (trigger) {
    trigger.disabled = true;
    trigger.textContent = "Previewing...";
  }
  try {
    const response = await fetch(`/api/reply-preview?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Preview failed");
    renderReplyPreview(payload);
    if (trigger) trigger.textContent = "Preview Ready";
  } catch (error) {
    const target = $("#replyPreview");
    if (target) target.innerHTML = `<div class="empty">Could not preview reply: ${escapeHtml(error.message)}</div>`;
    if (trigger) {
      trigger.disabled = false;
      trigger.textContent = originalText || "Preview";
    }
  } finally {
    if (trigger) {
      window.setTimeout(() => {
        trigger.disabled = false;
        trigger.textContent = originalText || "Preview";
      }, 1400);
    }
  }
}

async function accountAction(key, action, hours, trigger) {
  if (!key || !action) return;
  const messages = {
    call_done: "Mark the call as done and stop inbox reminders for this thread?",
    dead_for_now: "Mark this lead dead for now? It will stay in history and reopen only on new activity or manual revive.",
    dismiss: "Dismiss this account reminder?",
    monitor_calls: "Move this to OpenPhone/Quo monitoring and stop inbox reminders?",
    proposal_sent: "Mark proposal sent and stop inbox reminders for this thread?",
    quote_sent: "Mark quote sent and stop inbox reminders for this thread?",
    revive: "Revive this thread as waiting on Colin?",
    snooze: "Snooze this account for 24 hours?",
    waiting_on_client: "Mark this as waiting on the client/prospect?",
  };
  if (!window.confirm(messages[action] || "Apply this account action?")) return;
  const originalText = trigger ? trigger.textContent : "";
  if (trigger) {
    trigger.disabled = true;
    trigger.textContent = "Updating...";
  }
  try {
    const response = await fetch("/api/account-action", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, action, hours: Number(hours) || undefined }),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Account action failed");
    if (trigger) trigger.textContent = "Updated";
    await openAccountDetail(key);
    setTimeout(loadStatus, 250);
  } catch (error) {
    if (trigger) {
      trigger.disabled = false;
      trigger.textContent = originalText || "Action";
    }
    window.alert(`Could not update account: ${error.message}`);
  }
}

async function openGmail(url, trigger) {
  if (!url) return false;
  const originalText = trigger ? trigger.textContent : "";
  if (trigger) {
    trigger.disabled = true;
    trigger.textContent = "Opening...";
  }
  try {
    const response = await fetch("/api/open-gmail", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Open failed");
    if (trigger) trigger.textContent = "Opened Gmail";
    if (!payload.opened) window.location.href = url;
    return true;
  } catch (error) {
    if (trigger) trigger.textContent = "Opening here...";
    window.location.href = url;
    return false;
  } finally {
    if (trigger) {
      window.setTimeout(() => {
        trigger.disabled = false;
        trigger.textContent = originalText || "Open Gmail";
      }, 1600);
    }
  }
}

function isDraftComposeUrl(url) {
  return typeof url === "string" && url.includes("#drafts") && url.includes("compose=");
}

async function prepareReply(key, trigger) {
  if (!key) return;
  const originalText = trigger ? trigger.textContent : "";
  const variant = trigger?.dataset?.replyVariant || "";
  if (trigger) {
    trigger.disabled = true;
    trigger.textContent = trigger.dataset?.replyDraftId ? "Checking..." : "Drafting...";
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const params = new URLSearchParams({ key, open: "1" });
    if (variant) params.set("variant", variant);
    const response = await fetch(`/api/prepare-reply?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Draft failed");
    const openUrl = payload.open_url || payload.thread_url || payload.gmail_url;
    if (!payload.opened && openUrl) {
      await openGmail(openUrl, trigger);
      return;
    }
    if (trigger) {
      trigger.textContent = payload.reused ? "Opened Draft" : "Draft Ready";
    }
    setTimeout(loadStatus, 900);
  } catch (error) {
    if (trigger) {
      trigger.disabled = false;
      trigger.textContent = originalText || "Draft Reply";
    }
    const message = error.name === "AbortError" ? "Gmail draft prep timed out. Try Open Gmail or check dashboard server logs." : error.message;
    window.alert(`Could not prepare Gmail draft: ${message}`);
  } finally {
    window.clearTimeout(timeout);
  }
}

async function dismissAction(kind, key, trigger) {
  if (!kind || !key) return;
  const messages = {
    inbound: "Dismiss this inbound lead? This stops dashboard reminders until a new external email arrives in the thread.",
    approval: "Dismiss this approval item? The Gmail draft stays in Drafts, but it leaves the active queue.",
    multichannel: "Dismiss this manual channel action from the active queue?",
    radar: "Dismiss this radar action from the Action Center?",
    permit: "Dismiss this permit action from the Action Center?",
    safety: "Dismiss this safety action from the Action Center?",
    crm_sync: "Dismiss this CRM sync warning from the Action Center? The queued record stays in local state unless it syncs or is cleared separately.",
  };
  if (!window.confirm(messages[kind] || "Dismiss this dashboard action?")) return;

  const originalText = trigger ? trigger.textContent : "";
  if (trigger) {
    trigger.disabled = true;
    trigger.textContent = "Dismissing...";
  }
  try {
    const response = await fetch("/api/dismiss-action", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, key }),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Dismiss failed");
    if (trigger) trigger.textContent = "Dismissed";
    setTimeout(loadStatus, 250);
  } catch (error) {
    if (trigger) {
      trigger.disabled = false;
      trigger.textContent = originalText || "Dismiss";
    }
    window.alert(`Could not dismiss item: ${error.message}`);
  }
}

async function operatorAction(kind, key, action, hours, trigger) {
  if (!kind || !key || !action) return;
  const messages = {
    "inbound:snooze": "Snooze this inbound lead for 24 hours? It will come back unless Colin replies first.",
    "approval:skip": "Skip this approval item? The Gmail draft stays in Drafts.",
    "multichannel:done": "Mark this multichannel action done?",
    "multichannel:snoozed": "Snooze this multichannel action for 72 hours?",
    "multichannel:skipped": "Skip this multichannel action?",
    "system:pause": "Pause this local write path? This updates ~/.openclaw/.env and refreshes the dashboard.",
    "system:resume": "Resume this local write path? This can create Monday records or Gmail drafts, but it does not enable live sending.",
    "crm_sync:retry": "Retry this Monday CRM sync now? This can create or update a Monday item. It will not send email.",
    "crm_sync:clear": "Clear this deferred CRM write? Gmail/thread history stays intact, but this item will no longer retry into Monday.",
  };
  if (!window.confirm(messages[`${kind}:${action}`] || "Update this dashboard action?")) return;

  const originalText = trigger ? trigger.textContent : "";
  if (trigger) {
    trigger.disabled = true;
      trigger.textContent = action === "done" ? "Marking..." : action === "retry" ? "Retrying..." : action === "clear" ? "Clearing..." : action === "skip" || action === "skipped" ? "Skipping..." : "Snoozing...";
  }
  try {
    const response = await fetch("/api/operator-action", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, key, action, hours: Number(hours) || undefined }),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Action failed");
    if (trigger) {
      const blocked = payload.warning && String(payload.warning).includes("Monday circuit open");
      trigger.textContent = payload.status === "snoozed" ? "Snoozed" : payload.status === "skipped" ? "Skipped" : payload.status === "synced" ? "Synced" : payload.status === "cleared" ? "Cleared" : blocked ? "Monday Blocked" : payload.status === "queued" ? "Still Queued" : "Done";
    }
    if (payload.warning) {
      const until = payload.blocked_until ? `\n\nRetry after: ${formatDate(payload.blocked_until)}` : "";
      window.alert(`${payload.warning}${until}`);
    }
    setTimeout(loadStatus, 250);
  } catch (error) {
    if (trigger) {
      trigger.disabled = false;
      trigger.textContent = originalText || "Action";
    }
    window.alert(`Could not update item: ${error.message}`);
  }
}

async function undoAction(eventId, kind, key, action, trigger) {
  if (!kind || !key || !action) return;
  if (!window.confirm("Undo this dashboard action and reopen the item?")) return;
  const originalText = trigger ? trigger.textContent : "";
  if (trigger) {
    trigger.disabled = true;
    trigger.textContent = "Undoing...";
  }
  try {
    const response = await fetch("/api/undo-action", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, kind, key, action }),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error || "Undo failed");
    if (trigger) trigger.textContent = "Undone";
    setTimeout(loadStatus, 250);
  } catch (error) {
    if (trigger) {
      trigger.disabled = false;
      trigger.textContent = originalText || "Undo";
    }
    window.alert(`Could not undo item: ${error.message}`);
  }
}

function renderLogs(data) {
  const logs = data.logs || {};
  const files = logs.files || [];
  $("#logCount").textContent = `${number(files.length)} log file(s)`;
  $("#logs").innerHTML = files
    .map(
      (log) => `
        <article class="log-card ${escapeHtml(log.status)}">
          <header>
            <strong>${escapeHtml(log.name)}</strong>
            ${statusPill(log.status, statusLabel(log.status))}
          </header>
          <div class="log-meta">
            <span>${formatDate(log.modified_at)}</span>
            <span>${formatAge(log.age_hours)}</span>
            <span>rc ${log.last_rc ?? "-"}</span>
          </div>
          <pre>${escapeHtml((log.tail || []).join("\n"))}</pre>
        </article>
      `,
    )
    .join("") || '<div class="empty">No log files found.</div>';
}

function renderStateFiles(data) {
  const files = data.state_files || [];
  $("#stateCount").textContent = `${number(files.length)} tracked file(s)`;
  $("#stateFiles").innerHTML = table(files, [
    { label: "Status", value: (row) => statusPill(row.status, statusLabel(row.status)) },
    { label: "File", value: (row) => `<b>${safeText(row.name, 90)}</b>${row.critical ? "<small>critical</small>" : ""}` },
    { label: "Modified", value: (row) => formatDate(row.modified_at) },
    { label: "Age", value: (row) => formatAge(row.age_hours) },
    { label: "Size", value: (row) => `${number(row.size_bytes)} B` },
  ]);
}

function render(data) {
  state.data = data;
  $("#lastUpdated").textContent = `${formatDate(data.generated_at)} on ${data.host || "local"}`;
  renderSalesAssistant(data);
  renderOverview(data);
  renderOfficeBrief(data);
  renderActionCenter(data);
  renderOperatorActivity(data);
  renderHealth(data);
  renderPipeline(data);
  renderDrafts(data);
  renderCron(data);
  renderAgents(data);
  renderRadarInbound(data);
  renderLogs(data);
  renderStateFiles(data);
}

async function loadStatus() {
  if (state.loading) return;
  state.loading = true;
  $("#refreshBtn").disabled = true;
  try {
    const response = await fetch(`system_status.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch (error) {
    $("#healthPill").className = "pill danger";
    $("#healthPill").textContent = "No data";
    $("#lastUpdated").textContent = "system_status.json unavailable";
    $("#issues").innerHTML = `
      <article class="issue danger">
        <div>${statusPill("danger", "error")}</div>
        <div>
          <strong>Dashboard snapshot unavailable</strong>
          <p>${escapeHtml(error.message)}</p>
          <small>local dashboard</small>
        </div>
      </article>
    `;
  } finally {
    state.loading = false;
    $("#refreshBtn").disabled = false;
  }
}

$("#refreshBtn").addEventListener("click", loadStatus);
document.addEventListener("click", (event) => {
  const closeAccountTarget = event.target.closest("[data-close-account]");
  if (closeAccountTarget) {
    event.preventDefault();
    closeAccountDrawer();
    return;
  }
  const accountTarget = event.target.closest(".account-detail");
  if (accountTarget) {
    event.preventDefault();
    openAccountDetail(accountTarget.dataset.accountKey);
    return;
  }
  const accountActionTarget = event.target.closest(".account-action");
  if (accountActionTarget) {
    event.preventDefault();
    accountAction(
      accountActionTarget.dataset.accountKey || state.accountKey,
      accountActionTarget.dataset.accountAction,
      accountActionTarget.dataset.accountHours,
      accountActionTarget,
    );
    return;
  }
  const previewTarget = event.target.closest(".preview-reply");
  if (previewTarget) {
    event.preventDefault();
    previewReply(previewTarget.dataset.replyKey, previewTarget);
    return;
  }
  const replyTarget = event.target.closest(".prepare-reply");
  if (replyTarget) {
    event.preventDefault();
    prepareReply(replyTarget.dataset.replyKey, replyTarget);
    return;
  }
  const gmailTarget = event.target.closest(".open-gmail");
  if (gmailTarget) {
    event.preventDefault();
    openGmail(gmailTarget.dataset.gmailUrl, gmailTarget);
    return;
  }
  const operatorTarget = event.target.closest(".operator-action");
  if (operatorTarget) {
    event.preventDefault();
    operatorAction(
      operatorTarget.dataset.actionKind,
      operatorTarget.dataset.actionKey,
      operatorTarget.dataset.actionName,
      operatorTarget.dataset.actionHours,
      operatorTarget,
    );
    return;
  }
  const undoTarget = event.target.closest(".undo-action");
  if (undoTarget) {
    event.preventDefault();
    undoAction(
      undoTarget.dataset.eventId,
      undoTarget.dataset.undoKind,
      undoTarget.dataset.undoKey,
      undoTarget.dataset.undoAction,
      undoTarget,
    );
    return;
  }
  const dismissTarget = event.target.closest(".dismiss-action");
  if (dismissTarget) {
    event.preventDefault();
    dismissAction(dismissTarget.dataset.dismissKind, dismissTarget.dataset.dismissKey, dismissTarget);
  }
});
loadStatus();
setInterval(loadStatus, 60_000);
