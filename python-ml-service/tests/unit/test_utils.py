"""Unit tests for utility modules."""

import pytest
import numpy as np

from app.utils.cache import EmbeddingCache
from app.utils.vcap import get_postgres_credentials, is_cf_environment


class TestEmbeddingCache:
    """Tests for EmbeddingCache class."""

    def test_cache_set_and_get(self):
        """Test basic cache set and get operations."""
        cache = EmbeddingCache(maxsize=10)
        embedding = np.random.randn(384).astype(np.float32)

        cache.set("test text", embedding)
        result = cache.get("test text")

        assert result is not None
        np.testing.assert_array_almost_equal(result, embedding)

    def test_cache_miss_returns_none(self):
        """Test cache miss returns None."""
        cache = EmbeddingCache(maxsize=10)

        result = cache.get("nonexistent text")

        assert result is None

    def test_cache_eviction_lru(self):
        """Test LRU eviction when cache is full."""
        cache = EmbeddingCache(maxsize=3)

        # Fill cache
        for i in range(3):
            cache.set(f"text{i}", np.random.randn(384).astype(np.float32))

        # Access text0 to make it recently used
        cache.get("text0")

        # Add new item, should evict text1 (least recently used)
        cache.set("text3", np.random.randn(384).astype(np.float32))

        assert cache.get("text0") is not None  # Still in cache
        assert cache.get("text1") is None  # Evicted
        assert cache.get("text2") is not None  # Still in cache
        assert cache.get("text3") is not None  # Newly added

    def test_cache_query_vs_document(self):
        """Test separate caching for query and document embeddings."""
        cache = EmbeddingCache(maxsize=10)
        text = "same text"

        doc_embedding = np.ones(384, dtype=np.float32)
        query_embedding = np.ones(384, dtype=np.float32) * 2

        cache.set(text, doc_embedding, is_query=False)
        cache.set(text, query_embedding, is_query=True)

        doc_result = cache.get(text, is_query=False)
        query_result = cache.get(text, is_query=True)

        np.testing.assert_array_equal(doc_result, doc_embedding)
        np.testing.assert_array_equal(query_result, query_embedding)

    def test_cache_stats(self):
        """Test cache statistics."""
        cache = EmbeddingCache(maxsize=10)

        # Generate some hits and misses
        cache.set("text1", np.random.randn(384).astype(np.float32))
        cache.get("text1")  # Hit
        cache.get("text1")  # Hit
        cache.get("nonexistent")  # Miss

        stats = cache.stats()

        assert stats["hits"] == 2
        assert stats["misses"] == 1
        assert stats["size"] == 1

    def test_cache_clear(self):
        """Test cache clear operation."""
        cache = EmbeddingCache(maxsize=10)
        cache.set("text1", np.random.randn(384).astype(np.float32))
        cache.set("text2", np.random.randn(384).astype(np.float32))

        cache.clear()

        assert cache.size == 0
        assert cache.get("text1") is None


class TestVCAPParser:
    """Tests for VCAP_SERVICES parser."""

    def test_get_postgres_credentials_from_vcap(self, mock_vcap_services):
        """Test extracting PostgreSQL credentials from VCAP_SERVICES."""
        creds = get_postgres_credentials()

        assert creds is not None
        assert creds["host"] == "test-db.example.com"
        assert creds["port"] == 5432
        assert creds["database"] == "test_cv_sorting"
        assert creds["username"] == "test_user"
        assert creds["password"] == "test_pass"
        assert creds["ssl"] is True

    def test_get_postgres_credentials_no_vcap(self, clean_environment):
        """Test returns None when VCAP_SERVICES not set."""
        creds = get_postgres_credentials()

        assert creds is None

    def test_is_cf_environment_true(self, mock_vcap_services):
        """Test CF environment detection when VCAP_SERVICES set."""
        assert is_cf_environment() is True

    def test_is_cf_environment_false(self, clean_environment):
        """Test CF environment detection when not in CF."""
        assert is_cf_environment() is False
