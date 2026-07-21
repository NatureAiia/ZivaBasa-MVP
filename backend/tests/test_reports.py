"""
Integration coverage for the /reports/* endpoints (Word + PDF, predict + chat) — the actual
document generation logic (chart building, markdown walking) is exercised more thoroughly at
the unit level in reports.py's own docstrings/design; this suite just confirms the HTTP layer
wires request -> bytes -> correct content-type/magic-bytes for all four combinations.
"""

_DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
_PDF_MEDIA_TYPE = "application/pdf"
_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_PREDICT_RESULTS = {
    "employment": {
        "predict": {"task_type": "classification", "probability": 0.72, "label": 1},
        "explain": {
            "top_contributions": [
                {"feature": "avg_salary_usd", "value": 45000.0, "shap_value": 0.12},
                {"feature": "ai_tool_maturity_score", "value": 3.2, "shap_value": -0.08},
            ]
        },
    },
    "productivity": {
        "predict": {"task_type": "regression", "raw_output": 0.31},
        "explain": None,
    },
    "skills": {"predict": None, "explain": None},
}

_CHAT_MESSAGES = [
    {"role": "user", "text": "Can you check employment risk for this role?"},
    {"role": "assistant", "text": "Sure — **running the prediction now**."},
]
_CHAT_TOOL_CALLS = [
    {
        "name": "predict_task",
        "args": {"task": "employment"},
        "result": {"task": "employment", "task_type": "classification", "probability": 0.72},
    }
]


def test_predict_report_docx(client):
    r = client.post("/reports/predict", json={"results": _PREDICT_RESULTS})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == _DOCX_MEDIA_TYPE
    assert r.content[:2] == b"PK"


def test_predict_report_pdf(client):
    r = client.post("/reports/predict/pdf", json={"results": _PREDICT_RESULTS})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == _PDF_MEDIA_TYPE
    assert r.content[:4] == b"%PDF"


def test_chat_report_docx(client):
    r = client.post(
        "/reports/chat", json={"messages": _CHAT_MESSAGES, "tool_calls": _CHAT_TOOL_CALLS}
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == _DOCX_MEDIA_TYPE
    assert r.content[:2] == b"PK"


def test_chat_report_pdf(client):
    r = client.post(
        "/reports/chat/pdf", json={"messages": _CHAT_MESSAGES, "tool_calls": _CHAT_TOOL_CALLS}
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == _PDF_MEDIA_TYPE
    assert r.content[:4] == b"%PDF"


def test_chat_report_with_no_messages_still_generates(client):
    """Edge case: an empty conversation shouldn't 500 — reports.py builds a valid (if sparse)
    document either way."""
    r = client.post("/reports/chat/pdf", json={"messages": [], "tool_calls": []})
    assert r.status_code == 200, r.text
    assert r.content[:4] == b"%PDF"


def test_predict_report_xlsx(client):
    r = client.post("/reports/predict/xlsx", json={"results": _PREDICT_RESULTS})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == _XLSX_MEDIA_TYPE
    assert r.content[:2] == b"PK"  # xlsx is a zip container, same magic bytes as docx


def test_chat_report_xlsx(client):
    r = client.post(
        "/reports/chat/xlsx", json={"messages": _CHAT_MESSAGES, "tool_calls": _CHAT_TOOL_CALLS}
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == _XLSX_MEDIA_TYPE
    assert r.content[:2] == b"PK"


def test_chat_report_xlsx_with_no_messages_still_generates(client):
    r = client.post("/reports/chat/xlsx", json={"messages": [], "tool_calls": []})
    assert r.status_code == 200, r.text
    assert r.content[:2] == b"PK"
