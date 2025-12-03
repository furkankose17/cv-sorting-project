'use strict';

const cds = require('@sap/cds');

const LOG = cds.log('ai-provider');

/**
 * AI Provider Abstraction Layer
 *
 * Supports multiple AI backends:
 * - Ollama (local LLM serving)
 * - OpenAI-compatible APIs (OpenAI, Azure OpenAI, Groq, Together.ai, etc.)
 * - Hugging Face Inference API
 * - Local transformers.js models
 *
 * Configuration via environment variables or CDS configuration
 */

/**
 * Available AI Providers
 */
const AI_PROVIDERS = {
    OLLAMA: 'ollama',
    OPENAI: 'openai',
    HUGGINGFACE: 'huggingface',
    LOCAL: 'local',
    MOCK: 'mock'
};

/**
 * Recommended small/efficient models for each provider
 * Updated based on 2024-2025 benchmarks for HR/recruitment tasks
 *
 * Memory estimates (approximate):
 * - 135M params: ~300MB RAM
 * - 360M params: ~750MB RAM
 * - 0.5B params: ~1GB RAM
 * - 1.5B params: ~3GB RAM
 * - 3.8B params: ~7.6GB RAM (FP16) or ~1.8GB (INT4)
 */
const RECOMMENDED_MODELS = {
    ollama: {
        // Ultra-lightweight (< 1GB RAM)
        tiny: 'smollm2:135m',           // 135M params, ~300MB, fastest
        // Lightweight (1-2GB RAM)
        fast: 'smollm2:360m',           // 360M params, ~750MB, good for simple tasks
        // Balanced (2-4GB RAM)
        balanced: 'qwen2.5:1.5b',       // 1.5B params, ~3GB, excellent quality/size ratio
        // Quality (4-8GB RAM)
        quality: 'phi3.5:3.8b',         // 3.8B params, ~7.6GB FP16, best reasoning
        // Coding-focused
        coding: 'qwen2.5-coder:1.5b'    // 1.5B params, optimized for code
    },
    huggingface: {
        // Ultra-lightweight - runs on free tier easily
        tiny: 'HuggingFaceTB/SmolLM2-135M-Instruct',    // 135M, ~300MB
        // Lightweight - good for classification/extraction
        fast: 'HuggingFaceTB/SmolLM2-360M-Instruct',    // 360M, ~750MB
        // Balanced - best for general HR tasks
        balanced: 'Qwen/Qwen2.5-1.5B-Instruct',         // 1.5B, ~3GB
        // Quality - when you need best results
        quality: 'microsoft/Phi-3.5-mini-instruct',     // 3.8B, best reasoning
        // Alternative lightweight options
        alt_tiny: 'Qwen/Qwen2.5-0.5B-Instruct',         // 0.5B, ~1GB
        alt_balanced: 'HuggingFaceTB/SmolLM2-1.7B-Instruct' // 1.7B, ~3.4GB
    },
    openai: {
        fast: 'gpt-3.5-turbo',          // Fastest, cheapest
        balanced: 'gpt-4o-mini',        // Good balance
        quality: 'gpt-4o'               // Best quality
    },
    local: {
        // For browser/Node.js via transformers.js
        tiny: 'Xenova/smollm-135M-instruct-v0.2-Q8_0-ONNX',
        fast: 'Xenova/Qwen1.5-0.5B-Chat',
        balanced: 'Xenova/phi-2'
    }
};

/**
 * Default system prompts for different use cases
 */
const SYSTEM_PROMPTS = {
    general: `You are Joule, an AI assistant specialized in HR and recruitment.
You help recruiters find candidates, analyze profiles, and make hiring decisions.
Be concise, professional, and actionable in your responses.`,

    candidate_analysis: `You are an expert HR analyst. Analyze candidate profiles objectively.
Focus on skills match, experience relevance, and potential fit.
Provide structured insights with clear recommendations.`,

    interview: `You are an experienced interviewer. Generate relevant, fair questions
that assess both technical skills and cultural fit.
Avoid discriminatory or inappropriate questions.`,

    summarization: `You are a skilled summarizer. Create clear, concise summaries
that highlight key information. Use bullet points for clarity.`
};

/**
 * AI Provider Factory
 */
class AIProviderFactory {
    static create(providerType, config = {}) {
        switch (providerType) {
            case AI_PROVIDERS.OLLAMA:
                return new OllamaProvider(config);
            case AI_PROVIDERS.OPENAI:
                return new OpenAIProvider(config);
            case AI_PROVIDERS.HUGGINGFACE:
                return new HuggingFaceProvider(config);
            case AI_PROVIDERS.LOCAL:
                return new LocalProvider(config);
            case AI_PROVIDERS.MOCK:
            default:
                return new MockProvider(config);
        }
    }

    static getRecommendedModel(provider, preference = 'balanced') {
        return RECOMMENDED_MODELS[provider]?.[preference] || RECOMMENDED_MODELS[provider]?.balanced;
    }
}

/**
 * Base AI Provider class
 */
class BaseAIProvider {
    constructor(config = {}) {
        this.config = {
            temperature: 0.7,
            maxTokens: 1000,
            timeout: 30000,
            ...config
        };
        this.name = 'base';
    }

    async complete(prompt, options = {}) {
        throw new Error('Method not implemented');
    }

    async chat(messages, options = {}) {
        throw new Error('Method not implemented');
    }

    async embed(text) {
        throw new Error('Method not implemented');
    }

    async isAvailable() {
        return false;
    }

    _mergeOptions(options) {
        return { ...this.config, ...options };
    }
}

/**
 * Ollama Provider - Local LLM serving
 * https://ollama.ai/
 */
class OllamaProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'ollama';
        this.baseUrl = config.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        this.model = config.model || process.env.OLLAMA_MODEL || RECOMMENDED_MODELS.ollama.balanced;
    }

    async complete(prompt, options = {}) {
        const opts = this._mergeOptions(options);

        try {
            const response = await fetch(`${this.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: opts.model || this.model,
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: opts.temperature,
                        num_predict: opts.maxTokens
                    }
                }),
                signal: AbortSignal.timeout(opts.timeout)
            });

            if (!response.ok) {
                throw new Error(`Ollama request failed: ${response.status}`);
            }

            const data = await response.json();
            return {
                text: data.response,
                model: data.model,
                usage: {
                    promptTokens: data.prompt_eval_count,
                    completionTokens: data.eval_count
                }
            };
        } catch (error) {
            LOG.error('Ollama completion failed', error);
            throw error;
        }
    }

    async chat(messages, options = {}) {
        const opts = this._mergeOptions(options);

        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: opts.model || this.model,
                    messages: messages,
                    stream: false,
                    options: {
                        temperature: opts.temperature,
                        num_predict: opts.maxTokens
                    }
                }),
                signal: AbortSignal.timeout(opts.timeout)
            });

            if (!response.ok) {
                throw new Error(`Ollama chat failed: ${response.status}`);
            }

            const data = await response.json();
            return {
                text: data.message?.content || '',
                model: data.model,
                usage: {
                    promptTokens: data.prompt_eval_count,
                    completionTokens: data.eval_count
                }
            };
        } catch (error) {
            LOG.error('Ollama chat failed', error);
            throw error;
        }
    }

    async embed(text) {
        try {
            const response = await fetch(`${this.baseUrl}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'nomic-embed-text',
                    prompt: text
                }),
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) {
                throw new Error(`Ollama embedding failed: ${response.status}`);
            }

            const data = await response.json();
            return data.embedding;
        } catch (error) {
            LOG.error('Ollama embedding failed', error);
            throw error;
        }
    }

    async isAvailable() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            const data = await response.json();
            return data.models?.map(m => m.name) || [];
        } catch {
            return [];
        }
    }
}

/**
 * OpenAI-compatible Provider
 * Works with OpenAI, Azure OpenAI, Groq, Together.ai, Anyscale, etc.
 */
class OpenAIProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'openai';
        this.apiKey = config.apiKey || process.env.OPENAI_API_KEY;
        this.baseUrl = config.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        this.model = config.model || process.env.OPENAI_MODEL || RECOMMENDED_MODELS.openai.fast;
    }

    async complete(prompt, options = {}) {
        // Convert to chat format for modern API
        return this.chat([{ role: 'user', content: prompt }], options);
    }

    async chat(messages, options = {}) {
        const opts = this._mergeOptions(options);

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: opts.model || this.model,
                    messages: messages,
                    temperature: opts.temperature,
                    max_tokens: opts.maxTokens
                }),
                signal: AbortSignal.timeout(opts.timeout)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`OpenAI request failed: ${error.error?.message || response.status}`);
            }

            const data = await response.json();
            return {
                text: data.choices?.[0]?.message?.content || '',
                model: data.model,
                usage: {
                    promptTokens: data.usage?.prompt_tokens,
                    completionTokens: data.usage?.completion_tokens
                }
            };
        } catch (error) {
            LOG.error('OpenAI chat failed', error);
            throw error;
        }
    }

    async embed(text) {
        try {
            const response = await fetch(`${this.baseUrl}/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: 'text-embedding-3-small',
                    input: text
                }),
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) {
                throw new Error(`OpenAI embedding failed: ${response.status}`);
            }

            const data = await response.json();
            return data.data?.[0]?.embedding;
        } catch (error) {
            LOG.error('OpenAI embedding failed', error);
            throw error;
        }
    }

    async isAvailable() {
        return !!this.apiKey;
    }
}

/**
 * Hugging Face Inference API Provider
 *
 * Best lightweight models for HR/CV tasks:
 * - SmolLM2-135M-Instruct: Ultra-fast, ~300MB, good for simple extraction
 * - SmolLM2-360M-Instruct: Fast, ~750MB, good for classification
 * - Qwen2.5-0.5B-Instruct: ~1GB, multilingual, good quality
 * - Qwen2.5-1.5B-Instruct: ~3GB, excellent for summarization (RECOMMENDED)
 * - Phi-3.5-mini-instruct: ~3.8B, best reasoning but slower
 */
class HuggingFaceProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'huggingface';
        this.apiKey = config.apiKey || process.env.HF_API_KEY || process.env.HUGGINGFACE_API_KEY;
        this.baseUrl = config.baseUrl || 'https://api-inference.huggingface.co/models';
        // Default to SmolLM2-360M for good balance of speed and capability
        this.model = config.model || process.env.HF_MODEL || RECOMMENDED_MODELS.huggingface.fast;
    }

    async complete(prompt, options = {}) {
        const opts = this._mergeOptions(options);

        try {
            const response = await fetch(`${this.baseUrl}/${opts.model || this.model}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        temperature: opts.temperature,
                        max_new_tokens: opts.maxTokens,
                        return_full_text: false
                    }
                }),
                signal: AbortSignal.timeout(opts.timeout)
            });

            if (!response.ok) {
                throw new Error(`HuggingFace request failed: ${response.status}`);
            }

            const data = await response.json();
            return {
                text: Array.isArray(data) ? data[0]?.generated_text : data.generated_text,
                model: this.model
            };
        } catch (error) {
            LOG.error('HuggingFace completion failed', error);
            throw error;
        }
    }

    async chat(messages, options = {}) {
        // Convert messages to prompt format
        const prompt = messages.map(m => {
            const role = m.role === 'assistant' ? 'Assistant' : m.role === 'system' ? 'System' : 'User';
            return `${role}: ${m.content}`;
        }).join('\n') + '\nAssistant:';

        return this.complete(prompt, options);
    }

    async embed(text) {
        try {
            const response = await fetch(`${this.baseUrl}/sentence-transformers/all-MiniLM-L6-v2`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    inputs: text
                }),
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) {
                throw new Error(`HuggingFace embedding failed: ${response.status}`);
            }

            const data = await response.json();
            return data;
        } catch (error) {
            LOG.error('HuggingFace embedding failed', error);
            throw error;
        }
    }

    async isAvailable() {
        return !!this.apiKey;
    }
}

/**
 * Local Provider using transformers.js
 * Runs models directly in Node.js
 */
class LocalProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'local';
        this.model = config.model || RECOMMENDED_MODELS.local.fast;
        this.pipeline = null;
    }

    async _loadModel() {
        if (this.pipeline) return;

        try {
            // Dynamic import for transformers.js
            const { pipeline } = await import('@xenova/transformers');
            this.pipeline = await pipeline('text-generation', this.model, {
                quantized: true // Use quantized model for speed
            });
            LOG.info('Local model loaded', { model: this.model });
        } catch (error) {
            LOG.error('Failed to load local model', error);
            throw error;
        }
    }

    async complete(prompt, options = {}) {
        await this._loadModel();
        const opts = this._mergeOptions(options);

        try {
            const result = await this.pipeline(prompt, {
                max_new_tokens: opts.maxTokens,
                temperature: opts.temperature,
                do_sample: true
            });

            return {
                text: result[0]?.generated_text?.replace(prompt, '') || '',
                model: this.model
            };
        } catch (error) {
            LOG.error('Local completion failed', error);
            throw error;
        }
    }

    async chat(messages, options = {}) {
        const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
        return this.complete(prompt, options);
    }

    async isAvailable() {
        try {
            await import('@xenova/transformers');
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * Mock Provider for testing/development
 */
class MockProvider extends BaseAIProvider {
    constructor(config = {}) {
        super(config);
        this.name = 'mock';
        this.responses = config.responses || {};
    }

    async complete(prompt, options = {}) {
        await this._simulateDelay();

        const response = this._generateMockResponse(prompt, options);
        return {
            text: response,
            model: 'mock-model',
            usage: { promptTokens: 10, completionTokens: 50 }
        };
    }

    async chat(messages, options = {}) {
        const lastMessage = messages[messages.length - 1]?.content || '';
        return this.complete(lastMessage, options);
    }

    async embed(text) {
        // Return random embedding vector
        return Array(384).fill(0).map(() => Math.random() - 0.5);
    }

    async isAvailable() {
        return true;
    }

    async _simulateDelay() {
        const delay = Math.random() * 500 + 100;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    _generateMockResponse(prompt, options = {}) {
        const lowerPrompt = prompt.toLowerCase();

        if (lowerPrompt.includes('summarize') || lowerPrompt.includes('summary')) {
            return `**Summary:**

Based on the provided information, here are the key points:

- **Primary Focus:** The candidate shows strong alignment with technical requirements
- **Experience Level:** Demonstrated expertise in relevant technologies
- **Potential:** Good cultural fit with growth mindset

**Recommendation:** Proceed to next interview stage.`;
        }

        if (lowerPrompt.includes('interview') || lowerPrompt.includes('question')) {
            return `**Interview Questions:**

1. "Tell me about a challenging project and how you overcame obstacles."
2. "How do you stay current with new technologies?"
3. "Describe your approach to code reviews and collaboration."
4. "What interests you most about this role?"
5. "Where do you see your career in the next 3-5 years?"`;
        }

        if (lowerPrompt.includes('compare') || lowerPrompt.includes('comparison')) {
            return `**Comparison Analysis:**

| Criteria | Candidate A | Candidate B |
|----------|-------------|-------------|
| Skills Match | 85% | 78% |
| Experience | 6 years | 4 years |
| Cultural Fit | Strong | Moderate |

**Recommendation:** Candidate A shows stronger overall alignment.`;
        }

        if (lowerPrompt.includes('skill') || lowerPrompt.includes('gap')) {
            return `**Skill Gap Analysis:**

**Matching Skills:**
- JavaScript/TypeScript (Expert)
- React/Node.js (Advanced)
- SQL (Intermediate)

**Gaps:**
- Kubernetes (Required, not present)
- GraphQL (Nice-to-have)

**Development Path:**
Consider 2-4 weeks training on container orchestration.`;
        }

        return `I've analyzed the information provided.

**Key Observations:**
- The data shows interesting patterns worth exploring
- Several actionable insights can be derived
- Recommend further investigation of specific areas

Would you like me to elaborate on any particular aspect?`;
    }
}

/**
 * AI Service Manager
 * Handles provider selection, fallback, and configuration
 */
class AIServiceManager {
    constructor(config = {}) {
        this.config = config;
        this.providers = new Map();
        this.primaryProvider = null;
        this.fallbackProviders = [];
    }

    /**
     * Initialize AI service with automatic provider detection
     */
    async initialize() {
        LOG.info('Initializing AI Service Manager');

        // Check available providers in order of preference
        const providerConfigs = [
            { type: AI_PROVIDERS.OLLAMA, priority: 1 },
            { type: AI_PROVIDERS.OPENAI, priority: 2 },
            { type: AI_PROVIDERS.HUGGINGFACE, priority: 3 },
            { type: AI_PROVIDERS.LOCAL, priority: 4 },
            { type: AI_PROVIDERS.MOCK, priority: 99 }
        ];

        for (const { type, priority } of providerConfigs) {
            const provider = AIProviderFactory.create(type, this.config[type] || {});

            if (await provider.isAvailable()) {
                this.providers.set(type, provider);
                LOG.info(`AI Provider available: ${type}`);

                if (!this.primaryProvider) {
                    this.primaryProvider = provider;
                    LOG.info(`Primary AI Provider: ${type}`);
                } else {
                    this.fallbackProviders.push(provider);
                }
            }
        }

        if (!this.primaryProvider) {
            LOG.warn('No AI providers available, using mock');
            this.primaryProvider = new MockProvider();
        }

        return this;
    }

    /**
     * Get completion with automatic fallback
     */
    async complete(prompt, options = {}) {
        const providers = [this.primaryProvider, ...this.fallbackProviders];

        for (const provider of providers) {
            try {
                const result = await provider.complete(prompt, options);
                return { ...result, provider: provider.name };
            } catch (error) {
                LOG.warn(`Provider ${provider.name} failed, trying fallback`, error.message);
            }
        }

        throw new Error('All AI providers failed');
    }

    /**
     * Get chat completion with automatic fallback
     */
    async chat(messages, options = {}) {
        const providers = [this.primaryProvider, ...this.fallbackProviders];

        for (const provider of providers) {
            try {
                const result = await provider.chat(messages, options);
                return { ...result, provider: provider.name };
            } catch (error) {
                LOG.warn(`Provider ${provider.name} failed, trying fallback`, error.message);
            }
        }

        throw new Error('All AI providers failed');
    }

    /**
     * Get current provider info
     */
    getProviderInfo() {
        return {
            primary: this.primaryProvider?.name,
            fallbacks: this.fallbackProviders.map(p => p.name),
            available: Array.from(this.providers.keys())
        };
    }
}

module.exports = {
    AI_PROVIDERS,
    RECOMMENDED_MODELS,
    SYSTEM_PROMPTS,
    AIProviderFactory,
    BaseAIProvider,
    OllamaProvider,
    OpenAIProvider,
    HuggingFaceProvider,
    LocalProvider,
    MockProvider,
    AIServiceManager
};
