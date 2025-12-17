"""
VCAP_SERVICES parser for Cloud Foundry service bindings.

Extracts database and other service credentials from CF environment.
"""

import os
import json
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


def get_vcap_services() -> Optional[Dict[str, Any]]:
    """
    Parse VCAP_SERVICES environment variable.

    Returns:
        Parsed services dict or None if not in CF environment
    """
    vcap_services = os.getenv("VCAP_SERVICES")
    if not vcap_services:
        return None

    try:
        return json.loads(vcap_services)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse VCAP_SERVICES: {e}")
        return None


def get_service_credentials(service_name: str) -> Optional[Dict[str, Any]]:
    """
    Get credentials for a specific service by name.

    Args:
        service_name: Name of the service (e.g., 'postgresql-db', 'xsuaa')

    Returns:
        Service credentials dict or None
    """
    services = get_vcap_services()
    if not services:
        return None

    # Try exact match first
    if service_name in services and services[service_name]:
        return services[service_name][0].get("credentials", {})

    # Try partial match (service type)
    for key, instances in services.items():
        if service_name.lower() in key.lower() and instances:
            return instances[0].get("credentials", {})

    return None


def get_postgres_credentials() -> Optional[Dict[str, Any]]:
    """
    Extract PostgreSQL credentials from VCAP_SERVICES.

    Supports multiple PostgreSQL service naming conventions:
    - postgresql-db (SAP BTP)
    - postgresql
    - postgres

    Returns:
        Dict with host, port, database, username, password, ssl, uri
        or None if not found
    """
    services = get_vcap_services()
    if not services:
        logger.debug("VCAP_SERVICES not found - not in CF environment")
        return None

    # Look for PostgreSQL service (different names depending on provider)
    pg_services = None
    for service_type in ["postgresql-db", "postgresql", "postgres", "elephantsql"]:
        if service_type in services and services[service_type]:
            pg_services = services[service_type]
            break

    if not pg_services:
        logger.warning("No PostgreSQL service found in VCAP_SERVICES")
        return None

    creds = pg_services[0].get("credentials", {})

    # Handle different credential formats from various providers
    result = {
        "host": creds.get("hostname") or creds.get("host") or creds.get("db_host"),
        "port": int(creds.get("port", 5432)),
        "database": creds.get("dbname") or creds.get("database") or creds.get("db_name"),
        "username": creds.get("username") or creds.get("user"),
        "password": creds.get("password"),
        "ssl": creds.get("sslmode") == "require" or creds.get("ssl", False),
        "uri": creds.get("uri") or creds.get("connection_string")
    }

    # Validate required fields
    if not all([result["host"], result["database"], result["username"]]):
        logger.error("PostgreSQL credentials missing required fields")
        return None

    logger.info(f"PostgreSQL credentials found: {result['host']}:{result['port']}/{result['database']}")
    return result


def build_postgres_url(creds: Dict[str, Any]) -> str:
    """
    Build PostgreSQL connection URL from credentials.

    Args:
        creds: Credentials dict from get_postgres_credentials()

    Returns:
        PostgreSQL connection URL
    """
    if creds.get("uri"):
        return creds["uri"]

    ssl_suffix = "?sslmode=require" if creds.get("ssl") else ""
    return (
        f"postgresql://{creds['username']}:{creds['password']}"
        f"@{creds['host']}:{creds['port']}/{creds['database']}{ssl_suffix}"
    )


def get_xsuaa_credentials() -> Optional[Dict[str, Any]]:
    """
    Get XSUAA (authentication) service credentials.

    Returns:
        XSUAA credentials with clientid, clientsecret, url
    """
    return get_service_credentials("xsuaa")


def is_cf_environment() -> bool:
    """Check if running in Cloud Foundry environment."""
    return os.getenv("VCAP_SERVICES") is not None or os.getenv("VCAP_APPLICATION") is not None
