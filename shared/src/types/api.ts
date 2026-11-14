/**
 * Standard API envelope and error contracts.
 */

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown> | Array<unknown> | null;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    requestId?: string;
    timestamp: string;
    processingTimeMs?: number;
    version?: string;
  };
}

export interface HealthResponse {
  status: "ok" | "degraded" | "error";
  service: string;
  version: string;
  timestamp: string;
  uptimeSeconds?: number;
  checks?: {
    api: boolean;
    mlModelLoaded: boolean;
    nasaDataService?: boolean;
  };
}

export interface MockRequest {
  message: string;
}

export interface MockResponse {
  message: string;
  mock: boolean;
  timestamp?: string;
}

