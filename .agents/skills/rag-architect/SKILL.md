---
name: rag-architect
description: >-
  Architectural patterns for retrieval-augmented generation (RAG), vector embeddings,
  pgvector indexing, semantic search, and grounded agricultural recommendations.
---

# RAG Architect Skill

Guidance for designing semantic retrieval pipelines over agricultural research, USDA extension documents, and NASA mission reports.

## Pipeline Architecture

```text
Documents (NASA / USDA PDFs)
       │
       ▼
1. Chunking (Semantic chunking, 500-1000 tokens, 100 overlap)
       │
       ▼
2. Embeddings (e.g. text-embedding-3-small, BAAI/bge-small-en-v1.5)
       │
       ▼
3. Vector Store (PostgreSQL + pgvector extension)
       │
       ▼
4. Hybrid Retrieval (BM25 keyword search + Cosine vector similarity)
       │
       ▼
5. Reranking (Cross-encoder reranker e.g. Cohere / BGE-reranker)
       │
       ▼
6. Grounded Context + LLM Generation
```

## PostgreSQL + pgvector Setup

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_title TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    embedding vector(1536)
);

-- HNSW index for high performance similarity search
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);
```

## Grounding & Hallucination Prevention

- Always require the LLM to cite document chunks in its final advice.
- When retrieval confidence is below threshold, instruct the model to state: *"No verified NASA/USDA guidance available for this specific query."*

