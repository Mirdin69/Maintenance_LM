import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { PRIORITIES } from '@/lib/domain';
import { useAct, useStore } from '@/state/store';
import { useAuth } from '@/state/auth';
import { Field, Options } from '@/components/ui';
import { ImageField } from '@/components/ImageField';

/** Signalement rapide d'une panne : crée l'intervention, avec photo, et peut mettre le système hors service */
/** Bouton « Panne » rattaché à un système et à son contexte (TP, groupe, date) : ouvre le signalement prérempli */
export function FaultButton({ systemId, context, label }: { systemId: string; context?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useStore();
  const { canWrite } = useAuth();
  if (!canWrite) return null;
  const name = data.systems.find((s) => s.id === systemId)?.name;
  return (
    <>
      <button type="button" className="btn ghost sm no-print" onClick={() => setOpen(true)} aria-label={`Signaler une panne, ${name ?? 'système'}`}>⚠ {label ?? 'Panne'}</button>
      {open && <ReportFault systemId={systemId} context={context} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ReportFault({ onClose, systemId, context }: { onClose: () => void; systemId?: string; context?: string }) {
  const { data } = useStore();
  const act = useAct();
  const [photo, setPhoto] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const sid = String(f.get('system_id'));
    const stop = f.get('stop') === 'on';
    setBusy(true);
    const ok = await act(async () => {
      await api.insert('maintenance', {
        system_id: sid, kind: 'corr', title: String(f.get('title')).trim(), description: String(f.get('description')).trim() || null,
        priority: f.get('priority'), status: 'open', photo_url: photo.trim() || null,
      });
      if (stop) await api.update('systems', { id: sid }, { state: 'hs' });
    }, { ok: 'Panne signalée.', tables: ['maintenance', 'systems'] });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="modal-back no-print" onClick={onClose}>
      <div className="modal panel" role="dialog" aria-modal="true" aria-label="Signaler une panne" onClick={(e) => e.stopPropagation()}>
        <h2>Signaler une panne</h2>
        {data.systems.length === 0 ? <p className="muted">Ajoutez d’abord un système dans l’onglet Systèmes.</p> : (
          <form className="form" onSubmit={submit}>
            <Field label="Système *" wide><select className="in" name="system_id" required defaultValue={systemId ?? ''}><Options placeholder="Choisir…" items={data.systems.map((s) => [s.id, s.name])} /></select></Field>
            <Field label="Ce qui ne marche pas *" wide><input className="in" name="title" required maxLength={120} placeholder="Disjoncteur qui saute, afficheur éteint…" /></Field>
            <Field label="Détails" wide><textarea className="in" name="description" maxLength={1000} defaultValue={context ?? ''} /></Field>
            <Field label="Urgence"><select className="in" name="priority" defaultValue="h"><Options items={Object.entries(PRIORITIES).map(([k, v]) => [k, v.label])} /></select></Field>
            <ImageField label="Photo de la panne" value={photo} onChange={setPhoto} />
            <label className="row wide"><input type="checkbox" name="stop" defaultChecked /> Marquer le système hors service</label>
            <div className="actions">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'Envoi…' : 'Signaler'}</button>
              <button className="btn ghost" type="button" onClick={onClose}>Annuler</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
