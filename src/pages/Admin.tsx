import { usePersisted } from '@/hooks/usePersisted';
import Systems from './Systems';
import { useStore } from '@/state/store';
import { PageHead } from '@/components/ui';
import { MenuBar, type MenuGroup } from '@/components/MenuBar';
import AccountsAdmin from './admin/AccountsAdmin';
import StudentsAdmin from './admin/StudentsAdmin';
import RoomsAdmin from './admin/RoomsAdmin';
import ToolsAdmin from './admin/ToolsAdmin';
import CalendarAdmin from './admin/CalendarAdmin';
import ScheduleAdmin from './admin/ScheduleAdmin';
import Appearance from './admin/Appearance';
import DomainsAdmin from './admin/DomainsAdmin';
import Texts from './admin/Texts';
import BudgetAdmin from './admin/BudgetAdmin';
import History from './admin/History';
import BilanAdmin from './admin/BilanAdmin';
import { STUDENTS_OFF_TIP, studentsEnabled } from '@/lib/studentsFeature';
import RgpdAdmin from './admin/RgpdAdmin';
import DatabaseAdmin from './admin/DatabaseAdmin';
import HeadcountAdmin from './admin/HeadcountAdmin';

export const ADMIN_SECTIONS = ['comptes', 'systemes', 'eleves', 'salles', 'effectifs', 'outils', 'domaines', 'calendrier', 'horaires', 'apparence', 'textes', 'budget', 'historique', 'bilan', 'rgpd', 'base'] as const;
type Section = (typeof ADMIN_SECTIONS)[number];

export default function Admin() {
  const { data, settings } = useStore();
  const studentsOn = studentsEnabled(settings);
  const [section, setSection] = usePersisted<Section>('admin-sec', 'comptes', ADMIN_SECTIONS);
  const pending = data.profiles.filter((p) => !p.active).length;
  const off = studentsOn ? undefined : STUDENTS_OFF_TIP;
  const groups: Array<MenuGroup<Section>> = [
    { id: 'comptes', label: pending ? `Comptes (${pending})` : 'Comptes', items: [{ id: 'comptes', label: pending ? `Comptes (${pending})` : 'Comptes' }] },
    { id: 'materiel', label: 'Matériel', items: [{ id: 'systemes', label: 'Systèmes' }, { id: 'salles', label: 'Salles' }, { id: 'outils', label: 'Outils' }] },
    { id: 'eleves', label: 'Élèves et groupes', items: [{ id: 'eleves', label: 'Élèves', off }, { id: 'effectifs', label: 'Effectifs' }, { id: 'domaines', label: 'Domaines' }] },
    { id: 'calendrier', label: 'Dates et horaires', items: [{ id: 'calendrier', label: 'Calendrier' }, { id: 'horaires', label: 'Horaires de TP' }] },
    { id: 'gestion', label: 'Gestion', items: [{ id: 'budget', label: 'Budget' }, { id: 'bilan', label: 'Bilan' }] },
    { id: 'site', label: 'Site', items: [{ id: 'apparence', label: 'Apparence' }, { id: 'textes', label: 'Textes' }] },
    { id: 'donnees', label: 'Données', items: [{ id: 'historique', label: 'Historique' }, { id: 'rgpd', label: 'Confidentialité' }, { id: 'base', label: 'Base de données' }] },
  ];
  return (
    <>
      <PageHead tab="admin" title="Administration" />
      <div className="tools">
        <MenuBar<Section> label="Section" value={section} onChange={setSection} groups={groups} />
      </div>
      {section === 'comptes' && <AccountsAdmin />}
      {section === 'systemes' && <Systems />}
      {section === 'eleves' && (studentsOn ? <StudentsAdmin /> : <section className="panel"><h2>Fonction désactivée</h2><p>{STUDENTS_OFF_TIP}. Réactivation : Administration, Confidentialité.</p></section>)}
      {section === 'salles' && <RoomsAdmin />}
      {section === 'effectifs' && <HeadcountAdmin />}
      {section === 'outils' && <ToolsAdmin />}
      {section === 'calendrier' && <CalendarAdmin />}
      {section === 'horaires' && <ScheduleAdmin />}
      {section === 'domaines' && <DomainsAdmin />}
      {section === 'apparence' && <Appearance />}
      {section === 'textes' && <Texts />}
      {section === 'budget' && <BudgetAdmin />}
      {section === 'historique' && <History />}
      {section === 'bilan' && <BilanAdmin />}
      {section === 'rgpd' && <RgpdAdmin />}
      {section === 'base' && <DatabaseAdmin />}
    </>
  );
}
