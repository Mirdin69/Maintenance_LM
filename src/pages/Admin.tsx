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
import DomainsAdmin from './admin/DomainsAdmin';
import Texts from './admin/Texts';
import BudgetAdmin from './admin/BudgetAdmin';
import History from './admin/History';
import BilanAdmin from './admin/BilanAdmin';
import { STUDENTS_OFF_TIP, studentsEnabled } from '@/lib/studentsFeature';
import RgpdAdmin from './admin/RgpdAdmin';

export const ADMIN_SECTIONS = ['comptes', 'systemes', 'eleves', 'salles', 'outils', 'domaines', 'calendrier', 'apparence', 'textes', 'budget', 'historique', 'bilan', 'rgpd'] as const;
type Section = (typeof ADMIN_SECTIONS)[number];

export default function Admin() {
  const { data, settings } = useStore();
  const studentsOn = studentsEnabled(settings);
  const [section, setSection] = usePersisted<Section>('admin-sec', 'comptes', ADMIN_SECTIONS);
  const pending = data.profiles.filter((p) => !p.active).length;
  return (
    <>
      <PageHead tab="admin" title="Administration" />
      <div className="tools">
        <Seg<Section> label="Section" value={section} onChange={setSection} items={[
          ['comptes', pending ? `Comptes (${pending})` : 'Comptes'], ['systemes', 'Systèmes'], ['eleves', 'Élèves', ...(studentsOn ? [] : [{ off: STUDENTS_OFF_TIP }])] as [Section, string], ['salles', 'Salles'], ['outils', 'Outils'], ['domaines', 'Domaines'], ['calendrier', 'Calendrier'], ['apparence', 'Apparence'], ['textes', 'Textes'], ['budget', 'Budget'], ['historique', 'Historique'], ['bilan', 'Bilan'], ['rgpd', 'Confidentialité'],
        ]} />
      </div>
      {section === 'comptes' && <AccountsAdmin />}
      {section === 'systemes' && <Systems />}
      {section === 'eleves' && (studentsOn ? <StudentsAdmin /> : <section className="panel"><h2>Fonction désactivée</h2><p>{STUDENTS_OFF_TIP}. Réactivation : Administration, Confidentialité.</p></section>)}
      {section === 'salles' && <RoomsAdmin />}
      {section === 'outils' && <ToolsAdmin />}
      {section === 'calendrier' && <CalendarAdmin />}
      {section === 'domaines' && <DomainsAdmin />}
      {section === 'apparence' && <Appearance />}
      {section === 'textes' && <Texts />}
      {section === 'budget' && <BudgetAdmin />}
      {section === 'historique' && <History />}
      {section === 'bilan' && <BilanAdmin />}
      {section === 'rgpd' && <RgpdAdmin />}
    </>
  );
}
