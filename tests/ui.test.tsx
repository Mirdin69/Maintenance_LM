// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { configureDemo } from '@/lib/api.fake';

const open = async (as: string, tab: string) => {
  configureDemo({ as: as as never });
  window.location.hash = tab;
  render(<App />);
};

beforeEach(() => {
  window.location.hash = '';
});

describe('accès', () => {
  it('affiche la connexion hors session et refuse un autre domaine', async () => {
    await open('signedout', '');
    const input = await screen.findByLabelText(/Adresse e-mail/i);
    await userEvent.type(input, 'eleve@gmail.com');
    await userEvent.click(screen.getByRole('button', { name: /Recevoir le lien/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('@lamache.org');
  });
  it('affiche l’attente de validation', async () => {
    await open('pending', '');
    expect(await screen.findByText(/en attente de validation/i)).toBeInTheDocument();
  });
  it('masque l’administration à un enseignant', async () => {
    await open('prof', '');
    await screen.findByText('Tableau de bord');
    expect(screen.queryByRole('button', { name: 'Administration' })).toBeNull();
  });
  it('montre l’administration au gestionnaire', async () => {
    await open('admin', 'admin');
    expect(await screen.findByText(/Comptes à valider/)).toBeInTheDocument();
  });
});

describe('salles et occupation', () => {
  it('liste les salles et la salle partagée', async () => {
    await open('admin', 'salles');
    expect(await screen.findByText('Grand atelier')).toBeInTheDocument();
    expect(screen.getAllByText('Partagée').length).toBeGreaterThan(0);
  });
  it('un enseignant ne peut pas créer de salle', async () => {
    await open('prof', 'salles');
    await screen.findByText(/Salles \(/);
    expect(screen.queryByText('Ajouter une salle')).toBeNull();
  });
  it('refuse un créneau en conflit avec un message clair', async () => {
    await open('admin', 'edt');
    await userEvent.click(await screen.findByText('Ajouter un créneau'));
    await userEvent.selectOptions(screen.getByLabelText(/Salle \*/), 'A101');
    await userEvent.selectOptions(screen.getByLabelText(/Groupe \*/), '1PB1.1');
    await userEvent.click(screen.getByLabelText('mercredi'));
    await userEvent.click(screen.getByLabelText('lundi'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/Conflit de salle/));
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeDisabled();
  });
  it('propose les salles libres', async () => {
    await open('admin', 'occupation');
    await screen.findByText('Trouver une salle libre');
    expect(screen.getAllByRole('button', { name: /Réserver/ }).length).toBeGreaterThan(0);
  });
});

describe('élèves', () => {
  it('fait évoluer une validation au clic', async () => {
    await open('admin', 'eleves');
    const table = await screen.findByRole('table');
    const btn = within(table).getAllByRole('button').find((b) => b.className.includes('mk') && !b.textContent?.trim().match(/NA|ECA|PA|A/));
    expect(btn).toBeDefined();
    await userEvent.click(btn!);
    await waitFor(() => expect(btn!.textContent).toBe('NA'));
  });
});
