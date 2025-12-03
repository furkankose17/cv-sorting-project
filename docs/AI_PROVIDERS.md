# Alternative AI Providers Guide

This branch uses non-SAP AI providers for the Joule AI features. You can use local models (Ollama), cloud APIs (OpenAI, Hugging Face), or browser-based models.

## Supported Providers

| Provider | Type | Cost | Privacy | Setup Difficulty |
|----------|------|------|---------|------------------|
| **Ollama** | Local | Free | High | Easy |
| **Hugging Face** | Cloud | Free tier | Low | Easy |
| **OpenAI** | Cloud | Pay-per-use | Low | Easy |
| **Local (transformers.js)** | Browser/Node | Free | High | Medium |

## Best Lightweight Models for CV Sorting

Based on 2024-2025 benchmarks, here are the **recommended models** for HR/recruitment tasks:

### Top Picks by Memory Budget

| Memory | Model | Provider | Best For |
|--------|-------|----------|----------|
| **< 500MB** | SmolLM2-135M-Instruct | HuggingFace | Simple extraction, classification |
| **< 1GB** | SmolLM2-360M-Instruct | HuggingFace/Ollama | Fast analysis, entity extraction |
| **< 2GB** | Qwen2.5-0.5B-Instruct | HuggingFace/Ollama | Multilingual, good quality |
| **< 4GB** | Qwen2.5-1.5B-Instruct | HuggingFace/Ollama | **RECOMMENDED** - Best quality/size ratio |
| **< 8GB** | Phi-3.5-mini-instruct | HuggingFace/Ollama | Best reasoning, summarization |

### Why These Models?

- **SmolLM2** (Hugging Face): State-of-the-art small models, trained on high-quality datasets including code and math
- **Qwen2.5** (Alibaba): Excellent multilingual support (29+ languages), 128K context length
- **Phi-3.5** (Microsoft): Best reasoning capability, rivals GPT-3.5 on many benchmarks

## Quick Start

### Option 1: Hugging Face (Easiest - Free Tier)

Get a free API key and start immediately:

```bash
# 1. Get free API key from https://huggingface.co/settings/tokens
export HF_API_KEY="hf_..."

# 2. Optional: Choose a specific model (defaults to SmolLM2-360M)
export HF_MODEL="Qwen/Qwen2.5-1.5B-Instruct"  # Recommended for quality
# or
export HF_MODEL="HuggingFaceTB/SmolLM2-135M-Instruct"  # Fastest
```

### Option 2: Ollama (Best for Privacy)

Ollama runs LLMs locally on your machine. No API keys needed, completely private.

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a recommended model (choose based on your RAM)
ollama pull smollm2:135m     # Ultra-fast, ~300MB RAM
ollama pull smollm2:360m     # Fast, ~750MB RAM
ollama pull qwen2.5:1.5b     # RECOMMENDED, ~3GB RAM
ollama pull phi3.5:3.8b      # Best quality, ~4GB RAM (quantized)

# Ollama runs automatically on http://localhost:11434
```

The service will auto-detect Ollama if running.

### Option 3: OpenAI (or Compatible APIs)

Set your API key:

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL="gpt-3.5-turbo"  # Optional, defaults to gpt-3.5-turbo
```

For OpenAI-compatible APIs (Groq, Together.ai, Anyscale):

```bash
export OPENAI_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://api.groq.com/openai/v1"  # Groq example
export OPENAI_MODEL="llama-3.1-8b-instant"
```

### Option 3: Hugging Face

```bash
export HF_API_KEY="hf_..."
export HF_MODEL="microsoft/phi-2"  # Optional
```

## Model Recommendations

### By Use Case (CV Sorting Tasks)

| Use Case | Hugging Face Model | Ollama Model | Memory |
|----------|-------------------|--------------|--------|
| **Skill extraction** | SmolLM2-360M-Instruct | smollm2:360m | ~750MB |
| **CV summarization** | Qwen2.5-1.5B-Instruct | qwen2.5:1.5b | ~3GB |
| **Candidate comparison** | Phi-3.5-mini-instruct | phi3.5:3.8b | ~4GB |
| **Interview questions** | Qwen2.5-1.5B-Instruct | qwen2.5:1.5b | ~3GB |
| **Multilingual CVs** | Qwen2.5-1.5B-Instruct | qwen2.5:1.5b | ~3GB |
| **Simple classification** | SmolLM2-135M-Instruct | smollm2:135m | ~300MB |

### By Hardware

| Hardware | Recommended Model | Notes |
|----------|-------------------|-------|
| **2GB RAM** | SmolLM2-135M | Ultra-fast, basic tasks |
| **4GB RAM** | SmolLM2-360M or Qwen2.5-0.5B | Good for most extraction |
| **8GB RAM** | Qwen2.5-1.5B | **Best balance** - recommended |
| **16GB RAM** | Phi-3.5-mini (3.8B) | Best quality, full FP16 |
| **GPU 4GB VRAM** | Qwen2.5-1.5B quantized | Fast inference |
| **GPU 8GB VRAM** | Phi-3.5-mini | Excellent quality |

### Model Benchmarks (Relevant to HR Tasks)

| Model | Params | MMLU | MT-Bench | Memory | Speed |
|-------|--------|------|----------|--------|-------|
| SmolLM2-135M | 135M | ~35% | ~4.5 | 300MB | ⚡⚡⚡⚡ |
| SmolLM2-360M | 360M | ~42% | ~5.2 | 750MB | ⚡⚡⚡⚡ |
| Qwen2.5-0.5B | 0.5B | ~47% | ~5.5 | 1GB | ⚡⚡⚡ |
| SmolLM2-1.7B | 1.7B | ~50% | ~6.0 | 3.4GB | ⚡⚡⚡ |
| Qwen2.5-1.5B | 1.5B | ~58% | ~6.5 | 3GB | ⚡⚡⚡ |
| Phi-3.5-mini | 3.8B | ~69% | ~8.4 | 7.6GB | ⚡⚡ |

*MMLU = Massive Multitask Language Understanding (general knowledge)*
*MT-Bench = Multi-turn conversation quality*

## Configuration

### Environment Variables

```bash
# Ollama (local)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# OpenAI (cloud)
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-3.5-turbo

# Hugging Face (cloud)
HF_API_KEY=hf_...
HF_MODEL=microsoft/phi-2
```

### CDS Configuration (package.json)

```json
{
  "cds": {
    "ai": {
      "provider": "auto",
      "ollama": {
        "baseUrl": "http://localhost:11434",
        "model": "llama3.2:3b"
      },
      "openai": {
        "model": "gpt-3.5-turbo"
      }
    }
  }
}
```

### Provider Priority

When `provider: "auto"`, the service checks providers in this order:
1. Ollama (if running locally)
2. OpenAI (if API key set)
3. Hugging Face (if API key set)
4. Local transformers.js (if installed)
5. Mock responses (fallback)

## API Reference

### Ollama Endpoints Used

- `POST /api/generate` - Text completion
- `POST /api/chat` - Chat completion
- `POST /api/embeddings` - Text embeddings
- `GET /api/tags` - List available models

### OpenAI Endpoints Used

- `POST /chat/completions` - Chat completion
- `POST /embeddings` - Text embeddings

## Switching Providers

To force a specific provider:

```javascript
// In code
const { AIProviderFactory, AI_PROVIDERS } = require('./srv/lib/ai-provider');
const provider = AIProviderFactory.create(AI_PROVIDERS.OLLAMA, {
    model: 'mistral:7b'
});
```

Or set environment:

```bash
# Force Ollama
unset OPENAI_API_KEY
unset HF_API_KEY

# Force OpenAI
export OPENAI_API_KEY="sk-..."
```

## Troubleshooting

### Ollama not detected

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve
```

### Slow responses

- Use a smaller model (`phi3:mini` instead of `mistral:7b`)
- Reduce `maxTokens` in configuration
- Consider using GPU acceleration for Ollama

### Memory issues

```bash
# Use a quantized model
ollama pull phi3:mini  # Uses less RAM than 7B models
```

### Rate limiting (OpenAI/HuggingFace)

The service automatically falls back to the next available provider if one fails.

## Cost Comparison

| Provider | Cost | Rate Limits |
|----------|------|-------------|
| Ollama | Free (your hardware) | None |
| OpenAI GPT-3.5 | ~$0.002/1K tokens | 3-10K RPM |
| OpenAI GPT-4o-mini | ~$0.15/1M tokens | 500-10K RPM |
| Groq | Free tier available | 30 RPM free |
| Hugging Face | Free tier available | Variable |

## Security Considerations

- **Ollama**: All data stays on your machine
- **Cloud APIs**: Data sent to external servers
- **Recommendations**:
  - Use Ollama for sensitive candidate data
  - Use cloud APIs only for non-PII queries
  - Review provider data retention policies
