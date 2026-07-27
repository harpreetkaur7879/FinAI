import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import TopBar from '../components/TopBar';

const DOC_TYPES = [
  { value: 'aadhaar', label: 'Aadhaar Card' },
  { value: 'pan', label: 'PAN Card' },
  { value: 'salary_slip', label: 'Salary Slip' },
  { value: 'bank_statement', label: 'Bank Statement' }
];

const STATUS_STYLES = {
  submitted: { label: 'Submitted', color: 'text-ink-muted', border: 'border-ink-muted' },
  under_review: { label: 'Under Review', color: 'text-gold-dark', border: 'border-gold' },
  approved: { label: 'Approved', color: 'text-sage', border: 'border-sage' },
  rejected: { label: 'Rejected', color: 'text-rust', border: 'border-rust' },
  disbursed: { label: 'Disbursed', color: 'text-sage', border: 'border-sage' }
};

export default function ApplicationDetail() {
  const { id } = useParams();
  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [emis, setEmis] = useState([]);
  const [payingId, setPayingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState('aadhaar');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchAll = async () => {
    try {
      const [appRes, docsRes] = await Promise.all([
        api.get(`/loan-applications/${id}`),
        api.get(`/loan-applications/${id}/documents`)
      ]);
      setApplication(appRes.data.data.application);
      setDocuments(docsRes.data.data.documents);
      if (appRes.data.data.application.status === 'disbursed') {
        const emisRes = await api.get(`/loan-applications/${id}/emis`);
        setEmis(emisRes.data.data.emis);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load this application.');
    } finally {
      setLoading(false);
    }
  };

  const handlePayEmi = async (emiId) => {
    setPayingId(emiId);
    setError('');
    try {
      await api.patch(`/loan-applications/${id}/emis/${emiId}/pay`);
      const emisRes = await api.get(`/loan-applications/${id}/emis`);
      setEmis(emisRes.data.data.emis);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not process this payment.');
    } finally {
      setPayingId(null);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleUpload = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!file) {
      setError('Choose a file first.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('docType', docType);
      formData.append('file', file);
      await api.post(`/loan-applications/${id}/documents`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSuccessMsg('Document uploaded.');
      setFile(null);
      // Reset the native file input's displayed filename
      const fileInput = document.getElementById('doc-file-input');
      if (fileInput) fileInput.value = '';
      const docsRes = await api.get(`/loan-applications/${id}/documents`);
      setDocuments(docsRes.data.data.documents);
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-paper">
        <TopBar />
        <p className="text-center text-sm text-ink-muted seal mt-10">Loading…</p>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="min-h-screen bg-paper">
        <TopBar />
        <main className="max-w-3xl mx-auto px-8 py-14">
          <p className="text-rust text-sm">{error}</p>
          <Link to="/dashboard" className="text-gold-dark text-sm hover:underline mt-4 inline-block">
            ← Back to dashboard
          </Link>
        </main>
      </div>
    );
  }

  const style = STATUS_STYLES[application.status] || STATUS_STYLES.submitted;
  const uploadedTypes = new Set(documents.map((d) => d.docType));

  return (
    <div className="min-h-screen bg-paper">
      <TopBar />
      <main className="max-w-3xl mx-auto px-8 py-14">
        <Link to="/dashboard" className="text-sm text-ink-muted hover:text-ink mb-6 inline-block">
          ← Back to dashboard
        </Link>

        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="font-display text-4xl text-ink mb-1">
              {application.loanProduct?.name || 'Loan Application'}
            </h1>
            <p className="text-ink-muted font-mono text-sm">
              ₹{application.requestedAmount.toLocaleString('en-IN')} · {application.tenure} months
            </p>
          </div>
          <span className={`seal text-xs border px-3 py-1.5 ${style.color} ${style.border}`}>
            {style.label}
          </span>
        </div>

        {/* Document upload */}
        <div className="bg-white border border-line rounded-sm p-10 mb-6">
          <h2 className="font-display text-3xl text-ink mb-1">KYC Documents</h2>
          <p className="text-sm text-ink-muted mb-6">
            Upload the documents needed to verify your application.
          </p>

          {error && (
            <div className="mb-5 border-l-2 border-rust bg-rust/5 px-4 py-3 text-sm text-rust">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="mb-5 border-l-2 border-sage bg-sage/5 px-4 py-3 text-sm text-sage">
              {successMsg}
            </div>
          )}

          <form onSubmit={handleUpload} className="flex flex-col sm:flex-row gap-4 sm:items-end">
            <div className="flex-1">
              <label className="block text-xs seal text-ink-muted mb-1.5">Document type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                    {uploadedTypes.has(t.value) ? ' (uploaded)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs seal text-ink-muted mb-1.5">File</label>
              <input
                id="doc-file-input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setFile(e.target.files[0])}
                className="w-full text-sm text-ink-muted"
              />
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="bg-ink text-paper font-display text-sm px-5 py-2.5 hover:bg-ink-light transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </form>
        </div>

        {/* Uploaded documents list */}
        <div className="bg-white border border-line rounded-sm">
          {documents.length === 0 ? (
            <p className="text-sm text-ink-muted p-10 text-center">No documents uploaded yet.</p>
          ) : (
            documents.map((doc, i) => (
              <div
                key={doc._id}
                className={`flex items-center justify-between px-8 py-4 ${
                  i !== documents.length - 1 ? 'border-b border-line' : ''
                }`}
              >
                <div>
                  <p className="text-ink text-sm">
                    {DOC_TYPES.find((t) => t.value === doc.docType)?.label || doc.docType}
                  </p>
                  <p className="text-xs text-ink-muted font-mono mt-0.5">
                    Uploaded {new Date(doc.uploadedAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <a
                  href={doc.cloudinaryUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gold-dark hover:underline"
                >
                  View
                </a>
              </div>
            ))
          )}
        </div>

        {/* EMI repayment schedule — only exists once the loan is disbursed */}
        {application.status === 'disbursed' && (
          <div className="bg-white border border-line rounded-sm mt-6">
            <div className="px-8 pt-6 pb-2">
              <h2 className="font-display text-3xl text-ink">Repayment schedule</h2>
              <p className="text-sm text-ink-muted mt-1">
                {emis.filter((e) => e.status === 'paid').length} of {emis.length} installments paid
              </p>
            </div>
            {emis.map((emi, i) => (
              <div
                key={emi._id}
                className={`flex items-center justify-between px-8 py-4 ${
                  i !== emis.length - 1 ? 'border-b border-line' : ''
                }`}
              >
                <div>
                  <p className="text-sm text-ink">Installment {emi.installmentNumber}</p>
                  <p className="text-xs text-ink-muted font-mono mt-0.5">
                    Due {new Date(emi.dueDate).toLocaleDateString('en-IN')} · ₹
                    {emi.amount.toLocaleString('en-IN')}
                  </p>
                </div>
                {emi.status === 'paid' ? (
                  <span className="seal text-xs text-sage border border-sage px-3 py-1.5">Paid</span>
                ) : (
                  <button
                    onClick={() => handlePayEmi(emi._id)}
                    disabled={payingId === emi._id}
                    className="bg-ink text-paper font-display text-xs px-4 py-2 hover:bg-ink-light transition-colors disabled:opacity-50"
                  >
                    {payingId === emi._id ? 'Processing…' : 'Pay Now'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
