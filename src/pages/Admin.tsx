import { usePersisted } from '@/hooks/usePersisted';
import Systems from './Systems';
import { useStore } from '@/state/store';
import { PageHead, Seg } from '@/components/ui';
import AccountsAdmin from './admin/AccountsAdmin';
import StudentsAdmin from './admin/StudentsAdmin';
import RoomsAdmin from './admin/RoomsAdmin';
import ToolsAdmin from './admin/ToolsAdmin';
import CalendarAdmin from './admin/CalendarAdmin';
import Appearance from './admin/Appearance';
import Texts from './admin/Texts';
import BudgetAdmin from './admin/BudgetAdmin';
import History from './admin/History';
import BilanAdmin from './admin/BilanAdmin';

export const ADMIN_SECTIONS = ['comptes', 'systemes', 'eleves', 'salles', 'outils', 'calendrier', 'apparence', 'textes', 'budget', 'historique', 'bilan'] as const;
type Section = (typeof ADMIN_SECTIONS)[number];

export default function Admin() {
  const { data } = useStore();
  const [section, setSection] = usePersisted<Section>('admin-sec', 'comptes', ADMIN_SECTIONS);
  const pending = data.profiles.filter((p) => !p.active).length;
  return (
    <>
      <PageHead tab="admin" title="Administration" />
      <div className="tools">
        <Seg<Section> label="Section" value={section} onChange={setSection} items={[
          ['comptes', pending ? `Comptes (${pending})` : 'Comptes'], ['systemes', 'Systèmes'], ['eleves', 'Élèves'], ['salles', 'Salles'], ['outils', 'Outils'], ['calendrier', 'Calendrier'], ['apparence', 'Apparence'], ['textes', 'Textes'], ['budget', 'Budget'], ['historique', 'Historique'], ['bilan', 'Bilan'],
        ]} />
      </div>
      {section === 'comptes' && <AccountsAdmin />}
      {section === 'systemes' && <Systems />}
      {section === 'eleves' && <StudentsAdmin />}
      {section === 'salles' && <RoomsAdmin />}
      {section === 'outils' && <ToolsAdmin />}
      {section === 'calendrier' && <CalendarAdmin />}
      {section === 'apparence' && <Appearance />}
      {section === 'textes' && <Texts />}
      {section === 'budget' && <BudgetAdmin />}
      {section === 'historique' && <History />}
      {section === 'bilan' && <BilanAdmin />}
    </>
  );
}
