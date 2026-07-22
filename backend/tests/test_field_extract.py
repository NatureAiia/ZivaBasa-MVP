"""Mirrors test_org_extract.py's structure/convention — no real vision keys assumed present,
monkeypatch the module's constants directly rather than os.environ (same reasoning as
test_chat.py's docstring)."""
from api import field_extract as field_extract_module


def test_field_extract_providers_empty_without_keys(client, monkeypatch):
    monkeypatch.setattr(field_extract_module, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(field_extract_module, "GEMINI_API_KEY", None)
    r = client.get("/extract/task-fields/providers")
    assert r.status_code == 200
    assert r.json()["providers"] == []


def test_field_extract_503_without_keys(client, monkeypatch):
    monkeypatch.setattr(field_extract_module, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(field_extract_module, "GEMINI_API_KEY", None)
    r = client.post(
        "/extract/task-fields/employment",
        files={"file": ("payslip.png", b"not a real png but content-type is what's checked", "image/png")},
    )
    assert r.status_code == 503


def test_field_extract_unsupported_media_type_422(client):
    r = client.post(
        "/extract/task-fields/employment",
        files={"file": ("payslip.svg", b"<svg></svg>", "image/svg+xml")},
    )
    assert r.status_code == 422


def test_field_extract_unknown_task_404(client, monkeypatch):
    monkeypatch.setattr(field_extract_module, "ANTHROPIC_API_KEY", "fake-key")
    r = client.post(
        "/extract/task-fields/not_a_real_task",
        files={"file": ("payslip.png", b"fake bytes", "image/png")},
    )
    assert r.status_code == 404


def test_field_extract_success_mocked_provider(client, monkeypatch):
    monkeypatch.setattr(field_extract_module, "ANTHROPIC_API_KEY", "fake-key")
    monkeypatch.setattr(field_extract_module, "GEMINI_API_KEY", None)

    feature_names = client.get("/schema/employment").json()["feature_names"]

    async def _fake_extract(file_bytes, media_type, names, provider=None):
        # Only "find" the first field, leave the rest unmatched — exercises the honest
        # partial-extraction path, not a suspiciously-perfect mock.
        return {
            "provider": "anthropic",
            "features": {names[0]: 42.0},
            "unmatched": names[1:],
            "notes": "Could not read the rest of the document clearly.",
        }

    monkeypatch.setattr(field_extract_module, "extract_task_fields", _fake_extract)
    r = client.post(
        "/extract/task-fields/employment",
        files={"file": ("payslip.png", b"fake bytes", "image/png")},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["task"] == "employment"
    assert body["features"][feature_names[0]] == 42.0
    assert set(body["unmatched"]) == set(feature_names[1:])
    assert body["notes"]
