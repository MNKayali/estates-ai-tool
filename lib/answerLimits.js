/**
 * lib/answerLimits.js — size limits on questionnaire answers (server side).
 *
 * Free-text answers go into the AI prompt and the stored report, so with no
 * limit a caller could send megabytes of text on every report and spend real
 * API credit (security review, October 2026). The questionnaire's inputs carry
 * the same limits (TEXT_INPUT_MAX / TEXTAREA_MAX), so a person using the form
 * never meets the truncation here — it only bites on a scripted request.
 *
 * Pure: no React, no node-only imports (the questionnaire imports the limits).
 */

/** Single-line inputs in the questionnaire (project name, "Other" fields). */
export const TEXT_INPUT_MAX = 200
/** Multi-line inputs (objective, additional context, report instructions). */
export const TEXTAREA_MAX = 2000
/**
 * Whole answers object, as JSON. A full questionnaire with every scope item
 * ticked and quantities entered is well under 20 KB; anything near this is not
 * a person filling in the form.
 */
export const ANSWERS_MAX_CHARS = 100_000

/**
 * A copy of the answers with every top-level string cut to its limit, or
 * `{ problem }` when the answers are not an object or too large overall.
 */
export function limitAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return { problem: 'Missing answers' }
  }
  let size
  try { size = JSON.stringify(answers).length } catch { return { problem: 'Answers could not be read.' } }
  if (size > ANSWERS_MAX_CHARS) return { problem: 'The answers are too large to process.', tooLarge: true }

  const out = {}
  for (const [key, value] of Object.entries(answers)) {
    if (typeof value !== 'string') { out[key] = value; continue }
    const max = key === 'q1_0_projectName' ? TEXT_INPUT_MAX : TEXTAREA_MAX
    out[key] = value.length > max ? value.slice(0, max) : value
  }
  return { answers: out }
}
