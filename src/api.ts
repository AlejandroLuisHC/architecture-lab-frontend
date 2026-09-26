import type {
    ArchitectureAnalysis,
    Evaluation,
    Lab,
    LabConfiguration,
    Progress,
    Scenario,
    ScenarioSummary,
    WorkloadAssumptions,
} from './types';

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
    const result = await request<{ progress: Progress | null }>('/me/progress/serverless-web', {}, token);
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

export type ScenarioInput = {
    title: string;
    region: string;
    workloadAssumptions: WorkloadAssumptions;
    configuration: LabConfiguration;
    relationships: Array<{ sourceId: string; targetId: string; kind: string }>;
    cloudFormationSource?: string;
};
export async function listScenarios(token: string): Promise<ScenarioSummary[]> {
    return (await request<{ scenarios: ScenarioSummary[] }>('/me/scenarios', {}, token)).scenarios;
}
export async function getScenario(token: string, id: string): Promise<Scenario> {
    return (await request<{ scenario: Scenario }>(`/me/scenarios/${encodeURIComponent(id)}`, {}, token))
        .scenario;
}
export async function createScenario(
    token: string,
    input: ScenarioInput,
): Promise<{ id: string; currentRevision: number }> {
    return (
        await request<{ scenario: { id: string; currentRevision: number } }>(
            '/me/scenarios',
            { method: 'POST', body: JSON.stringify(input) },
            token,
        )
    ).scenario;
}
export async function updateScenario(
    token: string,
    id: string,
    input: ScenarioInput,
    expectedRevision: number,
): Promise<{ id: string; currentRevision: number }> {
    return (
        await request<{ scenario: { id: string; currentRevision: number } }>(
            `/me/scenarios/${encodeURIComponent(id)}`,
            { method: 'PUT', body: JSON.stringify({ ...input, expectedRevision }) },
            token,
        )
    ).scenario;
}
export async function analyzeArchitecture(
    input: ScenarioInput & { refreshPrices?: boolean; scenarioId?: string; revision?: number },
    token?: string,
): Promise<{ analysis: ArchitectureAnalysis }> {
    return request<{ analysis: ArchitectureAnalysis }>(
        '/sandbox/analyze',
        { method: 'POST', body: JSON.stringify(input) },
        token,
    );
}
