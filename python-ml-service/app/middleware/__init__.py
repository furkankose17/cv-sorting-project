"""Middleware modules for CV Sorting ML Service."""

from app.middleware.timeout import TimeoutMiddleware

__all__ = ["TimeoutMiddleware"]
