import { americanToDecimal, coreWorkspaceStatus, statusGroup } from "@paperedge/core";
import { getDatabaseFilePath } from "@paperedge/database";

export default function VerifierShellPage() {
  return (
    <main className="shell-page">
      <p className="eyebrow">PaperEdge Verifier</p>
      <h1>Verifier workspace shell</h1>
      <p>{coreWorkspaceStatus()}</p>
      <dl>
        <dt>Core odds check</dt>
        <dd>{americanToDecimal(125).toFixed(3)}</dd>
        <dt>Status taxonomy check</dt>
        <dd>{statusGroup("pending_verification")}</dd>
        <dt>Database path</dt>
        <dd>{getDatabaseFilePath()}</dd>
      </dl>
    </main>
  );
}
