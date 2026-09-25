import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { Evaluation, Lab, LabStep } from '../types';

const api = vi.hoisted(() => ({
  getLab: vi.fn(),
  getProgress: vi.fn(),
  saveProgress: vi.fn(),
  validateConfiguration: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, ...api };
});
vi.mock('../firebase', () => ({ auth: null }));

const steps: LabStep[] = [
  { id: 'delivery', number: '01', title: 'Build a private origin', services: ['Amazon S3'], goal: 'Keep the site private.', concept: 'Use controlled delivery.', instructions: ['Configure storage.'] },
  { id: 'api', number: '02', title: 'Connect the API', services: ['API Gateway'], goal: 'Route a request.', concept: 'Connect HTTP to compute.', instructions: ['Configure an API route.'] },
  { id: 'data', number: '03', title: 'Protect application data', services: ['DynamoDB'], goal: 'Store application items.', concept: 'Use scoped permissions.', instructions: ['Configure data access.'] },
  { id: 'observe', number: '04', title: 'Observe the function', services: ['CloudWatch'], goal: 'Record and notice failures.', concept: 'Use logs and alarms.', instructions: ['Configure monitoring.'] },
];
const lab: Lab = {
  id: 'serverless-web', version: 2, title: 'Build a serverless web app', description: 'Build a small serverless app.', duration: '45 minutes', level: 'Beginner',
  initialConfiguration: { resources: [] },
  serviceCatalog: steps.map((step, stepIndex) => ({ category: step.title, services: [{ id: ['s3', 'api-gateway', 'dynamodb', 'cloudwatch'][stepIndex], name: step.services[0], stepIndex }] })),
  steps,
};

function evaluation(stage: number, passed: boolean): Evaluation {
  return {
    complete: stage === 3 && passed,
    passedChecks: passed ? stage + 1 : stage,
    totalChecks: 4,
    steps: steps.map((step, index) => {
      const checkPassed = index < stage || (index === stage && passed);
      return { stepId: step.id, passed: checkPassed, checks: [{ id: `check-${index}`, label: `Stage ${index + 1} is configured`, passed: checkPassed, hint: 'Review this stage.' }] };
    }),
  };
}

beforeEach(() => {
  api.getLab.mockResolvedValue(lab);
  api.getProgress.mockReset();
  api.saveProgress.mockReset();
  api.validateConfiguration.mockReset();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches: false, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })),
  });
  window.scrollTo = vi.fn();
});

describe('guest learning flow', () => {
  it('shows failed checks, unlocks each stage after validation, and reaches completion', async () => {
    const user = userEvent.setup();
    api.validateConfiguration
      .mockResolvedValueOnce(evaluation(0, false))
      .mockResolvedValueOnce(evaluation(0, true))
      .mockResolvedValueOnce(evaluation(1, true))
      .mockResolvedValueOnce(evaluation(2, true))
      .mockResolvedValueOnce(evaluation(3, true));
    render(<App />);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Learn how cloud'));
    await user.click(screen.getAllByRole('button', { name: /explore the module/i })[0]);
    await user.click(screen.getByRole('button', { name: /open module/i }));
    await screen.findByRole('heading', { name: 'Amazon S3' });
    expect(screen.getByText('Guest session · not saved')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'API Gateway' })).toHaveAttribute('aria-disabled', 'true');

    await user.click(screen.getByRole('button', { name: /check configuration/i }));
    expect(await screen.findByText('Review these checks')).toBeInTheDocument();
    expect(screen.getByText('Review this stage.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /check configuration/i }));
    await user.click(await screen.findByRole('button', { name: /continue to next stage/i }));
    await screen.findByRole('heading', { name: 'API Gateway' });

    await user.click(screen.getByRole('button', { name: /check configuration/i }));
    await user.click(await screen.findByRole('button', { name: /continue to next stage/i }));
    await screen.findByRole('heading', { name: 'DynamoDB' });

    await user.click(screen.getByRole('button', { name: /check configuration/i }));
    await user.click(await screen.findByRole('button', { name: /continue to next stage/i }));
    await screen.findByRole('heading', { name: 'CloudWatch' });

    await user.click(screen.getByRole('button', { name: /check configuration/i }));
    await user.click(await screen.findByRole('button', { name: /view your architecture/i }));

    expect(await screen.findByRole('heading', { name: 'You built a serverless web app.' })).toBeInTheDocument();
    expect(screen.getByText('WHAT YOU LEARNED')).toBeInTheDocument();
    expect(api.validateConfiguration).toHaveBeenCalledTimes(5);
  });

  it('persists a theme switch for the next visit', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { level: 1 });

    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(window.localStorage.getItem('stack-playground.theme.v1')).toBe('dark');
  });
});
