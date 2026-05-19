const API_BASE = "http://localhost:3000";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "FETCH_ACTIVE_TRADE") {
    fetch(`${API_BASE}/api/trades/active-verification`)
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, trade: data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  if (msg.type === "VERIFY_LEG") {
    fetch(`${API_BASE}/api/trades/${msg.tradeId}/verify-leg`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.payload),
    })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === "DETECT_BOOK") {
    sendResponse({ book: detectBookFromUrl(sender.tab?.url || "") });
    return false;
  }
});

function detectBookFromUrl(url) {
  if (url.includes("novig.us")) return "Novig";
  if (url.includes("getfliff.com")) return "Fliff";
  if (url.includes("sportzino.com")) return "Sportzino";
  if (url.includes("kalshi.com")) return "Kalshi";
  if (url.includes("thescore.com")) return "theScore";
  return null;
}
