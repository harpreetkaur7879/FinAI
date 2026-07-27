import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import TopBar from '../components/TopBar';

const ROLE_STYLES = {
  admin: 'text-gold-dark border-gold',
  loanOfficer: 'text-ink border-ink-muted',
  customer: 'text-ink-muted border-line'
};

function CreateOfficerForm({ onCreated }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    branch: '',
    designation: 'junior_officer'
  });
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/users/officers', form);
      setSuccessMsg(
        `Officer created: ${data.data.user.name} (${data.data.user.officerProfile.employeeId})`
      );
      setForm({
        name: '',
        email: '',
        phone: '',
        password: '',
        branch: '',
        designation: 'junior_officer'
      });
      onCreated?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create officer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-line rounded-sm p-10 mb-10">
      <h2 className="font-display text-3xl text-ink mb-1">Create loan officer</h2>
      <p className="text-sm text-ink-muted mb-6">
        Officer and admin accounts can only be created here — never through public registration.
      </p>

      {error && (
        <div className="mb-5 border-l-2 border-rust bg-rust/5 px-4 py-3 text-sm text-rust">{error}</div>
      )}
      {successMsg && (
        <div className="mb-5 border-l-2 border-sage bg-sage/5 px-4 py-3 text-sm text-sage">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-5">
        <Field label="Full name" value={form.name} onChange={update('name')} />
        <Field label="Email" type="email" value={form.email} onChange={update('email')} />
        <Field label="Phone" type="tel" value={form.phone} onChange={update('phone')} />
        <Field
          label="Temporary password"
          type="password"
          value={form.password}
          onChange={update('password')}
        />
        <Field label="Branch" value={form.branch} onChange={update('branch')} />
        <div>
          <label className="block text-xs seal text-ink-muted mb-1.5">Designation</label>
          <select
            value={form.designation}
            onChange={update('designation')}
            className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
          >
            <option value="junior_officer">Junior Officer</option>
            <option value="senior_officer">Senior Officer</option>
          </select>
        </div>

        <div className="col-span-2">
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-ink text-paper font-display text-base py-3 hover:bg-ink-light transition-colors disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create officer'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, type = 'text', value, onChange }) {
  return (
    <div>
      <label className="block text-xs seal text-ink-muted mb-1.5">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={onChange}
        className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
      />
    </div>
  );
}

function UsersTable() {
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const fetchUsers = async (role) => {
    setLoading(true);
    try {
      const { data } = await api.get('/users', { params: role ? { role } : {} });
      setUsers(data.data.users);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(roleFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  const toggleStatus = async (user) => {
    setUpdatingId(user._id);
    setError('');
    try {
      await api.patch(`/users/${user._id}/status`, { isActive: !user.isActive });
      await fetchUsers(roleFilter);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update user status.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-3xl text-ink">Users</h2>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="border-b border-line bg-transparent py-1.5 text-sm text-ink focus:outline-none focus:border-ink"
        >
          <option value="">All roles</option>
          <option value="customer">Customer</option>
          <option value="loanOfficer">Loan Officer</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 border-l-2 border-rust bg-rust/5 px-4 py-3 text-sm text-rust">{error}</div>
      )}

      <div className="bg-white border border-line rounded-sm">
        {loading ? (
          <p className="text-sm text-ink-muted seal p-10 text-center">Loading…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-ink-muted p-10 text-center">No users found.</p>
        ) : (
          users.map((u, i) => (
            <div
              key={u._id}
              className={`flex items-center justify-between px-8 py-4 ${
                i !== users.length - 1 ? 'border-b border-line' : ''
              }`}
            >
              <div>
                <p className="text-ink text-sm">
                  {u.name}
                  {u.officerProfile?.employeeId ? ` · ${u.officerProfile.employeeId}` : ''}
                </p>
                <p className="text-xs text-ink-muted font-mono mt-0.5">{u.email}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className={`seal text-xs border px-3 py-1.5 ${ROLE_STYLES[u.role]}`}>
                  {u.role}
                </span>
                <span className={`text-xs seal ${u.isActive ? 'text-sage' : 'text-rust'}`}>
                  {u.isActive ? 'Active' : 'Inactive'}
                </span>
                {u.role !== 'admin' && (
                  <button
                    onClick={() => toggleStatus(u)}
                    disabled={updatingId === u._id}
                    className="text-xs border border-ink-muted text-ink-muted px-3 py-1.5 hover:border-ink hover:text-ink transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {updatingId === u._id ? '…' : u.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="min-h-screen bg-paper">
      <TopBar />
      <main className="max-w-5xl mx-auto px-8 py-14">
        <h1 className="font-display text-4xl text-ink mb-1">Administration</h1>
        <p className="text-ink-muted mb-10">Manage officers, users, and view portfolio analytics.</p>

        <CreateOfficerForm onCreated={() => setRefreshKey((k) => k + 1)} />
        <UsersTable key={refreshKey} />
      </main>
    </div>
  );
}
