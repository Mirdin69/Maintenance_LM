// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { configureDemo } from '@/lib/api.fake';

describe('mot de passe', () => {
  beforeEach(() => { localStorage.clear(); window.location.hash = ''; configureDemo({ as: 'prof' }); });

  it('propose de choisir un mot de passe puis permet de se reconnecter avec', async () => {
    const u = userEvent.setup();
    render(<App />);
    await u.click(await screen.findByRole('button', { name: 'Choisir un mot de passe' }));
    await u.type(screen.getByLabelText('Nouveau mot de passe'), 'court');
    await u.type(screen.getByLabelText('Confirmer le mot de passe'), 'court');
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('au moins 8');
    await u.clear(screen.getByLabelText('Nouveau mot de passe'));
    await u.clear(screen.getByLabelText('Confirmer le mot de passe'));
    await u.type(screen.getByLabelText('Nouveau mot de passe'), 'secret-1234');
    await u.type(screen.getByLabelText('Confirmer le mot de passe'), 'secret-1234');
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Mot de passe enregistré/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('button', { name: 'Choisir un mot de passe' })).toBeNull();

    await u.click(screen.getByRole('button', { name: /Marc M/ }));
    await u.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }));
    await u.type(await screen.findByLabelText('Adresse e-mail'), 'marc.m@lamache.org');
    await u.type(screen.getByLabelText('Mot de passe'), 'mauvais-mdp');
    await u.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('incorrect');
    await u.clear(screen.getByLabelText('Mot de passe'));
    await u.type(screen.getByLabelText('Mot de passe'), 'secret-1234');
    await u.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Marc M/ })).toBeInTheDocument());
  });
});
