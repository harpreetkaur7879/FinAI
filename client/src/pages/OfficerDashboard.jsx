import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import TopBar from '../components/TopBar';

const STATUS_STYLES = {
  submitted: { label: 'Submitted', color: 'text-ink-muted', border: 'border-ink-muted' },
  under_review: { label: 'Under Review', color: 'text-gold-dark', border: 'border-gold' },
  approved: { label: 'Approved', color: 'text-sage', border: 'border-sage' },
  rejected: { label: 'Rejected', color: 'text-rust', border: 'border-rust' },
  disbursed: { label: 'Disbursed', color: 'text-sage', border: 'border-sage' }
};

function ApplicationRow({ app, showClaim, onClaim, claiming }) {
  const style = STATUS_STYLES[app.status] || STATUS_STYLES.submitted;
  return (
    <div className="flex items-center justify-between px-8 py-6 border-b border-line last:border-b-0">
      <Link to={`/applications/${app._id}`} className="flex-1 hover:opacity-70 transition-opacity">
        <p className="font-display text-lg text-ink">
          {app.customer?.name} · {app.loanProduct?.name}
        </p>
        <p className="text-xs text-ink-muted font-mono mt-1">
          ₹{app.requestedAmount.toLocaleString('en-IN')} · {app.tenure} months
        </p>
      </Link>
      <div className="flex items-center gap-4">
        <span className={`seal text-xs border px-3 py-1.5 ${style.color} ${style.border}`}>
          {style.label}
        </span>
        {showClaim && (
          <button
            onClick={() => onClaim(app._id)}
            disabled={claiming === app._id}
            className="bg-ink text-paper font-display text-sm px-4 py-2 hover:bg-ink-light transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {claiming === app._id ? 'Claiming…' : 'Claim'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function OfficerDashboard() {
  const { user } = useAuth();
  const [queue, setQueue] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(null);
  const [error, setError] = useState('');

  const fetchAll = async () => {
    try {
      const [queueRes, mineRes] = await Promise.all([
        api.get('/loan-applications?unassigned=true'),
        api.get('/loan-applications')
      ]);
      setQueue(queueRes.data.data.applications);
      setMyApplications(mineRes.data.data.applications);
    } catch {
      setError('Could not load applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleClaim = async (id) => {
    setClaiming(id);
    setError('');
    try {
      await api.patch(`/loan-applications/${id}/assign`);
      await fetchAll();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not claim this application.');
    } finally {
      setClaiming(null);
    }
  };

  const activeCount = myApplications.filter(
    (a) => a.status === 'submitted' || a.status === 'under_review'
  ).length;
  const cap = user?.officerProfile?.maxActiveApplications || 20;

  return (
    <div className="min-h-screen bg-paper">
      <TopBar />
      <main className="max-w-5xl mx-auto px-8 py-14">
        <h1 className="font-display text-4xl text-ink mb-1">Review queue</h1>
        <p className="text-ink-muted mb-10">
          {user?.officerProfile?.employeeId} · {user?.officerProfile?.branch} branch ·{' '}
          <span className="font-mono">
            {activeCount}/{cap} active
          </span>
        </p>

        {error && (
          <div className="mb-6 border-l-2 border-rust bg-rust/5 px-4 py-3 text-sm text-rust">{error}</div>
        )}

        {loading ? (
          <p className="text-sm text-ink-muted seal">Loading…</p>
        ) : (
          <>
            <section className="mb-10">
              <h2 className="font-display text-3xl text-ink mb-4">My applications</h2>
              <div className="bg-white border border-line rounded-sm">
                {myApplications.length === 0 ? (
                  <p className="text-sm text-ink-muted p-10 text-center">
                    You haven't claimed any applications yet.
                  </p>
                ) : (
                  myApplications.map((app) => <ApplicationRow key={app._id} app={app} />)
                )}
              </div>
            </section>

            <section>
              <h2 className="font-display text-3xl text-ink mb-4">Unclaimed queue</h2>
              <div className="bg-white border border-line rounded-sm">
                {queue.length === 0 ? (
                  <p className="text-sm text-ink-muted p-10 text-center">
                    No unclaimed applications right now.
                  </p>
                ) : (
                  queue.map((app) => (
                    <ApplicationRow
                      key={app._id}
                      app={app}
                      showClaim
                      onClaim={handleClaim}
                      claiming={claiming}
                    />
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
