-- ============================================
-- CV Sorting Project - PostgreSQL + pgvector Schema
-- Vector Embeddings and Semantic Search Tables
-- ============================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CANDIDATE EMBEDDINGS
-- ============================================

CREATE TABLE IF NOT EXISTS candidate_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID NOT NULL UNIQUE,          -- FK to HANA Candidates.ID

    -- Text embeddings (all-MiniLM-L12-v2 produces 384 dimensions)
    cv_text_embedding vector(384),              -- Full CV text embedding
    skills_embedding vector(384),               -- Skills section embedding
    experience_embedding vector(384),           -- Experience section embedding
    combined_embedding vector(384),             -- Weighted combination for search

    -- Metadata
    embedding_model VARCHAR(100) DEFAULT 'all-MiniLM-L12-v2',
    cv_text_hash VARCHAR(64),                   -- SHA-256 hash to detect changes

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for fast similarity search using IVFFlat
-- lists=100 is good for ~10,000-100,000 vectors
CREATE INDEX IF NOT EXISTS idx_candidate_combined_embedding
    ON candidate_embeddings
    USING ivfflat (combined_embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_candidate_skills_embedding
    ON candidate_embeddings
    USING ivfflat (skills_embedding vector_cosine_ops)
    WITH (lists = 100);

-- Index for candidate lookup
CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_candidate_id
    ON candidate_embeddings(candidate_id);

-- ============================================
-- JOB POSTING EMBEDDINGS
-- ============================================

CREATE TABLE IF NOT EXISTS job_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_posting_id UUID NOT NULL UNIQUE,        -- FK to HANA JobPostings.ID

    -- Text embeddings
    description_embedding vector(384),          -- Job description embedding
    requirements_embedding vector(384),         -- Requirements section embedding
    combined_embedding vector(384),             -- Combined for search

    -- Metadata
    embedding_model VARCHAR(100) DEFAULT 'all-MiniLM-L12-v2',
    description_hash VARCHAR(64),               -- SHA-256 hash to detect changes

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for job similarity search
CREATE INDEX IF NOT EXISTS idx_job_combined_embedding
    ON job_embeddings
    USING ivfflat (combined_embedding vector_cosine_ops)
    WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_job_embeddings_job_id
    ON job_embeddings(job_posting_id);

-- ============================================
-- SCORING CRITERIA (Per-Position Rules)
-- ============================================

CREATE TABLE IF NOT EXISTS scoring_criteria (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_posting_id UUID NOT NULL,               -- FK to HANA JobPostings.ID

    -- Criterion definition
    criteria_name VARCHAR(100) NOT NULL,        -- Display name (e.g., "SAP UI5 Experience")
    criteria_type VARCHAR(50) NOT NULL,         -- skill, language, certification, experience, education, custom
    criteria_value VARCHAR(255) NOT NULL,       -- Value to match (e.g., skill name, language code)

    -- Scoring configuration
    points INTEGER NOT NULL DEFAULT 1,          -- Points awarded if matched
    is_required BOOLEAN DEFAULT FALSE,          -- If true, candidate is disqualified without this
    weight DECIMAL(3,2) DEFAULT 1.0,            -- Multiplier for points (0.5 = half points)

    -- For experience type: min years, per_year multiplier
    min_value INTEGER,                          -- Minimum threshold (e.g., min years)
    per_unit_points DECIMAL(5,2),               -- Points per unit (e.g., 1 point per year)
    max_points INTEGER,                         -- Cap on points (e.g., max 10 points for experience)

    -- Ordering
    sort_order INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    UNIQUE(job_posting_id, criteria_type, criteria_value)
);

CREATE INDEX IF NOT EXISTS idx_scoring_criteria_job
    ON scoring_criteria(job_posting_id);

CREATE INDEX IF NOT EXISTS idx_scoring_criteria_type
    ON scoring_criteria(criteria_type);

-- ============================================
-- SEMANTIC MATCH RESULTS (Cached)
-- ============================================

CREATE TABLE IF NOT EXISTS semantic_match_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID NOT NULL,                 -- FK to HANA Candidates.ID
    job_posting_id UUID NOT NULL,               -- FK to HANA JobPostings.ID

    -- Score components
    cosine_similarity DECIMAL(6,5),             -- 0.00000 to 1.00000 (semantic similarity)
    criteria_score DECIMAL(5,2),                -- Points from scoring criteria
    criteria_max_score DECIMAL(5,2),            -- Maximum possible criteria points
    criteria_percentage DECIMAL(5,2),           -- criteria_score / criteria_max_score * 100

    -- Combined scoring
    combined_score DECIMAL(5,2),                -- Weighted combination (0-100)
    rank INTEGER,                               -- Rank among all matches for this job

    -- Detailed breakdown (JSON)
    score_breakdown JSONB,                      -- {semantic: X, criteria: Y, weights: {...}}
    matched_criteria JSONB,                     -- [{type, value, points}]
    missing_criteria JSONB,                     -- [{type, value, points, is_required}]

    -- AI analysis
    ai_recommendation TEXT,                     -- AI-generated recommendation
    strengths TEXT,                             -- Identified strengths
    gaps TEXT,                                  -- Identified gaps

    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by VARCHAR(100),

    -- Constraints
    UNIQUE(candidate_id, job_posting_id)
);

CREATE INDEX IF NOT EXISTS idx_semantic_match_job
    ON semantic_match_results(job_posting_id);

CREATE INDEX IF NOT EXISTS idx_semantic_match_candidate
    ON semantic_match_results(candidate_id);

CREATE INDEX IF NOT EXISTS idx_semantic_match_score
    ON semantic_match_results(combined_score DESC);

CREATE INDEX IF NOT EXISTS idx_semantic_match_rank
    ON semantic_match_results(job_posting_id, rank);

-- ============================================
-- NOTIFICATION THRESHOLDS
-- ============================================

CREATE TABLE IF NOT EXISTS notification_thresholds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_posting_id UUID NOT NULL UNIQUE,        -- FK to HANA JobPostings.ID

    -- Threshold configuration
    min_score_threshold DECIMAL(5,2) DEFAULT 70.00,  -- Minimum combined score to count
    min_candidates_count INTEGER DEFAULT 5,          -- Notify when this many candidates match

    -- Notification settings
    notify_on_new_match BOOLEAN DEFAULT TRUE,        -- Notify on each new match above threshold
    notify_on_threshold_reached BOOLEAN DEFAULT TRUE, -- Notify when count threshold reached
    notification_cooldown_hours INTEGER DEFAULT 24,   -- Minimum hours between notifications

    -- Recipients
    notify_email VARCHAR(255),                       -- HR email to notify
    notify_webhook_url VARCHAR(500),                 -- Webhook URL (e.g., n8n)
    additional_recipients JSONB,                     -- Additional email addresses

    -- State
    last_notification_at TIMESTAMP WITH TIME ZONE,
    last_notification_type VARCHAR(50),
    current_match_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_thresholds_job
    ON notification_thresholds(job_posting_id);

-- ============================================
-- NOTIFICATION HISTORY
-- ============================================

CREATE TABLE IF NOT EXISTS notification_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_posting_id UUID NOT NULL,               -- FK to HANA JobPostings.ID

    -- Notification details
    notification_type VARCHAR(50) NOT NULL,     -- threshold_reached, new_match, daily_summary
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    body TEXT,

    -- Delivery status
    status VARCHAR(20) DEFAULT 'pending',       -- pending, sent, failed
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,

    -- Context
    match_count INTEGER,                        -- Number of matches at time of notification
    top_candidates JSONB,                       -- Top 5 candidate IDs and scores

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notification_history_job
    ON notification_history(job_posting_id);

CREATE INDEX IF NOT EXISTS idx_notification_history_created
    ON notification_history(created_at DESC);

-- ============================================
-- EMBEDDING GENERATION QUEUE
-- ============================================

CREATE TABLE IF NOT EXISTS embedding_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(20) NOT NULL,           -- candidate, job
    entity_id UUID NOT NULL,

    -- Queue status
    status VARCHAR(20) DEFAULT 'pending',       -- pending, processing, completed, failed
    priority INTEGER DEFAULT 5,                 -- 1 = highest, 10 = lowest
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,

    -- Error handling
    last_error TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_embedding_queue_status
    ON embedding_queue(status, priority, created_at);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_candidate_embeddings_updated_at
    BEFORE UPDATE ON candidate_embeddings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_job_embeddings_updated_at
    BEFORE UPDATE ON job_embeddings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scoring_criteria_updated_at
    BEFORE UPDATE ON scoring_criteria
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_thresholds_updated_at
    BEFORE UPDATE ON notification_thresholds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEMANTIC SEARCH FUNCTIONS
-- ============================================

-- Function to find similar candidates for a job
CREATE OR REPLACE FUNCTION find_similar_candidates(
    p_job_posting_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_min_similarity DECIMAL DEFAULT 0.5
)
RETURNS TABLE (
    candidate_id UUID,
    cosine_similarity DECIMAL,
    rank INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ce.candidate_id,
        1 - (ce.combined_embedding <=> je.combined_embedding) as cosine_similarity,
        ROW_NUMBER() OVER (ORDER BY ce.combined_embedding <=> je.combined_embedding)::INTEGER as rank
    FROM candidate_embeddings ce
    CROSS JOIN job_embeddings je
    WHERE je.job_posting_id = p_job_posting_id
    AND 1 - (ce.combined_embedding <=> je.combined_embedding) >= p_min_similarity
    ORDER BY ce.combined_embedding <=> je.combined_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to find similar candidates using natural language query
CREATE OR REPLACE FUNCTION semantic_search_candidates(
    p_query_embedding vector(384),
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    candidate_id UUID,
    similarity DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ce.candidate_id,
        1 - (ce.combined_embedding <=> p_query_embedding) as similarity
    FROM candidate_embeddings ce
    ORDER BY ce.combined_embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SAMPLE DATA FOR TESTING (Optional)
-- ============================================

-- Insert sample scoring criteria for testing
-- Uncomment to use:
/*
INSERT INTO scoring_criteria (job_posting_id, criteria_name, criteria_type, criteria_value, points, is_required, weight, sort_order)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'SAP UI5', 'skill', 'sap ui5', 3, true, 1.0, 1),
    ('00000000-0000-0000-0000-000000000001', 'JavaScript', 'skill', 'javascript', 2, true, 1.0, 2),
    ('00000000-0000-0000-0000-000000000001', 'TypeScript', 'skill', 'typescript', 2, false, 1.0, 3),
    ('00000000-0000-0000-0000-000000000001', 'English', 'language', 'english', 2, true, 1.0, 4),
    ('00000000-0000-0000-0000-000000000001', 'Experience', 'experience', 'years', 1, false, 1.0, 5);
*/

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO cv_sorting_app;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO cv_sorting_app;
