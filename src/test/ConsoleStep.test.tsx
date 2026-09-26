import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConsoleStep from '../components/ConsoleStep';
import type { LabConfiguration, LabStep } from '../types';

const step: LabStep = {
    id: 'delivery',
    number: '01',
    title: 'Build a private origin',
    services: ['Amazon S3'],
    goal: 'Keep the website files private.',
    concept: 'CloudFront can serve files from a private bucket.',
    instructions: ['Create a bucket.'],
};

function SandboxHarness() {
    const [configuration, setConfiguration] = useState<LabConfiguration>({ resources: [] });
    return (
        <ConsoleStep
            serviceId="s3"
            serviceName="Amazon S3"
            step={step}
            configuration={configuration}
            onChange={setConfiguration}
        />
    );
}

describe('ConsoleStep resource editing', () => {
    beforeEach(() => {
        Object.defineProperty(window.crypto, 'randomUUID', {
            configurable: true,
            value: vi.fn(() => 'bucket-test-id'),
        });
    });

    it('creates, edits, and deletes a simulated S3 bucket', async () => {
        const user = userEvent.setup();
        render(<SandboxHarness />);

        await user.click(screen.getByRole('button', { name: 'Create your first resource' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await user.type(screen.getByLabelText('Bucket name'), 'site-assets');
        await user.click(screen.getByRole('checkbox', { name: /block all public access/i }));
        await user.click(screen.getByRole('button', { name: 'Create resource' }));

        expect(await screen.findByRole('button', { name: 'site-assets' })).toBeInTheDocument();
        expect(screen.getByText('Private')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Bucket saved in this sandbox.');

        await user.click(screen.getByRole('button', { name: 'Edit bucket site-assets' }));
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        const name = screen.getByLabelText('Bucket name');
        await user.clear(name);
        await user.type(name, 'edited-assets');
        await user.click(screen.getByRole('button', { name: 'Save changes' }));
        expect(await screen.findByRole('button', { name: 'edited-assets' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Delete bucket edited-assets' }));
        expect(await screen.findByText('No resources yet')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Bucket deleted from this sandbox.');
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
});
