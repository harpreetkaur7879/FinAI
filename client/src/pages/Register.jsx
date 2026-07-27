import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await register(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-md">
        <div className="relative bg-white border border-line shadow-[0_1px_0_var(--color-line)] rounded-sm overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gold/10" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />

          <div className="px-8 pt-10 pb-8">
            <p className="seal text-xs text-gold-dark mb-1">FinAI · NBFC Loan Ledger</p>
            <h1 className="font-display text-4xl text-ink mb-10">Open an account</h1>

            {error && (
              <div className="mb-6 border-l-2 border-rust bg-rust/5 px-4 py-3 text-sm text-rust">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <Field label="Full name" type="text" value={form.name} onChange={update('name')} placeholder="Harpreet Kaur" />
              <Field label="Email" type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" />
              <Field label="Phone" type="tel" value={form.phone} onChange={update('phone')} placeholder="9876543210" />
              <Field
                label="Password"
                type="password"
                value={form.password}
                onChange={update('password')}
                placeholder="At least 8 characters, 1 number"
              />

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-ink text-paper font-display text-base py-3 mt-4 hover:bg-ink-light transition-colors disabled:opacity-50"
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </button>
            </form>
          </div>

          <div className="ledger-rule h-3" />
        </div>

        <p className="text-center text-sm text-ink-muted mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-gold-dark hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs seal text-ink-muted mb-1.5">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
      />
    </div>
  );
}
