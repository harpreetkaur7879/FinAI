import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import TopBar from '../components/TopBar';

export default function CompleteProfile() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    dob: '',
    employmentType: 'salaried',
    monthlySalary: '',
    employerName: ''
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        monthlySalary: Number(form.monthlySalary),
        // Backend only requires employerName for salaried applicants —
        // omit it for self-employed/unemployed so validation doesn't
        // reject an empty field it doesn't actually need.
        employerName: form.employmentType === 'salaried' ? form.employerName : undefined
      };
      const { data } = await api.put('/users/profile', payload);
      setUser(data.data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper">
      <TopBar />
      <main className="max-w-3xl mx-auto px-8 py-14">
        <h1 className="font-display text-4xl text-ink mb-1">Complete your profile</h1>
        <p className="text-ink-muted mb-10">
          We need a few details about your income before you can apply for a loan.
        </p>

        <div className="bg-white border border-line rounded-sm p-10">
          {error && (
            <div className="mb-6 border-l-2 border-rust bg-rust/5 px-4 py-3 text-sm text-rust">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs seal text-ink-muted mb-1.5">Date of birth</label>
              <input
                type="date"
                required
                value={form.dob}
                onChange={update('dob')}
                className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs seal text-ink-muted mb-1.5">Employment type</label>
              <select
                value={form.employmentType}
                onChange={update('employmentType')}
                className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
              >
                <option value="salaried">Salaried</option>
                <option value="self-employed">Self-employed</option>
                <option value="unemployed">Unemployed</option>
              </select>
            </div>

            <div>
              <label className="block text-xs seal text-ink-muted mb-1.5">
                Monthly salary (₹)
              </label>
              <input
                type="number"
                required
                min="0"
                value={form.monthlySalary}
                onChange={update('monthlySalary')}
                placeholder="58000"
                className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
              />
            </div>

            {form.employmentType === 'salaried' && (
              <div>
                <label className="block text-xs seal text-ink-muted mb-1.5">Employer name</label>
                <input
                  type="text"
                  required
                  value={form.employerName}
                  onChange={update('employerName')}
                  placeholder="ABC Pvt Ltd"
                  className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-ink text-paper font-display text-base py-3 mt-2 hover:bg-ink-light transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
