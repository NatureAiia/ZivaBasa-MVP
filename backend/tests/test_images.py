"""No real Gemini key assumed present — see test_chat.py's docstring for why these
monkeypatch the module's constants directly rather than os.environ."""
from api import image_gen as image_gen_module


def test_image_providers_empty_without_key(client, monkeypatch):
    monkeypatch.setattr(image_gen_module, "GEMINI_API_KEY", None)
    r = client.get("/images/providers")
    assert r.status_code == 200
    assert r.json()["providers"] == []


def test_image_generate_503_without_key(client, monkeypatch):
    monkeypatch.setattr(image_gen_module, "GEMINI_API_KEY", None)
    r = client.post("/images/generate", json={"prompt": "a friendly robot waving"})
    assert r.status_code == 503


def test_image_generate_missing_prompt_422(client):
    r = client.post("/images/generate", json={})
    assert r.status_code == 422
