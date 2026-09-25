import type { Evaluation, Lab, LabConfiguration, Progress } from './types';

const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError('The lab service is unreachable. Please try again.', 0, 'NETWORK_ERROR');
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      typeof body.message === 'string' ? body.message : 'Something went wrong.',
      response.status,
      typeof body.code === 'string' ? body.code : 'REQUEST_FAILED',
    );
  }
  return body as T;
}

export async function getLab(): Promise<Lab> {
  const result = await request<{ lab: Lab }>('/labs/serverless-web');
  return result.lab;
}

export async function validateConfiguration(configuration: LabConfiguration): Promise<Evaluation> {
  const result = await request<{ evaluation: Evaluation }>('/labs/serverless-web/validate', {
    method: 'POST',
    body: JSON.stringify({ configuration }),
  });
  return result.evaluation;
}

export async function getProgress(token: string): Promise<Progress | null> {
  const result = await request<{ progress: Progress | null }>(
    '/me/progress/serverless-web',
    {},
    token,
  );
  return result.progress;
}

export async function saveProgress(
  token: string,
  version: number,
  configuration: LabConfiguration,
  currentStep: number,
): Promise<Progress> {
  const result = await request<{ progress: Progress }>(
    '/me/progress/serverless-web',
    {
      method: 'PUT',
      body: JSON.stringify({ version, configuration, currentStep }),
    },
    token,
  );
  return result.progress;
}
