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
    forecast: List[ForecastPoint]
