import { useMemo, useState } from 'react';
import { useAuth } from '@/state/auth';
import { useStore } from '@/state/store';
import { iso } from '@/lib/dates';
import { isMine } from '@/lib/semainier';

interface Note { key: string; text: string; tab: string; tone: 'bad' | 'warn' | 'info' }

/** Alertes calculées à partir des données : rien n'est envoyé par e-mail */
export function useNotes(): Note[] {
  const { data, tpById } = useStore();
  const { profile, isAdmin, canWrite } = useAuth();
  return useMemo(() => {
    const out: Note[] = [];
    const today = iso(new Date());
    if (isAdmin) {
      const pending = data.profiles.filter((p) => !p.active).length;
      if (pending) out.push({ key: 'acc', text: `${pending} compte${pending > 1 ? 's' : ''} à valider`, tab: 'admin', tone: 'warn' });
    }
    if (canWrite) {
      const urgent = data.maintenance.filter((m) => m.status !== 'done' && m.priority === 'u').length;
      if (urgent) out.push({ key: 'urg', text: `${urgent} intervention${urgent > 1 ? 's' : ''} urgente${urgent > 1 ? 's' : ''}`, tab: 'maintenance', tone: 'bad' });
      const late = data.maintenance.filter((m) => m.status !== 'done' && m.due_date && m.due_date < today).length;
      if (late) out.push({ key: 'late', text: `${late} intervention${late > 1 ? 's' : ''} en retard`, tab: 'maintenance', tone: 'warn' });
      const duePlans = data.maintenance_plans.filter((p) => p.active && p.next_due <= today).length;
      if (duePlans) out.push({ key: 'plans', text: `${duePlans} contrôle${duePlans > 1 ? 's' : ''} préventif${duePlans > 1 ? 's' : ''} échu${duePlans > 1 ? 's' : ''}`, tab: 'maintenance', tone: 'warn' });
    }
    if (isAdmin) {
      const req = data.purchases.filter((p) => p.status === 'req').length;
      if (req) out.push({ key: 'req', text: `${req} achat${req > 1 ? 's' : ''} à valider`, tab: 'achats', tone: 'info' });
    }
    const down = data.systems.filter((s) => s.state === 'hs').length;
    if (down) out.push({ key: 'down', text: `${down} système${down > 1 ? 's' : ''} hors service`, tab: 'systemes', tone: 'bad' });
    const mineToday = data.planning_cells.filter((c) => c.day === today && isMine(c.tp_id ? tpById.get(c.tp_id) : undefined, profile));
    const blocked = mineToday.filter((c) => c.tp_id && tpById.get(c.tp_id)?.system_ids.some((id) => data.systems.find((s) => s.id === id)?.state === 'hs'));
    if (blocked.length) out.push({ key: 'blocked', text: `${blocked.length} de vos cours du jour utilisent un système hors service`, tab: 'semainier', tone: 'bad' });
    return out;
  }, [data, tpById, profile, isAdmin, canWrite]);
}

export function Notifications({ go }: { go: (tab: string) => void }) {
  const notes = useNotes();
  const [open, setOpen] = useState(false);
  return (
    <div className="alerts-wrap no-print">
      <button type="button" className="btn sm" aria-expanded={open} aria-label={`Alertes (${notes.length})`} onClick={() => setOpen(!open)}>
        Alertes{notes.length > 0 && <span className="badge">{notes.length}</span>}
      </button>
      {open && (
        <ul className="search-res notes-list" aria-label="Liste des alertes">
          {notes.length === 0 && <li className="muted">Rien à signaler.</li>}
          {notes.map((n) => (
            <li key={n.key}>
              <button type="button" onClick={() => { go(n.tab); setOpen(false); }}><span className={`chip ${n.tone === 'info' ? 'idle' : n.tone}`}>{n.text}</span></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
