-- =============================================
-- CV Sorting ML Service - PostgreSQL Schema
-- Requires pgvector extension
-- =============================================

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================
-- EMBEDDING TABLES
-- =============================================

-- Candidate embeddings table
CREATE TABLE IF NOT EXISTS candidate_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL UNIQUE,
    cv_text_embedding vector(384),
    skills_embedding vector(384),
    experience_embedding vector(384),
    combined_embedding vector(384) NOT NULL,
    embedding_model VARCHAR(100) NOT NULL,
    cv_text_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job embeddings table
CREATE TABLE IF NOT EXISTS job_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_posting_id UUID NOT NULL UNIQUE,
    description_embedding vector(384),
    requirements_embedding vector(384),
    combined_embedding vector(384) NOT NULL,
    embedding_model VARCHAR(100) NOT NULL,
    description_hash VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- SCORING TABLES
-- =============================================

-- Scoring criteria table
CREATE TABLE IF NOT EXISTS scoring_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_posting_id UUID NOT NULL,
    criteria_type VARCHAR(50) NOT NULL,
    criteria_value VARCHAR(255) NOT NULL,
    points INTEGER NOT NULL DEFAULT 1,
    is_required BOOLEAN DEFAULT FALSE,
    weight DECIMAL(3,2) DEFAULT 1.0,
    min_value INTEGER,
    per_unit_points DECIMAL(5,2),
    max_points INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_posting_id, criteria_type, criteria_value)
);

-- =============================================
-- MATCHING RESULTS TABLES
-- =============================================

-- Semantic match results table
CREATE TABLE IF NOT EXISTS semantic_match_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL,
    job_posting_id UUID NOT NULL,
    cosine_similarity DECIMAL(7,5) NOT NULL,
    criteria_score DECIMAL(7,2),
    criteria_max_score DECIMAL(7,2),
    criteria_percentage DECIMAL(5,2),
    combined_score DECIMAL(5,2) NOT NULL,
    rank INTEGER,
    score_breakdown JSONB,
    matched_criteria JSONB,
    missing_criteria JSONB,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(candidate_id, job_posting_id)
);

-- Notification thresholds table
CREATE TABLE IF NOT EXISTS notification_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_posting_id UUID NOT NULL UNIQUE,
    min_score_threshold DECIMAL(5,2) NOT NULL DEFAULT 70.0,
    min_candidates_count INTEGER NOT NULL DEFAULT 5,
    notify_email VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_notified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INDEXES
-- =============================================

-- IVFFlat indexes for fast vector similarity search
-- Note: IVFFlat requires data to be present before creating index
-- For empty tables, use HNSW or create index after loading data

CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_combined
ON candidate_embeddings
USING ivfflat (combined_embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_job_embeddings_combined
ON job_embeddings
USING ivfflat (combined_embedding vector_cosine_ops)
WITH (lists = 50);

-- Additional performance indexes
CREATE INDEX IF NOT EXISTS idx_scoring_criteria_job
ON scoring_criteria(job_posting_id);

CREATE INDEX IF NOT EXISTS idx_match_results_job
ON semantic_match_results(job_posting_id, combined_score DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_hash
ON candidate_embeddings(cv_text_hash);

CREATE INDEX IF NOT EXISTS idx_job_embeddings_hash
ON job_embeddings(description_hash);

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_candidate_embeddings_updated_at ON candidate_embeddings;
CREATE TRIGGER update_candidate_embeddings_updated_at
    BEFORE UPDATE ON candidate_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_job_embeddings_updated_at ON job_embeddings;
CREATE TRIGGER update_job_embeddings_updated_at
    BEFORE UPDATE ON job_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_notification_thresholds_updated_at ON notification_thresholds;
CREATE TRIGGER update_notification_thresholds_updated_at
    BEFORE UPDATE ON notification_thresholds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
