import type {
  FieldAnalysisRequest,
  FieldAnalysisResponse,
  HealthResponse,
  MockRequest,
  MockResponse,
} from "@spaceapps/shared";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Robust API client for communicating with the FastAPI backend.
 */
export const apiClient = {
  async getHealth(): Promise<HealthResponse> {
    const res = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
    return res.json();
  },

  async sendMock(payload: MockRequest): Promise<MockResponse> {
    const res = await fetch(`${API_BASE_URL}/api/v1/mock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Mock failed: ${res.statusText}`);
    return res.json();
  },

  async analyzeField(payload: FieldAnalysisRequest): Promise<FieldAnalysisResponse> {
    const res = await fetch(`${API_BASE_URL}/api/v1/field-shift/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Field analysis failed (${res.status}): ${errorText}`);
    }
    return res.json();
  },
};

