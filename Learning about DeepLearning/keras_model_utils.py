# keras_model_utils.py
"""
Utility functions to save/load Keras models and run predictions.
Designed to be imported into other scripts / notebooks.
"""


def save_model_to(path: str, model: tf.keras.Model) -> None:
    """Save a Keras model to the given path (HDF5 or SavedModel)."""
    model.save(path)


def load_keras_model(path: str) -> tf.keras.Model:
    """Load and return a Keras model from path."""
    return load_model(path)


def predict_proba(
    model: tf.keras.Model, x: np.ndarray, batch_size: int = 512
) -> np.ndarray:
    """Return predicted probabilities (1D array) for input sequences x."""
    probs = model.predict(x, batch_size=batch_size)
    return probs.flatten()


def predict_labels(
    model: tf.keras.Model, x: np.ndarray, threshold: float = 0.5, batch_size: int = 512
) -> np.ndarray:
    """Return binary labels (0/1) using given threshold."""
    probs = predict_proba(model, x, batch_size=batch_size)
    return (probs >= threshold).astype(int)


def threshold_for_ratio(
    probs: Iterable[float], desired_neg_pos_ratio: float = 2.0, steps: int = 1000
) -> float:
    """
    Find a threshold in [0,1] such that negatives:positives >= desired_neg_pos_ratio.
    Returns the largest threshold that still satisfies the constraint (so fewer positives).
    """
    probs = np.asarray(probs).flatten()
    n = probs.shape[0]
    best = 0.5
    for thresh in np.linspace(0.0, 1.0, steps + 1):
        preds = (probs >= thresh).astype(int)
        positives = preds.sum()
        negatives = n - positives
        if positives == 0:
            ratio = float("inf")
        else:
            ratio = negatives / positives
        if ratio >= desired_neg_pos_ratio:
            best = thresh
    return float(best)


def decode_review(
    sequence: Iterable[int], index_word: Dict[int, str], ignore_below: int = 3
) -> str:
    """Convert an index sequence into a readable string using index_word mapping.
    ignore_below removes special tokens (e.g. 0,1,2)."""
    return " ".join(
        index_word.get(int(idx), "?") for idx in sequence if int(idx) >= ignore_below
    )


def text_to_sequence(
    text: str,
    word_index: Dict[str, int],
    maxlen: int,
    unk_token: int = 2,
    start_token: int = 1,
    pad_value: int = 0,
) -> np.ndarray:
    """Convert raw text to an integer sequence using the provided word_index and pad to maxlen.
    Splits on whitespace. Does not perform advanced tokenization or lowercasing unless you pre-process text.
    """
    tokens = text.split()
    seq = [start_token] + [word_index.get(t, unk_token) for t in tokens]
    return pad_sequences(
        [seq], maxlen=maxlen, padding="post", truncating="post", value=pad_value
    )[0]


# Example convenience function that combines everything:
def predict_review_text(
    model: tf.keras.Model,
    text: str,
    word_index: Dict[str, int],
    index_word: Dict[int, str],
    maxlen: int,
    threshold: float = 0.5,
) -> Dict[str, object]:
    """Prepare text, run model, and return prob, label and decoded text."""
    seq = text_to_sequence(text, word_index, maxlen)
    prob = predict_proba(model, np.expand_dims(seq, axis=0))[0]
    label = int(prob >= threshold)
    decoded = decode_review(seq, index_word)
    return {
        "probability": float(prob),
        "label": label,
        "decoded": decoded,
        "sequence": seq,
    }
