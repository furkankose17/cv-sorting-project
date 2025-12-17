"""
In-memory LRU cache for embeddings.

Caches computed embeddings to avoid redundant model inference
for repeated texts. Uses MD5 hash for cache keys.
"""

import hashlib
import logging
from typing import Optional, Dict
from collections import OrderedDict
import numpy as np

logger = logging.getLogger(__name__)


class EmbeddingCache:
    """
    LRU cache for text embeddings to avoid recomputation.

    Thread-safe for read operations. Uses OrderedDict for LRU eviction.

    Attributes:
        maxsize: Maximum number of cached embeddings
        hits: Number of cache hits
        misses: Number of cache misses
    """

    def __init__(self, maxsize: int = 1000):
        """
        Initialize embedding cache.

        Args:
            maxsize: Maximum number of embeddings to cache (default: 1000)
        """
        self.maxsize = maxsize
        self._cache: OrderedDict[str, np.ndarray] = OrderedDict()
        self.hits = 0
        self.misses = 0

    def _hash_text(self, text: str, prefix: str = "") -> str:
        """
        Create hash key for text.

        Args:
            text: Text to hash
            prefix: Optional prefix for key (e.g., "q:" for query, "d:" for document)

        Returns:
            Hash key string
        """
        text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
        return f"{prefix}{text_hash}" if prefix else text_hash

    def get(self, text: str, is_query: bool = False) -> Optional[np.ndarray]:
        """
        Get cached embedding if exists.

        Args:
            text: Original text
            is_query: Whether this is a query embedding (uses different prefix)

        Returns:
            Cached embedding array or None if not found
        """
        prefix = "q:" if is_query else "d:"
        key = self._hash_text(text, prefix)

        if key in self._cache:
            self.hits += 1
            # Move to end (most recently used)
            self._cache.move_to_end(key)
            logger.debug(f"Cache hit for {prefix}text (hits={self.hits})")
            return self._cache[key].copy()

        self.misses += 1
        return None

    def set(self, text: str, embedding: np.ndarray, is_query: bool = False) -> None:
        """
        Cache an embedding.

        Args:
            text: Original text
            embedding: Embedding vector to cache
            is_query: Whether this is a query embedding
        """
        prefix = "q:" if is_query else "d:"
        key = self._hash_text(text, prefix)

        # Evict oldest if at capacity
        while len(self._cache) >= self.maxsize:
            oldest_key, _ = self._cache.popitem(last=False)
            logger.debug(f"Evicted oldest cache entry: {oldest_key[:20]}...")

        self._cache[key] = embedding.copy()
        logger.debug(f"Cached embedding for {prefix}text (size={len(self._cache)})")

    def get_or_compute(
        self,
        text: str,
        compute_fn,
        is_query: bool = False
    ) -> np.ndarray:
        """
        Get cached embedding or compute and cache it.

        Args:
            text: Text to embed
            compute_fn: Function to compute embedding if not cached
            is_query: Whether this is a query embedding

        Returns:
            Embedding array (from cache or newly computed)
        """
        cached = self.get(text, is_query)
        if cached is not None:
            return cached

        # Compute and cache
        embedding = compute_fn(text)
        self.set(text, embedding, is_query)
        return embedding

    def clear(self) -> None:
        """Clear all cached embeddings."""
        self._cache.clear()
        self.hits = 0
        self.misses = 0
        logger.info("Embedding cache cleared")

    def remove(self, text: str, is_query: bool = False) -> bool:
        """
        Remove a specific entry from cache.

        Args:
            text: Text whose embedding to remove
            is_query: Whether this is a query embedding

        Returns:
            True if removed, False if not found
        """
        prefix = "q:" if is_query else "d:"
        key = self._hash_text(text, prefix)

        if key in self._cache:
            del self._cache[key]
            return True
        return False

    @property
    def size(self) -> int:
        """Current number of cached embeddings."""
        return len(self._cache)

    @property
    def hit_rate(self) -> float:
        """Cache hit rate (0.0 to 1.0)."""
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0

    def stats(self) -> Dict[str, any]:
        """
        Get cache statistics.

        Returns:
            Dict with size, maxsize, hits, misses, hit_rate
        """
        return {
            "size": self.size,
            "maxsize": self.maxsize,
            "hits": self.hits,
            "misses": self.misses,
            "hit_rate": f"{self.hit_rate:.2%}",
            "utilization": f"{self.size / self.maxsize:.2%}"
        }


# Global cache instance
embedding_cache = EmbeddingCache(maxsize=1000)


def get_embedding_cache() -> EmbeddingCache:
    """Get the global embedding cache instance."""
    return embedding_cache
