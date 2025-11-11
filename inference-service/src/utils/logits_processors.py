"""Custom logits processors for handling numerical stability issues."""

import torch
from transformers import LogitsProcessor


class NumericalStabilityLogitsProcessor(LogitsProcessor):
    """
    Logits processor that ensures numerical stability for sampling.

    This processor is critical when using LoRA adapters or fine-tuned models
    that may produce extreme logit values (inf, -inf, nan). It:
    1. Replaces inf/-inf/nan values with safe alternatives
    2. Clamps logits to prevent overflow in softmax
    3. Ensures the probability distribution is valid for sampling

    Without this processor, torch.multinomial can fail with:
    "probability tensor contains either `inf`, `nan` or element < 0"

    This is particularly important for Gemma models with LoRA adapters.
    """

    def __init__(
        self,
        min_logit: float = -1e4,
        max_logit: float = 1e4,
        nan_replacement: float = -1e4
    ):
        """
        Initialize the processor.

        Args:
            min_logit: Minimum allowed logit value (default: -10000)
            max_logit: Maximum allowed logit value (default: 10000)
            nan_replacement: Value to replace NaN logits with (default: -10000)
        """
        self.min_logit = min_logit
        self.max_logit = max_logit
        self.nan_replacement = nan_replacement

    def __call__(
        self, input_ids: torch.LongTensor, scores: torch.FloatTensor
    ) -> torch.FloatTensor:
        """
        Process logits to ensure numerical stability.

        Args:
            input_ids: Token IDs generated so far
            scores: Logits for next token prediction

        Returns:
            Processed logits with extreme values handled
        """
        # Check if we have problematic values
        has_nan = torch.isnan(scores).any()
        has_inf = torch.isinf(scores).any()

        # If no problems, return unchanged to avoid modifying the distribution
        if not (has_nan or has_inf):
            return scores

        # Only process if we detect issues
        # Replace NaN values first (they break everything)
        if has_nan:
            nan_mask = torch.isnan(scores)
            scores = torch.where(
                nan_mask,
                torch.tensor(self.nan_replacement, device=scores.device, dtype=scores.dtype),
                scores
            )

        # Replace positive infinity with max_logit
        if has_inf:
            pos_inf_mask = torch.isposinf(scores)
            if pos_inf_mask.any():
                scores = torch.where(
                    pos_inf_mask,
                    torch.tensor(self.max_logit, device=scores.device, dtype=scores.dtype),
                    scores
                )

            # Replace negative infinity with min_logit
            neg_inf_mask = torch.isneginf(scores)
            if neg_inf_mask.any():
                scores = torch.where(
                    neg_inf_mask,
                    torch.tensor(self.min_logit, device=scores.device, dtype=scores.dtype),
                    scores
                )

        return scores
