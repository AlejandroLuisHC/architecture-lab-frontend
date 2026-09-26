import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLab, getProgress, saveProgress, validateConfiguration } from '../api';
import type { Lab, LabConfiguration, Progress } from '../types';

const configuration: LabConfiguration = { resources: [] };
const lab = { id: 'serverless-web', version: 2 } as Lab;
const progress = {
    version: 2,
    configuration,
    currentStep: 1,
    unlockedThroughStep: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    completedAt: null,
} as Progress;
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => fetchMock.mockReset());

describe('lab API client', () => {
    it('returns the lab definition from the service envelope', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ lab }), { status: 200 }));

        await expect(getLab()).resolves.toEqual(lab);
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringMatching(/\/labs\/serverless-web$/),
            expect.objectContaining({
                headers: { 'Content-Type': 'application/json' },
            }),
        );
    });

    it('posts a configuration for validation and returns the evaluation', async () => {
        const evaluation = { complete: false, passedChecks: 0, totalChecks: 11, steps: [] };
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ evaluation }), { status: 200 }));

        await expect(validateConfiguration(configuration)).resolves.toEqual(evaluation);
        expect(fetchMock.mock.calls[0][1]).toMatchObject({
            method: 'POST',
            body: JSON.stringify({ configuration }),
        });
    });

    it('sends the Firebase token when reading and saving progress', async () => {
        fetchMock
            .mockResolvedValueOnce(new Response(JSON.stringify({ progress }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify({ progress }), { status: 200 }));

        await expect(getProgress('test-token')).resolves.toEqual(progress);
        await expect(saveProgress('test-token', 2, configuration, 1)).resolves.toEqual(progress);

        for (const [, options] of fetchMock.mock.calls) {
            expect(options?.headers).toMatchObject({ Authorization: 'Bearer test-token' });
        }
        expect(fetchMock.mock.calls[1][1]).toMatchObject({
            method: 'PUT',
            body: JSON.stringify({ version: 2, configuration, currentStep: 1 }),
        });
    });

    it('maps network and server errors to actionable ApiError values', async () => {
        fetchMock.mockRejectedValueOnce(new TypeError('offline'));
        await expect(getLab()).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });

        fetchMock.mockResolvedValueOnce(
            new Response(JSON.stringify({ code: 'DATABASE_UNAVAILABLE', message: 'Try later.' }), {
                status: 503,
            }),
        );
        await expect(getProgress('test-token')).rejects.toMatchObject({
            code: 'DATABASE_UNAVAILABLE',
            status: 503,
            message: 'Try later.',
        });
    });

    it('uses a safe fallback when an error response has no JSON body', async () => {
        fetchMock.mockResolvedValue(new Response('not-json', { status: 502 }));

        await expect(getLab()).rejects.toMatchObject({
            code: 'REQUEST_FAILED',
            status: 502,
            message: 'Something went wrong.',
        });
    });
});
