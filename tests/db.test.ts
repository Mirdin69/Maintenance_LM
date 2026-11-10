import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../supabase/migrations/0001_init.sql', import.meta.url), 'utf8');
const migration2 = readFileSync(new URL('../supabase/migrations/0002_semainier.sql', import.meta.url), 'utf8');
const migration3 = readFileSync(new URL('../supabase/migrations/0003_documents.sql', import.meta.url), 'utf8');
const migration5 = readFileSync(new URL('../supabase/migrations/0005_ameliorations.sql', import.meta.url), 'utf8');
const migration6 = readFileSync(new URL('../supabase/migrations/0006_domaines.sql', import.meta.url), 'utf8');
const migration7 = readFileSync(new URL('../supabase/migrations/0007_rgpd.sql', import.meta.url), 'utf8');
const migration8 = readFileSync(new URL('../supabase/migrations/0008_idees.sql', import.meta.url), 'utf8');
const migration9 = readFileSync(new URL('../supabase/migrations/0009_demi_journees.sql', import.meta.url), 'utf8');
const migration4 = readFileSync(new URL('../supabase/migrations/0004_stockage.sql', import.meta.url), 'utf8');
const seed = readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8');

// Simulation minimale de l'authentification Supabase
const authStub = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon;
  create role authenticated;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

let db: PGlite;
const ids: Record<string, string> = {};

async function addUser(key: string, email: string) {
  const r = await db.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email]);
  ids[key] = r.rows[0].id;
}
async function as(key: string | null) {
  await db.exec('reset role');
  if (key) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [ids[key]]);
    await db.exec('set role authenticated');
  } else {
    await db.exec("select set_config('request.jwt.claim.sub', '', false)");
    await db.exec('set role anon');
  }
}
async function sql(text: string, params: unknown[] = []) {
  return (await db.query<any>(text, params)).rows;
}
async function fails(text: string, params: unknown[] = []) {
  try {
    await db.query(text, params);
  } catch (e: any) {
    return String(e.message);
  }
  return null;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(authStub);
  await db.exec(`
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text default auth.uid()::text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
  `);
  await db.exec(migration);
  await db.exec(migration2);
  await db.exec(migration3);
  await db.exec(migration4);
  await db.exec(migration5);
  await db.exec(migration6);
  await db.exec(migration7);
  await db.exec(migration8);
  await db.exec(migration9);
  await addUser('admin', 'Alexandre.V@lamache.org');
  await addUser('prof', 'collegue@lamache.org');
  await addUser('prof2', 'autre@lamache.org');
  await addUser('lecteur', 'lecteur@lamache.org');
  await db.exec('reset role');
  // Le gestionnaire valide les autres comptes
  await db.exec(`update public.profiles set active = true where email in ('collegue@lamache.org','autre@lamache.org','lecteur@lamache.org')`);
  await db.exec(`update public.profiles set role = 'lecture' where email = 'lecteur@lamache.org'`);
  await db.exec(seed);
  await db.exec(`insert into public.rooms (name, kind, seats) values ('A101', 'atelier', 16), ('B202', 'salle', 30)`);
  await db.exec(`insert into public.rooms (name, kind, shared) values ('Grand atelier', 'atelier', true)`);
});

const room = async (name: string) => (await sql('select id from public.rooms where name = $1', [name]))[0].id as string;

describe('comptes', () => {
  it('refuse une adresse hors @lamache.org', async () => {
    await db.exec('reset role');
    const err = await fails(`insert into auth.users (email) values ('eleve@gmail.com')`);
    expect(err).toContain('@lamache.org');
    expect(await fails(`insert into auth.users (email) values ('x@lamache.org.evil.com')`)).toContain('@lamache.org');
    expect(await fails(`insert into auth.users (email) values ('a@b@lamache.org')`)).toContain('@lamache.org');
  });

  it('le premier compte est gestionnaire actif, les suivants attendent la validation', async () => {
    await db.exec('reset role');
    const rows = await sql('select email, role, active from public.profiles order by created_at');
    expect(rows[0]).toMatchObject({ email: 'alexandre.v@lamache.org', role: 'admin', active: true });
    await addUser('nouveau', 'nouveau@lamache.org');
    const n = (await sql(`select role, active from public.profiles where email = 'nouveau@lamache.org'`))[0];
    expect(n).toMatchObject({ role: 'prof', active: false });
  });

  it('empêche de retirer le dernier gestionnaire', async () => {
    await db.exec('reset role');
    const err = await fails(`update public.profiles set role = 'prof' where email = 'alexandre.v@lamache.org'`);
    expect(err).toContain('au moins un gestionnaire');
  });
});

describe('sécurité par ligne', () => {
  it('un compte en attente ne voit que son profil et aucune donnée', async () => {
    await as('nouveau');
    expect(await sql('select email from public.profiles')).toHaveLength(1);
    expect(await sql('select * from public.rooms')).toHaveLength(0);
    expect(await sql('select * from public.students')).toHaveLength(0);
  });

  it('un visiteur anonyme ne lit rien', async () => {
    await as(null);
    expect(await fails('select * from public.rooms')).toContain('permission denied');
  });

  it('un enseignant lit tout mais ne crée pas de salle', async () => {
    await as('prof');
    expect((await sql('select * from public.rooms')).length).toBeGreaterThanOrEqual(3);
    expect(await sql('select * from public.profiles')).toHaveLength(5);
    expect(await fails(`insert into public.rooms (name) values ('Pirate')`)).toContain('row-level security');
  });

  it('un enseignant ne peut pas se donner le rôle gestionnaire', async () => {
    await as('prof');
    await db.query(`update public.profiles set role = 'admin' where id = $1`, [ids.prof]);
    await as('admin');
    expect((await sql('select role from public.profiles where id = $1', [ids.prof]))[0].role).toBe('prof');
  });

  it('un lecteur ne peut rien écrire', async () => {
    await as('lecteur');
    expect(await fails(`insert into public.students (name, group_code) values ('Emma L.', '2PB1.1')`)).toContain('row-level security');
  });

  it('un enseignant ajoute des élèves et une progression', async () => {
    await as('prof');
    const [s] = await sql(`insert into public.students (name, group_code) values ('Emma L.', '1PB1.2') returning id`);
    const [t] = await sql(`select id from public.tps where code = 'TP5'`);
    await db.query(`insert into public.progress (student_id, tp_id, level) values ($1, $2, 'ECA')`, [s.id, t.id]);
    expect(await sql('select level from public.progress')).toEqual([{ level: 'ECA' }]);
    expect(await fails(`insert into public.progress (student_id, tp_id, level) values ($1, $2, 'XX')`, [s.id, t.id])).toBeTruthy();
  });

  it('seul un gestionnaire peut changer le statut d’un achat', async () => {
    await as('prof');
    const [p] = await sql(
      `insert into public.purchases (item, qty, requested_by) values ('Contacteur 25 A', 2, auth.uid()) returning id`,
    );
    expect(await fails(`insert into public.purchases (item, requested_by, status) values ('x', auth.uid(), 'ok')`)).toBeTruthy();
    const err = await fails(`update public.purchases set status = 'ok' where id = $1`, [p.id]);
    // RLS : la ligne reste visible mais le garde-fou refuse le changement de statut
    expect(err).toContain('gestionnaire');
    await as('prof2');
    await db.query(`update public.purchases set qty = 9 where id = $1`, [p.id]);
    expect((await sql('select qty from public.purchases where id = $1', [p.id]))[0].qty).toBe(2);
    await as('admin');
    await db.query(`update public.purchases set status = 'ok' where id = $1`, [p.id]);
    expect((await sql('select status from public.purchases where id = $1', [p.id]))[0].status).toBe('ok');
  });

  it('l’utilisateur change seulement son propre nom', async () => {
    await as('prof');
    await db.exec(`select public.set_my_name('  Marc Martin ')`);
    expect((await sql('select full_name from public.profiles where id = $1', [ids.prof]))[0].full_name).toBe('Marc Martin');
  });
});

const slotSql = `insert into public.timetable_slots
  (room_id, group_code, teacher_label, weekday, start_time, end_time, valid_from, valid_to)
  values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`;

describe('emploi du temps et conflits', () => {
  it('accepte des créneaux compatibles et refuse un conflit de salle', async () => {
    await as('admin');
    const a101 = await room('A101');
    await db.query(slotSql, [a101, '1PB1.1', 'M. M', 1, '08:00', '10:00', '2026-09-01', '2027-07-07']);
    await db.query(slotSql, [a101, '1PB1.2', 'M. S', 1, '10:00', '12:00', '2026-09-01', '2027-07-07']);
    const err = await fails(slotSql, [a101, '2PB1.1', 'M. X', 1, '09:00', '11:00', '2026-10-01', '2026-10-31']);
    expect(err).toContain('Conflit de salle');
    expect(err).toContain('lundi');
  });

  it('autorise la même salle sur des périodes qui ne se chevauchent pas (rotation)', async () => {
    await as('admin');
    const b202 = await room('B202');
    await db.query(slotSql, [b202, '1PB1.1', 'M. M', 2, '08:00', '12:00', '2026-09-01', '2026-09-30']);
    await db.query(slotSql, [b202, '1PB1.2', 'M. M2', 2, '08:00', '12:00', '2026-10-01', '2026-10-31']);
  });

  it('refuse un groupe ou un enseignant à deux endroits en même temps', async () => {
    await as('admin');
    const b202 = await room('B202');
    expect(await fails(slotSql, [b202, '1PB1.1', 'M. Z', 1, '09:00', '10:00', '2026-09-01', '2027-07-07'])).toContain('Conflit de groupe');
    expect(await fails(slotSql, [b202, '2PB2', 'm. m', 1, '09:00', '10:00', '2026-09-01', '2027-07-07'])).toContain("Conflit d'enseignant");
  });

  it('une salle partagée accepte deux groupes en même temps, mais pas le même groupe', async () => {
    await as('admin');
    const g = await room('Grand atelier');
    await db.query(slotSql, [g, '2PB1.1', 'M. A', 3, '08:00', '12:00', '2026-09-01', '2027-07-07']);
    await db.query(slotSql, [g, '2PB1.2', 'M. B', 3, '08:00', '12:00', '2026-09-01', '2027-07-07']);
    expect(await fails(slotSql, [g, '2PB1.1', 'M. C', 3, '09:00', '10:00', '2026-09-01', '2027-07-07'])).toContain('Conflit de groupe');
  });

  it('un enseignant ne gère que ses propres lignes', async () => {
    await as('prof');
    expect(await fails(slotSql, [await room('A101'), 'TPB2', 'M. P', 4, '08:00', '09:00', '2026-09-01', '2027-07-07'])).toContain('row-level security');
    await db.query(
      `insert into public.timetable_slots (room_id, group_code, teacher_id, weekday, start_time, end_time, valid_from, valid_to)
       values ($1, 'TPB2', auth.uid(), 4, '08:00', '09:00', '2026-09-01', '2027-07-07')`,
      [await room('A101')],
    );
  });

  it('refuse une heure de fin avant le début', async () => {
    await as('admin');
    expect(await fails(slotSql, [await room('A101'), '2PB2', 'M. Q', 5, '10:00', '09:00', '2026-09-01', '2027-07-07'])).toContain('violates check');
  });

  it('empêche de supprimer une salle qui a un emploi du temps', async () => {
    await as('admin');
    expect(await fails('delete from public.rooms where name = $1', ['A101'])).toContain('foreign key');
  });
});

describe('séances datées', () => {
  // lundi 5 octobre 2026
  it('calcule les occurrences effectives', async () => {
    await as('admin');
    const rows = await sql(
      `select source, occ_date::text as d, group_code from public.room_occupancy('2026-10-05', '2026-10-05') order by start_time, group_code`,
    );
    const lundi = rows.filter((r) => r.d === '2026-10-05');
    expect(lundi.map((r) => r.group_code)).toEqual(['1PB1.1', '1PB1.2']);
  });

  it('une séance liée annule ou déplace l’occurrence du jour', async () => {
    await as('prof');
    const [slot] = await sql(`select id from public.timetable_slots where group_code = '1PB1.2' and weekday = 1`);
    // Annulation
    await db.query(
      `insert into public.sessions (slot_id, session_date, start_time, end_time, room_id, group_code, status)
       values ($1, '2026-10-05', '10:00', '12:00', $2, '1PB1.2', 'cancelled')`,
      [slot.id, await room('A101')],
    );
    const rows = await sql(`select group_code from public.room_occupancy('2026-10-05', '2026-10-05')`);
    expect(rows.map((r) => r.group_code)).toEqual(['1PB1.1']);
    // La salle est désormais libre : une réservation ponctuelle passe
    await db.query(
      `insert into public.sessions (session_date, start_time, end_time, room_id, label)
       values ('2026-10-05', '10:00', '11:00', $1, 'Réunion équipe')`,
      [await room('A101')],
    );
  });

  it('refuse une réservation qui chevauche une occupation existante', async () => {
    await as('prof');
    const err = await fails(
      `insert into public.sessions (session_date, start_time, end_time, room_id, label)
       values ('2026-10-05', '08:30', '09:30', $1, 'Intrus')`,
      [await room('A101')],
    );
    expect(err).toContain('Conflit de salle');
    expect(err).toContain('05/10/2026');
  });

  it('déplace une occurrence dans une autre salle sans créer de conflit avec elle-même', async () => {
    await as('prof');
    const [slot] = await sql(`select id from public.timetable_slots where group_code = '1PB1.1' and weekday = 1`);
    await db.query(
      `insert into public.sessions (slot_id, session_date, start_time, end_time, room_id, group_code, label)
       values ($1, '2026-10-12', '08:00', '10:00', $2, '1PB1.1', 'TP déplacé')`,
      [slot.id, await room('B202')],
    );
    const rows = await sql(`select room_id, source from public.room_occupancy('2026-10-12', '2026-10-12') where group_code = '1PB1.1'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('session');
    expect(rows[0].room_id).toBe(await room('B202'));
  });

  it('un seul remplacement par occurrence', async () => {
    await as('prof');
    const [slot] = await sql(`select id from public.timetable_slots where group_code = '1PB1.1' and weekday = 1`);
    expect(
      await fails(
        `insert into public.sessions (slot_id, session_date, start_time, end_time, room_id, group_code, status)
         values ($1, '2026-10-12', '08:00', '10:00', $2, '1PB1.1', 'cancelled')`,
        [slot.id, await room('A101')],
      ),
    ).toContain('duplicate key');
  });

  it('refuse une nouvelle ligne hebdomadaire qui heurte une réservation ponctuelle', async () => {
    await as('admin');
    await db.query(
      `insert into public.sessions (session_date, start_time, end_time, room_id, label)
       values ('2026-11-03', '13:00', '14:00', $1, 'Visite')`,
      [await room('A101')],
    );
    const err = await fails(slotSql, [await room('A101'), '2PB2', 'M. R', 2, '13:30', '15:00', '2026-11-01', '2026-11-30']);
    expect(err).toContain('est réservée le 03/11/2026');
  });
});

describe('maintenance', () => {
  it('renseigne la date de clôture automatiquement', async () => {
    await as('prof');
    const [sys] = await sql(`select id from public.systems limit 1`);
    const [m] = await sql(`insert into public.maintenance (system_id, title) values ($1, 'Contacteur KM1') returning id, closed_at`, [sys.id]);
    expect(m.closed_at).toBeNull();
    await db.query(`update public.maintenance set status = 'done' where id = $1`, [m.id]);
    expect((await sql('select closed_at from public.maintenance where id = $1', [m.id]))[0].closed_at).not.toBeNull();
    await db.query(`update public.maintenance set status = 'wip' where id = $1`, [m.id]);
    expect((await sql('select closed_at from public.maintenance where id = $1', [m.id]))[0].closed_at).toBeNull();
  });
});

describe('migration 0002 : réglages, outils, semainier, fiches', () => {
  it('les logos sont lisibles sans connexion, pas le reste', async () => {
    await as(null);
    const rows = await sql('select key from public.settings order by key');
    expect(rows.map((r) => r.key)).toEqual(['school_logo_url', 'site_logo_url', 'site_title']);
    expect(await fails("update public.settings set value = 'x' where key = 'site_title'")).toMatch(/permission denied/);
    await as('admin');
    expect((await sql("select value from public.settings where key = 'site_title'"))[0].value).toBe('Parc MELEC');
  });
  it('seul le gestionnaire modifie les réglages, outils et le calendrier', async () => {
    await as('prof');
    expect(await sql('select key from public.settings')).toHaveLength(6);
    await db.query("update public.settings set value = 'piraté' where key = 'site_title'");
    await as('admin');
    expect((await sql("select value from public.settings where key = 'site_title'"))[0].value).toBe('Parc MELEC');
    await as('prof');
    expect(await fails("insert into public.tools (name) values ('Pince')")).toMatch(/row-level security/);
    expect(await fails("insert into public.calendar_periods (kind,label,start_date,end_date) values ('vacances','X','2026-10-17','2026-11-01')")).toMatch(/row-level security/);
    await as('admin');
    expect(await fails("insert into public.tools (name, qty) values ('Pince à dénuder', 4)")).toBeNull();
    expect(await fails("insert into public.calendar_periods (kind,label,start_date,end_date) values ('vacances','Toussaint','2026-10-17','2026-11-01')")).toBeNull();
    expect(await fails("insert into public.calendar_periods (kind,label,start_date,end_date) values ('vacances','Inversée','2026-11-01','2026-10-17')")).toMatch(/check/);
  });
  it('refuse une image qui n’est pas une adresse web', async () => {
    await as('admin');
    expect(await fails("insert into public.tools (name, image_url) values ('T', 'javascript:alert(1)')")).toMatch(/check/);
    expect(await fails("update public.systems set image_url = 'file:///etc/passwd'")).toMatch(/check/);
    expect(await fails("update public.systems set image_url = 'https://drive.google.com/thumbnail?id=abc'")).toBeNull();
  });
  it('le semainier : un enseignant écrit, un lecteur non, une case par jour et groupe', async () => {
    await as('prof');
    expect(await fails("insert into public.planning_cells (day, group_code, label) values ('2026-11-02', '2PB1.1', 'Période d''observation')")).toBeNull();
    expect(await fails("insert into public.planning_cells (day, group_code, label) values ('2026-11-02', '2PB1.1', 'doublon')")).toMatch(/duplicate/);
    expect(await fails("insert into public.planning_cells (day, group_code) values ('2026-11-03', '2PB1.1')")).toMatch(/check/);
    expect(await fails("insert into public.planning_cells (day, group_code, label) values ('2026-11-03', 'XX', 'a')")).toMatch(/foreign key/);
    await as('lecteur');
    expect(await sql('select * from public.planning_cells')).toHaveLength(1);
    expect(await fails("insert into public.planning_cells (day, group_code, label) values ('2026-11-04', '2PB1.1', 'a')")).toMatch(/row-level security/);
  });
  it('le TP supprimé vide la case sans la supprimer', async () => {
    await as('admin');
    const [tp] = await sql("insert into public.tps (title, level, domain, code) values ('TP semainier', 'Seconde', 'pen', 'Prod Ener (1)') returning id");
    await db.query("insert into public.planning_cells (day, group_code, tp_id, label) values ('2026-11-05', '2PB1.2', $1, 'x')", [tp.id]);
    await db.query('delete from public.tps where id = $1', [tp.id]);
    const c = await sql("select tp_id from public.planning_cells where day = '2026-11-05' and group_code = '2PB1.2'");
    expect(c[0].tp_id).toBeNull();
  });
  it('les fiches : visibles par tous, modifiables par leur auteur ou le gestionnaire', async () => {
    await as('prof');
    const [f] = await sql(`insert into public.fiches (kind, title, level, data) values ('seance', 'Séance 1', 'Première', '{"objectifs":"x"}') returning id`);
    expect(await fails("insert into public.fiches (kind, title, created_by) values ('seance', 'Usurpée', (select id from public.profiles where email = 'autre@lamache.org'))")).toMatch(/row-level security/);
    await as('prof2');
    expect(await sql('select id from public.fiches')).toHaveLength(1);
    await db.query("update public.fiches set title = 'Modifiée par un autre' where id = $1", [f.id]);
    await as('prof');
    expect((await sql('select title from public.fiches where id = $1', [f.id]))[0].title).toBe('Séance 1');
    await as('admin');
    await db.query("update public.fiches set title = 'Corrigée' where id = $1", [f.id]);
    expect((await sql('select title from public.fiches where id = $1', [f.id]))[0].title).toBe('Corrigée');
    await as('lecteur');
    expect(await fails("insert into public.fiches (kind, title) values ('sequence', 'x')")).toMatch(/row-level security/);
  });
});

describe('migration 0003 : documents et fiches liées', () => {
  it('accepte des documents Drive, refuse les liens non web', async () => {
    await as('admin');
    expect(await fails(`update public.tps set documents = '[{"title":"Sujet","url":"https://drive.google.com/file/d/abcdefghij1/view"}]' where code = 'Prod Ener (1)' or true`)).toBeNull();
    expect(await fails(`update public.tps set documents = '[{"title":"x","url":"javascript:alert(1)"}]'`)).toMatch(/check/);
    expect(await fails(`update public.tps set documents = '{"url":"https://a.fr"}'`)).toMatch(/check/);
    expect(await fails(`update public.tps set documents = '["https://a.fr"]'`)).toMatch(/check/);
    const many = JSON.stringify(Array.from({ length: 21 }, () => ({ title: 't', url: 'https://a.fr/x.pdf' })));
    expect(await fails('update public.tps set documents = $1::jsonb', [many])).toMatch(/check/);
  });
  it('une séance se rattache à une séquence, pas à une autre séance', async () => {
    await as('prof');
    const [seq] = await sql(`insert into public.fiches (kind, title) values ('sequence', 'Séquence moteur') returning id`);
    const [sea] = await sql(`insert into public.fiches (kind, title, sequence_id, documents) values ('seance', 'Séance 1', $1, '[{"title":"Fiche.docx","url":"https://drive.google.com/file/d/abcdefghij2/view"}]') returning id`, [seq.id]);
    expect(await fails(`insert into public.fiches (kind, title, sequence_id) values ('seance', 'Séance 2', $1)`, [sea.id])).toMatch(/séquence/);
    expect(await fails(`insert into public.fiches (kind, title, sequence_id) values ('sequence', 'Séquence B', $1)`, [seq.id])).toMatch(/séance/);
    await db.query('delete from public.fiches where id = $1', [seq.id]);
    expect((await sql('select sequence_id from public.fiches where id = $1', [sea.id]))[0].sequence_id).toBeNull();
  });
});

describe('migration 0004 : fichiers déposés', () => {
  const path = 'docs/3f2a9c1e-77b1-4c3e/Sujet TP1.docx';
  it('accepte un fichier déposé ou un lien, refuse un chemin douteux', async () => {
    await as('admin');
    expect(await fails(`update public.tps set documents = $1::jsonb`, [JSON.stringify([{ title: 'Sujet', path }])])).toBeNull();
    expect(await fails(`update public.tps set documents = $1::jsonb`, [JSON.stringify([{ title: 'Lien', url: 'https://a.fr/x.pdf' }])])).toBeNull();
    for (const bad of ['docs/../secret/x.pdf', '../x.pdf', 'autre/abc12345/x.pdf', 'docs/abc12345/dossier/x.pdf', 'docs/abc12345/x<script>.pdf']) {
      expect(await fails(`update public.tps set documents = $1::jsonb`, [JSON.stringify([{ title: 'x', path: bad }])])).toMatch(/check/);
    }
    expect(await fails(`update public.tps set documents = $1::jsonb`, [JSON.stringify([{ title: 'x' }])])).toMatch(/check/);
  });
  it('le bucket est privé, limité à 10 Mo et aux formats bureautiques', async () => {
    await as('admin');
    await db.exec('reset role');
    const [b] = await sql("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'documents'");
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(10485760);
    expect(b.allowed_mime_types).toContain('application/pdf');
    expect(b.allowed_mime_types).not.toContain('text/html');
    expect(b.allowed_mime_types).not.toContain('image/svg+xml');
  });
  it('dépôt : enseignant oui, lecteur non, anonyme non ; suppression : auteur ou gestionnaire', async () => {
    await as('prof');
    expect(await fails("insert into storage.objects (bucket_id, name) values ('documents', 'docs/aaaaaaaa/a.pdf')")).toBeNull();
    await as('lecteur');
    expect(await fails("insert into storage.objects (bucket_id, name) values ('documents', 'docs/bbbbbbbb/b.pdf')")).toMatch(/row-level security/);
    expect(await sql('select name from storage.objects')).toHaveLength(1);
    await as(null);
    expect(await fails('select * from storage.objects')).toMatch(/permission denied/);
    await as('prof2');
    await db.query("delete from storage.objects where name = 'docs/aaaaaaaa/a.pdf'");
    await as('prof');
    expect(await sql('select name from storage.objects')).toHaveLength(1);
    await db.query("delete from storage.objects where name = 'docs/aaaaaaaa/a.pdf'");
    expect(await sql('select name from storage.objects')).toHaveLength(0);
    await as('prof');
    await db.query("insert into storage.objects (bucket_id, name) values ('documents', 'docs/cccccccc/c.pdf')");
    await as('admin');
    await db.query("delete from storage.objects where name = 'docs/cccccccc/c.pdf'");
    expect(await sql('select name from storage.objects')).toHaveLength(0);
  });
});

describe('migration 0005 : améliorations', () => {
  it('rejoue la migration sans erreur', async () => {
    await db.exec('reset role');
    await db.exec(migration5);
  });
  it('génère les interventions préventives échues, sans doublon', async () => {
    await as('admin');
    const [sys] = await sql("insert into public.systems (name) values ('Banc prév') returning id");
    await db.query("insert into public.maintenance_plans (system_id, title, every_days, next_due, checklist) values ($1, 'Contrôle annuel', 365, current_date - 10, '[\"Visuel\",\"Isolement\"]')", [sys.id]);
    await as('prof');
    const [r] = await sql('select public.generate_due_maintenance() as n');
    expect(r.n).toBe(1);
    const m = await sql("select kind, description, plan_id from public.maintenance where title = 'Contrôle annuel'");
    expect(m).toHaveLength(1);
    expect(m[0].kind).toBe('prev');
    expect(m[0].description).toContain('- Isolement');
    const [n2] = await sql('select public.generate_due_maintenance() as n');
    expect(n2.n).toBe(0);
    const [plan] = await sql("select next_due > current_date as future from public.maintenance_plans where title = 'Contrôle annuel'");
    expect(plan.future).toBe(true);
    await as('lecteur');
    expect(await fails('select public.generate_due_maintenance()')).toMatch(/Droits insuffisants/);
  });
  it('journalise les modifications et ne les montre qu’aux gestionnaires', async () => {
    await as('prof');
    await db.query("insert into public.systems (name) values ('Système journal')");
    await db.query("update public.systems set qty = 4 where name = 'Système journal'");
    expect(await sql('select * from public.audit_log')).toHaveLength(0);
    expect(await fails("insert into public.audit_log (table_name, op) values ('systems','INSERT')")).toMatch(/permission denied/);
    await as('admin');
    const rows = await sql("select op, old_data, new_data from public.audit_log where table_name = 'systems' and new_data->>'name' = 'Système journal' order by id");
    expect(rows.map((r: any) => r.op)).toEqual(['INSERT', 'UPDATE']);
    expect(rows[1].old_data.qty).toBe(1);
    expect(await fails('update public.audit_log set op = \'DELETE\'')).toMatch(/permission denied/);
    await as(null);
    expect(await fails('select * from public.audit_log')).toMatch(/permission denied/);
  });
  it('PFMP : écriture pour enseignant, dates cohérentes, refus au lecteur et à l’anonyme', async () => {
    await as('admin');
    const [st] = await sql("insert into public.students (name, group_code) values ('Élève Test', '1PB1.1') returning id");
    await as('prof');
    const [co] = await sql("insert into public.companies (name) values ('Entreprise SA') returning id");
    expect(await fails('insert into public.pfmp_periods (student_id, company_id, start_date, end_date) values ($1,$2, current_date, current_date + 14)', [st.id, co.id])).toBeNull();
    expect(await fails('insert into public.pfmp_periods (student_id, start_date, end_date) values ($1, current_date, current_date - 1)', [st.id])).toMatch(/check/);
    await as('lecteur');
    expect(await sql('select * from public.pfmp_periods')).toHaveLength(1);
    expect(await fails("insert into public.companies (name) values ('X')")).toMatch(/row-level security/);
    await as(null);
    expect(await fails('select * from public.companies')).toMatch(/permission denied/);
  });
  it('devis, photo de panne et images : adresses web seulement, bucket public limité', async () => {
    await as('prof');
    expect(await fails("update public.purchases set quote_url = 'javascript:alert(1)'")).toBeNull(); // aucune ligne, pas d'erreur
    const [sys] = await sql("select id from public.systems limit 1");
    expect(await fails("insert into public.maintenance (system_id, title, photo_url) values ($1, 'x', 'javascript:alert(1)')", [sys.id])).toMatch(/check/);
    expect(await fails("insert into public.maintenance (system_id, title, photo_url) values ($1, 'x', 'https://a.fr/p.jpg')", [sys.id])).toBeNull();
    await db.exec('reset role');
    const [b] = await sql("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'images'");
    expect(b.public).toBe(true);
    expect(Number(b.file_size_limit)).toBe(5242880);
    expect(b.allowed_mime_types).not.toContain('image/svg+xml');
    await as('lecteur');
    expect(await fails("insert into storage.objects (bucket_id, name) values ('images', 'img/aaaaaaaa/a.png')")).toMatch(/row-level security/);
    await as('prof');
    expect(await fails("insert into storage.objects (bucket_id, name) values ('images', 'img/aaaaaaaa/a.png')")).toBeNull();
  });
});

describe('migration 0006 : domaines personnalisés', () => {
  it('rejoue la migration sans erreur', async () => {
    await db.exec('reset role');
    await db.exec(migration6);
  });
  it('accepte un domaine personnalisé pour un TP et un système, refuse un identifiant invalide', async () => {
    await as('admin');
    expect(await fails("insert into public.tps (title, level, domain) values ('TP froid', 'Seconde', 'c-froid')")).toBeNull();
    expect(await fails("insert into public.systems (name, domain) values ('Banc froid', 'ate')")).toBeNull();
    expect(await fails("insert into public.tps (title, level, domain) values ('TP', 'Seconde', 'Domaine Libre')")).toMatch(/check/);
  });
  it('seul un gestionnaire enregistre la liste des domaines', async () => {
    await as('prof');
    expect(await fails("insert into public.settings (key, value) values ('custom_domains', '[]')")).toMatch(/row-level security/);
    await as('admin');
    expect(await fails("insert into public.settings (key, value) values ('custom_domains', '[{\"id\":\"c-froid\",\"label\":\"Froid\",\"color\":\"p1\"}]') on conflict (key) do update set value = excluded.value")).toBeNull();
  });
});

describe('migration 0007 : RGPD', () => {
  it('rejoue la migration sans erreur', async () => {
    await db.exec('reset role');
    await db.exec(migration7);
  });
  it('exporte puis efface un élève avec sa progression et ses traces dans le journal', async () => {
    await as('admin');
    const [st] = await sql("insert into public.students (name, group_code) values ('Emma LA', '2PB1.1') returning id");
    const [tp] = await sql("insert into public.tps (title, level, domain, code) values ('TP RGPD', 'Seconde', 'ind', 'RG1') returning id");
    await sql(`insert into public.progress (student_id, tp_id, level) values ('${st.id}', '${tp.id}', 'A')`);
    const exp = (await sql(`select public.export_student('${st.id}') as j`))[0].j as { eleve: { name: string }; competences: unknown[] };
    expect(exp.eleve.name).toBe('Emma LA');
    expect(exp.competences).toHaveLength(1);
    await as('prof');
    expect(await fails(`select public.erase_student('${st.id}')`)).toMatch(/Réservé/);
    await as('admin');
    await sql(`select public.erase_student('${st.id}')`);
    expect(await sql(`select 1 from public.students where id = '${st.id}'`)).toHaveLength(0);
    expect(await sql(`select 1 from public.progress where student_id = '${st.id}'`)).toHaveLength(0);
    await db.exec('reset role');
    expect((await db.query("select count(*)::int as n from public.audit_log where (table_name='students' and coalesce(new_data,old_data)->>'id' = $1) or (table_name='progress' and coalesce(new_data,old_data)->>'student_id' = $1)", [st.id])).rows[0]).toEqual({ n: 0 });
  });
  it('purge les élèves sortis depuis plus longtemps que la durée de conservation', async () => {
    await as('admin');
    await sql("insert into public.settings (key, value) values ('retention_students_months', '6') on conflict (key) do update set value = excluded.value");
    await sql("insert into public.students (name, group_code, left_at) values ('Vieux AA', '2PB1.1', current_date - 400), ('Récent BB', '2PB1.1', current_date - 30), ('Présent CC', '2PB1.1', null)");
    const prev = (await sql('select public.purge_preview() as j'))[0].j as { students: number; students_months: number };
    expect(prev).toMatchObject({ students: 1, students_months: 6 });
    await as('prof');
    expect(await fails('select public.purge_expired()')).toMatch(/Réservé/);
    await as('admin');
    const res = (await sql('select public.purge_expired() as j'))[0].j as { students: number };
    expect(res.students).toBe(1);
    const left = (await sql("select name from public.students where name in ('Vieux AA','Récent BB','Présent CC') order by name")).map((r) => r.name);
    expect(left).toEqual(['Présent CC', 'Récent BB']);
  });
});

describe('migration 0008 : boîte à idées', () => {
  it('rejoue la migration sans erreur', async () => {
    await db.exec('reset role');
    await db.exec(migration8);
  });
  it('tout compte actif propose et vote, seul un gestionnaire répond', async () => {
    await as('prof');
    expect(await fails("insert into public.ideas (title) values ('Exporter en PDF')")).toBeNull();
    expect(await fails("insert into public.ideas (title, status) values ('Je me valide', 'retenue')")).toMatch(/row-level security/);
    const [idea] = await sql("select id from public.ideas where title = 'Exporter en PDF'");
    expect(await fails("update public.ideas set status = 'retenue' where title = 'Exporter en PDF'")).toBeNull(); // RLS : aucune ligne modifiée
    expect((await sql("select status from public.ideas where title = 'Exporter en PDF'"))[0].status).toBe('nouvelle');
    await sql(`select public.toggle_idea_vote('${idea.id}')`);
    expect((await sql(`select cardinality(votes) as n from public.ideas where id = '${idea.id}'`))[0].n).toBe(1);
    await sql(`select public.toggle_idea_vote('${idea.id}')`);
    expect((await sql(`select cardinality(votes) as n from public.ideas where id = '${idea.id}'`))[0].n).toBe(0);
    await as('lecteur');
    expect(await fails("insert into public.ideas (title) values ('Idée d’un lecteur')")).toBeNull();
    await as('admin');
    await sql("update public.ideas set status = 'retenue', answer = 'Bonne idée' where title = 'Exporter en PDF'");
    expect((await sql("select status from public.ideas where title = 'Exporter en PDF'"))[0].status).toBe('retenue');
  });
});

describe('migration 0009 : demi-journées et salle dans le semainier', () => {
  it('rejoue la migration sans erreur', async () => {
    await db.exec('reset role');
    await db.exec(migration9);
  });
  it('une journée, un matin et un après-midi coexistent, mais pas deux fois la même partie', async () => {
    await as('prof');
    expect(await fails("insert into public.planning_cells (day, group_code, part, label) values ('2026-12-07', '2PB1.1', 'M', 'REM')")).toBeNull();
    expect(await fails("insert into public.planning_cells (day, group_code, part, label) values ('2026-12-07', '2PB1.1', 'A', 'TP')")).toBeNull();
    expect(await fails("insert into public.planning_cells (day, group_code, part, label) values ('2026-12-07', '2PB1.1', 'A', 'doublon')")).toMatch(/duplicate/);
    expect(await fails("insert into public.planning_cells (day, group_code, part, label) values ('2026-12-08', '2PB1.1', 'X', 'a')")).toMatch(/check/);
    // sans précision : journée entière
    expect(await fails("insert into public.planning_cells (day, group_code, label) values ('2026-12-09', '2PB1.1', 'a')")).toBeNull();
    expect((await sql("select part from public.planning_cells where day = '2026-12-09'"))[0].part).toBe('J');
  });
  it('la salle est liée à une salle existante et se vide si la salle disparaît', async () => {
    await as('admin');
    const [room] = await sql("insert into public.rooms (name, kind) values ('Salle demi-journée', 'atelier') returning id");
    expect(await fails(`insert into public.planning_cells (day, group_code, part, label, room_id) values ('2026-12-10', '2PB1.2', 'M', 'REM', '${room.id}')`)).toBeNull();
    expect(await fails("insert into public.planning_cells (day, group_code, part, label, room_id) values ('2026-12-10', '2PB1.2', 'A', 'REM', gen_random_uuid())")).toMatch(/foreign key/);
    await db.query('delete from public.rooms where id = $1', [room.id]);
    expect((await sql("select room_id from public.planning_cells where day = '2026-12-10' and part = 'M'"))[0].room_id).toBeNull();
  });
  it('le journal d’audit distingue les parties de journée', async () => {
    await as('admin');
    const keys = (await sql("select row_key from public.audit_log where table_name = 'planning_cells' and row_key like '2026-12-07/%'")).map((r: { row_key: string }) => r.row_key);
    expect(keys).toEqual(expect.arrayContaining(['2026-12-07/2PB1.1/M', '2026-12-07/2PB1.1/A']));
  });
});
