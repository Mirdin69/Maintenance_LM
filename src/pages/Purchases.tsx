import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/state/auth';
import { useAct, useStore } from '@/state/store';
import { PURCHASE_STATUS, eur } from '@/lib/domain';
import { fmtStamp } from '@/lib/dates';
import type { PurchaseStatus } from '@/lib/types';
import { AddPanel, Chip, ConfirmButton, Empty, Field, Options, PageHead, Seg, downloadBlob, toCsv } from '@/components/ui';

type Filter = 'active' | 'all';

export default function Purchases() {
  const { data, systemById, who } = useStore();
  const { canWrite, isAdmin, profile } = useAuth();
  const act = useAct();
  const [filter, setFilter] = useState<Filter>('active');
  const [formKey, setFormKey] = useState(0);

  const list = data.purchases
    .filter((p) => (filter === 'all' ? true : ['req', 'ok', 'ord'].includes(p.status)))
    .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.created_at.localeCompare(a.created_at));
  const total = list.reduce((a, p) => a + p.qty * Number(p.unit_price), 0);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const ok = await act(
      () => api.insert('purchases', {
        kind: f.get('kind'), item: String(f.get('item')).trim(), ref: String(f.get('ref')).trim() || null,
        qty: Math.max(1, Number(f.get('qty')) || 1), unit_price: Math.max(0, Number(f.get('unit_price')) || 0),
        system_id: String(f.get('system_id')) || null, justification: String(f.get('justification')).trim() || null,
        urgent: f.get('urgent') === 'on', status: 'req',
        supplier: String(f.get('supplier')).trim() || null, quote_ref: String(f.get('quote_ref')).trim() || null,
        quote_url: /^https?:\/\//i.test(String(f.get('quote_url')).trim()) ? String(f.get('quote_url')).trim() : null,
      }),
      { ok: 'Demande enregistrée.', tables: ['purchases'] },
    );
    if (ok) setFormKey((k) => k + 1);
  };

  const exportCsv = () =>
    downloadBlob('achats.csv', toCsv([
      ['Date', 'Type', 'Désignation', 'Référence', 'Quantité', 'Prix unitaire', 'Total', 'Système', 'Urgent', 'Statut', 'Demandeur', 'Justification'],
      ...list.map((p) => [fmtStamp(p.created_at), p.kind === 'mat' ? 'Matériel' : 'Consommable', p.item, p.ref, p.qty, String(p.unit_price).replace('.', ','), String((p.qty * Number(p.unit_price)).toFixed(2)).replace('.', ','), p.system_id ? systemById.get(p.system_id)?.name : '', p.urgent ? 'oui' : '', PURCHASE_STATUS[p.status].label, who(p.requested_by), p.justification]),
    ]));

  return (
    <>
      <PageHead tab="achats" title="Demandes d’achat" />
      {canWrite && (
        <AddPanel summary="Nouvelle demande">
          <form className="form" key={formKey} onSubmit={submit}>
            <Field label="Type"><select className="in" name="kind"><Options items={[['mat', 'Matériel'], ['conso', 'Consommable']]} /></select></Field>
            <Field label="Désignation *" wide><input className="in" name="item" required maxLength={160} /></Field>
            <Field label="Référence"><input className="in" name="ref" maxLength={80} /></Field>
            <Field label="Quantité"><input className="in" name="qty" type="number" min={1} defaultValue={1} /></Field>
            <Field label="Prix unitaire estimé (€)"><input className="in" name="unit_price" type="number" min={0} step="0.01" defaultValue={0} /></Field>
            <Field label="Système concerné"><select className="in" name="system_id"><Options placeholder="Aucun" items={data.systems.map((s) => [s.id, s.name])} /></select></Field>
            <Field label="Fournisseur"><input className="in" name="supplier" maxLength={120} /></Field>
            <Field label="N° de devis"><input className="in" name="quote_ref" maxLength={80} /></Field>
            <Field label="Lien du devis (https://…)" wide><input className="in" name="quote_url" inputMode="url" placeholder="https://" /></Field>
            <Field label="Justification" wide><textarea className="in" name="justification" maxLength={500} /></Field>
            <label className="row"><input type="checkbox" name="urgent" /> Urgent</label>
            <div className="actions"><button className="btn" type="submit">Envoyer la demande</button></div>
          </form>
        </AddPanel>
      )}
      <BudgetBar />
      <section className="panel">
        <div className="row between">
          <h2>Demandes ({list.length}) · {eur(total)}</h2>
          <div className="row">
            <Seg<Filter> label="Filtre" value={filter} onChange={setFilter} items={[['active', 'En cours'], ['all', 'Toutes']]} />
            <button className="btn ghost sm" onClick={exportCsv} disabled={!list.length}>Exporter en CSV</button>
          </div>
        </div>
        {list.length === 0 ? <Empty>Aucune demande.</Empty> : (
          <div className="scroll">
            <table className="tbl">
              <thead><tr><th>Désignation</th><th className="num">Qté</th><th className="num">Total</th><th>Demandeur</th><th>Statut</th>{canWrite && <th />}</tr></thead>
              <tbody>
                {list.map((p) => {
                  const own = p.requested_by === profile?.id && p.status === 'req';
                  return (
                    <tr key={p.id}>
                      <td>
                        <b>{p.item}</b> {p.urgent && <Chip tone="bad">Urgent</Chip>}
                        <span className="sub">{p.kind === 'mat' ? 'Matériel' : 'Consommable'}{p.ref ? ` · réf. ${p.ref}` : ''}{p.system_id ? ` · ${systemById.get(p.system_id)?.name}` : ''}</span>
                        {p.justification && <span className="sub">{p.justification}</span>}
                        {(p.supplier || p.quote_ref || p.quote_url) && <span className="sub">{[p.supplier, p.quote_ref ? `devis ${p.quote_ref}` : null].filter(Boolean).join(' · ')}{p.quote_url && <> · <a href={p.quote_url} target="_blank" rel="noopener noreferrer">voir le devis</a></>}</span>}
                      </td>
                      <td className="num">{p.qty}</td>
                      <td className="num">{eur(p.qty * Number(p.unit_price))}</td>
                      <td>{who(p.requested_by)}<span className="sub">{fmtStamp(p.created_at)}</span></td>
                      <td>
                        {isAdmin ? (
                          <select className="in" aria-label={`Statut de ${p.item}`} value={p.status} onChange={(e) => void act(() => api.update('purchases', { id: p.id }, { status: e.target.value as PurchaseStatus }), { tables: ['purchases'] })}>
                            <Options items={Object.entries(PURCHASE_STATUS).map(([k, v]) => [k, v.label])} />
                          </select>
                        ) : <Chip tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</Chip>}
                      </td>
                      {canWrite && <td>{(isAdmin || own) && <ConfirmButton onConfirm={() => void act(() => api.remove('purchases', { id: p.id }), { ok: 'Demande supprimée.', tables: ['purchases'] })}>Supprimer</ConfirmButton>}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/** Budget de l'année (réglé dans Administration, Budget) : engagé = demandes validées, commandées ou reçues */
function BudgetBar() {
  const { data, settings } = useStore();
  const lines = ([['mat', 'Matériel', settings.budget_mat], ['conso', 'Consommables', settings.budget_conso]] as const)
    .map(([kind, label, raw]) => {
      const budget = Number(raw);
      const spent = data.purchases.filter((p) => p.kind === kind && ['ok', 'ord', 'recv'].includes(p.status)).reduce((a, p) => a + p.qty * Number(p.unit_price), 0);
      const asked = data.purchases.filter((p) => p.kind === kind && p.status === 'req').reduce((a, p) => a + p.qty * Number(p.unit_price), 0);
      return { kind, label, budget, spent, asked, ok: raw !== undefined && raw !== '' && Number.isFinite(budget) };
    })
    .filter((l) => l.ok);
  if (!lines.length) return null;
  return (
    <section className="panel stack">
      <h2>Budget de l’année</h2>
      {lines.map((l) => {
        const left = l.budget - l.spent;
        const over = left < 0;
        const projected = left - l.asked < 0;
        return (
          <div key={l.kind}>
            <div className="row between"><b>{l.label}</b><span>{eur(l.spent)} engagés sur {eur(l.budget)}</span></div>
            <progress max={Math.max(l.budget, 1)} value={Math.min(l.spent, l.budget)} aria-label={`Budget ${l.label}`} style={{ width: '100%' }} />
            <span className={'chip ' + (over ? 'bad' : projected ? 'warn' : 'ok')}>
              {over ? `Dépassé de ${eur(-left)}` : projected ? `Reste ${eur(left)}, mais ${eur(l.asked)} sont en attente de validation` : `Reste ${eur(left)}`}
            </span>
          </div>
        );
      })}
    </section>
  );
}
