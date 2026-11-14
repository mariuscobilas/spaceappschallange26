---
name: fine-tuning-expert
description: >-
  Workflows for LoRA/QLoRA parameter-efficient fine-tuning (PEFT), structured output validation,
  dataset curation, and systematic prompt evaluation.
---

# Fine-Tuning & Prompt Optimization Skill

Best practices for adapting foundation models to domain-specific agricultural advisory and structured output synthesis.

## 1. LoRA / QLoRA Workflow

When customizing open-weights models (e.g. Llama 3, Mistral, Gemma):

1. **Parameter Efficiency**: Use QLoRA (4-bit quantization + low-rank adapters, rank $r=16, \alpha=32$).
2. **Target Modules**: Apply adapters to query/key/value projections (`q_proj`, `v_proj`).
3. **Dataset Curation**:
   - Minimum 500-1,000 high-quality input-output pairs formatted in conversational JSONL.
   - Dedicate 15% to hold-out validation.

## 2. Structured Outputs & JSON Schema Enforcing

Always enforce Pydantic schemas for LLM responses to avoid parsing failures:

```python
from pydantic import BaseModel
from openai import OpenAI

client = OpenAI()

class CropRecommendation(BaseModel):
    crop_name: str
    rationale: str
    suitability_score: float

completion = client.beta.chat.completions.parse(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "You are a NASA agricultural adaptation advisor."},
        {"role": "user", "content": "Analyze shifting corn to sorghum in drought regions."}
    ],
    response_format=CropRecommendation,
)
```

## 3. Systematic Prompt Evaluation

- Maintain a benchmark test suite of 20 realistic farmer scenarios.
- Run automated evaluations checking:
  - Correct schema formatting (100% target).
  - Agronomic plausibility (verified against baseline guidelines).
  - Absence of hallucinated metrics.

