import { delegate, recordProgress, reviewDeliverable, submitDeliverable } from './assignment.mjs'
import { companyContext, roles } from './roles.mjs'

export async function runStage(assignment, { generate, strategy = '', now = () => new Date().toISOString() }) {
  const { brief, evidence, delegation, deliverable, history } = assignment
  const context = { brief, evidence, delegation, history: history.slice(-4).map(({ by, action, note, reasons }) => ({ by, action, note, reasons })) }
  const ask = (role, instruction, input) => generate({
    role,
    companyContext,
    job: roles[role],
    instruction,
    input,
  })

  switch (assignment.status) {
    case 'queued': {
      const plan = await ask('omar',
        'Choose Sarah, Daniel or Ahmed. Return specialist (lowercase role ID), instructions and testable criteria. Flag missing evidence in your instructions.',
        { ...context, strategy })
      return delegate(assignment, { ...plan, at: now() })
    }
    case 'assigned':
    case 'revision_requested': {
      const by = delegation.specialist
      const result = await ask(by,
        'Do the assigned work using the supplied evidence. Return content for a usable internal deliverable, or blocker if missing evidence prevents meaningful work. Cite your evidence and label assumptions.',
        { ...context, deliverable })
      if (result.blocker) {
        return recordProgress(assignment, { by, note: result.blocker, blocked: true, at: now() })
      }
      return submitDeliverable(assignment, { by, content: result.content, at: now() })
    }
    case 'awaiting_quality_review': {
      const review = await ask('emma',
        'Review the exact submitted deliverable against the brief, supplied evidence and criteria. Return verdict (PASS, REVISE or BLOCK) and reasons. A pass only sends the deliverable to the owner.',
        { brief, evidence, delegation, deliverable })
      return reviewDeliverable(assignment, { ...review, version: deliverable.version, at: now() })
    }
    default:
      throw new Error('This assignment is waiting for a progress update or an owner decision.')
  }
}
