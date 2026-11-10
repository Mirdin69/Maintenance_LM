import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAct, useStore } from '@/state/store';
import { BUILTIN_DOMAINS, DOMAIN_PALETTE, MAX_CUSTOM_DOMAINS, colorsOf, domainLabel, parseCustomDomains, parseDomainColors, type CustomDomain } from '@/lib/domain';
import { ConfirmButton, Field } from '@/components/ui';

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 14);

/** Sélecteur de couleur : n'enregistre qu'à la validation (fermeture du sélecteur), pas à chaque déplacement du curseur */
function ColorInput({ value, label, onCommit }: { value: string; label: string; onCommit: (hex: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => onCommit(el.value);
    el.addEventListener('change', on);
    return () => el.removeEventListener('change', on);
  });
  return <input ref={ref} type="color" aria-label={label} value={draft} onChange={(e) => setDraft(e.target.value)} />;
}

export default function DomainsAdmin() {
  const { data, settings } = useStore();
  const act = useAct();
  const list = parseCustomDomains(settings.custom_domains);
  const [color, setColor] = useState('p1');
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState('');

  const save = (next: CustomDomain[], ok: string) => act(() => api.upsert('settings', [{ key: 'custom_domains', value: JSON.stringify(next) }], 'key'), { ok, tables: ['settings'] });
  const colors = parseDomainColors(settings.domain_colors);
  const allIds = [...Object.keys(BUILTIN_DOMAINS), ...list.map((d) => d.id)];
  const saveColors = (next: Record<string, string>, ok: string) => act(() => api.upsert('settings', [{ key: 'domain_colors', value: JSON.stringify(next) }], 'key'), { ok, tables: ['settings'] });
  const pickColor = (id: string, hex: string) => saveColors({ ...colors, [id]: hex }, 'Couleur modifiée.');
  const resetColor = (id: string) => { const { [id]: _drop, ...rest } = colors; return saveColors(rest, 'Couleur d’origine rétablie.'); };
  const used = (id: string) => data.tps.filter((t) => t.domain === id).length + data.systems.filter((s) => s.domain === id).length;

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const label = String(new FormData(e.currentTarget).get('label')).trim();
    const taken = [...Object.values(BUILTIN_DOMAINS), ...list.map((d) => d.label)].some((l) => l.toLowerCase() === label.toLowerCase());
    if (taken) return setError('Ce domaine existe déjà.');
    if (list.length >= MAX_CUSTOM_DOMAINS) return setError(`${MAX_CUSTOM_DOMAINS} domaines ajoutés au plus.`);
    let id = `c-${slug(label) || 'domaine'}`;
    for (let n = 2; list.some((d) => d.id === id); n++) id = `c-${slug(label).slice(0, 12)}-${n}`;
    if (await save([...list, { id, label, color }], 'Domaine ajouté.')) setFormKey((k) => k + 1);
  };

  return (
    <>
      <p className="muted">Les domaines prédéfinis restent disponibles. Ceux que vous ajoutez ici apparaissent dans le catalogue des TP, les systèmes, les fiches et le semainier (avec la couleur choisie), et peuvent être utilisés dans l’import Excel des TP.</p>
      <section className="panel stack">
        <h2>Ajouter un domaine</h2>
        <form className="form" key={formKey} onSubmit={add}>
          <Field label="Nom du domaine *"><input className="in" name="label" required maxLength={40} placeholder="Froid et climatisation" /></Field>
          <div className="f wide"><span className="lab">Couleur dans le semainier</span>
            <div className="picks">{Object.entries(DOMAIN_PALETTE).map(([k, c]) => (
              <label key={k} className="pick"><input type="radio" name="color" checked={color === k} onChange={() => setColor(k)} />
                <span className="swatch" style={{ background: c.bg, color: c.fg }} aria-hidden="true">Aa</span>{c.name}</label>
            ))}</div></div>
          {error && <div className="alert wide" role="alert">{error}</div>}
          <div className="actions"><button className="btn" type="submit">Ajouter le domaine</button></div>
        </form>
      </section>
      <section className="panel stack">
        <h2>Couleurs des domaines</h2>
        <p className="muted small">Choisissez la couleur de chaque domaine : elle colore toute la case du cours dans le semainier. Le texte est ajusté automatiquement pour rester lisible, en thème clair comme en thème sombre.</p>
        <div className="scroll"><table className="tbl" aria-label="Couleurs des domaines">
          <thead><tr><th>Domaine</th><th>Couleur</th><th>Aperçu</th><th /></tr></thead>
          <tbody>{allIds.map((id) => {
            const c = colorsOf(id);
            return (
              <tr key={id}>
                <td><b>{domainLabel(id)}</b></td>
                <td><ColorInput label={`Couleur de ${domainLabel(id)}`} value={colors[id] ?? c.bg} onCommit={(hex) => void pickColor(id, hex)} /></td>
                <td><span className="swatch" style={{ background: c.bg, color: c.fg }}>TP exemple</span></td>
                <td>{colors[id] ? <button type="button" className="btn ghost sm" onClick={() => void resetColor(id)}>Couleur d’origine</button> : <span className="muted small">Couleur d’origine</span>}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      </section>
      <section className="panel stack">
        <h2>Domaines ajoutés ({list.length})</h2>
        {list.length === 0 ? <p className="muted">Aucun domaine ajouté pour le moment.</p> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Domaine</th><th>Couleur</th><th className="num">Utilisé par</th><th /></tr></thead>
            <tbody>{list.map((d) => (
              <tr key={d.id}>
                <td><b>{d.label}</b></td>
                <td><span className="swatch" style={{ background: DOMAIN_PALETTE[d.color].bg, color: DOMAIN_PALETTE[d.color].fg }}>{DOMAIN_PALETTE[d.color].name}</span></td>
                <td className="num">{used(d.id) ? `${used(d.id)} TP/système(s)` : '—'}</td>
                <td>{used(d.id) ? <span className="muted small">Réaffectez d’abord ses TP et systèmes</span> : <ConfirmButton detail={`Supprimer le domaine « ${d.label} » ?`} onConfirm={() => void save(list.filter((x) => x.id !== d.id), 'Domaine supprimé.')}>Supprimer</ConfirmButton>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        <details className="muted small"><summary>Domaines prédéfinis</summary><p>{Object.values(BUILTIN_DOMAINS).join(' · ')}</p></details>
      </section>
    </>
  );
}
