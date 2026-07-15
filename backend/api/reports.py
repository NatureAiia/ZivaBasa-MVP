"""
reports.py — Generates real .docx Word documents (python-docx), not markdown pretending to be
one. Two report types:
  - build_predict_report(): the Predict tab's results (single-role predictions + SHAP), as a
    clean narrative document with a chart, not a data dump.
  - build_chat_report(): a chat conversation, cleaned up into readable text (not a raw
    role/text transcript with markdown artifacts), plus a chart of any predictions the
    assistant actually ran as tools during that conversation, if any.

Both write to an in-memory BytesIO buffer (no temp files, no disk writes needed) and return
the buffer's bytes for the endpoint to stream back.
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Optional

import matplotlib
matplotlib.use("Agg")  # headless — this process never opens a display
import matplotlib.pyplot as plt

from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

# ZivaBasa's own gold/teal/red palette, matched to the frontend's Tailwind theme colors, so a
# chart embedded in a report doesn't look like it came from an unrelated tool.
GOLD = "#D4AF37"
TEAL = "#2FBF9F"
RED = "#D1495B"
INK = "#1F2430"

TASK_LABELS = {
    "employment": "Job & Automation Risk",
    "skills": "Employee Turnover Risk",
    "productivity": "AI Impact on Productivity",
    "skill_match": "Job and Skill Matching",
}

# Mirrors the frontend's fieldMeta.js labels (hand-duplicated on purpose — this backend module
# has no reason to import frontend JS, and a shared-taxonomy endpoint wasn't worth building for
# one label map). If you add a feature on either side, update both — same flagged tradeoff as
# skillMatchClient.js mirroring skill_matching.py's ALL_SKILLS.
FEATURE_LABELS = {
    "avg_salary_usd": "Salary",
    "ai_tool_maturity_score": "AI Tool Maturity",
    "task_repetition_level": "Task Repetition",
    "skill_complexity_score": "Skill Complexity",
    "training_hours_needed": "Training Hours Needed",
    "job_demand_index": "Job Demand",
    "percent_tasks_automatable": "% Tasks Automatable",
    "exposure_x_skill_complexity": "Exposure × Skill Complexity",
    "Age": "Age",
    "TrainingTimesLastYear": "Trainings Last Year",
    "YearsAtCompany": "Years at Company",
    "MonthlyIncome": "Monthly Income",
    "JobSatisfaction": "Job Satisfaction",
    "PerformanceRating": "Performance Rating",
    "training_intensity_index": "Training Intensity",
    "training_x_satisfaction": "Training × Satisfaction",
    "skill_gap_index": "Skill Gap",
    "seniority_years": "Seniority",
    "recent_training_hours": "Recent Training Hours",
    "performance_rating": "Performance Rating",
    "recent_ot_hours": "Recent Overtime Hours",
    "skill_overlap_count": "Matching Skills",
    "missing_skill_count": "Skill Gaps",
    "overlap_x_training": "Overlap × Training",
}


def _feature_label(name: str) -> str:
    return FEATURE_LABELS.get(name, name)


def _add_title(doc: Document, text: str, subtitle: Optional[str] = None):
    heading = doc.add_heading(text, level=0)
    heading.alignment = WD_ALIGN_PARAGRAPH.LEFT
    if subtitle:
        p = doc.add_paragraph()
        run = p.add_run(subtitle)
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(0x6B, 0x72, 0x80)
        run.italic = True


def _add_disclaimer(doc: Document, text: str):
    doc.add_paragraph()  # spacer
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor(0x8A, 0x90, 0x9C)
    run.italic = True


def _chart_to_stream(fig) -> io.BytesIO:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf


def _predictions_bar_chart(rows: list[dict]) -> io.BytesIO:
    """rows: [{label, value, kind: 'classification'|'regression'}]"""
    fig, ax = plt.subplots(figsize=(6, max(1.6, 0.6 * len(rows))))
    labels = [r["label"] for r in rows]
    values = [r["value"] for r in rows]
    colors = [TEAL if r["kind"] == "classification" and r["value"] < 0.5 else
              (RED if r["kind"] == "classification" else GOLD) for r in rows]
    ax.barh(labels, values, color=colors)
    ax.set_xlim(0, max(1.0, max(values) * 1.15) if values else 1.0)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_xlabel("Score")
    fig.tight_layout()
    return _chart_to_stream(fig)


def _shap_chart(top_contributions: list[dict]) -> io.BytesIO:
    feats = [_feature_label(c["feature"]) for c in top_contributions][::-1]
    vals = [c["shap_value"] for c in top_contributions][::-1]
    colors = [TEAL if v >= 0 else RED for v in vals]
    fig, ax = plt.subplots(figsize=(6, max(1.6, 0.4 * len(feats))))
    ax.barh(feats, vals, color=colors)
    ax.axvline(0, color=INK, linewidth=0.8)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_title(f"What influenced this result", fontsize=10)
    fig.tight_layout()
    return _chart_to_stream(fig)


def build_predict_report(results: dict) -> bytes:
    """results: { task_name: { predict: {...}, explain: {...} | None } }, same shape the
    frontend's history entries already have — no reshaping needed at the call site."""
    doc = Document()
    _add_title(doc, "ZivaBasa Workforce Intelligence Report",
               f"Generated {datetime.now().strftime('%B %d, %Y at %I:%M %p')}")

    doc.add_paragraph(
        "This report summarizes predictions run on the Predict tab. Each section below covers "
        "one prediction task, in plain language, followed by the factors that most influenced "
        "that specific result."
    )

    chart_rows = []
    for task, r in results.items():
        if not r.get("predict"):
            continue
        p = r["predict"]
        if p["task_type"] == "classification":
            chart_rows.append({"label": TASK_LABELS.get(task, task), "value": p["probability"], "kind": "classification"})
        else:
            chart_rows.append({"label": TASK_LABELS.get(task, task), "value": p["raw_output"], "kind": "regression"})

    if chart_rows:
        doc.add_heading("At a glance", level=1)
        doc.add_picture(_predictions_bar_chart(chart_rows), width=Inches(5.5))

    for task, r in results.items():
        label = TASK_LABELS.get(task, task)
        doc.add_heading(label, level=1)
        p = r.get("predict")
        if not p:
            doc.add_paragraph("Not run for this input.")
            continue

        if p["task_type"] == "classification":
            flagged = p["label"] == 1
            sentence = (
                f"This role was flagged for {label.lower()} "
                f"(estimated likelihood: {p['probability'] * 100:.1f}%)."
                if flagged else
                f"This role was not flagged for {label.lower()} "
                f"(estimated likelihood: {p['probability'] * 100:.1f}%)."
            )
        else:
            sentence = f"Predicted score: {p['raw_output']:.3f} (standardized — 0 is an average result, positive is above average, negative is below)."
        doc.add_paragraph(sentence)

        explain = r.get("explain")
        if explain and explain.get("top_contributions"):
            doc.add_paragraph("What influenced this result most:", style="Intense Quote")
            doc.add_picture(_shap_chart(explain["top_contributions"][:6]), width=Inches(5.5))
            doc.add_paragraph(
                "Teal bars pushed the result up, red bars pushed it down — a longer bar means "
                "a bigger effect on this specific prediction."
            )

    _add_disclaimer(
        doc,
        "This is a prototype report built on Kaggle proxy / synthetic training data, not real "
        "company data. Treat every number here as illustrative, not a verified business "
        "finding. Explanations are local and associational (what mattered for this one "
        "prediction), not a claim about cause and effect."
    )

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.getvalue()


def _clean_chat_text(text: str) -> str:
    """Strips markdown clutter (##, **, bullet dashes) so the doc reads as prose, not a
    markdown file with the wrong extension — this is the whole point of this being a real
    Word doc instead of the old markdown-in-a-.md-file report."""
    import re
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"^[-*]\s+", "• ", text, flags=re.MULTILINE)
    return text.strip()


def build_chat_report(messages: list[dict], tool_calls: list[dict]) -> bytes:
    """messages: [{role, text}]. tool_calls: [{name, args, result}] — every predict_task/
    explain_task call made anywhere in the conversation, in order, so the report can show what
    was actually predicted rather than just the free-text back-and-forth."""
    doc = Document()
    _add_title(doc, "ZivaBasa Chat Report",
               f"Generated {datetime.now().strftime('%B %d, %Y at %I:%M %p')}")

    doc.add_paragraph(
        f"A record of this conversation with the ZivaBasa assistant "
        f"({len(messages)} message{'s' if len(messages) != 1 else ''})."
    )

    predict_calls = [tc for tc in tool_calls if tc["name"] == "predict_task" and "error" not in tc.get("result", {})]
    if predict_calls:
        doc.add_heading("Predictions made in this conversation", level=1)
        rows = []
        for tc in predict_calls:
            res = tc["result"]
            label = TASK_LABELS.get(res.get("task", ""), res.get("task", "?"))
            if res.get("task_type") == "classification":
                rows.append({"label": label, "value": res.get("probability", 0), "kind": "classification"})
            else:
                rows.append({"label": label, "value": res.get("raw_output", 0), "kind": "regression"})
        if rows:
            doc.add_picture(_predictions_bar_chart(rows), width=Inches(5.5))

    doc.add_heading("Conversation", level=1)
    for m in messages:
        speaker = "You" if m["role"] == "user" else "ZivaBasa Assistant"
        p = doc.add_paragraph()
        run = p.add_run(f"{speaker}: ")
        run.bold = True
        run.font.color.rgb = RGBColor(0xD4, 0xAF, 0x37) if m["role"] == "user" else RGBColor(0x2F, 0xBF, 0x9F)
        doc.add_paragraph(_clean_chat_text(m.get("text", "")))

    _add_disclaimer(
        doc,
        "This is a record of an AI chat conversation from a prototype system trained on Kaggle "
        "proxy / synthetic data. Any predictions shown reflect the same limitations as the "
        "Predict tab — not verified business findings."
    )

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.getvalue()
