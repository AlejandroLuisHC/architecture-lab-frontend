import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import Sandbox from '../components/Sandbox';

const api = vi.hoisted(() => ({
    analyzeArchitecture: vi.fn(),
    listScenarios: vi.fn(),
    createScenario: vi.fn(),
    getScenario: vi.fn(),
    updateScenario: vi.fn(),
}));
vi.mock('../api', () => api);

beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    api.listScenarios.mockResolvedValue([]);
    api.analyzeArchitecture.mockResolvedValue({
        analysis: {
            findings: [
                {
                    id: 'finding-1',
                    category: 'reliability',
                    severity: 'warning',
                    title: 'Single instance is a failure point',
                    explanation: 'One instance cannot tolerate a failure.',
                    recommendation: 'Add redundancy.',
                    resourceIds: ['resource-1'],
                },
            ],
            estimate: {
                currency: 'USD',
                monthlyLow: null,
                monthlyHigh: null,
                source: 'AWS Price List Bulk API',
                effectiveAt: null,
                coverage: 'Current rate coverage is unavailable.',
                assumptions: ['No rates loaded.'],
            },
            performance: {
                summary: 'Rule-based estimate; no cloud workload was run.',
                assumptions: ['Run a workload test to measure latency.'],
            },
        },
    });
});

describe('freeform architecture sandbox', () => {
    it('creates a guest draft, analyzes it, and reopens it from browser storage', async () => {
        const user = userEvent.setup();
        render(<Sandbox user={null} onSignIn={vi.fn()} />);

        await user.click(screen.getByRole('button', { name: /new architecture/i }));
        await user.click(screen.getByRole('button', { name: /amazon ec2/i }));
        await user.click(screen.getByRole('button', { name: /create ec2/i }));
        expect(screen.getByRole('button', { name: /ec2 1/i })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /amazon s3/i }));
        await user.click(screen.getByRole('button', { name: /create s3/i }));
        await user.selectOptions(screen.getByRole('combobox', { name: /block public access/i }), 'false');
        await user.click(screen.getByRole('button', { name: /amazon cloudfront/i }));
        await user.click(screen.getByRole('button', { name: /create cloudfront/i }));
        const bucketOption = screen.getByRole('option', { name: 'S3 1' });
        await user.selectOptions(
            screen.getByRole('combobox', { name: /connect to/i }),
            bucketOption.getAttribute('value') ?? '',
        );
        await user.selectOptions(screen.getByRole('combobox', { name: /relationship type/i }), 'uses-origin');
        await user.click(screen.getByRole('button', { name: /add relationship/i }));
        expect(screen.getAllByText('uses-origin').length).toBeGreaterThan(0);
        await user.click(screen.getByRole('button', { name: /analyze architecture/i }));

        expect(await screen.findByText('Single instance is a failure point')).toBeInTheDocument();
        expect(api.analyzeArchitecture).toHaveBeenCalledWith(
            expect.objectContaining({
                region: 'us-east-1',
                configuration: expect.objectContaining({
                    resources: expect.arrayContaining([
                        expect.objectContaining({ service: 'ec2', schemaVersion: 1 }),
                    ]),
                }),
                workloadAssumptions: expect.objectContaining({ requestsPerMonth: 100000 }),
            }),
            undefined,
        );
        await user.click(screen.getByRole('button', { name: /stack playground/i }));
        expect(screen.getByRole('heading', { name: 'Untitled architecture' })).toBeInTheDocument();
        await waitFor(() =>
            expect(window.localStorage.getItem('stack-playground.sandbox.drafts.v1')).toContain(
                '"blockPublicAccess":false',
            ),
        );
    });

    it('saves an architecture to the signed-in account and reopens its saved revision', async () => {
        const user = userEvent.setup();
        const account = { getIdToken: vi.fn().mockResolvedValue('id-token') } as unknown as User;
        api.createScenario.mockResolvedValue({ id: 'scenario-1', currentRevision: 1 });
        api.listScenarios.mockResolvedValueOnce([]).mockResolvedValueOnce([
            {
                id: 'scenario-1',
                title: 'Orders architecture',
                mode: 'freeform',
                region: 'eu-west-1',
                currentRevision: 1,
                updatedAt: '2026-09-25T10:00:00.000Z',
            },
        ]);
        api.getScenario.mockResolvedValue({
            id: 'scenario-1',
            title: 'Orders architecture',
            mode: 'freeform',
            region: 'eu-west-1',
            currentRevision: 1,
            updatedAt: '2026-09-25T10:00:00.000Z',
            workloadAssumptions: {
                requestsPerMonth: 1000,
                averageDurationMs: 100,
                storageGb: 5,
                availabilityTarget: 99.9,
            },
            snapshot: { configuration: { resources: [] }, relationships: [] },
        });
        render(<Sandbox user={account} onSignIn={vi.fn()} />);

        await user.click(await screen.findByRole('button', { name: /new architecture/i }));
        await user.clear(screen.getByRole('textbox', { name: 'Architecture name' }));
        await user.type(screen.getByRole('textbox', { name: 'Architecture name' }), 'Orders architecture');
        await user.click(screen.getByRole('button', { name: /save architecture/i }));
        await waitFor(() =>
            expect(api.createScenario).toHaveBeenCalledWith(
                'id-token',
                expect.objectContaining({ title: 'Orders architecture' }),
            ),
        );
        await user.click(screen.getByRole('button', { name: /stack playground/i }));
        await user.click(await screen.findByRole('button', { name: /open architecture/i }));

        expect(await screen.findByRole('textbox', { name: 'Architecture name' })).toHaveValue(
            'Orders architecture',
        );
        expect(api.getScenario).toHaveBeenCalledWith('id-token', 'scenario-1');
    });

    it('keeps the current console architecture when CloudFormation edits are invalid', async () => {
        const user = userEvent.setup();
        render(<Sandbox user={null} onSignIn={vi.fn()} />);

        await user.click(screen.getByRole('button', { name: /new architecture/i }));
        await user.click(screen.getByRole('button', { name: /amazon ec2/i }));
        await user.click(screen.getByRole('button', { name: /create ec2/i }));
        await user.click(screen.getByRole('tab', { name: /cloudformation/i }));
        const editor = screen.getByRole('textbox', { name: /cloudformation yaml source/i });
        fireEvent.change(editor, { target: { value: 'Resources:\n  Broken: [\n' } });
        await user.click(screen.getByRole('button', { name: /validate and apply/i }));

        expect(await screen.findByRole('alert')).toHaveTextContent(/line/i);
        await user.click(screen.getByRole('button', { name: /discard edits/i }));
        await user.click(screen.getByRole('tab', { name: /^services$/i }));
        expect(screen.getByRole('button', { name: /ec2 1/i })).toBeInTheDocument();
    });
});
