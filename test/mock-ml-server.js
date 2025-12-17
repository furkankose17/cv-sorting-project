/**
 * Mock ML Service for Integration Testing
 *
 * Simulates the Python ML service endpoints without actual ML models.
 * Run with: node test/mock-ml-server.js
 */

const http = require('http');

const PORT = 8000;

// In-memory storage for embeddings
const embeddings = new Map();

// Generate a mock embedding (384 dimensions like sentence-transformers)
function generateMockEmbedding() {
    return Array.from({ length: 384 }, () => Math.random() * 2 - 1);
}

// Calculate mock cosine similarity
function cosineSimilarity(a, b) {
    if (!a || !b) return Math.random() * 0.5 + 0.3; // Random 0.3-0.8
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

const server = http.createServer((req, res) => {
    let body = '';

    req.on('data', chunk => body += chunk);

    req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');

        console.log(`[Mock ML] ${req.method} ${req.url}`);

        // Health endpoints
        if (req.url === '/health/live' || req.url === '/health/ready') {
            res.writeHead(200);
            res.end(JSON.stringify({ status: 'healthy', mock: true }));
            return;
        }

        // Generate embedding
        if (req.url === '/api/embeddings/generate' && req.method === 'POST') {
            const data = JSON.parse(body);
            const embedding = generateMockEmbedding();

            // Store embedding
            const key = `${data.entity_type}:${data.entity_id}`;
            embeddings.set(key, {
                embedding,
                text: data.text_content?.substring(0, 100),
                createdAt: new Date().toISOString()
            });

            console.log(`[Mock ML] Generated embedding for ${key}`);

            res.writeHead(200);
            res.end(JSON.stringify({
                entity_id: data.entity_id,
                entity_type: data.entity_type,
                embedding_dimension: 384,
                stored: true,
                mock: true
            }));
            return;
        }

        // Semantic matching
        if (req.url === '/api/matching/semantic' && req.method === 'POST') {
            const data = JSON.parse(body);
            const jobKey = `job:${data.job_posting_id}`;
            const jobEmbedding = embeddings.get(jobKey)?.embedding;

            // Find all candidate embeddings and calculate similarity
            const matches = [];
            for (const [key, value] of embeddings.entries()) {
                if (key.startsWith('candidate:')) {
                    const candidateId = key.replace('candidate:', '');
                    const similarity = cosineSimilarity(jobEmbedding, value.embedding);
                    const score = similarity * 100;

                    if (score >= (data.min_score || 0)) {
                        matches.push({
                            candidate_id: candidateId,
                            cosine_similarity: similarity,
                            criteria_score: Math.random() * 30 + 60, // 60-90
                            combined_score: score,
                            score_breakdown: {
                                skills_match: Math.random() * 40 + 50,
                                experience_match: Math.random() * 30 + 60,
                                semantic_similarity: similarity * 100
                            },
                            matched_criteria: ['JavaScript', 'Node.js', 'React'],
                            missing_criteria: ['Python']
                        });
                    }
                }
            }

            // Sort by score and limit
            matches.sort((a, b) => b.combined_score - a.combined_score);
            const limitedMatches = matches.slice(0, data.limit || 50);

            console.log(`[Mock ML] Semantic match for job ${data.job_posting_id}: ${limitedMatches.length} candidates`);

            res.writeHead(200);
            res.end(JSON.stringify({
                job_posting_id: data.job_posting_id,
                total_candidates: limitedMatches.length,
                matches: limitedMatches,
                mock: true
            }));
            return;
        }

        // OCR processing
        if (req.url === '/api/ocr/process' && req.method === 'POST') {
            const data = JSON.parse(body);

            console.log(`[Mock ML] OCR processing for ${data.file_type}`);

            res.writeHead(200);
            res.end(JSON.stringify({
                extracted_text: `Mock extracted text from ${data.file_type} document.
                    This is a simulated CV with skills in JavaScript, Python, and cloud technologies.
                    Experience: 5 years in software development.
                    Education: Bachelor's in Computer Science.`,
                confidence: 0.95,
                language: data.language || 'en',
                structured_data: {
                    name: 'Mock Candidate',
                    email: 'mock@example.com',
                    skills: ['JavaScript', 'Python', 'AWS', 'Docker'],
                    experience_years: 5
                },
                mock: true
            }));
            return;
        }

        // Scoring criteria
        if (req.url.startsWith('/api/scoring/criteria') && req.method === 'GET') {
            res.writeHead(200);
            res.end(JSON.stringify({
                criteria: [
                    { type: 'skill', value: 'JavaScript', points: 10, required: true },
                    { type: 'skill', value: 'Python', points: 8, required: false },
                    { type: 'experience', value: '3+ years', points: 15, required: true }
                ],
                mock: true
            }));
            return;
        }

        // Default: 404
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found', path: req.url }));
    });
});

server.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════╗
║          Mock ML Service Running on port ${PORT}          ║
╠════════════════════════════════════════════════════════╣
║  Endpoints:                                            ║
║  - GET  /health/live                                   ║
║  - GET  /health/ready                                  ║
║  - POST /api/embeddings/generate                       ║
║  - POST /api/matching/semantic                         ║
║  - POST /api/ocr/process                               ║
║  - GET  /api/scoring/criteria/:id                      ║
╚════════════════════════════════════════════════════════╝
`);
});
