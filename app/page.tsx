import Link from "next/link";
import { db } from "@/lib/db";
import { fmtUSD, fmtPct, fmtOdds, statusBadge, sportInfo } from "@/lib/fmt";
import { KPI, LineChart, GroupedBarChart, BookCell, SportPill, StatusBadge } from "@/components/ui/design";
import { RefreshButton } from "@/components/RefreshButton";

const LOCAL_USER_EMAIL = "local@paperedge.app";
export const dynamic = "force-dynamic";

// 30-day bankroll series (static sample — replace with DB data when ready)
const BANKROLL_SERIES = (() => {
  const deltas = [12, -8, 18, 22, -14, 6, 28, 11, -6, 19, 14, -22, 8, 31, 17, -3, 9, 25, 12, -11, 18, 7, 24, -9, 16, 14, 22, 11, 19, 28];
  let v = 9500;
  return deltas.map((d, i) => { v += d; return { d: i + 1, v: Math.round(v * 100) / 100 }; });
})();

const DAILY_EVA = [
  { d: "May 05", expected: 24.10, actual: 28.40 },
  { d: "May 06", expected: 31.20, actual: 22.80 },
  { d: "May 07", expected: 18.40, actual: -12.20 },
  { d: "May 08", expected: 27.60, actual: 31.10 },
  { d: "May 09", expected: 35.40, actual: 40.80 },
  { d: "May 10", expected: 22.90, actual: 17.60 },
  { d: "May 11", expected: 26.80, actual: 28.40 },
  { d: "May 12", expected: 31.00, actual: 19.20 },
  { d: "May 13", expected: 28.40, actual: 33.10 },
  { d: "May 14", expected: 24.60, actual: 0 },
  { d: "May 15", expected: 28.00, actual: -15.45 },
  { d: "May 16", expected: 26.80, actual: 130.20 },
  { d: "May 17", expected: 35.40, actual: -22.06 },
  { d: "May 18", expected: 44.40, actual: 0 },
];

export default async function DashboardPage() {
  const user = await db.user.findUniqueOrThrow({ where: { email: LOCAL_USER_EMAIL } });
  const settings = await db.userSettings.findUnique({ where: { userId: user.id } });

  const trades = await db.paperTrade.findMany({
    // Removed trades are excluded from every dashboard stat. revalidatePath("/")
    // in removeTrade() means this re-runs immediately after a removal.
    where: { userId: user.id, status: { not: "replaced_removed" } },
    include: { legs: { include: { book: true } }, result: true },
    orderBy: { tradeDate: "desc" },
  });

  const PENDING_STATUSES = new Set([
    // manual-entry
    "pending_verification", "locked_paper_trade", "locked_paper_trade_upgraded",
    // wizard
    "paper_traded", "pending_result", "locked", "needs", "verified", "ready",
    "unverified", "verifying",
  ]);
  const NEEDS_VERIFICATION_STATUSES = new Set([
    "pending_verification", "pending_result", "needs", "unverified",
  ]);
  const SETTLED_STATUSES = new Set([
    "settled_win", "settled_loss", "settled_push_void",
    "settled_won", "settled_lost", "settled_push", "settled_partial",
    "voided", "mistake", "mistake_invalid",
  ]);

  const pending = trades.filter((t) => PENDING_STATUSES.has(t.status));
  const settled = trades.filter((t) => SETTLED_STATUSES.has(t.status));
  const needsVerification = trades.filter((t) => NEEDS_VERIFICATION_STATUSES.has(t.status));
  const mistakes = trades.filter((t) =>
    t.status === "mistake" || t.status === "mistake_invalid"
  );

  const totalStaked = trades.reduce((s, t) => s + (t.totalStakeExposure ?? 0), 0);
  const exposure = pending.reduce((s, t) => s + (t.totalStakeExposure ?? 0), 0);
  // Use numeric expected fields; worstCasePL is the conservative figure for arb/promo.
  // expectedProfitRange is a free-text string — never sum it.
  const expectedProfit = pending.reduce(
    (s, t) => s + (t.worstCasePL ?? t.expectedProfitIfA ?? 0),
    0
  );
  const actualPL = settled.reduce((s, t) => s + (t.result?.actualProfitLoss ?? 0), 0);
  const settledStaked = settled.reduce((s, t) => s + (t.totalStakeExposure ?? 0), 0);
  const roi = settledStaked > 0 ? (actualPL / settledStaked) * 100 : 0;

  const startingBankroll = settings?.startingBankroll ?? 10000;
  const currentBankroll = settings?.currentBankroll ?? (startingBankroll + actualPL);
  const bankrollPct = startingBankroll > 0 ? ((currentBankroll - startingBankroll) / startingBankroll) * 100 : 0;

  const winsCount = settled.filter((t) => (t.result?.actualProfitLoss ?? 0) > 0).length;
  const lossCount = settled.filter((t) => (t.result?.actualProfitLoss ?? 0) < 0).length;
  const voidedCount = settled.filter((t) => t.status === "voided").length;

  // Today's trades (last 5)
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = trades.filter((t) => t.tradeDate.toISOString().slice(0, 10) === today).slice(0, 8);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })} · Paper account · No live betting</p>
        </div>
        <div className="actions">
          <RefreshButton />
          <a href="/api/export" download className="btn ghost">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>
            Export
          </a>
          <Link href="/trades/new" className="btn primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            Add Paper Trade
          </Link>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid cols-4" style={{ marginBottom: 14 }}>
        <KPI label="Paper Bankroll"   value={fmtUSD(currentBankroll)} delta={`${fmtPct(bankrollPct)} all-time`} up={bankrollPct >= 0} />
        <KPI label="Total Staked"     value={fmtUSD(totalStaked)}     sub={`${trades.length} trades`} />
        <KPI label="Current Exposure" value={fmtUSD(exposure)}        sub={`${pending.length} pending events`} warn={exposure > 0} />
        <KPI label="Expected Profit"  value={fmtUSD(expectedProfit, { sign: true })} up={expectedProfit > 0} />
        <KPI label="Actual P/L"       value={fmtUSD(actualPL, { sign: true })} delta={`${fmtPct(roi)} ROI realized`} up={actualPL >= 0} down={actualPL < 0} />
        <KPI label="Pending Trades"   value={pending.length} sub={`${needsVerification.length} need verification`} />
        <KPI label="Settled Trades"   value={settled.length} sub={`${winsCount}W · ${lossCount}L · ${voidedCount}V`} />
        <KPI label="ROI %"            value={`${roi.toFixed(2)}%`} delta="Target ≥ 1.5%" up={roi >= 1.5} down={roi < 0} />
      </div>

      {/* Warning panel — stale trades */}
      {needsVerification.length > 0 && (
        <div className="card" style={{ marginBottom: 14, borderColor: "var(--warn-bd)" }}>
          <div className="card-head" style={{ background: "var(--warn-bg)" }}>
            <span style={{ color: "var(--warn)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 9v4M12 17h.01"/><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z"/>
              </svg>
            </span>
            <h3 style={{ color: "var(--warn)" }}>Trades Needing Review</h3>
            <span className="sub">{needsVerification.length} trade{needsVerification.length !== 1 ? "s" : ""} · needs verification or settlement</span>
            <div className="right">
              <Link href="/settlement" className="btn warn sm">Review all</Link>
            </div>
          </div>
          <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            {needsVerification.slice(0, 5).map((t) => (
              <div key={t.id} style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr 120px 120px", gap: 12, alignItems: "center", padding: "6px 0" }}>
                <span className="muted num" style={{ fontSize: 11.5 }}>{t.customTradeId ?? t.id.slice(0, 8)}</span>
                <div>
                  <b style={{ fontSize: 13 }}>{t.eventName}</b>
                  <div className="hint">{t.marketType}</div>
                </div>
                <span className="hint">needs re-verification</span>
                <span className="num pos" style={{ fontSize: 12.5 }}>
                  {fmtUSD(t.worstCasePL ?? t.expectedProfitIfA ?? 0, { sign: true })} <span className="muted">exp.</span>
                </span>
                <div style={{ textAlign: "right" }}>
                  <Link href="/settlement" className="btn sm">Review →</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid cols-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-head">
            <h3>Paper Bankroll</h3>
            <span className="sub">last 30 days · sample data</span>
            <div className="right">
              <div className="toggle">
                <button>7D</button>
                <button className="on">30D</button>
                <button>90D</button>
                <button>YTD</button>
              </div>
            </div>
          </div>
          <div className="chart-wrap">
            <LineChart data={BANKROLL_SERIES} color="#22C55E" />
          </div>
          <div className="chart-legend">
            <span><i className="legend-sw" style={{ background: "#22C55E" }} />Bankroll</span>
            <span className="dim">+$421.40 this period · 0 drawdown days &gt; 1%</span>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Daily Expected vs Actual</h3>
            <span className="sub">last 14 days · sample data</span>
            <div className="right"><span className="hint dim">$ profit</span></div>
          </div>
          <div className="chart-wrap">
            <GroupedBarChart data={DAILY_EVA} />
          </div>
          <div className="chart-legend">
            <span><i className="legend-sw" style={{ background: "#3B82F6", opacity: 0.6 }} />Expected</span>
            <span><i className="legend-sw" style={{ background: "#22C55E" }} />Actual (profit)</span>
            <span><i className="legend-sw" style={{ background: "#EF4444" }} />Actual (loss)</span>
          </div>
        </div>
      </div>

      {/* Today's trades table */}
      <div className="card">
        <div className="card-head">
          <h3>Recent Paper Trades</h3>
          <span className="sub">{todayTrades.length} shown</span>
          <div className="right">
            <Link href="/trades" className="btn ghost sm">View all →</Link>
          </div>
        </div>
        {trades.length === 0 ? (
          <div className="card-pad" style={{ color: "var(--fg-3)", textAlign: "center", padding: "40px 16px" }}>
            No trades yet.{" "}
            <Link href="/trades/new" style={{ color: "var(--info)" }}>Add your first paper trade →</Link>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Market</th>
                  <th>Book A</th>
                  <th className="num">Odds A</th>
                  <th className="num">Stake A</th>
                  <th>Book B</th>
                  <th className="num">Odds B</th>
                  <th className="num">Stake B</th>
                  <th className="num">Exp. profit</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(todayTrades.length > 0 ? todayTrades : trades.slice(0, 8)).map((t) => {
                  const legA = t.legs.find((l) => l.legLabel === "A");
                  const legB = t.legs.find((l) => l.legLabel === "B");
                  return (
                    <tr key={t.id}>
                      <td className="muted num">{t.tradeDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</td>
                      <td>
                        <b>{t.eventName}</b>
                        <div className="hint">{t.sport ? <SportPill sport={t.sport} /> : null}</div>
                      </td>
                      <td>
                        {t.marketType}
                        <div className="hint">{t.player ?? t.notes?.slice(0, 40)}</div>
                      </td>
                      <td>{legA ? <BookCell name={legA.book.name} /> : <span className="dim">—</span>}</td>
                      <td className="num">{legA?.oddsAmerican != null ? fmtOdds(legA.oddsAmerican) : "—"}</td>
                      <td className="num">{legA ? fmtUSD(legA.stake) : "—"}</td>
                      <td>{legB ? <BookCell name={legB.book.name} /> : <span className="dim">—</span>}</td>
                      <td className="num">{legB?.oddsAmerican != null ? fmtOdds(legB.oddsAmerican) : "—"}</td>
                      <td className="num">{legB ? fmtUSD(legB.stake) : "—"}</td>
                      <td className="num pos">{fmtUSD(t.worstCasePL ?? t.expectedProfitIfA ?? 0, { sign: true })}</td>
                      <td><StatusBadge status={t.status} /></td>
                      <td className="actions">
                        <Link href={`/trades/${t.id}`} className="btn ghost sm">Open →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
