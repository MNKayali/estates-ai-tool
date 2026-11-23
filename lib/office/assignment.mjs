const specialistRoles = new Set(['sarah', 'daniel', 'ahmed'])

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${label} must contain between 1 and ${maxLength} characters.`)
  }
  return value.trim()
}

function append(assignment, status, event, at, fields = {}) {
  return {
    ...assignment,
    ...fields,
    status,
    history: [...assignment.history, { ...event, at }],
  }
}

export function createAssignment({ id, brief, evidence = '', at }) {
  return append({ id, brief: requiredText(brief, 'Brief', 4000), evidence: evidence === '' ? '' : requiredText(evidence, 'Evidence', 12000), history: [] },
    'queued', { by: 'owner', action: 'submitted' }, at)
}

export function delegate(assignment, { specialist, instructions, criteria, consultations = [], at }) {
  if (assignment.status !== 'queued' || !specialistRoles.has(specialist)) {
    throw new Error('Omar can delegate queued work to Sarah, Daniel or Ahmed.')
  }
  if (!Array.isArray(consultations) || consultations.length > 2) throw new Error('Invalid consultation plan.')
  const used = new Set([specialist])
  const requests = consultations.map(({ role, question }) => {
    if (!specialistRoles.has(role) || used.has(role)) throw new Error('Each contribution needs its own specialist.')
    used.add(role)
    return { role, question: requiredText(question, 'Consultation question', 1000) }
  })
  const delegation = {
    consultations: requests,
    specialist,
    instructions: requiredText(instructions, 'Instructions', 4000),
    criteria: requiredText(criteria, 'Acceptance criteria', 2000),
  }
  return append(assignment, 'assigned', { by: 'omar', action: 'delegated', ...delegation }, at, { delegation })
}

export function recordProgress(assignment, { by, note, blocked = false, at }) {
  if (!['assigned', 'in_progress', 'blocked', 'revision_requested'].includes(assignment.status) || by !== assignment.delegation?.specialist) {
    throw new Error('Only the assigned specialist can update active work.')
  }
  return append(assignment, blocked ? 'blocked' : 'in_progress', { by, action: 'progress', note: requiredText(note, 'Progress update', 2000) }, at)
}

export function submitDeliverable(assignment, { by, content, at }) {
  if (!['assigned', 'in_progress', 'revision_requested'].includes(assignment.status) || by !== assignment.delegation?.specialist) {
    throw new Error('Only the assigned specialist can submit active work.')
  }
  const deliverable = {
    version: (assignment.deliverable?.version ?? 0) + 1,
    content: requiredText(content, 'Deliverable', 10000),
  }
  return append(assignment, 'awaiting_quality_review', { by, action: 'delivered', ...deliverable }, at, { deliverable, review: null })
}

export function reviewDeliverable(assignment, { version, verdict, reasons, at }) {
  if (assignment.status !== 'awaiting_quality_review' || version !== assignment.deliverable?.version) {
    throw new Error('Emma must review the current deliverable version.')
  }
  const statuses = new Map([
    ['PASS', 'awaiting_owner_review'],
    ['REVISE', 'revision_requested'],
    ['BLOCK', 'quality_blocked'],
  ])
  const status = statuses.get(verdict)
  if (!status) throw new Error('Emma must record PASS, REVISE or BLOCK.')
  const review = { version, verdict, reasons: requiredText(reasons, 'Review reasons', 4000) }
  return append(assignment, status, { by: 'emma', action: 'reviewed', ...review }, at, { review })
}

export function recordOwnerDecision(assignment, { accepted, note, at }) {
  if (assignment.status !== 'awaiting_owner_review' || typeof accepted !== 'boolean') {
    throw new Error('An owner decision requires a reviewed deliverable.')
  }
  return append(assignment, accepted ? 'completed' : 'revision_requested', {
    by: 'owner',
    action: accepted ? 'accepted' : 'requested_revision',
    note: requiredText(note, 'Decision note', 2000),
  }, at)
}

export function buildBriefing(assignments, { since, strategy }) {
  return {
    strategy,
    recentlyCompleted: assignments.filter(({ status, history }) =>
      status === 'completed' && Date.parse(history.at(-1).at) >= Date.parse(since)),
    upcoming: assignments.filter(({ status }) => status === 'queued'),
    active: assignments.filter(({ status }) =>
      ['assigned', 'in_progress', 'awaiting_quality_review', 'revision_requested', 'with_gm'].includes(status)),
    blockers: assignments.filter(({ status }) => ['blocked', 'quality_blocked'].includes(status)),
    needsOwnerDecision: assignments.filter(({ status }) => status === 'awaiting_owner_review'),
  }
}

export function supplyEvidence(assignment, evidence, at) {
  if (!['blocked', 'quality_blocked'].includes(assignment.status)) throw new Error('Only an evidence blocker can be reopened.')
  const combined = requiredText([assignment.evidence, evidence].filter(Boolean).join('\n\n'), 'Combined evidence', 12000)
  return append(assignment, 'assigned', { by: 'owner', action: 'supplied_evidence' }, at, { evidence: combined })
}
