# Alternative AI Providers Guide

This branch uses non-SAP AI providers for the Joule AI features. You can use local models (Ollama), cloud APIs (OpenAI, Hugging Face), or browser-based models.

## Supported Providers

| Provider | Type | Cost | Privacy | Setup Difficulty |
|----------|------|------|---------|------------------|
| **Ollama** | Local | Free | High | Easy |
| **OpenAI** | Cloud | Pay-per-use | Low | Easy |
| **Hugging Face** | Cloud | Free tier | Low | Easy |
| **Local (transformers.js)** | Browser/Node | Free | High | Medium |

## Quick Start

### Option 1: Ollama (Recommended for Local Development)

Ollama runs LLMs locally on your machine. No API keys needed, completely private.

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a recommended model (choose one based on your hardware)
ollama pull phi3:mini        # Fast, 3.8B params, ~2GB RAM
ollama pull llama3.2:3b      # Balanced, 3B params, ~2GB RAM
ollama pull mistral:7b       # Quality, 7B params, ~4GB RAM

# Ollama runs automatically on http://localhost:11434
```

The service will auto-detect Ollama if running.

### Option 2: OpenAI (or Compatible APIs)

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

### By Use Case

| Use Case | Ollama Model | OpenAI Model | Notes |
|----------|--------------|--------------|-------|
| Fast responses | `phi3:mini` | `gpt-3.5-turbo` | Best for quick queries |
| Quality analysis | `mistral:7b` | `gpt-4o-mini` | Better reasoning |
| Code understanding | `codellama:7b` | `gpt-4o` | Optimized for code |
| Low memory | `tinyllama` | `gpt-3.5-turbo` | Under 1GB RAM |

### By Hardware

| Hardware | Recommended Model | RAM Required |
|----------|-------------------|--------------|
| 8GB RAM | `phi3:mini` | ~2GB |
| 16GB RAM | `llama3.2:3b` | ~3GB |
| 32GB+ RAM | `mistral:7b` or larger | ~4-8GB |
| GPU (8GB VRAM) | `llama3.1:8b` | Fast inference |

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
