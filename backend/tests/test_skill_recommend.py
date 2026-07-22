"""
Integration coverage for POST /skill_match/recommend — the prescriptive skill-gap layer on
top of skill_matching.match_score() (Master Checklist §5, Day 10 item).
"""


def test_recommend_returns_missing_skills_and_resources(client):
    r = client.post(
        "/skill_match/recommend",
        json={
            "current_skills": "teller_ops,customer_service",
            "required_skills": "teller_ops,credit_risk,aml_compliance",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["missing_skills"] == ["credit_risk", "aml_compliance"]
    assert body["missing_skill_count"] == 2
    assert body["skill_overlap_count"] == 1
    recommended = {rec["skill"]: rec["resource"] for rec in body["recommended_training"]}
    assert recommended["credit_risk"] == "Credit Risk Analysis Workshop"
    assert recommended["aml_compliance"] == "AML/CFT Compliance Certification"


def test_recommend_no_gap_when_fully_matched(client):
    r = client.post(
        "/skill_match/recommend",
        json={"current_skills": "teller_ops,credit_risk", "required_skills": "teller_ops"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["missing_skills"] == []
    assert body["recommended_training"] == []


def test_recommend_handles_empty_skills_gracefully(client):
    r = client.post(
        "/skill_match/recommend", json={"current_skills": "", "required_skills": ""}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["missing_skills"] == []
    assert body["cosine_similarity_score"] == 0.0
