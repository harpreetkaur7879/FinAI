import { useAuth } from '../context/AuthContext';

export default function TopBar() {
  const { user, logout } = useAuth();

  return (
    <header className="border-b border-line bg-white">
      <div className="max-w-5xl mx-auto px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
            <rect width="64" height="64" rx="12" fill="#14213D" />
            <circle cx="32" cy="32" r="24" fill="none" stroke="#B8860B" strokeWidth="2" />
            <text
              x="32"
              y="42"
              fontFamily="Georgia, 'Source Serif 4', serif"
              fontSize="28"
              fontWeight="600"
              fill="#B8860B"
              textAnchor="middle"
            >
              F
            </text>
          </svg>
          <div>
            <p className="font-display text-2xl text-ink leading-none">FinAI</p>
            <p className="seal text-[10px] text-ink-muted mt-0.5">NBFC Loan Ledger</p>
          </div>
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