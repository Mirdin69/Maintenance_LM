import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { fileName, pdfText, seanceModel, sequenceModel, toDocx, toPdf } from '@/lib/ficheExport';
import { seanceData, sequenceData } from '@/lib/fiche';

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const head = (u: Uint8Array, n: number) => String.fromCharCode(...u.slice(0, n));

const seq = sequenceData({
  domaine: 'Industriel (STEF Lyon Gerland)', organisation: '7 séances de 55 min', objectif: 'Câbler hors tension', cc: ['CC11', 'CC42', 'CC51'], competences: ['C1', 'C4', 'C6'],
  parties: [{ partie: 'A', intitule: 'Préparation', nature: 'Étude', duree: '1 h 10', supports: 'Photos, schéma', competences: 'CC11 (C1)' }, { partie: 'B1', intitule: 'Implantation', nature: 'Réalisation', duree: '1 h 05', supports: '', competences: 'CC41' }],
  principe: [{ titre: 'Arrêts de validation', texte: '4 arrêts' }, { titre: 'Rotation', texte: '' }],
  coherence: '- Fil rouge STEF\n- Prolonge le TP 2.0',
  evaluation: [{ cc: 'CC42', indicateur: 'Câblage', na: 'Non réalisé', eca: '> 3 écarts', pa: '1 à 3 écarts', a: 'Aucun écart' }], autoeval: 'Auto-évaluation en fin de séance.',
});
const sea = seanceData({
  numero: '2.1', objectif: 'Câbler', contexte: 'STEF', cc: ['CC42'], competences: ['C4'], prerequis: 'Thème 2.0\nSécurité', duree: 'Durée totale : 385 min',
  blocs: [{ titre: 'Mercredi – 165 min', lignes: [{ activite: 'A – Préparation', duree: '35 min', professeur: 'Accueil', eleve: 'Répond', outils: 'Dossier' }, { activite: 'B1', duree: '65 min', professeur: 'Gère', eleve: 'Prélève', outils: 'Placard' }] }],
  situation: 'Mise en situation', deroulement: '- Gestes\n- Préparation', vigilance: [{ type: 'danger', texte: 'Coffret hors tension (Ω)' }, { type: 'ok', texte: 'Cartes de couleur' }], guide: 'Liste pré-remplie', autonome: '', expert: 'Cherche un défaut', annexe: 'Grille',
}, new Date('2026-11-22'));

describe('export des fiches en Word et en PDF', () => {
  it('le modèle suit le plan des documents : séquence en paysage, séance en portrait', () => {
    const a = sequenceModel('Thème 2.1', 'Seconde', seq);
    const b = seanceModel('Câbler', 'Seconde', sea, 'Thème 2.1');
    expect([a.orientation, b.orientation]).toEqual(['landscape', 'portrait']);
    const bars = (m: typeof a) => m.blocks.filter((x) => x.t === 'bar').map((x) => (x as { text: string }).text);
    expect(bars(a)).toEqual(['Identité de la séquence', 'Compétences couvertes', 'Récapitulatif du TP', 'Principe d’organisation', 'Cohérence pédagogique et fil rouge', 'Évaluation']);
    expect(bars(b)).toEqual(['Activité en lien avec le référentiel MELEC', 'Fiche de déroulement', 'Scénario']);
    // la rubrique vide du principe n'est pas exportée ; le total des durées est calculé
    expect(a.blocks.find((x) => x.t === 'kv' && x.rows.some(([k]) => k === 'Arrêts de validation'))).toBeTruthy();
    expect(JSON.stringify(a.blocks)).not.toContain('"Rotation"');
    expect(JSON.stringify(a.blocks)).toContain('2 h 15');
    expect(JSON.stringify(b.blocks)).toContain('1 h 40');
  });
  it('produit un vrai fichier Word (.docx)', async () => {
    for (const m of [sequenceModel('Thème 2.1', 'Seconde', seq), seanceModel('Câbler', 'Seconde', sea, 'Thème 2.1')]) {
      const u = await bytes(await toDocx(m));
      expect(head(u, 2)).toBe('PK');
      expect(u.length).toBeGreaterThan(3000);
    }
    writeFileSync('/tmp/fiche-sequence.docx', await bytes(await toDocx(sequenceModel('Thème 2.1', 'Seconde', seq))));
    writeFileSync('/tmp/fiche-seance.docx', await bytes(await toDocx(seanceModel('Câbler', 'Seconde', sea, 'Thème 2.1'))));
  });
  it('produit un vrai fichier PDF', async () => {
    for (const m of [sequenceModel('Thème 2.1', 'Seconde', seq), seanceModel('Câbler', 'Seconde', sea, 'Thème 2.1')]) {
      const u = await bytes(await toPdf(m));
      expect(head(u, 5)).toBe('%PDF-');
      expect(u.length).toBeGreaterThan(3000);
    }
    writeFileSync('/tmp/fiche-sequence.pdf', await bytes(await toPdf(sequenceModel('Thème 2.1', 'Seconde', seq))));
    writeFileSync('/tmp/fiche-seance.pdf', await bytes(await toPdf(seanceModel('Câbler', 'Seconde', sea, 'Thème 2.1'))));
  });
  it('nom de fichier sans accents et texte PDF limité aux caractères des polices standard', () => {
    expect(fileName('Câbler & vérifier : l’alimentation d’un groupe', 'pdf')).toBe('Cabler_verifier_l_alimentation_d_un_groupe.pdf');
    expect(fileName('???', 'docx')).toBe('fiche.docx');
    expect(pdfText('⚠ 10 Ω → “ok” – é’')).toBe(' 10 ohm -> “ok” – é’');
  });
});
