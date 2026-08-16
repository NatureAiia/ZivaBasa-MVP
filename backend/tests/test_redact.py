"""
test_redact.py — coverage for api/redact.py's field-level masking, and its wiring into
POST /predict/batch/{task} (now viewer-reachable — see main.py — with masking for a resolved
viewer-role caller).
"""
from __future__ import annotations

from api import redact
from api import supabase_auth


def test_redact_rows_noop_when_role_none():
    rows = [{"avg_salary_usd": 45000.0, "job_demand_index": 0.7}]
    out = redact.redact_rows(rows, role=None)
    assert out[0]["avg_salary_usd"] == 45000.0


def test_redact_rows_noop_for_admin():
    rows = [{"avg_salary_usd": 45000.0}]
    out = redact.redact_rows(rows, role="admin")
    assert out[0]["avg_salary_usd"] == 45000.0


def test_redact_rows_noop_for_superadmin():
    rows = [{"avg_salary_usd": 45000.0}]
    out = redact.redact_rows(rows, role="superadmin")
    assert out[0]["avg_salary_usd"] == 45000.0


def test_redact_rows_masks_for_viewer():
    rows = [{"avg_salary_usd": 45000.0, "job_demand_index": 0.7}]
    out = redact.redact_rows(rows, role="viewer")
    assert out[0]["avg_salary_usd"] == redact.REDACTED
    assert out[0]["job_demand_index"] == 0.7  # non-sensitive field untouched


def test_redact_rows_does_not_mutate_input():
    rows = [{"avg_salary_usd": 45000.0}]
    redact.redact_rows(rows, role="viewer")
    assert rows[0]["avg_salary_usd"] == 45000.0


def test_batch_predict_now_reachable_by_viewer(client, monkeypatch):
    """/predict/batch/{task} was admin-only; it's now viewer-reachable (with masking applied
    for viewer role) so a non-admin account can actually run/see roster-style batch analyses."""
    monkeypatch.setenv("ZIVABASA_API_KEYS", "viewkey:viewer")
    feature_names = client.get(
        "/schema/employment", headers={"Authorization": "Bearer viewkey"}
    ).json()["feature_names"]
    header = ",".join(feature_names)
    row = ",".join("1.0" for _ in feature_names)
    csv_bytes = f"{header}\n{row}\n".encode()

    r = client.post(
        "/predict/batch/employment",
        files={"file": ("upload.csv", csv_bytes, "text/csv")},
        headers={"Authorization": "Bearer viewkey"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["rows"][0]["avg_salary_usd"] == "REDACTED"


def test_batch_predict_admin_sees_real_values(client, monkeypatch):
    monkeypatch.setenv("ZIVABASA_API_KEYS", "adminkey:admin")
    feature_names = client.get(
        "/schema/employment", headers={"Authorization": "Bearer adminkey"}
    ).json()["feature_names"]
    header = ",".join(feature_names)
    row = ",".join("1.0" for _ in feature_names)
    csv_bytes = f"{header}\n{row}\n".encode()

    r = client.post(
        "/predict/batch/employment",
        files={"file": ("upload.csv", csv_bytes, "text/csv")},
        headers={"Authorization": "Bearer adminkey"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["rows"][0]["avg_salary_usd"] == 1.0
