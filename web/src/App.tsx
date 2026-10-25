import { useEffect } from 'react';
import { Admin } from './Admin';
import { PublicSite } from './Public';
export { Blocks } from './Content';
export function App() {
  const path = location.pathname;
  useEffect(() => {
    document.documentElement.lang = 'en';
  }, []);
  return path.startsWith('/admin') ? <Admin /> : <PublicSite path={path} />;
}
