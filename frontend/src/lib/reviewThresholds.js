/*
  Centralized "is this prediction confident enough to skip human review?" thresholds, shared by
  every call site that creates a review_queue item (AdvancedPredict.jsx for classification,
  the forecast view for forecasts) so they can't drift apart.
*/

// Classification: probability near the 0.5 decision boundary is where the model is least sure.
// A margin of 0.1 flags anything in [0.4, 0.6].
export const CLASSIFICATION_MARGIN = 0.1;

export function isLowConfidenceClassification(probability) {
  if (probability == null) return false;
  return Math.abs(probability - 0.5) <= CLASSIFICATION_MARGIN;
}

// Forecast: confidence_level below this cutoff gets queued for review.
export const FORECAST_CONFIDENCE_CUTOFF = 0.6;

export function isLowConfidenceForecast(confidenceLevel) {
  if (confidenceLevel == null) return false;
  return confidenceLevel < FORECAST_CONFIDENCE_CUTOFF;
}
