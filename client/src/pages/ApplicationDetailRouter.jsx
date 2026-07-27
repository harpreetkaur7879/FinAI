import { useAuth } from '../context/AuthContext';
import ApplicationDetail from './ApplicationDetail';
import OfficerApplicationReview from './OfficerApplicationReview';

// Same URL (/applications/:id) shows different views depending on who's
// looking — customers see their own upload/status view, officers and
// admins see the review view with AI actions and the decision form.
export default function ApplicationDetailRouter() {
  const { user } = useAuth();

  if (user?.role === 'loanOfficer' || user?.role === 'admin') {
    return <OfficerApplicationReview />;
  }
  return <ApplicationDetail />;
}
