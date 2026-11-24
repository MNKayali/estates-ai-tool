import { delegate, recordProgress, reviewDeliverable, submitDeliverable } from './assignment.mjs'
import { companyContext, roles } from './roles.mjs'

export async function runStage(assignment, { generate, strategy = '', officeWork = [], knowledge, now = () => new Date().toISOString() }) {
  const { brief, evidence, delegation, deliverable, history } = assignment
  const context = { brief, evidence, delegation, history: history.slice(-4).map(({ by, action, note, reasons }) => ({ by, action, note: note?.slice(0, 650), reasons: reasons?.slice(0, 650) })) }
  const ask = (role, instruction, input) => generate({
    role,
    companyContext,
    job: roles[role],
    instruction,
    input: { ...input, strategy, officeWork, knowledge },
  })

  switch (assignment.status) {
    case 'queued': {
      const plan = await ask('omar',
        'Choose Sarah, Daniel or Ahmed. Return specialist (lowercase role ID), instructions and testable criteria. Set out planSteps in order, from the first action to a deliverable ready for review. Return goal naming the strategic outcome. Tie the plan to the company strategy and explain how the lead will know it is complete. If another discipline is needed, return consultations with a different specialist role and a specific, non-overlapping question for each. The lead integrates their replies. Make a practical proposal from available evidence.',
        { ...context, strategy })
      return delegate(assignment, { ...plan, at: now() })
    }
    case 'in_progress':
    case 'assigned':
    case 'revision_requested': {
      const by = delegation.specialist
      const contributions = assignment.contributions ?? []
      const needed = delegation.consultations?.find(request => !contributions.some(item => item.role === request.role))
      if (needed) {
        const output = await ask(needed.role, 'Answer the lead’s specific consultation question within your remit. Provide useful input and any assumptions. Return content. The lead owns the final draft.', {
          ...context, lead: by, question: needed.question, contributions,
        })
        if (typeof output.content !== 'string' || !output.content.trim() || output.content.length > 4000) throw new Error('Invalid contribution.')
        const item = { ...needed, content: output.content.trim() }
        return { ...assignment, contributions: [...contributions, item], history: [...history, { by: needed.role, action: 'advised_lead', note: item.content, at: now() }] }
      }
      const result = await ask(by,
        'Do the assigned work using the supplied evidence. Return content for a usable internal deliverable, or blocker if missing evidence prevents meaningful work. Integrate the recorded contributions and address the most recent feedback. Cite your evidence and label assumptions.',
        { ...context, deliverable, contributions, feedback: assignment.review?.reasons })
      if (result.blocker) {
        return recordProgress(assignment, { by, note: result.blocker, blocked: true, at: now() })
      }
      return submitDeliverable(assignment, { by, content: result.content, at: now() })
    }
    case 'awaiting_quality_review': {
      const review = await ask('emma',
        'Review the exact submitted deliverable against the brief, supplied evidence and criteria. Return verdict (PASS, REVISE or BLOCK) and reasons. A pass sends the exact draft to Omar for his recommendation before owner approval.',
        { brief, evidence, delegation, deliverable, contributions: assignment.contributions ?? [] })
      const reviewed = reviewDeliverable(assignment, { ...review, version: deliverable.version, at: now() })
      return review.verdict === 'PASS' ? { ...reviewed, status: 'with_gm' } : reviewed
    }
    case 'with_gm': {
      const result = await ask('omar', 'Give Nabil your management recommendation in two plain sentences. Use the reviewed draft and Emma’s findings. State the exact decision needed. Preserve the reviewed draft.', {
        brief, deliverable, review: assignment.review, contributions: assignment.contributions ?? [],
      })
      if (typeof result.content !== 'string' || !result.content.trim() || result.content.length > 4000) throw new Error('Invalid GM recommendation.')
      return { ...assignment, status: 'awaiting_owner_review', recommendation: result.content.trim(),
        history: [...history, { by: 'omar', action: 'recommended', note: result.content.trim(), version: deliverable.version, at: now() }] }
    }
    default:
      throw new Error('This assignment is waiting for a progress update or an owner decision.')
  }
}
