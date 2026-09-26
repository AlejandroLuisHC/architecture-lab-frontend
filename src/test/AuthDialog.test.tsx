import { FirebaseError } from 'firebase/app';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AuthDialog from '../components/AuthDialog';

const authMocks = vi.hoisted(() => ({
    create: vi.fn(),
    signIn: vi.fn(),
    reset: vi.fn(),
}));

vi.mock('../firebase', () => ({ auth: { name: 'test-auth' } }));
vi.mock('firebase/auth', () => ({
    createUserWithEmailAndPassword: authMocks.create,
    signInWithEmailAndPassword: authMocks.signIn,
    sendPasswordResetEmail: authMocks.reset,
}));

describe('AuthDialog', () => {
    it('maps a sign-in failure to a helpful message without reaching Firebase', async () => {
        const user = userEvent.setup();
        authMocks.signIn.mockRejectedValue(new FirebaseError('auth/invalid-credential', 'invalid'));
        render(<AuthDialog onClose={vi.fn()} />);

        await user.click(screen.getByRole('button', { name: 'Sign in' }));
        await user.type(screen.getByLabelText('Email address'), 'learner@example.com');
        await user.type(screen.getByLabelText('Password'), 'not-a-real-password');
        await user.click(screen.getByRole('button', { name: 'Sign in' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Email or password not recognized.');
        expect(authMocks.signIn).toHaveBeenCalledWith(
            { name: 'test-auth' },
            'learner@example.com',
            'not-a-real-password',
        );
    });

    it('closes after a successful account creation', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        authMocks.create.mockResolvedValue({ user: { uid: 'test-user' } });
        render(<AuthDialog onClose={onClose} />);

        await user.type(screen.getByLabelText('Email address'), 'learner@example.com');
        await user.type(screen.getByLabelText('Password'), 'long-enough-password');
        await user.click(screen.getByRole('button', { name: 'Create account' }));

        expect(authMocks.create).toHaveBeenCalledWith(
            { name: 'test-auth' },
            'learner@example.com',
            'long-enough-password',
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
