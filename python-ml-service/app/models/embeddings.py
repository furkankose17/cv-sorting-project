"""
Embedding Model for CV Sorting ML Service.
Uses Sentence Transformers with multilingual-e5-small for text embeddings.
Supports 100+ languages including English, German, Turkish, French, Spanish.
"""

import logging
import os
from typing import List, Union, Optional
import numpy as np

logger = logging.getLogger(__name__)

# Default model - multilingual-e5-small for multilingual support
DEFAULT_MODEL = "intfloat/multilingual-e5-small"


class EmbeddingModel:
    """
    Wrapper for Sentence Transformers embedding model.
    Provides methods for generating and comparing text embeddings.

    Uses multilingual-e5-small by default for:
    - 100+ language support (EN, DE, TR, FR, ES, etc.)
    - CPU-optimized inference (118M params)
    - 384 dimensions (compatible with pgvector)
    """

    # E5 models require specific prefixes for optimal performance
    E5_QUERY_PREFIX = "query: "
    E5_PASSAGE_PREFIX = "passage: "

    def __init__(
        self,
        model_name: Optional[str] = None,
        normalize: bool = True,
        device: Optional[str] = None,
        max_length: int = 512
    ):
        """
        Initialize the embedding model.

        Args:
            model_name: Name of the Sentence Transformer model to use
                        (defaults to EMBEDDING_MODEL env var or multilingual-e5-small)
            normalize: Whether to normalize embeddings (for cosine similarity)
            device: Device to use ('cpu', 'cuda', or None for auto-detect)
            max_length: Maximum sequence length for encoding
        """
        from sentence_transformers import SentenceTransformer

        # Get model name from env var or use default
        self.model_name = model_name or os.getenv("EMBEDDING_MODEL", DEFAULT_MODEL)
        self.normalize = normalize
        self.max_length = max_length
        self._is_e5_model = "e5" in self.model_name.lower()

        logger.info(f"Loading Sentence Transformer model: {self.model_name}")
        if self._is_e5_model:
            logger.info("E5 model detected - will use query/passage prefixes")

        self.model = SentenceTransformer(self.model_name, device=device)
        self.dimension = self.model.get_sentence_embedding_dimension()
        logger.info(f"Model loaded. Embedding dimension: {self.dimension}")

    def encode(
        self,
        texts: Union[str, List[str]],
        batch_size: int = 32,
        show_progress: bool = False,
        is_query: bool = False
    ) -> np.ndarray:
        """
        Generate embeddings for text(s).

        For E5 models, use is_query=True when encoding search queries,
        and is_query=False (default) when encoding documents/passages.

        Args:
            texts: Single text or list of texts to encode
            batch_size: Batch size for encoding
            show_progress: Whether to show progress bar
            is_query: If True, prepend "query: " prefix (for E5 models)
                      If False, prepend "passage: " prefix (for E5 models)

        Returns:
            numpy array of embeddings with shape (n_texts, dimension)
        """
        if isinstance(texts, str):
            texts = [texts]

        # Handle empty input
        if not texts:
            return np.array([]).reshape(0, self.dimension)

        # Clean texts
        texts = [self._preprocess_text(t) for t in texts]

        # Add E5 prefix if using E5 model
        if self._is_e5_model:
            prefix = self.E5_QUERY_PREFIX if is_query else self.E5_PASSAGE_PREFIX
            texts = [prefix + t for t in texts]

        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=self.normalize,
            show_progress_bar=show_progress,
            convert_to_numpy=True
        )

        return embeddings

    def encode_single(self, text: str, is_query: bool = False) -> np.ndarray:
        """
        Generate embedding for a single text.

        Args:
            text: Text to encode
            is_query: If True, treat as search query (for E5 models)

        Returns:
            1D numpy array of embedding
        """
        embeddings = self.encode([text], is_query=is_query)
        return embeddings[0]

    def encode_query(self, query: str) -> np.ndarray:
        """
        Encode a search query. Uses "query: " prefix for E5 models.

        Args:
            query: Search query text

        Returns:
            1D numpy array of embedding
        """
        return self.encode_single(query, is_query=True)

    def encode_document(self, document: str) -> np.ndarray:
        """
        Encode a document/passage. Uses "passage: " prefix for E5 models.

        Args:
            document: Document text to encode

        Returns:
            1D numpy array of embedding
        """
        return self.encode_single(document, is_query=False)

    def encode_documents(
        self,
        documents: List[str],
        batch_size: int = 32,
        show_progress: bool = False
    ) -> np.ndarray:
        """
        Encode multiple documents/passages.

        Args:
            documents: List of document texts
            batch_size: Batch size for encoding
            show_progress: Whether to show progress bar

        Returns:
            2D numpy array of embeddings
        """
        return self.encode(documents, batch_size=batch_size, show_progress=show_progress, is_query=False)

    def compute_similarity(
        self,
        embedding1: np.ndarray,
        embedding2: np.ndarray
    ) -> float:
        """
        Compute cosine similarity between two embeddings.

        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector

        Returns:
            Cosine similarity score (0-1 if normalized)
        """
        # Ensure 1D arrays
        e1 = embedding1.flatten()
        e2 = embedding2.flatten()

        # Compute dot product (equals cosine similarity if normalized)
        if self.normalize:
            return float(np.dot(e1, e2))
        else:
            # Compute full cosine similarity
            norm1 = np.linalg.norm(e1)
            norm2 = np.linalg.norm(e2)
            if norm1 == 0 or norm2 == 0:
                return 0.0
            return float(np.dot(e1, e2) / (norm1 * norm2))

    def batch_similarity(
        self,
        query_embedding: np.ndarray,
        corpus_embeddings: np.ndarray
    ) -> np.ndarray:
        """
        Compute similarities between a query and corpus of embeddings.

        Args:
            query_embedding: Query embedding (1D array)
            corpus_embeddings: Corpus embeddings (2D array: n_docs x dimension)

        Returns:
            Array of similarity scores
        """
        query = query_embedding.flatten()

        if self.normalize:
            # For normalized vectors, dot product equals cosine similarity
            similarities = np.dot(corpus_embeddings, query)
        else:
            # Compute full cosine similarity
            query_norm = np.linalg.norm(query)
            corpus_norms = np.linalg.norm(corpus_embeddings, axis=1)
            similarities = np.dot(corpus_embeddings, query) / (corpus_norms * query_norm + 1e-8)

        return similarities

    def find_most_similar(
        self,
        query_embedding: np.ndarray,
        corpus_embeddings: np.ndarray,
        corpus_ids: List[str],
        top_k: int = 10,
        min_similarity: float = 0.0
    ) -> List[dict]:
        """
        Find most similar documents in corpus.

        Args:
            query_embedding: Query embedding
            corpus_embeddings: Corpus embeddings
            corpus_ids: IDs corresponding to corpus embeddings
            top_k: Number of top results to return
            min_similarity: Minimum similarity threshold

        Returns:
            List of dicts with id and similarity score
        """
        similarities = self.batch_similarity(query_embedding, corpus_embeddings)

        # Get indices sorted by similarity (descending)
        sorted_indices = np.argsort(similarities)[::-1]

        results = []
        for idx in sorted_indices[:top_k]:
            similarity = float(similarities[idx])
            if similarity >= min_similarity:
                results.append({
                    "id": corpus_ids[idx],
                    "similarity": round(similarity, 5)
                })

        return results

    def combine_embeddings(
        self,
        embeddings: List[np.ndarray],
        weights: Optional[List[float]] = None
    ) -> np.ndarray:
        """
        Combine multiple embeddings into one using weighted average.

        Args:
            embeddings: List of embeddings to combine
            weights: Optional weights for each embedding

        Returns:
            Combined embedding
        """
        if not embeddings:
            return np.zeros(self.dimension)

        embeddings_array = np.array([e.flatten() for e in embeddings])

        if weights is None:
            weights = [1.0 / len(embeddings)] * len(embeddings)
        else:
            # Normalize weights
            total = sum(weights)
            weights = [w / total for w in weights]

        # Weighted average
        combined = np.average(embeddings_array, axis=0, weights=weights)

        # Re-normalize if needed
        if self.normalize:
            norm = np.linalg.norm(combined)
            if norm > 0:
                combined = combined / norm

        return combined

    def _preprocess_text(self, text: str) -> str:
        """
        Preprocess text before encoding.

        Args:
            text: Input text

        Returns:
            Cleaned text
        """
        if not text:
            return ""

        # Basic cleaning
        text = text.strip()

        # Remove excessive whitespace
        text = " ".join(text.split())

        # Truncate very long texts (model has max length)
        max_length = 512  # tokens, roughly 2000 chars
        if len(text) > 8000:
            text = text[:8000]

        return text

    def to_list(self, embedding: np.ndarray) -> List[float]:
        """
        Convert embedding to list for JSON serialization.

        Args:
            embedding: Embedding array

        Returns:
            List of floats
        """
        return embedding.flatten().tolist()

    def from_list(self, embedding_list: List[float]) -> np.ndarray:
        """
        Convert list back to numpy array.

        Args:
            embedding_list: List of floats

        Returns:
            Numpy array
        """
        return np.array(embedding_list, dtype=np.float32)

    def get_model_info(self) -> dict:
        """
        Get information about the loaded model.

        Returns:
            Dict with model information
        """
        return {
            "model_name": self.model_name,
            "dimension": self.dimension,
            "normalize": self.normalize,
            "max_length": self.max_length,
            "is_e5_model": self._is_e5_model,
            "multilingual": self._is_multilingual(),
            "supported_languages": self._get_supported_languages()
        }

    def _is_multilingual(self) -> bool:
        """Check if the model is multilingual."""
        multilingual_indicators = ["multilingual", "e5", "muse", "labse", "xlm"]
        model_lower = self.model_name.lower()
        return any(indicator in model_lower for indicator in multilingual_indicators)

    def _get_supported_languages(self) -> List[str]:
        """Get list of supported languages for the model."""
        if self._is_multilingual():
            # E5-small supports 100+ languages
            return [
                "en", "de", "tr", "fr", "es", "it", "pt", "nl", "pl", "ru",
                "zh", "ja", "ko", "ar", "hi", "th", "vi", "id", "ms", "and 90+ more"
            ]
        else:
            return ["en"]
