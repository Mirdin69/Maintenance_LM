// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { configureDemo } from '@/lib/api.fake';

const open = async (as: string, tab: string, studentsOn = true) => {
  configureDemo({ as: as as never, studentsOn });
  window.location.hash = tab;
  render(<App />);
};

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '';
});

describe('accès', () => {
  it('affiche la connexion hors session et refuse un autre domaine', async () => {
    await open('signedout', '');
    await userEvent.click(await screen.findByRole('button', { name: /Première connexion/i }));
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
    await userEvent.type(screen.getByLabelText(/Prénom de l’élève à ajouter dans 2PB1.1/), 'Nina');
    await userEvent.type(screen.getByLabelText(/Nom de famille/), 'Tessier{enter}');
    expect(await screen.findByText('Nina TE')).toBeInTheDocument();
    expect(screen.queryByText(/Tessier/)).toBeNull();
    const row = screen.getByText('Nina TE').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Effacer' }));
    expect(screen.queryByText(/retrouver la plupart des suppressions/)).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmer' }));
    await waitFor(() => expect(screen.queryByText('Nina TE')).toBeNull());
  });
  it('purge les élèves sortis après la durée de conservation et affiche la page de confidentialité', async () => {
    const old = new Date(); old.setMonth(old.getMonth() - 30);
    await open('admin', 'admin');
    await api.insert('students', [{ name: 'Vieux VI', group_code: '2PB1.1', left_at: old.toISOString().slice(0, 10) }, { name: 'Actif AC', group_code: '2PB1.1' }]);
    await userEvent.click(await screen.findByRole('button', { name: 'Confidentialité' }));
    expect(await screen.findByText(/À purger maintenant/)).toHaveTextContent('1 élève sorti');
    await userEvent.click(screen.getByRole('button', { name: 'Lancer la purge maintenant' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmer' }));
    await waitFor(async () => expect((await api.select<{ name: string }>('students')).map((s) => s.name)).not.toContain('Vieux VI'));
    expect((await api.select<{ name: string }>('students')).map((s) => s.name)).toContain('Actif AC');
    window.location.hash = 'confidentialite';
    expect(await screen.findByRole('heading', { name: 'Confidentialité et données personnelles' })).toBeInTheDocument();
    expect(screen.getByText(/2 premières lettres du nom/)).toBeInTheDocument();
  });
  it('le suivi des élèves n’a plus d’import', async () => {
    await open('admin', 'eleves');
    await screen.findByRole('heading', { name: 'Suivi des élèves' });
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
    await userEvent.type(screen.getByLabelText('Logo du lycée'), 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view?usp=sharing');
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

describe('textes des onglets et jours par niveau', () => {
  it('modifie le commentaire d’un onglet et le retire de l’impression', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Textes' }));
    const area = (await screen.findAllByLabelText(/sous le titre « Tableau de bord »/))[0];
    await userEvent.clear(area);
    await userEvent.type(area, 'Bienvenue à l’atelier');
    const panel = area.closest('section') as HTMLElement;
    await userEvent.click(within(panel).getByLabelText('Imprimer ce commentaire'));
    await userEvent.click(within(panel).getByRole('button', { name: 'Enregistrer' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Accueil' }));
    const p = await screen.findByText('Bienvenue à l’atelier');
    expect(p.className).toContain('no-print');
  });
  it('règle les jours affichés séparément pour chaque niveau', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Calendrier' }));
    const fri = async (l: string) => within(await screen.findByRole('group', { name: `Jours affichés ${l}` })).getByLabelText('vendredi');
    await userEvent.click(await fri('Terminale'));
    await waitFor(async () => expect(await fri('Terminale')).toBeChecked());
    expect(await fri('Seconde')).not.toBeChecked();
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
    await open('admin', 'catalogue');
    await userEvent.click(await screen.findByText('Ajouter un TP'));
    await userEvent.type(screen.getByLabelText(/Titre \*/), 'TP avec document');
    await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un lien' }));
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
  it('dépose un PDF et un Excel sur un TP et les prévisualise', async () => {
    (URL as unknown as Record<string, unknown>).createObjectURL = () => 'blob:test';
    (URL as unknown as Record<string, unknown>).revokeObjectURL = () => {};
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Suivi').addRows([['Nom', 'Note'], ['Dupont', 'Valeur-12']]);
    const xlsx = new File([await wb.xlsx.writeBuffer()], 'suivi.xlsx');
    const pdf = new File(['%PDF-1.4'], 'cours.pdf', { type: 'application/pdf' });
    await open('admin', 'catalogue');
    await userEvent.click(await screen.findByText('Ajouter un TP'));
    await userEvent.type(screen.getByLabelText(/Titre \*/), 'TP fichiers');
    await userEvent.upload(screen.getByLabelText('Déposer un fichier'), [pdf, xlsx]);
    expect(await screen.findByLabelText('Titre du document 2')).toHaveValue('suivi.xlsx');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    await userEvent.click(await screen.findByRole('button', { name: '2 documents' }));
    const previews = await screen.findAllByRole('button', { name: 'Aperçu' });
    await userEvent.click(previews[0]);
    await waitFor(() => expect((document.querySelector('iframe') as HTMLIFrameElement).src).toBe('blob:test'));
    await userEvent.click(screen.getByRole('button', { name: 'Masquer' }));
    await userEvent.click((await screen.findAllByRole('button', { name: 'Aperçu' }))[1]);
    expect(await screen.findByText('Valeur-12')).toBeInTheDocument();
  });
  it('refuse un fichier au mauvais format', async () => {
    await open('admin', 'catalogue');
    await userEvent.click(await screen.findByText('Ajouter un TP'));
    await userEvent.upload(screen.getByLabelText('Déposer un fichier'), new File(['x'], 'virus.exe'), { applyAccept: false });
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.queryByLabelText('Titre du document 1')).toBeNull();
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
    await userEvent.click(screen.getByRole('button', { name: '+ Ajouter un lien' }));
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

import { api } from '@/lib/api';
import { fireEvent } from '@testing-library/react';

const openWith = async (as: string, tab: string, prepare?: () => Promise<unknown>) => {
  configureDemo({ as: as as never });
  if (prepare) await prepare();
  window.location.hash = tab;
  render(<App />);
};

describe('nouvelles fonctions', () => {
  it('la recherche trouve un système et ouvre son onglet', async () => {
    await open('admin', 'accueil');
    await userEvent.type(await screen.findByLabelText('Rechercher'), 'zelio');
    const hit = await screen.findByRole('option', { name: /Banc Zelio/ });
    await userEvent.click(hit);
    await waitFor(() => expect(window.location.hash).toBe('#admin'));
    expect(await screen.findByRole('heading', { name: 'Systèmes pédagogiques' })).toBeInTheDocument();
  });

  it('signale une panne : intervention créée, système hors service, alerte affichée', async () => {
    await open('prof', 'accueil');
    await userEvent.click(await screen.findByRole('button', { name: 'Signaler une panne' }));
    const dlg = within(await screen.findByRole('dialog', { name: 'Signaler une panne' }));
    await userEvent.selectOptions(dlg.getByLabelText('Système *'), 'Banc API M221');
    await userEvent.type(dlg.getByLabelText('Ce qui ne marche pas *'), 'Port Ethernet cassé');
    await userEvent.click(dlg.getByRole('button', { name: 'Signaler' }));
    expect(await screen.findByText('Panne signalée.')).toBeInTheDocument();
    const sys = (await api.select<{ name: string; state: string }>('systems')).find((s) => s.name === 'Banc API M221')!;
    expect(sys.state).toBe('hs');
    expect((await api.select<{ title: string }>('maintenance')).some((m) => m.title === 'Port Ethernet cassé')).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: /^Alertes/ }));
    expect(await screen.findByText(/hors service/)).toBeInTheDocument();
  });

  it('un changement du semainier peut être annulé', async () => {
    await open('prof', 'semainier');
    const cell = (await screen.findAllByRole('combobox', { name: /^2PB1\.1,/ }))[0] as HTMLSelectElement;
    const before = cell.value;
    await userEvent.selectOptions(cell, 'Évaluation');
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect((screen.getAllByRole('combobox', { name: /^2PB1\.1,/ })[0] as HTMLSelectElement).value).toBe(before));
  });

  it('copie une semaine vers la suivante', async () => {
    await open('prof', 'semainier');
    await userEvent.click(await screen.findByText('Copier une semaine vers une autre'));
    await userEvent.click(await screen.findByRole('button', { name: /^Copier \(Seconde\)/ }));
    expect(await screen.findByText(/cases? copiées?/)).toBeInTheDocument();
  });

  it('crée automatiquement l’intervention d’un contrôle préventif échu', async () => {
    await openWith('admin', 'maintenance', async () => {
      const [sys] = await api.select<{ id: string }>('systems');
      await api.insert('maintenance_plans', { system_id: sys.id, title: 'Contrôle isolement', every_days: 90, next_due: '2020-01-01', checklist: ['Mesure', 'Visuel'] });
    });
    expect(await screen.findByText('Contrôle isolement')).toBeInTheDocument();
    const m = (await api.select<{ title: string; kind: string; description: string }>('maintenance')).find((x) => x.title === 'Contrôle isolement')!;
    expect(m.kind).toBe('prev');
    expect(m.description).toContain('- Mesure');
    expect((await api.select<{ next_due: string }>('maintenance_plans'))[0].next_due > '2025-01-01').toBe(true);
  });

  it('PFMP : ajoute une période pour un élève', async () => {
    await open('prof', 'pfmp');
    await userEvent.click(await screen.findByText('Ajouter une période de PFMP'));
    const sel = (await screen.findByLabelText('Élève *')) as HTMLSelectElement;
    await userEvent.selectOptions(sel, sel.options[1].value);
    await userEvent.type(screen.getByLabelText('Début *'), '2026-12-01');
    await userEvent.type(screen.getByLabelText('Fin *'), '2026-12-19');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(await screen.findByText('Période ajoutée.')).toBeInTheDocument();
    expect((await screen.findAllByText(/Prévue|En cours|Terminée/)).length).toBeGreaterThan(0);
  });

  it('l’historique liste les modifications et permet de les annuler', async () => {
    await openWith('admin', 'admin', async () => { await api.insert('systems', { name: 'Système éphémère' }); });
    await userEvent.click(await screen.findByRole('button', { name: 'Historique' }));
    expect(await screen.findByText('Système éphémère')).toBeInTheDocument();
    const btn = screen.getAllByRole('button', { name: 'Annuler' })[0];
    await userEvent.click(btn);
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmer' }));
    await waitFor(async () => expect((await api.select<{ name: string }>('systems')).some((s) => s.name === 'Système éphémère')).toBe(false));
  });

  it('les systèmes ne sont plus dans la barre d’onglets mais dans Administration', async () => {
    await open('admin', 'accueil');
    const nav = within(await screen.findByRole('navigation', { name: 'Sections' }));
    expect(nav.queryByRole('button', { name: 'Systèmes' })).toBeNull();
    await userEvent.click(nav.getByRole('button', { name: 'Administration' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Systèmes' }));
    expect(await screen.findByRole('heading', { name: 'Systèmes pédagogiques' })).toBeInTheDocument();
  });

  it('un enseignant ne voit pas l’historique', async () => {
    await open('prof', 'admin');
    expect(screen.queryByRole('button', { name: 'Historique' })).toBeNull();
  });

  it('le budget s’affiche dans les achats avec l’alerte de dépassement', async () => {
    await openWith('admin', 'achats', async () => { await api.upsert('settings', [{ key: 'budget_mat', value: '100' }], 'key'); });
    expect(await screen.findByText('Budget de l’année')).toBeInTheDocument();
    expect(await screen.findByText(/en attente de validation/)).toBeInTheDocument();
  });

  it('suivi par compétence', async () => {
    await open('prof', 'eleves');
    await userEvent.click(await screen.findByRole('button', { name: 'Par compétence' }));
    expect(await screen.findByText('Élèves au moins PA')).toBeInTheDocument();
  });

  it('rotation des groupes sur les systèmes', async () => {
    await open('prof', 'planning');
    await userEvent.click(await screen.findByRole('button', { name: 'Rotations des groupes' }));
    await userEvent.selectOptions(await screen.findByLabelText('Groupe'), '1PB1.1');
    await userEvent.click(screen.getByLabelText(/Banc API M221/));
    await userEvent.click(screen.getByLabelText(/Banc Zelio/));
    expect(await screen.findByText('Groupe 1')).toBeInTheDocument();
    expect(screen.getByText('Groupe 2')).toBeInTheDocument();
    expect(screen.getAllByText(/Séance/).length).toBeGreaterThanOrEqual(2);
  });

  it('dépose une image pour un système', async () => {
    await open('admin', 'systemes');
    await userEvent.click(await screen.findByText('Ajouter un système'));
    await userEvent.upload(await screen.findByLabelText('Déposer une image : Image du système'), new File(['x'], 'banc.png', { type: 'image/png' }));
    await waitFor(() => expect((screen.getByLabelText('Image du système') as HTMLInputElement).value).toContain('demo.local/images'));
  });

  it('refuse une image trop lourde ou d’un mauvais format', async () => {
    await open('admin', 'systemes');
    await userEvent.click(await screen.findByText('Ajouter un système'));
    const input = await screen.findByLabelText('Déposer une image : Image du système');
    fireEvent.change(input, { target: { files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(/n’est pas une image/)).toBeInTheDocument();
    expect((screen.getByLabelText('Image du système') as HTMLInputElement).value).toBe('');
  });

  it('la banque liste les ressources marquées réutilisables', async () => {
    await openWith('prof', 'banque', async () => {
      const tp = (await api.select<{ id: string }>('tps'))[0];
      await api.update('tps', { id: tp.id }, { reusable: true });
    });
    expect(await screen.findByText('Réutilisable')).toBeInTheDocument();
  });

  it('duplique un TP', async () => {
    await open('prof', 'catalogue');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Dupliquer' }))[0]);
    expect(await screen.findByText('TP dupliqué.')).toBeInTheDocument();
    expect((await api.select<{ code: string }>('tps')).some((t) => /\(copie\)/.test(t.code ?? ''))).toBe(true);
  });

  it('le bilan de l’année est accessible aux gestionnaires', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Bilan' }));
    expect(await screen.findByText('cases de TP au semainier')).toBeInTheDocument();
  });

  it('les réglages des jours du semainier restent mémorisés', async () => {
    await open('admin', 'semainier');
    await userEvent.click(await screen.findByRole('button', { name: 'Terminale' }));
    expect(window.localStorage.getItem('parc:sem-level')).toBe('Terminale');
  });
});

describe('interface', () => {
  it('regroupe les pages par rubrique avec fil d’Ariane', async () => {
    await open('admin', 'accueil');
    const nav = within(await screen.findByRole('navigation', { name: 'Sections' }));
    expect(nav.getAllByRole('button').map((b) => b.textContent)).toEqual(['Accueil', 'Planifier', 'Pédagogie', 'Atelier', 'Aide', 'Administration']);
    await userEvent.click(nav.getByRole('button', { name: 'Atelier' }));
    const sub = within(await screen.findByRole('navigation', { name: 'Pages de la rubrique' }));
    await userEvent.click(sub.getByRole('button', { name: 'Achats' }));
    const crumbs = screen.getByLabelText('Fil d’Ariane');
    expect(crumbs).toHaveTextContent('Atelier');
    expect(crumbs).toHaveTextContent('Achats');
    await userEvent.click(nav.getByRole('button', { name: 'Atelier' }));
    expect(window.location.hash).toBe('#achats');
  });

  it('la page Aide change le thème et la taille du texte', async () => {
    await open('prof', 'aide');
    await userEvent.selectOptions(await screen.findByLabelText('Thème'), 'dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    await userEvent.selectOptions(screen.getByLabelText('Taille du texte'), 'large');
    expect(document.documentElement.getAttribute('data-size')).toBe('large');
    await userEvent.selectOptions(screen.getByLabelText('Thème'), 'auto');
    await userEvent.selectOptions(screen.getByLabelText('Taille du texte'), 'normal');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(screen.getByText('Questions fréquentes')).toBeInTheDocument();
  });

  it('les formulaires s’ouvrent dans un panneau latéral fermé par Échap', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Systèmes' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter un système' }));
    expect(await screen.findByRole('dialog', { name: 'Ajouter un système' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('la suppression demande une confirmation qui détaille les conséquences', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Systèmes' }));
    await userEvent.click((await screen.findAllByRole('button', { name: 'Supprimer' }))[0]);
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent(/Supprimer «/);
    await userEvent.click(within(dlg).getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((await api.select('systems')).length).toBeGreaterThan(0);
  });

  it('modifie le nombre de postes directement dans la liste et affiche l’enregistrement', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Systèmes' }));
    const input = (await screen.findAllByLabelText(/^Postes de /))[0] as HTMLInputElement;
    const name = input.getAttribute('aria-label')!.replace('Postes de ', '');
    await userEvent.clear(input);
    await userEvent.type(input, '7{Enter}');
    await waitFor(async () => expect((await api.select<{ name: string; qty: number }>('systems')).find((s) => s.name === name)!.qty).toBe(7));
    expect(await screen.findByText('✓ Enregistré')).toBeInTheDocument();
  });

  it('importe des systèmes collés depuis Excel', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Systèmes' }));
    await userEvent.click(await screen.findByText('Coller une liste depuis Excel'));
    const area = await screen.findByLabelText('Lignes à importer');
    await userEvent.click(area);
    await userEvent.paste('Nom\tRéférence\tPostes\nBanc collé\tZ9\t3\nAutre banc\t\t2');
    await userEvent.click(await screen.findByRole('button', { name: /^Importer 2 lignes/ }));
    await waitFor(async () => expect((await api.select<{ name: string; qty: number }>('systems')).filter((s) => ['Banc collé', 'Autre banc'].includes(s.name))).toHaveLength(2));
  });

  it('importe des TP collés depuis Excel et signale les valeurs inconnues', async () => {
    await open('prof', 'catalogue');
    await userEvent.click(await screen.findByText('Coller une liste de TP depuis Excel'));
    const area = await screen.findByLabelText('Lignes à importer');
    await userEvent.click(area);
    await userEvent.paste('Code\tTitre\tNiveau\tDomaine\tDurée (h)\tEnseignant\tSéquence\tObjectif\tCompétences\tSystèmes\nXT1\tTP importé un\t1ère\tTertiaire\t4\tMarc M.\tSéq A\tObjectif\tC1-C3 - C99\tSystème inexistant\nXT2\tTP importé deux\t\t\t\t\t\t\t\t\n\tSans niveau valide\tCM2\t\t\t\t\t\t\t');
    expect(await screen.findByText(/compétence « C99 » inconnue/)).toBeInTheDocument();
    expect(screen.getByText(/niveau « CM2 » inconnu/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: /^Importer 3 lignes/ }));
    await waitFor(async () => {
      const t = (await api.select<{ code: string; level: string; domain: string; competences: string[]; teacher_id: string | null }>('tps')).filter((x) => x.code?.startsWith('XT'));
      expect(t).toHaveLength(2);
      const one = t.find((x) => x.code === 'XT1')!;
      expect([one.level, one.domain, one.competences.join(','), !!one.teacher_id]).toEqual(['Première', 'ter', 'C1,C3', true]);
    });
  });

  it('ajoute un domaine dans Administration et le propose dans le catalogue', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Domaines' }));
    await userEvent.type(await screen.findByLabelText('Nom du domaine *'), 'Froid et clim');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter le domaine' }));
    expect(await screen.findByText('Domaine ajouté.')).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: 'Froid et clim' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Nom du domaine *'), 'Industriel');
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter le domaine' }));
    expect(await screen.findByText('Ce domaine existe déjà.')).toBeInTheDocument();
    window.location.hash = 'catalogue';
    await userEvent.click(await screen.findByText('Ajouter un TP'));
    expect(await screen.findByRole('option', { name: 'Froid et clim' })).toBeInTheDocument();
  });

  it('importe les vacances de la zone A puis prépare la nouvelle année', async () => {
    const y = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const rec = (description: string, s: string, e: string) => ({ description, start_date: s, end_date: e, population: '-', zones: 'Zone A' });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ results: [rec('Vacances de Noël', `${y}-12-19`, `${y + 1}-01-04`)] }) })));
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Calendrier' }));
    await userEvent.click((await screen.findAllByRole('button', { name: new RegExp(`Importer les vacances ${y}-${y + 1}`) }))[0]);
    expect(await screen.findByText(/Vacances de la zone A trouvées/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^Ajouter ces 1 périodes/ }));
    expect(await screen.findByText('1 période de vacances ajoutée.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Prévisualiser et préremplir' }));
    const dlg = await screen.findByRole('dialog', { name: 'Préparer la nouvelle année' });
    expect(dlg).toHaveTextContent(/case/);
    expect(dlg).toHaveTextContent(/aucune vacance n’est enregistrée pour la nouvelle année/);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    vi.unstubAllGlobals();
  });

  it('propose de restaurer le brouillon d’une fiche', async () => {
    window.localStorage.setItem('parc:draft:fiche:new-seance', JSON.stringify({ title: 'Brouillon séance', level: '', d: { activites: [] }, sequenceId: '' }));
    await open('prof', 'fiches');
    await userEvent.click(await screen.findByRole('button', { name: '+ Fiche séance' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurer le brouillon' }));
    expect(await screen.findByDisplayValue('Brouillon séance')).toBeInTheDocument();
  });

  it('l’accueil d’un gestionnaire liste ce qui est à traiter', async () => {
    await open('admin', 'accueil');
    expect(await screen.findByRole('region', { name: 'À traiter' })).toBeInTheDocument();
  });
});

describe('fonctions élèves désactivées', () => {
  it('grise Suivi des élèves et PFMP avec une info-bulle, et bloque les pages', async () => {
    await open('admin', 'eleves', false);
    const btn = await screen.findByRole('button', { name: 'PFMP' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Désactivé en attente validation RGPD');
    expect(screen.getByRole('button', { name: 'Suivi des élèves' })).toHaveAttribute('title', 'Désactivé en attente validation RGPD');
    expect(await screen.findByRole('heading', { name: 'Fonction désactivée' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
    await userEvent.click(btn);
    expect(window.location.hash).toBe('#eleves');
  });
  it('désactive aussi la section Élèves de l’administration, réactivable dans Confidentialité', async () => {
    await open('admin', 'admin', false);
    const sec = await screen.findByRole('button', { name: 'Élèves' });
    expect(sec).toHaveAttribute('title', 'Désactivé en attente validation RGPD');
    await userEvent.click(sec);
    expect(sec).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByLabelText('Prénom de l’élève à ajouter dans 2PB1.1')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Confidentialité' }));
    await userEvent.click(await screen.findByLabelText(/Activer le suivi des élèves/));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Élèves' })).not.toHaveAttribute('aria-disabled'));
  });
});

describe('boîte à idées', () => {
  it('un enseignant propose et soutient une idée, un gestionnaire répond', async () => {
    await open('prof', 'idees');
    await userEvent.type(await screen.findByLabelText(/Votre idée en une phrase/), 'Exporter le semainier en PDF');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer l’idée' }));
    expect(await screen.findByText('Exporter le semainier en PDF')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Soutenir/ }));
    expect(await screen.findByRole('button', { name: /Je soutiens · 1/ })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Statut de l’idée/)).toBeNull();
  });
  it('un gestionnaire change le statut et répond', async () => {
    await open('admin', 'idees');
    await userEvent.type(await screen.findByLabelText(/Votre idée en une phrase/), 'Mode sombre automatique');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer l’idée' }));
    await userEvent.selectOptions(await screen.findByLabelText(/Statut de l’idée « Mode sombre automatique »/), 'retenue');
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Statut de l’idée « Mode sombre automatique »/ })).toHaveValue('retenue'));
    await userEvent.type(screen.getByLabelText(/Réponse à « Mode sombre automatique »/), 'Prévu en décembre');
    await userEvent.tab();
    expect(await screen.findByText(/Prévu en décembre/)).toBeInTheDocument();
  });
});

describe('demi-journées, salle et carrousel', () => {
  it('permet de choisir la salle d’une case du semainier', async () => {
    await open('prof', 'semainier');
    const room = (await screen.findAllByRole('combobox', { name: /^Salle, 2PB1\.1,/ }))[0];
    await userEvent.selectOptions(room, 'A101');
    expect(await screen.findByText('Salle modifiée.')).toBeInTheDocument();
    await waitFor(() => expect((screen.getAllByRole('combobox', { name: /^Salle, 2PB1\.1,/ })[0] as HTMLSelectElement).selectedOptions[0].textContent).toBe('A101'));
  });
  it('génère le carrousel d’une demi-journée et remplit le semainier', async () => {
    await open('admin', 'edt');
    await userEvent.click(await screen.findByText(/Générer une demi-journée/));
    await userEvent.type(screen.getByLabelText(/Intitulé \*/), 'REM');
    await userEvent.selectOptions(screen.getByLabelText('Salle de l’activité 1'), 'B201');
    await userEvent.selectOptions(screen.getByLabelText('Salle de l’activité 2'), 'B202');
    await userEvent.selectOptions(screen.getByLabelText('Salle de l’activité 3'), 'A103');
    const preview = await screen.findByRole('table', { name: /Aperçu de la rotation/ });
    expect(within(preview).getAllByText(/^TP · B201/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /^Générer \d+ créneaux?/ }));
    expect(await screen.findByText(/créneaux? créés?, \d+ cases? du semainier/)).toBeInTheDocument();
  });
  it('propose matin et après-midi pour chaque jour dans le calendrier', async () => {
    await open('admin', 'admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Calendrier' }));
    const sel = (await screen.findAllByLabelText(/^Partie de la journée, lundi Seconde/i))[0];
    await userEvent.selectOptions(sel, 'MA');
    expect(await screen.findByText('Enregistré.')).toBeInTheDocument();
  });
});
