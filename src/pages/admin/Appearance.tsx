import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { useBranding } from '@/state/branding';
import { Field } from '@/components/ui';
import { ImageHint } from '@/components/Img';

export default function Appearance() {
  const { settings } = useStore();
  const { refresh } = useBranding();
  const act = useAct();
  const [title, setTitle] = useState(settings.site_title ?? 'Parc MELEC');
  const [site, setSite] = useState(settings.site_logo_url ?? '');
  const [school, setSchool] = useState(settings.school_logo_url ?? '');

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const rows = [
      { key: 'site_title', value: title.trim() || 'Parc MELEC' },
      { key: 'site_logo_url', value: site.trim() },
      { key: 'school_logo_url', value: school.trim() },
    ];
    if (await act(() => api.upsert('settings', rows, 'key'), { ok: 'Apparence enregistrée.', tables: ['settings'] })) await refresh();
  };

  return (
    <form className="panel form" onSubmit={save}>
      <p className="muted wide">Le titre et les logos s’affichent en haut de chaque page et sur la page de connexion, donc visibles de toute personne qui ouvre le site. N’y mettez que des images publiques. Collez le lien de partage d’une image du Drive (« Tous les utilisateurs disposant du lien »).</p>
      <Field label="Titre du site" wide><input className="in" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Logo du site (lien)" wide><input className="in" value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://drive.google.com/file/d/…/view" /></Field>
      <ImageHint value={site} />
      <Field label="Logo du lycée (lien)" wide><input className="in" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="https://drive.google.com/file/d/…/view" /></Field>
      <ImageHint value={school} />
      <div className="actions"><button className="btn" type="submit">Enregistrer</button></div>
    </form>
  );
}
