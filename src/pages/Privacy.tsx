import { PageHead } from '@/components/ui';
import { PrivacyText } from '@/components/PrivacyText';
import { useStore } from '@/state/store';

export default function Privacy() {
  const { settings } = useStore();
  return (
    <>
      <PageHead tab="confidentialite" title="Confidentialité et données personnelles" />
      <section className="panel"><PrivacyText settings={settings} /></section>
    </>
  );
}
