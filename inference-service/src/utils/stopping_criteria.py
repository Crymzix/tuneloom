"""Custom stopping criteria for text generation."""

from typing import List
import torch
from transformers import StoppingCriteria


class StopOnTokens(StoppingCriteria):
    """Custom stopping criteria that stops generation when specific token sequences are encountered."""

    def __init__(self, stop_token_ids: List[List[int]], prompt_length: int):
        """
        Initialize the stopping criteria.

        Args:
            stop_token_ids: List of token ID sequences to stop on
            prompt_length: Length of the prompt tokens (to skip checking the prompt)
        """
        self.stop_token_ids = stop_token_ids
        self.prompt_length = prompt_length

    def __call__(self, input_ids: torch.LongTensor, scores: torch.FloatTensor, **kwargs) -> bool:
        """
        Check if any stop sequence appears in the generated tokens.

        Args:
            input_ids: Generated token IDs
            scores: Token scores
            **kwargs: Additional arguments

        Returns:
            True if generation should stop, False otherwise
        """
        # Only check the newly generated tokens (skip the prompt)
        generated_ids = input_ids[0, self.prompt_length :]

        # Check each stop sequence
        for stop_ids in self.stop_token_ids:
            stop_len = len(stop_ids)
            if len(generated_ids) >= stop_len:
                # Check if the last N tokens match the stop sequence
                if generated_ids[-stop_len:].tolist() == stop_ids:
                    return True

        return False
