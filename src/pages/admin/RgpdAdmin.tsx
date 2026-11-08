import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { PRIVACY_DEFAULTS } from '@/components/PrivacyText';
import { ConfirmButton, Field } from '@/components/ui';

interface Preview { students: number; audit: number; students_months: number; audit_months: number }

export default function RgpdAdmin() {
  const { settings } = useStore();
  const act = useAct();
  const [pv, setPv] = useState<Preview | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    void api.rpc('purge_preview').then((r) => alive && setPv(r as Preview)).catch(() => alive && setPv(null));
    return () => { alive = false; };
  }, [settings.retention_students_months, settings.retention_audit_months, version]);

  const save = (key: string, value: string) => act(() => api.upsert('settings', [{ key, value }], 'key'), { ok: 'Enregistré.', tables: ['settings'] });
  const num = (key: string, def: number) => String(Number(settings[key]) || def);
  const purge = () => act(async () => { await api.rpc('purge_expired'); setVersion((v) => v + 1); }, { ok: 'Purge effectuée.', tables: ['students', 'progress'] });

  return (
    <>
      <p className="muted">Réglages de la page « Confidentialité » (Aide) et durées de conservation. Les élèves sont enregistrés sous la forme « Prénom + 2 premières lettres du nom ».</p>
      <section className="panel stack">
        <h2>Fonctions liées aux élèves</h2>
        <label className="row"><input type="checkbox" checked={settings.students_enabled === '1'} onChange={(e) => void save('students_enabled', e.target.checked ? '1' : '0')} /> Activer le suivi des élèves, les PFMP, la liste des élèves en administration et la répartition en sous-groupes</label>
        <p className="muted small">{settings.students_enabled === '1' ? 'Ces fonctions sont actives.' : 'Désactivées en attente de validation RGPD : les menus sont grisés avec une info-bulle, et les élèves et entreprises n’apparaissent plus dans la recherche. À cocher une fois le traitement validé par le chef d’établissement et le DPD.'}</p>
      </section>
      <section className="panel stack">
        <h2>Informations affichées</h2>
        <div className="form">
          <Field label="Responsable du traitement"><input className="in" defaultValue={settings.privacy_controller ?? ''} placeholder={PRIVACY_DEFAULTS.controller} maxLength={200} key={`c${settings.privacy_controller}`} onBlur={(e) => e.target.value !== (settings.privacy_controller ?? '') && void save('privacy_controller', e.target.value.trim())} /></Field>
          <Field label="Contact du délégué à la protection des données (DPD)"><input className="in" defaultValue={settings.privacy_dpo ?? ''} placeholder="nom, e-mail ou téléphone du DPD" maxLength={300} key={`d${settings.privacy_dpo}`} onBlur={(e) => e.target.value !== (settings.privacy_dpo ?? '') && void save('privacy_dpo', e.target.value.trim())} /></Field>
        </div>
      </section>
      <section className="panel stack">
        <h2>Durées de conservation</h2>
        <div className="form">
          <Field label="Élèves sortis : effacés après (mois)"><input className="in" type="number" min={1} max={120} defaultValue={num('retention_students_months', PRIVACY_DEFAULTS.studentsMonths)} key={`s${settings.retention_students_months}`} onBlur={(e) => e.target.value !== num('retention_students_months', 12) && void save('retention_students_months', String(Math.min(120, Math.max(1, Number(e.target.value) || 12))))} /></Field>
          <Field label="Historique des modifications : gardé (mois)"><input className="in" type="number" min={1} max={120} defaultValue={num('retention_audit_months', PRIVACY_DEFAULTS.auditMonths)} key={`a${settings.retention_audit_months}`} onBlur={(e) => e.target.value !== num('retention_audit_months', 12) && void save('retention_audit_months', String(Math.min(120, Math.max(1, Number(e.target.value) || 12))))} /></Field>
        </div>
        <p>{pv ? <>À purger maintenant : <b>{pv.students}</b> élève{pv.students > 1 ? 's' : ''} sorti{pv.students > 1 ? 's' : ''} depuis plus de {pv.students_months} mois et <b>{pv.audit}</b> entrée{pv.audit > 1 ? 's' : ''} d’historique de plus de {pv.audit_months} mois.</> : <span className="muted">Calcul des données à purger… (nécessite la migration 0007)</span>}</p>
        <div className="row">
          <ConfirmButton irreversible detail="Effacer définitivement les élèves sortis depuis plus longtemps que la durée de conservation, avec leur progression et leurs traces dans l’historique, ainsi que l’ancien historique ? Cette action est irréversible." onConfirm={() => void purge()}>Lancer la purge maintenant</ConfirmButton>
        </div>
        <p className="muted small">La purge n’est pas automatique : lancez-la à chaque rentrée, après avoir marqué les classes sorties dans Élèves.</p>
      </section>
    </>
  );
}
