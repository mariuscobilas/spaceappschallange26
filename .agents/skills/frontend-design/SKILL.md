---
name: frontend-design
description: >-
  Anthropic-inspired frontend design guidance to eliminate generic AI-slop layouts,
  enforce intentional typography, balanced spacing, cohesive palettes, and polished UI hierarchy.
---

# Frontend Design & Visual Polish Skill

Principles for crafting distinct, professional, and tactile agricultural web applications without generic AI design clichés.

## Eliminating AI Design Clichés

- ❌ **Ban Generic Slop**: Avoid repetitive neon purple/cyan gradients on pure black backgrounds, identical pill badges plastered everywhere, and unstyled floating glassmorphism cards.
- ✅ **Embrace Domain Personality**: Field Shift is an agricultural, Earth-observation platform. Use earthy tones (deep sage greens, warm ambers, slate grays, soil ochres) combined with crisp modern typography.

## Design Systems & Hierarchy

### 1. Typography
- Limit font choices to at most 2 typefaces: one crisp sans-serif for UI/data (e.g., Geist, Inter, or system-ui) and optional display serif/monospace for statistics.
- Use tabular numbers (`font-variant-numeric: tabular-nums`) for satellite sensor data, coordinates, and metrics to prevent jitter on value updates.

### 2. Spacing & Rhythm
- Stick to a consistent 4px/8px spatial grid (`gap-2`, `gap-4`, `gap-6`, `p-6`).
- Group related metrics together inside cohesive functional sections rather than isolated scattered cards.

### 3. Purposeful Color Coding
- **Status Green**: Positive vegetation vigor (high NDVI anomaly, healthy soil moisture).
- **Amber / Ochre**: Emerging drought stress, watch state.
- **Crimson / Coral**: Critical thermal stress, severe soil depletion.
- Avoid using accent colors merely for decoration—every color must convey data state.

### 4. Data Density & Visual Rhythm
- Balance high-density data tables and satellite telemetry with spacious summary stat headers.
- Provide clear visual indicators for confidence scores, units of measurement, and satellite source timestamps.

