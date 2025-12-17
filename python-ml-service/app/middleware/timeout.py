"""
Request timeout middleware for FastAPI.

Enforces request timeouts to prevent long-running requests
from consuming resources indefinitely.
"""

import asyncio
import logging
from typing import Callable

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger(__name__)


class TimeoutMiddleware(BaseHTTPMiddleware):
    """
    Middleware to enforce request timeouts.

    Wraps request handling in asyncio.wait_for() to enforce timeout.
    Returns 504 Gateway Timeout if request exceeds timeout.

    Attributes:
        timeout: Request timeout in seconds
        exclude_paths: Paths to exclude from timeout (e.g., health checks)
    """

    def __init__(
        self,
        app,
        timeout: int = 120,
        exclude_paths: list = None
    ):
        """
        Initialize timeout middleware.

        Args:
            app: FastAPI/Starlette application
            timeout: Request timeout in seconds (default: 120)
            exclude_paths: List of paths to exclude from timeout
        """
        super().__init__(app)
        self.timeout = timeout
        self.exclude_paths = exclude_paths or ["/health", "/health/live", "/health/ready"]

    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """
        Process request with timeout enforcement.

        Args:
            request: Incoming request
            call_next: Next middleware/route handler

        Returns:
            Response from handler or timeout error
        """
        # Skip timeout for excluded paths
        if any(request.url.path.startswith(path) for path in self.exclude_paths):
            return await call_next(request)

        try:
            return await asyncio.wait_for(
                call_next(request),
                timeout=self.timeout
            )
        except asyncio.TimeoutError:
            logger.error(
                f"Request timeout: {request.method} {request.url.path} "
                f"exceeded {self.timeout}s"
            )
            raise HTTPException(
                status_code=504,
                detail=f"Request timed out after {self.timeout} seconds"
            )


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for request/response logging.

    Logs request method, path, status code, and duration.
    """

    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """Log request and response details."""
        import time

        start_time = time.time()

        # Log request
        logger.info(f"Request: {request.method} {request.url.path}")

        response = await call_next(request)

        # Log response
        duration = time.time() - start_time
        logger.info(
            f"Response: {request.method} {request.url.path} "
            f"status={response.status_code} duration={duration:.3f}s"
        )

        return response
