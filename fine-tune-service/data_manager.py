"""
Data manager for loading and formatting training data.

This module handles downloading training data from GCS, loading datasets,
and formatting them for training with support for multiple input formats.
"""

import json
import logging
from pathlib import Path
from typing import Dict

from datasets import load_dataset, Dataset, DatasetDict
from transformers import AutoTokenizer

from .storage import GCSStorageManager

logger = logging.getLogger(__name__)


class DataManager:
    """Manager for training data loading and formatting."""

    def __init__(
        self,
        storage_manager: GCSStorageManager,
        local_data_dir: Path,
    ):
        """
        Initialize data manager.

        Args:
            storage_manager: GCS storage manager instance
            local_data_dir: Local directory for caching data
        """
        self.storage = storage_manager
        self.local_data_dir = local_data_dir

        self.local_data_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Initialized data manager with cache dir: {local_data_dir}")

    def load_training_data(
        self,
        training_data_path: str,
        tokenizer: AutoTokenizer,
        test_split_ratio: float = 0.1,
        seed: int = 42,
    ) -> DatasetDict:
        """
        Load and prepare training data from GCS with train/test split.

        Args:
            training_data_path: GCS path to training data (JSONL format)
            tokenizer: Tokenizer for formatting chat messages
            test_split_ratio: Ratio of data to use for testing (default: 0.1)
            seed: Random seed for train/test split (default: 42)

        Returns:
            DatasetDict with 'train' and 'test' splits

        Raises:
            ValueError: If dataset format is not supported
        """
        logger.info("Loading training data...")

        # Download training data
        local_data_file = self._download_training_data(training_data_path)

        # Load dataset
        dataset = load_dataset("json", data_files=str(local_data_file), split="train")
        logger.info(f"Loaded {len(dataset)} training examples")

        # Format dataset
        formatted_dataset = self._format_dataset(dataset, tokenizer)

        # Split into train and test
        logger.info(f"Splitting dataset (test_size={test_split_ratio})...")
        dataset_splits = formatted_dataset.train_test_split(
            test_size=test_split_ratio, seed=seed
        )

        logger.info(f"Train examples: {len(dataset_splits['train'])}")
        logger.info(f"Test examples: {len(dataset_splits['test'])}")

        return dataset_splits

    def _download_training_data(self, training_data_path: str) -> Path:
        """
        Download training data from GCS.

        Args:
            training_data_path: GCS path to training data

        Returns:
            Path to downloaded file
        """
        local_data_file = self.local_data_dir / "training_data.jsonl"
        actual_file_path = self.storage.download_file(training_data_path, local_data_file)
        logger.info(f"Downloaded training data to: {actual_file_path}")
        return actual_file_path

    def _format_dataset(
        self, dataset: Dataset, tokenizer: AutoTokenizer
    ) -> Dataset:
        """
        Format dataset to extract text from different formats.

        Supports the following formats:
        - {"text": "..."}
        - {"messages": [...]}  # Chat format
        - {"instruction": "...", "output": "..."}
        - {"input": "...", "output": "..."}

        Args:
            dataset: Raw dataset
            tokenizer: Tokenizer for chat template

        Returns:
            Formatted dataset with 'text' field
        """
        logger.info("Formatting dataset...")

        def format_text(examples):
            """Format examples to text field for SFTTrainer."""
            texts = []

            # Handle different formats
            if "text" in examples:
                texts = examples["text"]
            elif "messages" in examples:
                texts = self._format_chat_messages(examples["messages"], tokenizer)
            elif "instruction" in examples:
                texts = self._format_instruction(examples)
            elif "input" in examples and "output" in examples:
                texts = self._format_input_output(examples)
            else:
                raise ValueError(
                    "Dataset must have 'text', 'messages', 'instruction', "
                    "or 'input'/'output' fields"
                )

            return {"text": texts}

        formatted_dataset = dataset.map(
            format_text,
            batched=True,
            remove_columns=dataset.column_names,
            desc="Formatting",
        )

        return formatted_dataset

    def _format_chat_messages(
        self, messages_list, tokenizer: AutoTokenizer
    ) -> list[str]:
        """
        Format chat messages using tokenizer's chat template.

        Args:
            messages_list: List of message arrays
            tokenizer: Tokenizer with chat template

        Returns:
            List of formatted text strings
        """
        texts = []
        for messages in messages_list:
            if isinstance(messages, str):
                messages = json.loads(messages)

            # Apply chat template
            text = tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=False,
            )
            texts.append(text)
        return texts

    def _format_instruction(self, examples: dict) -> list[str]:
        """
        Format instruction-following examples.

        Args:
            examples: Dictionary with 'instruction' and 'output' keys

        Returns:
            List of formatted text strings
        """
        texts = []
        for i in range(len(examples["instruction"])):
            instruction = examples["instruction"][i]
            output = examples.get("output", [""])[i]
            text = f"Instruction: {instruction}\n\nResponse: {output}"
            texts.append(text)
        return texts

    def _format_input_output(self, examples: dict) -> list[str]:
        """
        Format input-output examples.

        Args:
            examples: Dictionary with 'input' and 'output' keys

        Returns:
            List of formatted text strings
        """
        texts = []
        for i in range(len(examples["input"])):
            input_text = examples["input"][i]
            output_text = examples["output"][i]
            text = f"{input_text}\n{output_text}"
            texts.append(text)
        return texts
