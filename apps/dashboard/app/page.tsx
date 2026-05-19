import { americanToDecimal, coreWorkspaceStatus, statusGroup } from "@paperedge/core";
import { getDatabaseFilePath } from "@paperedge/database";

export default function DashboardShellPage() {
  return (
    <main className="shell-page">
      <p className="eyebrow">PaperEdge Dashboard</p>
      <h1>Dashboard workspace shell</h1>
      <p>{coreWorkspaceStatus()}</p>
      <dl>
        <dt>Core odds check</dt>
        <dd>{americanToDecimal(-110).toFixed(3)}</dd>
        <dt>Status taxonomy check</dt>
        <dd>{statusGroup("paper_traded")}</dd>
        <dt>Database path</dt>
        <dd>{getDatabaseFilePath()}</dd>
      </dl>
    </main>
  );
}
