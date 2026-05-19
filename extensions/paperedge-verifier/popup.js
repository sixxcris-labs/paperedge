chrome.runtime.sendMessage({ type: "FETCH_ACTIVE_TRADE" }, (resp) => {
  const el = document.getElementById("status");

  if (chrome.runtime.lastError || !resp) {
    el.className = "status err";
    el.textContent = "Extension error. Try reloading the extension.";
    return;
  }

  if (!resp.ok) {
    el.className = "status warn";
    el.textContent = "Can't reach PaperEdge at localhost:3000. Make sure the app is running.";
    return;
  }

  if (!resp.trade) {
    el.className = "status warn";
    el.textContent = "No active trade. Click \"Start verification\" on a trade in PaperEdge first.";
    return;
  }

  el.className = "status ok";
  el.textContent = "Verifying: " + resp.trade.eventName;
});
