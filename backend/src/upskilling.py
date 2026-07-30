"""
upskilling.py — Course-catalog recommendations tied to a prediction's top SHAP-contributing
features, split into a free tier (static curated catalog, always shown) and a paid tier (premium
catalog entries, gated by the existing token-spend system in api/tokens.py rather than a new
subscription/billing system — no Stripe/billing integration exists anywhere in this repo, so
token-spend stays the only monetization mechanism).

CATALOG SCOPE NOTE: there is no live API/partnership with Coursera, IBM SkillsBuild, Cisco
Networking Academy, or atingi — every catalog URL below is a stable provider search/catalog page
(e.g. a Coursera search-results URL), never a specific named course URL this repo can't verify
still resolves. Treat CATALOG as an illustrative curated map, the same "static taxonomy, not a
live LMS integration" framing skill_matching.py already uses for SKILL_TRAINING_RESOURCES.

LAYERING NOTE: this module is pure data/lookup logic (catalog, topic map, matching), living in
src/ alongside skill_matching.py/causal_xai.py, with no dependency on api/ — this project's
convention is api/ imports from src/, never the reverse (verified: no other src/ module imports
from api/). The AI-generated micro-lesson + board-verification pieces (which DO need llm_gateway
and provider HTTP calls) live in api/upskilling_ai.py instead, for exactly that reason.
"""
from __future__ import annotations

from typing import Dict, List

from . import skill_matching


# --------------------------------------------------------------------------- #
# 1. Feature name -> topic tag map (real feature names from config.py's TASK_CONFIGS /
#    features.py's engineered-feature builders — not invented names)
# --------------------------------------------------------------------------- #
FEATURE_TOPIC_TAGS: Dict[str, List[str]] = {
    # employment
    "ai_tool_maturity_score": ["ai-literacy", "digital-skills"],
    "task_repetition_level": ["automation-resilience", "productivity"],
    "skill_complexity_score": ["digital-skills", "data-skills"],
    "training_hours_needed": ["automation-resilience"],
    "job_demand_index": ["automation-resilience", "leadership"],
    "percent_tasks_automatable": ["automation-resilience", "ai-literacy"],
    # skills
    "TrainingTimesLastYear": ["retention-engagement", "productivity"],
    "YearsAtCompany": ["retention-engagement"],
    "MonthlyIncome": ["retention-engagement"],
    "JobSatisfaction": ["retention-engagement", "leadership"],
    "PerformanceRating": ["productivity", "leadership"],
    "training_intensity_index": ["retention-engagement"],
    "training_x_satisfaction": ["retention-engagement"],
    # productivity
    "ai_adoption_level": ["ai-literacy", "productivity"],
    "skill_gap_index": ["digital-skills", "data-skills"],
    "salary_change_percent": ["productivity"],
    "salary_change_real": ["productivity"],
    "ai_adoption_index": ["ai-literacy"],
    # skill_match (task-level features; per-skill-tag topics are in SKILL_TAG_TOPICS below)
    "cosine_similarity_score": ["credit-risk-banking-skills", "digital-skills"],
    "skill_overlap_count": ["credit-risk-banking-skills"],
    "missing_skill_count": ["credit-risk-banking-skills"],
    "overlap_x_training": ["credit-risk-banking-skills"],
    "recent_training_hours": ["credit-risk-banking-skills", "retention-engagement"],
    # human_capital
    "tenure_years": ["retention-engagement"],
    "EngagementSurvey": ["retention-engagement"],
    "EmpSatisfaction": ["retention-engagement"],
    "PerformanceScore": ["productivity", "leadership"],
    "PayRate": ["retention-engagement"],
    "DaysLateLast30": ["retention-engagement"],
    "SpecialProjectsCount": ["leadership", "productivity"],
}

# Reuses skill_matching.py's ALL_SKILLS taxonomy directly rather than re-declaring it — a
# skill_match SHAP top-feature list can itself include a skill tag (e.g. "cybersecurity") when
# per-skill signal is modeled, not just the task-level features above.
SKILL_TAG_TOPICS: Dict[str, List[str]] = {
    tag: ["credit-risk-banking-skills", tag] for tag in skill_matching.ALL_SKILLS
}


def topics_for_features(task: str, feature_names: List[str]) -> List[str]:
    """Ordered, de-duplicated topic tags for the given top SHAP feature names. Unknown feature
    names are skipped, not errored on — SHAP feature lists evolve independently of this map."""
    topics: List[str] = []
    for name in feature_names:
        for tag in FEATURE_TOPIC_TAGS.get(name, SKILL_TAG_TOPICS.get(name, [])):
            if tag not in topics:
                topics.append(tag)
    return topics


# --------------------------------------------------------------------------- #
# 2. Static curated catalog — see module docstring's CATALOG SCOPE NOTE. Every url is a stable
#    provider search/catalog page, never a specific named course this repo can't verify.
# --------------------------------------------------------------------------- #
CATALOG: List[dict] = [
    {"id": "coursera-ai-literacy", "title": "AI literacy courses (Coursera search)", "provider": "Coursera",
     "url": "https://www.coursera.org/search?query=AI%20literacy", "format": "course", "tier": "free",
     "topics": ["ai-literacy"]},
    {"id": "ibm-skillsbuild-ai", "title": "AI Foundations (IBM SkillsBuild)", "provider": "IBM SkillsBuild",
     "url": "https://skillsbuild.org/", "format": "course", "tier": "free", "topics": ["ai-literacy", "digital-skills"]},
    {"id": "coursera-automation-resilience", "title": "Future-proofing your role against automation (Coursera search)",
     "provider": "Coursera", "url": "https://www.coursera.org/search?query=automation%20resilience%20reskilling",
     "format": "course", "tier": "paid", "topics": ["automation-resilience"]},
    {"id": "atingi-digital-skills", "title": "Digital skills courses (atingi)", "provider": "atingi",
     "url": "https://www.atingi.org/", "format": "course", "tier": "free", "topics": ["digital-skills", "automation-resilience"]},
    {"id": "freecodecamp-data-skills", "title": "Data analysis curriculum (freeCodeCamp)", "provider": "freeCodeCamp",
     "url": "https://www.freecodecamp.org/learn", "format": "course", "tier": "free", "topics": ["data-skills", "digital-skills"]},
    {"id": "coursera-data-skills", "title": "Data analytics courses (Coursera search)", "provider": "Coursera",
     "url": "https://www.coursera.org/search?query=data%20analytics", "format": "course", "tier": "paid",
     "topics": ["data-skills"]},
    {"id": "cisco-netacad-cyber", "title": "Cybersecurity courses (Cisco Networking Academy)", "provider": "Cisco Networking Academy",
     "url": "https://www.netacad.com/courses", "format": "course", "tier": "free", "topics": ["cybersecurity", "credit-risk-banking-skills"]},
    {"id": "cisco-netacad-it", "title": "IT support courses (Cisco Networking Academy)", "provider": "Cisco Networking Academy",
     "url": "https://www.netacad.com/courses", "format": "course", "tier": "free", "topics": ["it_support", "credit-risk-banking-skills", "digital-skills"]},
    {"id": "coursera-leadership", "title": "People leadership & management (Coursera search)", "provider": "Coursera",
     "url": "https://www.coursera.org/search?query=people%20management%20leadership", "format": "course", "tier": "paid",
     "topics": ["leadership"]},
    {"id": "atingi-leadership", "title": "Leadership & soft skills (atingi)", "provider": "atingi",
     "url": "https://www.atingi.org/", "format": "course", "tier": "free", "topics": ["leadership"]},
    {"id": "coursera-productivity", "title": "Workplace productivity courses (Coursera search)", "provider": "Coursera",
     "url": "https://www.coursera.org/search?query=workplace%20productivity", "format": "course", "tier": "free",
     "topics": ["productivity"]},
    {"id": "ibm-skillsbuild-productivity", "title": "Productivity with AI tools (IBM SkillsBuild)", "provider": "IBM SkillsBuild",
     "url": "https://skillsbuild.org/", "format": "course", "tier": "paid", "topics": ["productivity", "ai-literacy"]},
    {"id": "coursera-retention", "title": "Employee engagement courses (Coursera search)", "provider": "Coursera",
     "url": "https://www.coursera.org/search?query=employee%20engagement", "format": "course", "tier": "free",
     "topics": ["retention-engagement"]},
    {"id": "atingi-retention", "title": "Career development & motivation (atingi)", "provider": "atingi",
     "url": "https://www.atingi.org/", "format": "video", "tier": "free", "topics": ["retention-engagement"]},
    {"id": "coursera-banking", "title": "Banking & financial services skills (Coursera search)", "provider": "Coursera",
     "url": "https://www.coursera.org/search?query=banking%20financial%20services", "format": "course", "tier": "paid",
     "topics": ["credit-risk-banking-skills"]},
    {"id": "ibm-skillsbuild-banking", "title": "Financial services foundations (IBM SkillsBuild)", "provider": "IBM SkillsBuild",
     "url": "https://skillsbuild.org/", "format": "course", "tier": "free", "topics": ["credit-risk-banking-skills"]},
    {"id": "coursera-wealth-management", "title": "Wealth & investment advisory (Coursera search)", "provider": "Coursera",
     "url": "https://www.coursera.org/search?query=wealth%20management%20advisory", "format": "course", "tier": "paid",
     "topics": ["credit-risk-banking-skills", "wealth_management"]},
]


def recommend_courses(task: str, feature_names: List[str]) -> dict:
    """Matches catalog entries by topic-tag overlap against the given task's top SHAP feature
    names, ranked by overlap count desc then catalog order (deterministic). Returns free-tier
    matches always; paid-tier matches separately (caller decides whether to actually show them,
    per the token gate)."""
    topics = topics_for_features(task, feature_names)
    topic_set = set(topics)

    def overlap(entry: dict) -> int:
        return len(topic_set & set(entry["topics"]))

    scored = [(overlap(e), i, e) for i, e in enumerate(CATALOG) if overlap(e) > 0]
    scored.sort(key=lambda t: (-t[0], t[1]))
    ranked = [e for _, _, e in scored]

    return {
        "topics": topics,
        "free": [e for e in ranked if e["tier"] == "free"],
        "paid": [e for e in ranked if e["tier"] == "paid"],
    }
