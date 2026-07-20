"""No real Anthropic/Gemini vision keys assumed present — see test_chat.py's docstring for why
these monkeypatch the module's constants directly rather than os.environ."""
from api import org_extract as org_extract_module


def test_org_extract_providers_empty_without_keys(client, monkeypatch):
    monkeypatch.setattr(org_extract_module, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(org_extract_module, "GEMINI_API_KEY", None)
    r = client.get("/organization/extract/providers")
    assert r.status_code == 200
    assert r.json()["providers"] == []


def test_org_extract_503_without_keys(client, monkeypatch):
    monkeypatch.setattr(org_extract_module, "ANTHROPIC_API_KEY", None)
    monkeypatch.setattr(org_extract_module, "GEMINI_API_KEY", None)
    r = client.post(
        "/organization/extract",
        files={"file": ("chart.png", b"not a real png but content-type is what's checked", "image/png")},
    )
    assert r.status_code == 503


def test_org_extract_unsupported_media_type_422(client):
    r = client.post(
        "/organization/extract",
        files={"file": ("chart.svg", b"<svg></svg>", "image/svg+xml")},
    )
    assert r.status_code == 422
