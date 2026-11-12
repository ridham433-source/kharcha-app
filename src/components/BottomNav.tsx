import { Icon, type IconName } from './ui';

const TABS: { to: string; key: string; label: string; icon: IconName; cls?: string }[] = [
  { to: '/', key: '', label: 'Home', icon: 'home' },
  { to: '/activity', key: 'activity', label: 'Activity', icon: 'list' },
  { to: '/insights', key: 'insights', label: 'Insights', icon: 'chart' },
  { to: '/splitter', key: 'splitter', label: 'Splitter', icon: 'split', cls: 'split' },
];

export default function BottomNav({ current }: { current: string }) {
  const render = (t: (typeof TABS)[number]) => (
    <a
      key={t.key}
      href={`#${t.to}`}
      className={t.cls}
      aria-current={current === t.key ? 'page' : undefined}
    >
      <Icon name={t.icon} />
      {t.label}
    </a>
  );
  return (
    <nav className="nav" aria-label="Main">
      {render(TABS[0])}
      {render(TABS[1])}
      <a href="#/add" className="fab" aria-label="Add transaction">
        <Icon name="plus" size={30} />
      </a>
      {render(TABS[2])}
      {render(TABS[3])}
    </nav>
  );
}
