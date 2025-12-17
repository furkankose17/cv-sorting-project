"""
Retry utilities for resilient operations.

Provides async retry decorator with exponential backoff for handling
transient failures in network calls, database operations, etc.
"""

import asyncio
import logging
from functools import wraps
from typing import Type, Tuple, Callable, Any, Optional

logger = logging.getLogger(__name__)


def async_retry(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    max_delay: float = 60.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,),
    on_retry: Optional[Callable[[Exception, int], None]] = None
):
    """
    Async retry decorator with exponential backoff.

    Args:
        max_attempts: Maximum number of retry attempts (default: 3)
        delay: Initial delay between retries in seconds (default: 1.0)
        backoff: Multiplier for delay after each retry (default: 2.0)
        max_delay: Maximum delay cap in seconds (default: 60.0)
        exceptions: Tuple of exceptions to catch and retry (default: all)
        on_retry: Optional callback(exception, attempt) on each retry

    Returns:
        Decorated async function with retry logic

    Usage:
        @async_retry(max_attempts=3, delay=1.0, exceptions=(ConnectionError, TimeoutError))
        async def fetch_data():
            # ... code that might fail transiently
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            current_delay = delay
            last_exception = None

            for attempt in range(1, max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e

                    if attempt < max_attempts:
                        logger.warning(
                            f"{func.__name__} failed (attempt {attempt}/{max_attempts}): {e}. "
                            f"Retrying in {current_delay:.1f}s..."
                        )

                        if on_retry:
                            on_retry(e, attempt)

                        await asyncio.sleep(current_delay)
                        current_delay = min(current_delay * backoff, max_delay)
                    else:
                        logger.error(
                            f"{func.__name__} failed after {max_attempts} attempts: {e}"
                        )

            raise last_exception

        return wrapper
    return decorator


def retry_with_backoff(
    max_attempts: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    max_delay: float = 60.0,
    exceptions: Tuple[Type[Exception], ...] = (Exception,)
):
    """
    Synchronous retry decorator with exponential backoff.

    Same as async_retry but for synchronous functions.

    Args:
        max_attempts: Maximum number of retry attempts
        delay: Initial delay between retries in seconds
        backoff: Multiplier for delay after each retry
        max_delay: Maximum delay cap in seconds
        exceptions: Tuple of exceptions to catch and retry

    Returns:
        Decorated function with retry logic
    """
    import time

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            current_delay = delay
            last_exception = None

            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions as e:
                    last_exception = e

                    if attempt < max_attempts:
                        logger.warning(
                            f"{func.__name__} failed (attempt {attempt}/{max_attempts}): {e}. "
                            f"Retrying in {current_delay:.1f}s..."
                        )
                        time.sleep(current_delay)
                        current_delay = min(current_delay * backoff, max_delay)
                    else:
                        logger.error(
                            f"{func.__name__} failed after {max_attempts} attempts: {e}"
                        )

            raise last_exception

        return wrapper
    return decorator


class RetryableOperation:
    """
    Context manager for retryable operations.

    Usage:
        async with RetryableOperation(max_attempts=3) as op:
            result = await op.execute(some_async_function, arg1, arg2)
    """

    def __init__(
        self,
        max_attempts: int = 3,
        delay: float = 1.0,
        backoff: float = 2.0,
        exceptions: Tuple[Type[Exception], ...] = (Exception,)
    ):
        self.max_attempts = max_attempts
        self.delay = delay
        self.backoff = backoff
        self.exceptions = exceptions
        self.attempts = 0
        self.last_exception = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return False

    async def execute(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with retry logic."""
        current_delay = self.delay

        for attempt in range(1, self.max_attempts + 1):
            self.attempts = attempt
            try:
                return await func(*args, **kwargs)
            except self.exceptions as e:
                self.last_exception = e

                if attempt < self.max_attempts:
                    logger.warning(
                        f"Operation failed (attempt {attempt}/{self.max_attempts}): {e}. "
                        f"Retrying in {current_delay:.1f}s..."
                    )
                    await asyncio.sleep(current_delay)
                    current_delay = min(current_delay * self.backoff, 60.0)

        raise self.last_exception
