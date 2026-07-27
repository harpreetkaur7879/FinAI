import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import TopBar from '../components/TopBar';

const DOC_LABELS = {
  aadhaar: 'Aadhaar Card',
  pan: 'PAN Card',
  salary_slip: 'Salary Slip',
  bank_statement: 'Bank Statement'
};
const IDENTITY_TYPES = ['aadhaar', 'pan'];
const INCOME_TYPES = ['salary_slip', 'bank_statement'];

export default function OfficerApplicationReview() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [application, setApplication] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [aiLoading, setAiLoading] = useState(null); // which AI action is running
  const [decisionForm, setDecisionForm] = useState({
    decision: 'approved',
    officerRemarks: '',
    approvedAmount: ''
  });
  const [decisionError, setDecisionError] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [requestingDocs, setRequestingDocs] = useState(false);
  const [requestDocsMsg, setRequestDocsMsg] = useState('');
  const [disbursing, setDisbursing] = useState(false);

  const fetchAll = async () => {
    try {
      const [appRes, docsRes] = await Promise.all([
        api.get(`/loan-applications/${id}`),
        api.get(`/loan-applications/${id}/documents`)
      ]);
      setApplication(appRes.data.data.application);
      setDocuments(docsRes.data.data.documents);
      setDecisionForm((f) => ({ ...f, approvedAmount: appRes.data.data.application.requestedAmount }));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load this application.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const runAiAction = async (action, endpoint) => {
    setAiLoading(action);
    setError('');
    try {
      const { data } = await api.post(endpoint);
      setApplication(data.data.application);
    } catch (err) {
      setError(err.response?.data?.message || `Could not run ${action}.`);
    } finally {
      setAiLoading(null);
    }
  };

  const runDocumentSummary = async (documentId) => {
    setAiLoading(`summarize-${documentId}`);
    setError('');
    try {
      await api.post(`/ai/documents/${documentId}/summarize`);
      const docsRes = await api.get(`/loan-applications/${id}/documents`);
      setDocuments(docsRes.data.data.documents);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not summarize this document.');
    } finally {
      setAiLoading(null);
    }
  };

  const handleRequestDocuments = async () => {
    setRequestingDocs(true);
    setRequestDocsMsg('');
    setError('');
    try {
      const { data } = await api.post(`/loan-applications/${id}/request-documents`);
      setApplication(data.data.application);
      setRequestDocsMsg('Notified the customer about missing documents.');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send document request.');
    } finally {
      setRequestingDocs(false);
    }
  };

  const handleDisburse = async () => {
    setDisbursing(true);
    setError('');
    try {
      const { data } = await api.post(`/loan-applications/${id}/disburse`);
      setApplication(data.data.application);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not disburse this loan.');
    } finally {
      setDisbursing(false);
    }
  };

  const handleDecision = async (e) => {
    e.preventDefault();
    setDecisionError('');
    setDeciding(true);
    try {
      const payload = {
        decision: decisionForm.decision,
        officerRemarks: decisionForm.officerRemarks,
        ...(decisionForm.decision === 'approved'
          ? { approvedAmount: Number(decisionForm.approvedAmount) }
          : {})
      };
      await api.post(`/loan-applications/${id}/decision`, payload);
      navigate('/officer');
    } catch (err) {
      setDecisionError(err.response?.data?.message || 'Could not submit decision.');
    } finally {
      setDeciding(false);
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
        <main className="max-w-5xl mx-auto px-8 py-14">
          <p className="text-rust text-sm">{error}</p>
        </main>
      </div>
    );
  }

  const docTypes = new Set(documents.map((d) => d.docType));
  const hasIdentity = IDENTITY_TYPES.some((t) => docTypes.has(t));
  const hasIncome = INCOME_TYPES.some((t) => docTypes.has(t));
  const canApprove = hasIdentity && hasIncome;
  const isDecided = application.status === 'approved' || application.status === 'rejected';
  const isAssignedToMe = application.assignedOfficer?._id === user?._id;
  const docsRequested = Boolean(application.documentsRequestedAt);

  return (
    <div className="min-h-screen bg-paper">
      <TopBar />
      <main className="max-w-5xl mx-auto px-8 py-14">
        <Link to="/officer" className="text-sm text-ink-muted hover:text-ink mb-6 inline-block">
          ← Back to queue
        </Link>

        {error && (
          <div className="mb-6 border-l-2 border-rust bg-rust/5 px-4 py-3 text-sm text-rust">{error}</div>
        )}

        {/* Application + customer summary */}
        <div className="bg-white border border-line rounded-sm p-10 mb-6">
          <h1 className="font-display text-3xl text-ink mb-1">{application.customer?.name}</h1>
          <p className="text-sm text-ink-muted mb-6">{application.customer?.email}</p>

          <div className="grid grid-cols-2 gap-6 font-mono text-sm">
            <div>
              <p className="seal text-xs text-ink-muted mb-1">Requested</p>
              <p className="text-ink">₹{application.requestedAmount.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="seal text-xs text-ink-muted mb-1">Tenure</p>
              <p className="text-ink">{application.tenure} months</p>
            </div>
            <div>
              <p className="seal text-xs text-ink-muted mb-1">Monthly salary</p>
              <p className="text-ink">
                ₹{application.customer?.customerProfile?.monthlySalary?.toLocaleString('en-IN') || '—'}
              </p>
            </div>
            <div>
              <p className="seal text-xs text-ink-muted mb-1">Employer</p>
              <p className="text-ink">{application.customer?.customerProfile?.employerName || '—'}</p>
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="bg-white border border-line rounded-sm p-10 mb-6">
          <h2 className="font-display text-3xl text-ink mb-4">Documents</h2>
          {documents.length === 0 ? (
            <p className="text-sm text-ink-muted">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div key={doc._id} className="border border-line rounded-sm p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-ink">{DOC_LABELS[doc.docType] || doc.docType}</p>
                      <a
                        href={doc.cloudinaryUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gold-dark hover:underline"
                      >
                        View file
                      </a>
                    </div>
                    {!doc.aiSummary?.name ? (
                      <button
                        onClick={() => runDocumentSummary(doc._id)}
                        disabled={aiLoading === `summarize-${doc._id}`}
                        className="text-xs border border-ink text-ink px-3 py-1.5 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
                      >
                        {aiLoading === `summarize-${doc._id}` ? 'Summarizing…' : 'AI Summarize'}
                      </button>
                    ) : (
                      <span className="seal text-xs text-sage border border-sage px-3 py-1.5">
                        Summarized
                      </span>
                    )}
                  </div>
                  {doc.aiSummary?.name && (
                    <p className="text-xs text-ink-muted font-mono mt-3 border-t border-line pt-3">
                      Extracted: {doc.aiSummary.name}
                      {doc.aiSummary.monthlySalary ? ` · ₹${doc.aiSummary.monthlySalary}` : ''}
                      {doc.aiSummary.employer ? ` · ${doc.aiSummary.employer}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs font-mono text-ink-muted">
              <span className={hasIdentity ? 'text-sage' : 'text-rust'}>
                {hasIdentity ? '✓' : '✗'} Identity document
              </span>
              {'  ·  '}
              <span className={hasIncome ? 'text-sage' : 'text-rust'}>
                {hasIncome ? '✓' : '✗'} Income document
              </span>
            </div>
            {isAssignedToMe && !canApprove && !isDecided && (
              <button
                onClick={handleRequestDocuments}
                disabled={requestingDocs || docsRequested}
                className={`text-xs border px-3 py-1.5 transition-colors disabled:opacity-70 whitespace-nowrap ${
                  docsRequested
                    ? 'border-sage text-sage'
                    : 'border-gold-dark text-gold-dark hover:bg-gold hover:text-paper'
                }`}
              >
                {docsRequested ? 'Requested ✓' : requestingDocs ? 'Sending…' : 'Request Documents'}
              </button>
            )}
          </div>
          {requestDocsMsg && <p className="text-xs text-sage mt-2">{requestDocsMsg}</p>}
          {!requestDocsMsg && docsRequested && (
            <p className="text-xs text-ink-muted mt-2 font-mono">
              Requested on {new Date(application.documentsRequestedAt).toLocaleDateString('en-IN')}
            </p>
          )}
        </div>

        {/* AI actions */}
        <div className="bg-white border border-line rounded-sm p-10 mb-6">
          <h2 className="font-display text-3xl text-ink mb-4">AI analysis</h2>
          <div className="flex flex-wrap gap-3 mb-6">
            <button
              onClick={() => runAiAction('risk-explanation', `/ai/applications/${id}/risk-explanation`)}
              disabled={aiLoading !== null}
              className="text-sm border border-ink text-ink px-4 py-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
            >
              {aiLoading === 'risk-explanation' ? 'Analyzing…' : 'Explain Risk'}
            </button>
            <button
              onClick={() => runAiAction('eligibility', `/ai/applications/${id}/eligibility`)}
              disabled={aiLoading !== null}
              className="text-sm border border-ink text-ink px-4 py-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
            >
              {aiLoading === 'eligibility' ? 'Analyzing…' : 'Recommend Eligibility'}
            </button>
            <button
              onClick={() => runAiAction('duplicate-check', `/ai/applications/${id}/duplicate-check`)}
              disabled={aiLoading !== null}
              className="text-sm border border-ink text-ink px-4 py-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
            >
              {aiLoading === 'duplicate-check' ? 'Checking…' : 'Check Duplicates'}
            </button>
            <button
              onClick={() => runAiAction('fraud-check', `/ai/applications/${id}/fraud-check`)}
              disabled={aiLoading !== null}
              className="text-sm border border-ink text-ink px-4 py-2 hover:bg-ink hover:text-paper transition-colors disabled:opacity-50"
            >
              {aiLoading === 'fraud-check' ? 'Checking…' : 'Fraud Check'}
            </button>
          </div>

          {application.aiRiskExplanation && (
            <div className="border-l-2 border-gold bg-gold/5 px-4 py-3 mb-3">
              <p className="seal text-xs text-gold-dark mb-1">Risk explanation</p>
              <p className="text-sm text-ink">{application.aiRiskExplanation}</p>
              {application.aiRiskTags?.length > 0 && (
                <p className="text-xs text-ink-muted font-mono mt-2">
                  {application.aiRiskTags.join(' · ')}
                </p>
              )}
            </div>
          )}

          {application.aiEligibilityRecommendation?.reasoning && (
            <div className="border-l-2 border-ink-muted bg-paper-dim px-4 py-3 mb-3">
              <p className="seal text-xs text-ink-muted mb-1">Eligibility recommendation</p>
              <p className="text-sm text-ink">
                Suggested max: ₹
                {application.aiEligibilityRecommendation.eligibleAmount?.toLocaleString('en-IN')}
              </p>
              <p className="text-sm text-ink-muted mt-1">
                {application.aiEligibilityRecommendation.reasoning}
              </p>
            </div>
          )}

          {application.aiDuplicateExplanation && (
            <div
              className={`border-l-2 px-4 py-3 mb-3 ${
                application.aiDuplicateFlag ? 'border-rust bg-rust/5' : 'border-sage bg-sage/5'
              }`}
            >
              <p className="seal text-xs mb-1">Duplicate check</p>
              <p className="text-sm text-ink">{application.aiDuplicateExplanation}</p>
            </div>
          )}

          {application.aiFraudExplanation && (
            <div
              className={`border-l-2 px-4 py-3 ${
                application.aiFraudFlag ? 'border-rust bg-rust/5' : 'border-sage bg-sage/5'
              }`}
            >
              <p className="seal text-xs mb-1">Fraud check</p>
              <p className="text-sm text-ink">{application.aiFraudExplanation}</p>
            </div>
          )}
        </div>

        {/* Decision / Disbursement */}
        {application.status === 'disbursed' ? (
          <div className="bg-white border border-line rounded-sm p-10">
            <p className="seal text-sm text-sage mb-1">Loan disbursed</p>
            <p className="text-sm text-ink-muted">
              Disbursed on {new Date(application.disbursedAt).toLocaleDateString('en-IN')}. EMI
              schedule has been generated for the customer.
            </p>
          </div>
        ) : application.status === 'approved' ? (
          <div className="bg-white border border-line rounded-sm p-10">
            <p className="seal text-sm text-sage mb-4">Application approved</p>
            {(isAssignedToMe || user?.role === 'admin') && (
              <>
                <p className="text-sm text-ink-muted mb-4">
                  Disbursing will mark this loan as active and generate the customer's EMI
                  repayment schedule.
                </p>
                <button
                  onClick={handleDisburse}
                  disabled={disbursing}
                  className="bg-ink text-paper font-display text-sm px-5 py-2.5 hover:bg-ink-light transition-colors disabled:opacity-50"
                >
                  {disbursing ? 'Disbursing…' : 'Disburse Loan'}
                </button>
              </>
            )}
          </div>
        ) : isDecided ? (
          <div className="bg-white border border-line rounded-sm p-10">
            <p className="seal text-sm text-ink-muted">
              This application has already been {application.status}.
            </p>
          </div>
        ) : isAssignedToMe ? (
          <div className="bg-white border border-line rounded-sm p-10">
            <h2 className="font-display text-3xl text-ink mb-4">Decision</h2>

            {!canApprove && (
              <div className="border-l-2 border-gold bg-gold/5 px-4 py-3 mb-5 text-sm text-ink">
                <span className="seal text-gold-dark">Note —</span> approval is blocked until an
                identity document and an income document are uploaded.
              </div>
            )}

            {decisionError && (
              <div className="mb-5 border-l-2 border-rust bg-rust/5 px-4 py-3 text-sm text-rust">
                {decisionError}
              </div>
            )}

            <form onSubmit={handleDecision} className="space-y-5">
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    checked={decisionForm.decision === 'approved'}
                    onChange={() => setDecisionForm((f) => ({ ...f, decision: 'approved' }))}
                  />
                  Approve
                </label>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    checked={decisionForm.decision === 'rejected'}
                    onChange={() => setDecisionForm((f) => ({ ...f, decision: 'rejected' }))}
                  />
                  Reject
                </label>
              </div>

              {decisionForm.decision === 'approved' && (
                <div>
                  <label className="block text-xs seal text-ink-muted mb-1.5">Approved amount (₹)</label>
                  <input
                    type="number"
                    required
                    value={decisionForm.approvedAmount}
                    onChange={(e) =>
                      setDecisionForm((f) => ({ ...f, approvedAmount: e.target.value }))
                    }
                    className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs seal text-ink-muted mb-1.5">Remarks</label>
                <textarea
                  required
                  rows={3}
                  value={decisionForm.officerRemarks}
                  onChange={(e) =>
                    setDecisionForm((f) => ({ ...f, officerRemarks: e.target.value }))
                  }
                  className="w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink transition-colors resize-none"
                  placeholder="Reasoning for this decision…"
                />
              </div>

              <button
                type="submit"
                disabled={deciding || (decisionForm.decision === 'approved' && !canApprove)}
                className="w-full bg-ink text-paper font-display text-base py-3 hover:bg-ink-light transition-colors disabled:opacity-50"
              >
                {deciding ? 'Submitting…' : `Submit ${decisionForm.decision}`}
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-white border border-line rounded-sm p-10">
            <p className="text-sm text-ink-muted">
              This application isn't assigned to you, so you can view it but not decide on it.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
