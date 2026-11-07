import { useRef, useState } from 'react';
import { api } from '@/lib/api';
import { IMAGE_ACCEPT, checkImage } from '@/lib/images';
import { friendlyError, useToast } from '@/state/toast';
import { ImageHint } from '@/components/Img';

/** Image par lien (Drive, site web) ou déposée depuis l'ordinateur ou le téléphone */
export function ImageField({ label, value, onChange, wide = true }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const problem = checkImage(file);
    if (problem) return toast(problem, 'bad');
    setBusy(true);
    try {
      onChange(await api.images.upload(file));
    } catch (e) {
      toast(friendlyError(e), 'bad');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className={'f' + (wide ? ' wide' : '')}>
      <label className="lab" htmlFor={`img-${label}`}>{label}</label>
      <div className="row">
        <input id={`img-${label}`} className="in" style={{ flex: 1, minWidth: 180 }} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Lien https://… ou image déposée" />
        <label className="btn sm" style={{ cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Envoi…' : 'Choisir une image'}
          <input ref={input} type="file" accept={IMAGE_ACCEPT} capture={undefined} disabled={busy} aria-label={`Déposer une image : ${label}`}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' }} onChange={(e) => void pick(e.target.files)} />
        </label>
        {value && <button type="button" className="btn ghost sm" onClick={() => onChange('')}>Retirer</button>}
      </div>
      <ImageHint value={value} />
    </div>
  );
}
