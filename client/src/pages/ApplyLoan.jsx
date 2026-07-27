import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import TopBar from '../components/TopBar';

export default function ApplyLoan() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [amount, setAmount] = useState('');
  const [tenure, setTenure] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const { data } = await api.get('/loan-products');
        setProducts(data.data.products);
      } catch {
        setError('Could not load loan products. Please try again.');
      } finally {
        setLoadingProducts(false);
      }
    };
    fetchProducts();
  }, []);

  const selectProduct = (product) => {
    setSelectedProduct(product);
    setAmount('');
    setTenure('');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/loan-applications', {
        loanProduct: selectedProduct._id,
        requestedAmount: Number(amount),
        tenure: Number(tenure)
      });
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
        <h1 className="font-display text-4xl text-ink mb-1">Apply for a loan</h1>
        <p className="text-ink-muted mb-10">Choose a product, then tell us how much you need.</p>

        {loadingProducts ? (
          <p className="text-sm text-ink-muted seal">Loading products…</p>
        ) : !selectedProduct ? (
          <div className="space-y-3">
            {products.length === 0 && (
              <p className="text-sm text-ink-muted">No loan products are currently available.</p>
            )}
            {products.map((p) => (
              <button
                key={p._id}
                onClick={() => selectProduct(p)}
                className="w-full text-left bg-white border border-line rounded-sm p-5 hover:border-gold transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display text-lg text-ink">{p.name}</p>
                    {p.description && <p className="text-sm text-ink-muted mt-0.5">{p.description}</p>}
                  </div>
                  <p className="font-mono text-sm text-gold-dark">{p.interestRate}% p.a.</p>
                </div>
                <p className="text-xs text-ink-muted mt-3 font-mono">
                  ₹{p.minAmount.toLocaleString('en-IN')} – ₹{p.maxAmount.toLocaleString('en-IN')} ·{' '}
                  {p.tenureOptions.join(', ')} months
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-line rounded-sm p-10">
            <div className="flex items-center justify-between mb-6 pb-6 border-b border-line">
              <div>
                <p className="font-display text-3xl text-ink">{selectedProduct.name}</p>
                <p className="text-xs text-ink-muted font-mono mt-1">
                  {selectedProduct.interestRate}% p.a.
                </p>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-sm text-ink-muted hover:text-ink"
              >
                Change
              </button>
            </div>

            {error && (
              <div className="mb-6 border-l-2 border-rust bg-rust/5 px-4 py-3 text-sm text-rust">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-xs seal text-ink-muted mb-1.5">
                  Amount (₹{selectedProduct.minAmount.toLocaleString('en-IN')} – ₹
                  {selectedProduct.maxAmount.toLocaleString('en-IN')})
                </label>
                <input
                  type="number"
                  required
                  min={selectedProduct.minAmount}
                  max={selectedProduct.maxAmount}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs seal text-ink-muted mb-1.5">Tenure (months)</label>
                <select
                  required
                  value={tenure}
                  onChange={(e) => setTenure(e.target.value)}
                  className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
                >
                  <option value="" disabled>
                    Select tenure
                  </option>
                  {selectedProduct.tenureOptions.map((t) => (
                    <option key={t} value={t}>
                      {t} months
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-ink text-paper font-display text-base py-3 mt-2 hover:bg-ink-light transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit application'}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
