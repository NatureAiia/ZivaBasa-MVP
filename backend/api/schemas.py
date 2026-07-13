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
