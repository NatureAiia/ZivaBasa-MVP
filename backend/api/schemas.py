"""
schemas.py — Request/response models for the ZivaBasa prototype API.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    features: List[float] = Field(
        ..., description="Feature vector in the exact order returned by GET /schema/{task}"
    )


class PredictResponse(BaseModel):
    task: str
    task_type: str
    raw_output: float
    label: Optional[int] = None          # thresholded 0/1, classification only
    probability: Optional[float] = None  # same as raw_output for classification, kept explicit


class SchemaResponse(BaseModel):
    task: str
    task_type: str
    input_dim: int
    feature_names: List[str]


class FeatureContribution(BaseModel):
    feature: str
    value: float
    shap_value: float


class ExplainResponse(BaseModel):
    task: str
    base_value: float
    prediction: float
    top_contributions: List[FeatureContribution]
    explainer_used: str


class HealthResponse(BaseModel):
    status: str
    tasks_loaded: List[str]


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    provider: Optional[str] = None  # explicit choice from the frontend's model picker; None = auto-detect
    user_id: Optional[str] = None  # POST /chat/agent only — scopes Chiedza's Supabase context
                                    # tools (org chart, predict history, batch results) to this
                                    # user; ignored by plain POST /chat.


class ChatModelInfo(BaseModel):
    provider: str
    model: str
    label: str
    description: str
    supports_tools: bool
    key_present: bool


class ChatResponse(BaseModel):
    reply: str
    provider: str
    usage: Optional[dict] = None
    tool_calls: Optional[list] = None
    generated_images: Optional[list] = None  # [{id, mime_type, image_base64}], from the generate_image tool
    fallback_chain: Optional[list] = None  # [{provider, outcome}] — which providers the LLM
                                            # gateway tried this request and why (api/llm_gateway.py)


class ImageGenerateRequest(BaseModel):
    prompt: str = Field(..., description="A clear, detailed description of the image to generate.")


class ImageGenerateResponse(BaseModel):
    provider: str
    mime_type: str
    image_base64: str
    text: Optional[str] = None


class PredictReportRequest(BaseModel):
    results: dict  # { task_name: {predict: {...}, explain: {...}|None} } — same shape the
                    # frontend's history entries already have
    extra_notes: Optional[dict] = None  # { task_name: markdown_text } — freeform narrative
                                          # appended after that task's SHAP section (e.g. a
                                          # cost-of-inaction figure or causal/uplift lever
                                          # estimate from Manager Action Inbox's export button)


class ChatReportMessage(BaseModel):
    role: str
    text: str


class ChatReportRequest(BaseModel):
    messages: List[ChatReportMessage]
    tool_calls: list = []


class SkillGapRequest(BaseModel):
    current_skills: str = Field(..., description="Comma-separated skill tags the staff member currently has.")
    required_skills: str = Field(..., description="Comma-separated skill tags the target role requires.")


class SkillTrainingRecommendation(BaseModel):
    skill: str
    resource: str


class SkillGapResponse(BaseModel):
    cosine_similarity_score: float
    skill_overlap_count: int
    missing_skill_count: int
    missing_skills: List[str]
    recommended_training: List[SkillTrainingRecommendation]


class UpliftResponse(BaseModel):
    task: str
    treatment_feature: str
    estimated_effect_per_unit: float
    effect_interval_90pct: List[float]
    statistically_significant_90pct: bool
    interpretation: str


class FederatedSimulateRequest(BaseModel):
    task: str = "skills"
    num_institutions: int = Field(3, ge=2, le=5)
    num_rounds: int = Field(5, ge=1, le=10)


class FederatedRound(BaseModel):
    round: int
    val_loss: float
    val_metric: float


class FederatedSimulationResponse(BaseModel):
    task: str
    num_institutions: int
    num_rounds: int
    institution_ids: List[str]
    round_history: List[FederatedRound]
    final_federated_val_loss: float
    final_federated_val_metric: float
    centralized_val_loss: float
    centralized_val_metric: float
    SIMULATED: bool
    simulation_note: str


class ForecastSchemaResponse(BaseModel):
    industries: List[str]
    metrics: List[str]
    last_year: int
    default_horizon: int
    max_horizon: int


class ForecastPoint(BaseModel):
    year: int
    values: dict  # {metric_name: value}


class ForecastResponse(BaseModel):
    industry: str
    metrics: List[str]
    history: List[ForecastPoint]
    forecast: List[ForecastPoint]  # each forecast point's `values` includes "{metric}_lower"/
                                    # "{metric}_upper" alongside the point estimate — see
                                    # confidence_level/uncertainty_method for what they mean
    confidence_level: float = 0.90
    uncertainty_method: str = ""
