import { useState } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { TAB_INTROS, resolveIntro, type TabIntro } from '@/lib/intros';

function Row({ tab }: { tab: TabIntro }) {
  const { settings } = useStore();
  const act = useAct();
  const cur = resolveIntro(tab.id, settings);
  const [text, setText] = useState(cur.text);
  const [print, setPrint] = useState(cur.print);
  const key = `intro_${tab.id}`;
  const custom = key in settings || `${key}_print` in settings;

  const save = () =>
    act(() => api.upsert('settings', [{ key, value: text.trim() }, { key: `${key}_print`, value: print ? '1' : '0' }], 'key'), { ok: `Texte « ${tab.label} » enregistré.`, tables: ['settings'] });
  const reset = async () => {
    if (await act(() => api.remove('settings', { key }).then(() => api.remove('settings', { key: `${key}_print` })), { ok: 'Texte d’origine rétabli.', tables: ['settings'] })) {
      setText(tab.text);
      setPrint(true);
    }
  };

  return (
    <section className="panel stack">
      <h2>{tab.label}</h2>
      <label className="f wide">
        <span className="lab">Commentaire affiché sous le titre « {tab.title} »</span>
        <textarea className="in" rows={3} maxLength={600} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="row">
        <label className="pick"><input type="checkbox" checked={print} onChange={(e) => setPrint(e.target.checked)} />Imprimer ce commentaire</label>
        <button type="button" className="btn sm" onClick={() => void save()}>Enregistrer</button>
        {custom && <button type="button" className="btn ghost sm" onClick={() => void reset()}>Rétablir le texte d’origine</button>}
      </div>
    </section>
  );
}

export default function Texts() {
  return (
    <>
      <p className="muted">Le commentaire sous le titre de chaque onglet. Laissez vide pour ne rien afficher ; décochez « Imprimer » pour qu’il n’apparaisse qu’à l’écran.</p>
      {TAB_INTROS.map((t) => <Row key={t.id} tab={t} />)}
    </>
  );
}
