import { useMemo } from 'react';
import { DAY_END, DAY_START } from '@/lib/domain';
import { DAY_SHORT, iso, minToHM, parseISO } from '@/lib/dates';

export interface GridBlock {
  id: string;
  /** 0 = lundi ... 4 = vendredi */
  day: number;
  start: number;
  end: number;
  title: string;
  sub?: string;
  /** Classe de couleur : l-Seconde, l-Première, l-Terminale, res, cancel */
  tone: string;
  tag?: string;
  onClick?: () => void;
}

interface Props {
  days: string[];
  blocks: GridBlock[];
  label: string;
  hourPx?: number;
}

interface Placed extends GridBlock {
  lane: number;
  lanes: number;
}

/** Place les blocs qui se chevauchent côte à côte */
function place(blocks: GridBlock[]): Placed[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = cluster.reduce((m, b) => Math.max(m, b.lane + 1), 1);
    cluster.forEach((b) => (b.lanes = lanes));
    out.push(...cluster);
    cluster = [];
  };
  for (const b of sorted) {
    if (cluster.length && b.start >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => c.end > b.start).map((c) => c.lane));
    let lane = 0;
    while (taken.has(lane)) lane++;
    cluster.push({ ...b, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return out;
}

export function WeekGrid({ days, blocks, label, hourPx = 44 }: Props) {
  const { from, to } = useMemo(() => {
    let from = DAY_START;
    let to = DAY_END;
    for (const b of blocks) {
      from = Math.min(from, Math.floor(b.start / 60) * 60);
      to = Math.max(to, Math.ceil(b.end / 60) * 60);
    }
    return { from, to };
  }, [blocks]);
  const height = ((to - from) / 60) * hourPx;
  const hours: number[] = [];
  for (let m = from; m < to; m += 60) hours.push(m);
  const today = iso(new Date());

  return (
    <div className="scroll">
      <div className="wg" role="group" aria-label={label} style={{ ['--hp' as string]: `${hourPx}px` }}>
        <div className="wg-head">
          <span />
          {days.map((d) => (
            <span key={d} className={d === today ? 'today' : ''}>
              {DAY_SHORT[(parseISO(d).getDay() + 6) % 7]} {parseISO(d).getDate()}
            </span>
          ))}
        </div>
        <div className="wg-body" style={{ height }}>
          <div className="wg-hours">
            {hours.map((m) => (
              <span key={m} style={{ top: ((m - from) / 60) * hourPx }}>
                {minToHM(m)}
              </span>
            ))}
          </div>
          {days.map((d, i) => (
            <div key={d} className={'wg-col' + (d === today ? ' today' : '')}>
              {place(blocks.filter((b) => b.day === i)).map((b) => {
                const style = {
                  top: ((b.start - from) / 60) * hourPx,
                  height: Math.max(((b.end - b.start) / 60) * hourPx - 2, 18),
                  left: `${(b.lane / b.lanes) * 100}%`,
                  width: `calc(${100 / b.lanes}% - 2px)`,
                };
                const inner = (
                  <>
                    <b>{b.title}</b>
                    {b.sub && <span>{b.sub}</span>}
                    <span className="tm">
                      {minToHM(b.start)}–{minToHM(b.end)}
                      {b.tag ? ` · ${b.tag}` : ''}
                    </span>
                  </>
                );
                return b.onClick ? (
                  <button key={b.id} type="button" className={`wgb ${b.tone}`} style={style} onClick={b.onClick}>
                    {inner}
                  </button>
                ) : (
                  <div key={b.id} className={`wgb ${b.tone}`} style={style}>
                    {inner}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
