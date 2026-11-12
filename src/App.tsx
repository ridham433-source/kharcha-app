import { useEffect } from 'react';
import { parseHash, useHash } from './lib/router';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Activity from './pages/Activity';
import Insights from './pages/Insights';
import AddTx from './pages/AddTx';
import More from './pages/More';
import Splitter from './pages/Splitter';
import GroupDetail from './pages/GroupDetail';
import GroupExpenseForm from './pages/GroupExpenseForm';
import Join from './pages/Join';
import Khata from './pages/Khata';
import KhataDetail from './pages/KhataDetail';

export default function App() {
  const hash = useHash();
  const { parts, query } = parseHash(hash);
  const [a, b, c, d] = parts;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  let page: JSX.Element;
  let nav: string | null = null; // which tab is highlighted; null hides the nav

  if (!a) {
    page = <Home />;
    nav = '';
  } else if (a === 'activity') {
    page = <Activity />;
    nav = 'activity';
  } else if (a === 'insights') {
    page = <Insights />;
    nav = 'insights';
  } else if (a === 'more') {
    page = <More />;
    nav = 'more';
  } else if (a === 'add') {
    page = <AddTx startOwe={query.has('owe')} friendId={query.get('owe') ?? undefined} key={query.toString()} />;
  } else if (a === 'edit' && b) {
    page = <AddTx editId={b} key={b} />;
  } else if (a === 'join' && b) {
    page = (
      <Join
        code={b}
        url={query.get('u') ?? undefined}
        anonKey={query.get('k') ?? undefined}
        key={b}
      />
    );
  } else if (a === 'khata' && !b) {
    page = <Khata />;
    nav = 'khata';
  } else if (a === 'khata' && b) {
    page = <KhataDetail id={b} key={b} />;
  } else if (a === 'splitter' && !b) {
    page = <Splitter />;
    nav = 'splitter';
  } else if (a === 'splitter' && b && c === 'add') {
    page = <GroupExpenseForm groupId={b} />;
  } else if (a === 'splitter' && b && c === 'edit' && d) {
    page = <GroupExpenseForm groupId={b} editId={d} key={d} />;
  } else if (a === 'splitter' && b) {
    page = <GroupDetail id={b} key={b} />;
  } else {
    page = <Home />;
    nav = '';
  }

  return (
    <>
      {page}
      {nav !== null && <BottomNav current={nav} />}
    </>
  );
}
