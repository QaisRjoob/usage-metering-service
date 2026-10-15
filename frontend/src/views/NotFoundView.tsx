import { Link } from 'react-router';
import { routePaths } from '@/routing/routePaths';

export default function NotFoundView() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <p className="text-5xl font-bold text-slate-200">404</p>
      <h1 className="mt-4 text-lg font-semibold text-slate-900">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">The page you are looking for does not exist.</p>
      <Link to={routePaths.dashboard} className="mt-6 text-sm font-medium text-brand-600 hover:underline">
        Back to the dashboard
      </Link>
    </div>
  );
}
