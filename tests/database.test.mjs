import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('Supabase schema: authorization, bookings, purchases and history',async t=>{
 const db=new PGlite();
 const teacher='11111111-1111-4111-8111-111111111111', outsider='22222222-2222-4222-8222-222222222222', unconfirmed='33333333-3333-4333-8333-333333333333', noGoogle='44444444-4444-4444-8444-444444444444';
 await db.exec(`create role anon;create role authenticated;create role supabase_auth_admin;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table auth.identities(user_id uuid,provider text);
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.user_id',true),'')::uuid $$;
 insert into auth.users values ('${teacher}','test@lamache.org',now()),('${outsider}','test@example.org',now()),('${unconfirmed}','unconfirmed@lamache.org',null),('${noGoogle}','password@lamache.org',now());
 insert into auth.identities values ('${teacher}','google'),('${outsider}','google'),('${unconfirmed}','google');`);
 await db.exec(await readFile(new URL('../supabase/01_schema.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/02_signup_hook.sql',import.meta.url),'utf8'));
 async function as(user,fn,role='authenticated'){return db.transaction(async tx=>{await tx.exec(`set local role ${role}`);await tx.query("select set_config('request.user_id',$1,true)",[user||'']);return fn(tx)})}
 async function mutate(payload,user=teacher){return as(user,async tx=>(await tx.query('select public.lm_mutate($1::jsonb) as result',[JSON.stringify(payload)])).rows[0].result)}
 const makeSystem=(status='Disponible')=>({action:'system',name:'Convoyeur',workshop:'MELEC',location:'J02',status,notes:''});
 let sid,booking;
 await t.test('anonymous access denied and foreign accounts cannot write',async()=>{
  await assert.rejects(as(null,tx=>tx.query('select * from public.lm_systems'),'anon'));
  await assert.rejects(mutate(makeSystem(),outsider),/Accès réservé/);
  await assert.rejects(mutate(makeSystem(),unconfirmed),/Accès réservé/);
  await assert.rejects(mutate(makeSystem(),noGoogle),/Accès réservé/);
  sid=(await mutate(makeSystem())).id;
  const rows=await as(outsider,tx=>tx.query('select * from public.lm_systems'));assert.equal(rows.rows.length,0);
  await assert.rejects(as(teacher,tx=>tx.query("insert into public.lm_systems(name,workshop) values ('Bypass','MELEC')")),/permission denied/);
 });
 const plan=(start,end,extras={})=>({action:'record',kind:'planning',title:'TP convoyeur',status:'Réservé',systemId:sid,data:{year:'2026-2027',group:'1PRO',start,end,notes:''},...extras});
 await t.test('overlap rejected; adjacent reservations and edits allowed',async()=>{
  booking=(await mutate(plan('2026-10-06T14:00','2026-10-06T18:00'))).id;
  await assert.rejects(mutate(plan('2026-10-06T15:00','2026-10-06T17:00')),/déjà réservé/);
  await mutate(plan('2026-10-06T18:00','2026-10-06T19:00'));
  await mutate(plan('2026-10-06T14:30','2026-10-06T17:30',{id:booking}));
  await assert.rejects(mutate(plan('2026-10-07T16:00','2026-10-07T15:00')),/Vérifiez les dates/);
  await assert.rejects(mutate(plan('2027-09-07T14:00','2027-09-07T15:00')),/Vérifiez les dates/);
  await assert.rejects(mutate(plan('2026-10-07T14:00','2026-10-07T15:00',{data:{year:'2026-2027',start:'2026-10-07T14:00',end:'2026-10-07T15:00'}})),/groupe/);
 });
 await t.test('unavailable systems rejected; history protects deletion',async()=>{
  await mutate({...makeSystem('En maintenance'),id:sid});
  await assert.rejects(mutate(plan('2026-10-08T14:00','2026-10-08T15:00')),/pas disponible/);
  await assert.rejects(mutate({action:'deleteSystem',id:sid}),/Archivez-le/);
  const spare=(await mutate(makeSystem())).id;await mutate({action:'deleteSystem',id:spare});
 });
 await t.test('intervention updates retain audit trail; fake authors ignored',async()=>{
  const m={action:'record',kind:'maintenance',systemId:sid,title:'Contrôle variateur',status:'À traiter',author:'fake@lamache.org',data:{priority:'Haute',date:'2026-10-09',notes:'Diagnostic'}};
  const id=(await mutate(m)).id;await mutate({...m,id,status:'Terminée',data:{...m.data,notes:'Variateur réglé'}});
  const rows=await as(teacher,tx=>tx.query('select * from public.lm_history where record_id=$1',[id]));assert.equal(rows.rows.length,2);assert(rows.rows.every(r=>r.author==='test@lamache.org'));
  await assert.rejects(mutate({action:'deleteRecord',id}),/introuvable/);
  await assert.rejects(as(teacher,tx=>tx.query('delete from public.lm_history')),/permission denied/);
 });
 await t.test('purchase validation runs in PostgreSQL',async()=>{
  const a={action:'record',kind:'achats',title:'Embouts',status:'À valider',data:{quantity:4,price:14.9,category:'Consommable',workshop:'MELEC',notes:''}};
  await mutate(a);await assert.rejects(mutate({...a,data:{...a.data,quantity:-1}}),/Quantité/);await assert.rejects(mutate({...a,data:{...a.data,quantity:1.5}}),/Quantité/);await assert.rejects(mutate({...a,data:{...a.data,price:-1}}),/Quantité/);
 });
 await t.test('signup hook only admits Google at lamache.org',async()=>{
  const hook=async(email,provider)=>as(null,async tx=>(await tx.query('select public.lm_before_user_created($1::jsonb) as result',[JSON.stringify({user:{email,app_metadata:{provider}}})])).rows[0].result,'supabase_auth_admin');
  assert.deepEqual(await hook('teacher@lamache.org','google'),{});
  assert((await hook('teacher@sub.lamache.org','google')).error);
  assert((await hook('teacher@lamache.org.evil.com','google')).error);
  assert((await hook('teacher@lamache.org','email')).error);
 });
 await t.test('email allowlist migration preserves records and enables delegated access management',async()=>{
  await db.exec(await readFile(new URL('../supabase/03_email_allowlist.sql',import.meta.url),'utf8'));
  await db.query("insert into public.lm_allowed_teachers(email) values ($1)",['test@lamache.org']);
  const manage=(address,remove,user=teacher)=>as(user,tx=>tx.query('select public.lm_manage_teacher($1,$2)',[address,remove]));
  const rows=await as(teacher,tx=>tx.query('select * from public.lm_records'));assert(rows.rows.length>0);
  await assert.rejects(manage('test@lamache.org',true),/dernier enseignant/);
  await assert.rejects(manage('test@example.org',false),/adresse @lamache/);
  await assert.rejects(manage('password@lamache.org',false,outsider),/enseignants autorisés/);
  const hidden=await as(outsider,tx=>tx.query('select * from public.lm_allowed_teachers'));assert.equal(hidden.rows.length,0);
  await manage('password@lamache.org',false);
  const emailAccess=await as(noGoogle,tx=>tx.query('select public.lm_is_teacher() as allowed'));assert.equal(emailAccess.rows[0].allowed,true);
  await manage('unconfirmed@lamache.org',false,noGoogle);
  const unverified=await as(unconfirmed,tx=>tx.query('select public.lm_is_teacher() as allowed'));assert.equal(unverified.rows[0].allowed,false);
  await manage('password@lamache.org',true);
  const revoked=await as(noGoogle,tx=>tx.query('select public.lm_is_teacher() as allowed'));assert.equal(revoked.rows[0].allowed,false);
  await assert.rejects(manage('test@lamache.org',true,noGoogle),/enseignants autorisés/);
  const hook=async(email,provider)=>as(null,async tx=>(await tx.query('select public.lm_before_user_created($1::jsonb) as result',[JSON.stringify({user:{email,app_metadata:{provider}}})])).rows[0].result,'supabase_auth_admin');
  assert.deepEqual(await hook('test@lamache.org','email'),{});
  assert((await hook('unlisted@lamache.org','email')).error);
  assert((await hook('test@lamache.org','google')).error);
 });
 await db.close();
});
