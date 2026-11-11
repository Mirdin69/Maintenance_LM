import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/state/store';
import { byText } from '@/lib/domain';
import { qrDataUrl, systemUrl } from '@/lib/qr';
import { Field } from '@/components/ui';

/** Planche d'étiquettes QR à imprimer et coller sur les systèmes (ou sur chaque poste) : le QR ouvre la fiche du système */
export function QrLabels({ onClose }: { onClose: () => void }) {
  const { data, roomById } = useStore();
  const [perPoste, setPerPoste] = useState(false);
  const [room, setRoom] = useState('');
  const [codes, setCodes] = useState<Record<string, string>>({});
  const systems = useMemo(() => data.systems.filter((s) => !room || s.room_id === room).sort(byText((s) => s.name)), [data.systems, room]);
  const labels = useMemo(() => systems.flatMap((s) => (perPoste && s.qty > 1 ? Array.from({ length: s.qty }, (_, i) => ({ s, poste: i + 1 })) : [{ s, poste: 0 }])), [systems, perPoste]);

  useEffect(() => {
    document.body.classList.add('qr-printing');
    return () => document.body.classList.remove('qr-printing');
  }, []);
  useEffect(() => {
    let live = true;
    void (async () => {
      const next: Record<string, string> = {};
      for (const { s, poste } of labels) { const u = systemUrl(s.id, poste || undefined); next[u] = codes[u] ?? await qrDataUrl(u); }
      if (live) setCodes(next);
    })();
    return () => { live = false; };
  }, [labels]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="panel stack qr-sheet" aria-label="Étiquettes QR">
      <div className="row between no-print">
        <h2>Étiquettes QR</h2>
        <div className="row"><button className="btn sm" onClick={() => window.print()}>Imprimer les étiquettes</button><button className="btn ghost sm" onClick={onClose}>Fermer</button></div>
      </div>
      <div className="tools no-print">
        <Field label="Salle"><select className="in" value={room} onChange={(e) => setRoom(e.target.value)}><option value="">Toutes</option>{data.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        <label className="row"><input type="checkbox" checked={perPoste} onChange={(e) => setPerPoste(e.target.checked)} /> Une étiquette par poste</label>
      </div>
      <p className="muted small no-print">Le QR code ouvre la fiche du système sur le téléphone (connexion demandée) : état, interventions, signalement d’une panne.</p>
      <div className="qr-grid">
        {labels.map(({ s, poste }) => {
          const u = systemUrl(s.id, poste || undefined);
          return (
            <figure key={u} className="qr-label">
              {codes[u] ? <img src={codes[u]} alt={`QR code de ${s.name}${poste ? `, poste ${poste}` : ''}`} width={110} height={110} /> : <span className="qr-wait" />}
              <figcaption><b>{s.name}{poste ? ` · Poste ${poste}` : ''}</b><span>{s.room_id ? roomById.get(s.room_id)?.name : ''}</span></figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
