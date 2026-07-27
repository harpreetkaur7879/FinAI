import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import TopBar from '../components/TopBar';

// Status -> seal color, matching the passbook/ledger design language.
// Each status reads like a stamp on a passbook entry rather than a
// generic colored pill.
const STATUS_STYLES = {
  submitted: { label: 'Submitted', color: 'text-ink-muted', border: 'border-ink-muted' },
  under_review: { label: 'Under Review', color: 'text-gold-dark', border: 'border-gold' },
  approved: { label: 'Approved', color: 'text-sage', border: 'border-sage' },
  rejected: { label: 'Rejected', color: 'text-rust', border: 'border-rust' },
  disbursed: { label: 'Disbursed', color: 'text-sage', border: 'border-sage' }
};

export default function CustomerDashboard() {
  const { user } = useAuth();
  const profileDone = user?.customerProfile?.profileCompleted;
  const [applications, setApplications] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        const [appsRes, notifsRes] = await Promise.all([
          api.get('/loan-applications'),
          api.get('/notifications')
        ]);
        setApplications(appsRes.data.data.applications);
        setNotifications(notifsRes.data.data.notifications.filter((n) => !n.isRead));
      } catch {
        // Non-fatal — dashboard still renders, just without the list.
      } finally {
        setLoading(false);
      }
    };
    fetchApplications();
  }, []);

  const dismissNotification = async (notificationId) => {
    setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
    try {
      await api.patch(`/notifications/${notificationId}/read`);
    } catch {
      // Non-fatal — worst case it reappears on next visit, not worth
      // blocking the UI or showing an error for a read-receipt failing.
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <TopBar />
      <main className="max-w-5xl mx-auto px-8 py-14">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="font-display text-4xl text-ink mb-1">Your ledger</h1>
            <p className="text-ink-muted">Track your applications and loan status here.</p>
          </div>
          {profileDone && (
            <Link
              to="/apply"
              className="bg-ink text-paper font-display text-sm px-5 py-2.5 hover:bg-ink-light transition-colors whitespace-nowrap"
            >
              Apply for a loan
            </Link>
          )}
        </div>

        {notifications.map((n) => (
          <div
            key={n._id}
            className="border-l-2 border-gold bg-gold/5 px-5 py-4 mb-4 flex items-center justify-between"
          >
            <p className="text-sm text-ink">
              <span className="seal text-gold-dark">Notice —</span> {n.message}
            </p>
            <button
              onClick={() => dismissNotification(n._id)}
              className="text-sm text-ink-muted hover:text-ink whitespace-nowrap ml-4"
            >
              Dismiss
            </button>
          </div>
        ))}

        {!profileDone && (
          <div className="border-l-2 border-gold bg-gold/5 px-5 py-4 mb-10 flex items-center justify-between">
            <p className="text-sm text-ink">
              <span className="seal text-gold-dark">Action needed —</span> complete your profile
              before applying for a loan.
            </p>
            <Link to="/profile/complete" className="text-sm text-gold-dark hover:underline whitespace-nowrap ml-4">
              Complete profile →
            </Link>
          </div>
        )}

        <div className="bg-white border border-line rounded-sm">
          {loading ? (
            <p className="text-sm text-ink-muted seal p-10 text-center">Loading…</p>
          ) : applications.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-ink-muted text-sm">
                {profileDone
                  ? "You haven't applied for a loan yet."
                  : 'Complete your profile to apply for your first loan.'}
              </p>
            </div>
          ) : (
            <div>
              {applications.map((app, i) => {
                const style = STATUS_STYLES[app.status] || STATUS_STYLES.submitted;
                return (
                  <Link
                    to={`/applications/${app._id}`}
                    key={app._id}
                    className={`flex items-center justify-between px-8 py-6 hover:bg-paper-dim transition-colors ${
                      i !== applications.length - 1 ? 'border-b border-line' : ''
                    }`}
                  >
                    <div>
                      <p className="font-display text-lg text-ink">
                        {app.loanProduct?.name || 'Loan'}
                      </p>
                      <p className="text-xs text-ink-muted font-mono mt-1">
                        ₹{app.requestedAmount.toLocaleString('en-IN')} · {app.tenure} months
                        {app.emiAmount ? ` · EMI ₹${app.emiAmount.toLocaleString('en-IN')}` : ''}
                      </p>
                    </div>
                    <span
                      className={`seal text-xs border px-3 py-1.5 ${style.color} ${style.border}`}
                    >
                      {style.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
