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
  window.localStorage.clear();
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
    await open('admin', 'planning');
    await userEvent.click(await screen.findByRole('button', { name: 'Catalogue des TP' }));
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
    await open('admin', 'planning');
    await userEvent.click(await screen.findByRole('button', { name: 'Catalogue des TP' }));
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
    await open('admin', 'planning');
    await userEvent.click(await screen.findByRole('button', { name: 'Catalogue des TP' }));
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
    await open('prof', 'planning');
    await userEvent.click(await screen.findByRole('button', { name: 'Catalogue des TP' }));
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
