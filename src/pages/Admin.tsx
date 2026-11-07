import { useState } from 'react';
import { useStore } from '@/state/store';
import { PageHead, Seg } from '@/components/ui';
import AccountsAdmin from './admin/AccountsAdmin';
import StudentsAdmin from './admin/StudentsAdmin';
import RoomsAdmin from './admin/RoomsAdmin';
import ToolsAdmin from './admin/ToolsAdmin';
import CalendarAdmin from './admin/CalendarAdmin';
import Appearance from './admin/Appearance';
import Texts from './admin/Texts';

type Section = 'comptes' | 'eleves' | 'salles' | 'outils' | 'calendrier' | 'apparence' | 'textes';

export default function Admin() {
  const { data } = useStore();
  const [section, setSection] = useState<Section>('comptes');
  const pending = data.profiles.filter((p) => !p.active).length;
  return (
    <>
      <PageHead tab="admin" title="Administration" />
      <div className="tools">
        <Seg<Section> label="Section" value={section} onChange={setSection} items={[
          ['comptes', pending ? `Comptes (${pending})` : 'Comptes'], ['eleves', 'Élèves'], ['salles', 'Salles'], ['outils', 'Outils'], ['calendrier', 'Calendrier'], ['apparence', 'Apparence'], ['textes', 'Textes'],
        ]} />
      </div>
      {section === 'comptes' && <AccountsAdmin />}
      {section === 'eleves' && <StudentsAdmin />}
      {section === 'salles' && <RoomsAdmin />}
      {section === 'outils' && <ToolsAdmin />}
      {section === 'calendrier' && <CalendarAdmin />}
      {section === 'apparence' && <Appearance />}
      {section === 'textes' && <Texts />}
    </>
  );
}
