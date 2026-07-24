export function downloadReport(filename, content, mime = "text/markdown") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// For binary responses (the .docx/.pdf/.xlsx reports from /reports/*) — the blob already has
// its content-type from the server, no need to re-wrap it in a new Blob. Every report-download
// call site in the app (Predict, Manager Action Inbox, History, chat Studio) goes through this
// one function, so it's the single hook point for "export first report" onboarding/milestone
// tracking rather than threading that call through each of those components individually.
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  notifyReportExported();
}

// Dynamically imported so report.js (a plain download utility) doesn't take a hard, always-on
// dependency on the onboarding/milestone stores — a failure there should never break an actual
// file download.
async function notifyReportExported() {
  try {
    const [{ markOnboardingStep }, { checkAndFireMilestone, MILESTONES, MILESTONE_COPY }, { emitMilestoneToast }] =
      await Promise.all([import("./onboardingStore"), import("./milestoneStore"), import("../components/common/Toast")]);
    await markOnboardingStep("exported_first_report");
    const justFired = await checkAndFireMilestone(MILESTONES.FIRST_REPORT_EXPORT);
    if (justFired) emitMilestoneToast(MILESTONE_COPY[MILESTONES.FIRST_REPORT_EXPORT]);
  } catch (e) {
    console.error("notifyReportExported failed:", e.message);
  }
}
