import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(email, password);
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'loanOfficer') navigate('/officer');
      else navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md">
        {/* Signature element: a passbook-style cover with a gold seal corner */}
        <div className="relative bg-white border border-line shadow-[0_1px_0_var(--color-line)] rounded-sm overflow-hidden">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gold/10" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />

          <div className="px-8 pt-10 pb-8">
            <p className="seal text-xs text-gold-dark mb-1">FinAI · NBFC Loan Ledger</p>
            <h1 className="font-display text-4xl text-ink mb-10">Welcome back</h1>

            {error && (
              <div className="mb-6 border-l-2 border-rust bg-rust/5 px-4 py-3 text-sm text-rust">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-xs seal text-ink-muted mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs seal text-ink-muted mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-ink text-paper font-display text-base py-3 mt-4 hover:bg-ink-light transition-colors disabled:opacity-50"
              >
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>

          <div className="ledger-rule h-3" />
        </div>

        <p className="text-center text-sm text-ink-muted mt-6">
          New customer?{' '}
          <Link to="/register" className="text-gold-dark hover:underline">
            Open an account
          </Link>
        </p>
      </div>
    </div>
  );
}
