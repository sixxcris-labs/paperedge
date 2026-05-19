(function () {
  "use strict";

  const book = detectBook(window.location.hostname);
  if (!book) return;

  // Don't inject twice if navigating within the SPA
  if (document.getElementById("paperedge-overlay")) return;

  chrome.runtime.sendMessage({ type: "FETCH_ACTIVE_TRADE" }, (response) => {
    if (!response?.ok || !response.trade) return;
    injectOverlay(response.trade, book);
  });

  function detectBook(host) {
    if (host.includes("novig.us")) return "Novig";
    if (host.includes("getfliff.com")) return "Fliff";
    if (host.includes("sportzino.com")) return "Sportzino";
    if (host.includes("kalshi.com")) return "Kalshi";
    if (host.includes("thescore.com")) return "theScore";
    return null;
  }

  function injectOverlay(trade, book) {
    const leg = trade.legs && trade.legs.find((l) => l.book && l.book.name === book);
    if (!leg) return;

    const root = document.createElement("div");
    root.id = "paperedge-overlay";
    root.innerHTML = `
      <div class="pe-header">
        <span class="pe-title">PaperEdge</span>
        <button class="pe-close" id="pe-close" aria-label="Close">×</button>
      </div>
      <div class="pe-body">
        <div class="pe-trade-info">
          <div class="pe-row"><span class="pe-label">Event</span><span>${esc(trade.eventName)}</span></div>
          <div class="pe-row"><span class="pe-label">Market</span><span>${esc(trade.marketType)} / ${esc(trade.gamePeriod)}</span></div>
          <div class="pe-row"><span class="pe-label">Side</span><span><strong>${esc(leg.side)}</strong></span></div>
          <div class="pe-row"><span class="pe-label">Expected odds</span><span><strong>${fmtOdds(leg.oddsAmerican)}</strong></span></div>
          ${leg.lineValue != null ? `<div class="pe-row"><span class="pe-label">Expected line</span><span><strong>${leg.lineValue}</strong></span></div>` : ""}
          <div class="pe-row"><span class="pe-label">Stake</span><span>$${Number(leg.stake).toFixed(2)}</span></div>
        </div>

        <div class="pe-verify">
          <label class="pe-field">
            <span>Observed odds</span>
            <input type="number" id="pe-observed-odds" placeholder="${fmtOdds(leg.oddsAmerican)}" />
          </label>
          ${leg.lineValue != null ? `
          <label class="pe-field">
            <span>Observed line</span>
            <input type="number" step="0.5" id="pe-observed-line" placeholder="${leg.lineValue}" />
          </label>
          ` : ""}
          <label class="pe-field">
            <span>Notes (optional)</span>
            <input type="text" id="pe-notes" placeholder="" />
          </label>

          <div class="pe-buttons">
            <button class="pe-btn pe-btn-verify" id="pe-btn-verified">✓ Verified</button>
            <button class="pe-btn pe-btn-warn" id="pe-btn-odds">Odds moved</button>
            <button class="pe-btn pe-btn-warn" id="pe-btn-line">Line moved</button>
            <button class="pe-btn pe-btn-fail" id="pe-btn-missing">Not available</button>
          </div>

          <div class="pe-status" id="pe-status"></div>
        </div>

        <div class="pe-copy">
          <button class="pe-btn pe-btn-ghost" id="pe-copy-name">Copy "${esc(leg.side)}" to clipboard</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);
    wireOverlay(trade, leg);
  }

  function wireOverlay(trade, leg) {
    document.getElementById("pe-close").onclick = () => {
      document.getElementById("paperedge-overlay")?.remove();
    };

    document.getElementById("pe-copy-name").onclick = async () => {
      try {
        await navigator.clipboard.writeText(leg.side);
        flashStatus("Copied to clipboard — paste into search.");
      } catch {
        flashStatus("Clipboard access denied. Copy: " + leg.side);
      }
    };

    const submit = (status) => {
      const oddsEl = document.getElementById("pe-observed-odds");
      const lineEl = document.getElementById("pe-observed-line");
      const notesEl = document.getElementById("pe-notes");

      const payload = {
        legId: leg.id,
        status,
        observedOddsAmerican: oddsEl?.value ? parseInt(oddsEl.value, 10) : null,
        observedLineValue: lineEl?.value ? parseFloat(lineEl.value) : null,
        notes: notesEl?.value || null,
      };

      chrome.runtime.sendMessage(
        { type: "VERIFY_LEG", tradeId: trade.id, payload },
        (resp) => {
          if (resp?.ok) {
            flashStatus(`Saved as "${status.replace(/_/g, " ")}". You can close this tab.`);
          } else {
            flashStatus("Save failed — is PaperEdge running at localhost:3000?", true);
          }
        }
      );
    };

    document.getElementById("pe-btn-verified").onclick = () => submit("verified");
    document.getElementById("pe-btn-odds").onclick = () => submit("odds_moved");
    document.getElementById("pe-btn-line").onclick = () => submit("line_moved");
    document.getElementById("pe-btn-missing").onclick = () => submit("market_unavailable");
  }

  function flashStatus(msg, isError = false) {
    const el = document.getElementById("pe-status");
    if (!el) return;
    el.textContent = msg;
    el.className = "pe-status " + (isError ? "pe-error" : "pe-success");
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  }

  function fmtOdds(n) {
    return Number(n) > 0 ? `+${n}` : String(n);
  }
})();
