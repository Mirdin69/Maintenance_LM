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
  it('liste les salles et la salle partagée (Administration)', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Salles' }));
    expect(await screen.findByText('Grand atelier')).toBeInTheDocument();
    expect(screen.getAllByText('Partagée').length).toBeGreaterThan(0);
  });
  it('un enseignant n’a plus d’onglet Salles ni Administration', async () => {
    await open('prof', '');
    await screen.findByText('Tableau de bord');
    expect(screen.queryByRole('button', { name: 'Salles' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Administration' })).toBeNull();
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

describe('administration', () => {
  it('gère les élèves depuis Administration, plus depuis le suivi', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Élèves' }));
    expect(await screen.findByText('Mise à jour par fichier Excel')).toBeInTheDocument();
    const input = screen.getByLabelText(/Nom de l’élève à ajouter dans 2PB1.1/);
    await userEvent.type(input, 'Nina T.{enter}');
    expect(await screen.findByText('Nina T.')).toBeInTheDocument();
  });
  it('le suivi des élèves n’a plus d’import', async () => {
    await open('admin', 'eleves');
    await screen.findByText('Suivi des élèves');
    expect(screen.queryByText(/Mise à jour par fichier/)).toBeNull();
    expect(screen.queryByText(/Ajouter ou mettre à jour des élèves/)).toBeNull();
  });
  it('ajoute un outil dans la liste', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Outils' }));
    await userEvent.click(await screen.findByText('Ajouter un outil'));
    await userEvent.type(screen.getByLabelText(/Nom \*/), 'Pince coupante');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter l’outil' }));
    expect(await screen.findByText('Pince coupante')).toBeInTheDocument();
    expect(screen.getByText('Multimètre numérique CAT III')).toBeInTheDocument();
  });
  it('enregistre le titre et les logos', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Apparence' }));
    const title = await screen.findByLabelText('Titre du site');
    await userEvent.clear(title);
    await userEvent.type(title, 'Atelier La Mâche');
    await userEvent.type(screen.getByLabelText(/Logo du lycée/), 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view?usp=sharing');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.getAllByText('Atelier La Mâche').length).toBeGreaterThan(0));
    const img = document.querySelector('img[alt="Logo du lycée"]') as HTMLImageElement;
    expect(img.src).toContain('drive.google.com/thumbnail?id=1AbCdEfGhIjKlMnOpQrSt');
  });
  it('les outils sont visibles par un enseignant, sans modification', async () => {
    await open('prof', 'systemes');
    await userEvent.click(await screen.findByRole('button', { name: 'Outils' }));
    expect(await screen.findByText('Multimètre numérique CAT III')).toBeInTheDocument();
    expect(screen.queryByText('Ajouter un outil')).toBeNull();
  });
});

describe('semainier', () => {
  it('affiche les TP affectés et permet de changer une case', async () => {
    await open('prof', 'semainier');
    const cell = (await screen.findAllByRole('combobox', { name: /^2PB1\.1,/ }))[0];
    expect(cell).toBeEnabled();
    const options = within(cell).getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('Prod Ener (1)');
    expect(options).toContain('Période d’observation');
  });
  it('un lecteur voit le semainier sans pouvoir le modifier', async () => {
    await open('lecture', 'semainier');
    const cell = (await screen.findAllByRole('combobox', { name: /^2PB1\.1,/ }))[0];
    expect(cell).toBeDisabled();
  });
  it('« Mes cours » liste les TP de l’utilisateur', async () => {
    await open('admin', 'semainier');
    await userEvent.click(await screen.findByRole('button', { name: 'Mes cours' }));
    expect(await screen.findByText(/Répartition sur l’année/)).toBeInTheDocument();
    expect(screen.getAllByText('Industrie (1)').length).toBeGreaterThan(0);
  });
  it('la vue semaine montre domaine, enseignant, TP, objectif et compétences', async () => {
    await open('admin', 'semainier');
    await userEvent.click(await screen.findByRole('button', { name: 'Semaine' }));
    expect((await screen.findAllByText('Compétences')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Objectif').length).toBeGreaterThan(0);
  });
});

describe('fiches', () => {
  it('crée une fiche séance, la retrouve et l’ouvre', async () => {
    await open('prof', 'fiches');
    await userEvent.click(await screen.findByRole('button', { name: '+ Fiche séance' }));
    await userEvent.type(screen.getByLabelText(/Titre \*/), 'Inversion du sens de marche');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Fiche enregistrée.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Retour à la liste/ }));
    expect(await screen.findByText('Inversion du sens de marche')).toBeInTheDocument();
  });
});

describe('documents et séquences', () => {
  it('joint un document à un TP et affiche son aperçu Drive', async () => {
    await open('admin', 'planning');
    await userEvent.click(await screen.findByRole('button', { name: 'Catalogue des TP' }));
    await userEvent.click(await screen.findByText('Ajouter un TP'));
    await userEvent.type(screen.getByLabelText(/Titre \*/), 'TP avec document');
    await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un document' }));
    await userEvent.type(screen.getByLabelText('Titre du document 1'), 'Sujet.docx');
    await userEvent.type(screen.getByLabelText('Lien du document 1'), 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    const btn = await screen.findByRole('button', { name: '1 document' });
    await userEvent.click(btn);
    await userEvent.click(await screen.findByRole('button', { name: 'Aperçu' }));
    const frame = document.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.src).toBe('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/preview');
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(screen.getByText('Word')).toBeInTheDocument();
  });
  it('relie une fiche séance à une fiche séquence avec un document', async () => {
    await open('prof', 'fiches');
    await userEvent.click(await screen.findByRole('button', { name: '+ Fiche séquence' }));
    await userEvent.type(screen.getByLabelText(/Titre \*/), 'Séquence moteur');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await userEvent.click(await screen.findByRole('button', { name: /Retour à la liste/ }));
    await userEvent.click(await screen.findByRole('button', { name: '+ Fiche séance' }));
    await userEvent.type(screen.getByLabelText(/Titre \*/), 'Séance 1 moteur');
    await userEvent.selectOptions(screen.getByLabelText('Fiche séquence liée'), screen.getByRole('option', { name: 'Séquence moteur' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un document' }));
    await userEvent.type(screen.getByLabelText('Titre du document 1'), 'Fiche séance.pdf');
    await userEvent.type(screen.getByLabelText('Lien du document 1'), 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('button', { name: 'Séquence moteur' })).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Séquence moteur' }));
    expect(await screen.findByText(/Fiches séance rattachées \(1\)/)).toBeInTheDocument();
    expect(screen.getAllByText('Séance 1 moteur').length).toBeGreaterThan(0);
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
