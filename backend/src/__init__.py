"""
ZivaBasa MVP (Kaggle-Data Phase) — reusable pipeline package.

    from src import config, features, model, evaluate

See each module's docstring for usage. config.py is the single source of truth for task
definitions, paths, and hyperparameters — features.py, model.py, and evaluate.py all import
from it, which is what keeps them consistent with each other and with the notebooks.
"""

from . import config
from . import features
from . import model
from . import evaluate

__all__ = ["config", "features", "model", "evaluate"]
