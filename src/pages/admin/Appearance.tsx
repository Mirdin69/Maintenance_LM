import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { useBranding } from '@/state/branding';
import { Field } from '@/components/ui';
import { ImageField } from '@/components/ImageField';

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
      <p className="muted wide">Le titre et les logos s’affichent en haut de chaque page et sur la page de connexion, donc visibles de toute personne qui ouvre le site. N’y mettez que des images publiques. Déposez une image (PNG, JPEG, WebP ou GIF, 5 Mo au plus) ou collez un lien ; une image déposée est publique.</p>
      <Field label="Titre du site" wide><input className="in" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></Field>
      <ImageField label="Logo du site" value={site} onChange={setSite} />
      <ImageField label="Logo du lycée" value={school} onChange={setSchool} />
      <div className="actions"><button className="btn" type="submit">Enregistrer</button></div>
    </form>
  );
}
