const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Model name is env-configurable on purpose — Gemini model names/versions
 * change over time (e.g. gemini-1.5-flash, gemini-2.0-flash, etc.).
 * If Google renames/deprecates a model, this is a one-line .env change,
 * not a code change. Check https://ai.google.dev/gemini-api/docs/models
 * for the current recommended model name if this stops working.
 */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const getModel = () => {
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  return genAI.getGenerativeModel({ model: modelName });
};

module.exports = { getModel };