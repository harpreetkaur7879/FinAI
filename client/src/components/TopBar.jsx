import { useAuth } from '../context/AuthContext';

export default function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-line bg-white">
      <div className="max-w-5xl mx-auto px-8 py-6 flex items-center justify-between">
        <div>
          <p className="font-display text-2xl text-ink leading-none">FinAI</p>
          <p className="seal text-[10px] text-ink-muted mt-0.5">NBFC Loan Ledger</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-ink leading-tight">{user?.name}</p>
            <p className="seal text-[10px] text-gold-dark leading-tight">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="text-sm text-ink-muted hover:text-rust transition-colors border-b border-transparent hover:border-rust"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
