const { getModel } = require('../config/gemini');
const { ApiError } = require('../utils/apiResponse');

/**
 * Strips markdown code fences (```json ... ```) that Gemini sometimes
 * wraps JSON responses in, then parses. Every "structured" AI call below
 * asks for JSON-only output, but models aren't 100% reliable about that
 * instruction, so this is a defensive parse, not an optional nicety.
 */
const parseJsonResponse = (text) => {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new ApiError(502, `AI returned an unparseable response: ${cleaned.slice(0, 200)}`);
  }
};

/**
 * Downloads a file from Cloudinary and base64-encodes it for Gemini's
 * vision input. Kept small and isolated so if we ever swap storage
 * providers, only this function needs to change.
 */
const fetchAsBase64 = async (url) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ApiError(502, `Failed to fetch document from storage (status ${res.status})`);
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await res.arrayBuffer();
  return { base64: Buffer.from(arrayBuffer).toString('base64'), mimeType: contentType };
};

/**
 * AI Action 1: KYC Document Summary + OCR Cleanup (combined)
 * Business reason (Phase 0): officer reads 5 structured lines instead of
 * a 10-page scanned document. Uses Gemini's vision capability directly on
 * the image/PDF — no separate OCR library needed (Gemini reads the text
 * as part of understanding the image).
 */
const summarizeDocument = async (cloudinaryUrl, docType) => {
  const { base64, mimeType } = await fetchAsBase64(cloudinaryUrl);
  const model = getModel();

  const prompt = `You are analyzing a KYC document of type "${docType}" for a loan application at an NBFC (non-banking financial company).

Extract whatever of the following fields are visible in the document, and clean up any OCR-style errors (e.g. "H4rpreet KaUr" -> "Harpreet Kaur"). Leave a field null if it is not present in this document type.

Respond with ONLY a JSON object, no markdown, no explanation, in this exact shape:
{
  "cleanedText": "a short cleaned-up plain-text transcription of the key visible text",
  "name": "string or null",
  "monthlySalary": "number or null",
  "employer": "string or null",
  "avgBalance": "number or null",
  "existingEmi": "number or null"
}`;

  const result = await model.generateContent([
    prompt,
    { inlineData: { data: base64, mimeType } }
  ]);

  const parsed = parseJsonResponse(result.response.text());
  return {
    aiCleanedText: parsed.cleanedText || '',
    aiSummary: {
      name: parsed.name || undefined,
      monthlySalary: parsed.monthlySalary || undefined,
      employer: parsed.employer || undefined,
      avgBalance: parsed.avgBalance || undefined,
      existingEmi: parsed.existingEmi || undefined
    }
  };
};

/**
 * AI Action 2: Risk Explanation
 * Business reason: "Risk: Medium" tells an officer nothing actionable.
 * AI explains WHY in plain business language. AI never approves/rejects —
 * it only explains; the officer's own judgment is what makes the decision
 * (see loanDecisionController — this data is advisory input, not a gate).
 */
const explainRisk = async ({ monthlySalary, existingEmiEstimate, requestedAmount, tenure, employmentType }) => {
  const model = getModel();
  const prompt = `You are a loan risk analyst assistant at an NBFC. You NEVER approve or reject — you only explain risk factors for a human loan officer to consider.

Applicant data:
- Monthly salary: ₹${monthlySalary}
- Estimated existing EMI/debt: ₹${existingEmiEstimate || 0}
- Employment type: ${employmentType}
- Requested loan amount: ₹${requestedAmount}
- Tenure: ${tenure} months

Respond with ONLY a JSON object, no markdown, in this exact shape:
{
  "riskTags": ["short tag", "short tag", ...],
  "explanation": "2-4 sentence plain-language explanation of the risk factors, written for a loan officer, not a customer"
}`;

  const result = await model.generateContent(prompt);
  const parsed = parseJsonResponse(result.response.text());
  return {
    aiRiskTags: Array.isArray(parsed.riskTags) ? parsed.riskTags : [],
    aiRiskExplanation: parsed.explanation || ''
  };
};

/**
 * AI Action 3: Loan Eligibility Recommendation
 * Business reason: officer enters income/EMI, gets a suggested ceiling
 * with reasoning — still just a recommendation, final call is the
 * officer's (enforced in loanDecisionController, not here).
 */
const recommendEligibility = async ({ monthlySalary, existingEmiEstimate, requestedAmount, employmentType }) => {
  const model = getModel();
  const prompt = `You are a loan eligibility assistant at an NBFC. You provide a RECOMMENDATION only — a human loan officer makes the final decision.

Applicant data:
- Monthly salary: ₹${monthlySalary}
- Estimated existing EMI/debt: ₹${existingEmiEstimate || 0}
- Employment type: ${employmentType}
- Requested amount: ₹${requestedAmount}

Use standard NBFC underwriting practice (e.g. total EMI obligations should generally not exceed ~50% of monthly income) to recommend a maximum eligible loan amount.

Respond with ONLY a JSON object, no markdown, in this exact shape:
{
  "eligibleAmount": number,
  "reasoning": "2-3 sentence explanation of how you arrived at this number"
}`;

  const result = await model.generateContent(prompt);
  const parsed = parseJsonResponse(result.response.text());
  return {
    eligibleAmount: parsed.eligibleAmount || 0,
    reasoning: parsed.reasoning || ''
  };
};

/**
 * AI Action 4: Fraud Indicator
 * Business reason (Phase 0): compares figures across documents (e.g.
 * salary slip vs bank statement) for inconsistencies. AI flags for
 * manual review only — it never blocks or auto-rejects an application.
 */
const checkFraudIndicators = async (documentSummaries) => {
  const model = getModel();
  const summaryText = documentSummaries
    .map((d) => `${d.docType}: ${JSON.stringify(d.aiSummary)}`)
    .join('\n');

  const prompt = `You are a fraud-detection assistant at an NBFC. You flag inconsistencies for human review — you NEVER make a final fraud determination.

Extracted data from this applicant's documents:
${summaryText}

Look for inconsistencies (e.g. salary slip income vs bank statement credits, mismatched names/employers across documents). Respond with ONLY a JSON object, no markdown:
{
  "flagged": true or false,
  "explanation": "1-3 sentence explanation of what was found, or 'No inconsistencies detected.' if none"
}`;

  const result = await model.generateContent(prompt);
  const parsed = parseJsonResponse(result.response.text());
  return {
    flagged: Boolean(parsed.flagged),
    explanation: parsed.explanation || ''
  };
};

/**
 * AI Action 5: Approval/Rejection Letter Generator
 * Business reason: officer clicks Approve/Reject, gets a professional
 * letter instantly instead of typing one. Only called AFTER the human
 * decision is made (see loanDecisionController) — AI drafts wording,
 * never the decision itself.
 */
const generateDecisionLetter = async ({ decision, customerName, approvedAmount, emiAmount, officerRemarks }) => {
  const model = getModel();
  const prompt =
    decision === 'approved'
      ? `Write a short, professional loan approval letter for an NBFC customer named ${customerName}. The approved amount is ₹${approvedAmount} with an EMI of ₹${emiAmount}. Keep it under 120 words, warm but professional, no placeholders like [Company Name] — sign off as "FinAI Loan Team". Respond with ONLY the letter text, no markdown, no preamble.`
      : `Write a short, professional loan rejection letter for an NBFC customer named ${customerName}. The internal reason given by the loan officer was: "${officerRemarks}". Rephrase this professionally and respectfully without being overly specific about internal risk scoring. Keep it under 120 words, sign off as "FinAI Loan Team". Respond with ONLY the letter text, no markdown, no preamble.`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
};

/**
 * AI Action 6: Internal Notes Polish
 * Business reason: officer types rough shorthand notes; AI turns them
 * into professional internal review notes. Purely a writing-assist
 * action — nothing here feeds into any automated decision.
 */
const polishInternalNotes = async (rawNotes) => {
  const model = getModel();
  const prompt = `Rewrite the following rough loan-officer shorthand notes into a professional internal review note, 2-4 sentences, factual tone, no embellishment or invented facts. Respond with ONLY the rewritten note, no markdown, no preamble.

Raw notes: "${rawNotes}"`;

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
};

module.exports = {
  summarizeDocument,
  explainRisk,
  recommendEligibility,
  checkFraudIndicators,
  generateDecisionLetter,
  polishInternalNotes
};