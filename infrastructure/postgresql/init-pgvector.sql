-- ============================================
-- CV Sorting Project - pgvector Initialization Script
-- Run this first to enable the pgvector extension
-- ============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Verify pgvector is installed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'pgvector extension is not installed. Please install it first.';
    END IF;
    RAISE NOTICE 'pgvector extension is installed and ready.';
END $$;

-- Show pgvector version
SELECT extversion FROM pg_extension WHERE extname = 'vector';
