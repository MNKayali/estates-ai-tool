import { hasIdentity } from './records.mjs'
const string = { type: 'string' }
const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false
})
const list = (items, maxItems) => ({ type: 'array', items, maxItems })
const choice = (...items) => ({ type: 'string', enum: items })
const schema = {
  intake: object({
    kind: choice('objective', 'answer', 'clarify', 'amend'),
    summary: string,
    target: string,
    projectName: string,
    answersQuestion: string,
    priority: choice('urgent', 'normal', 'later'),
    priorities: list(object({ id: string, priority: choice('urgent', 'normal', 'later') }), 12),
    tasks: list(
      object({
        owner: string,
        title: string,
        deadline: string,
        criteria: string,
        outputs: list(string, 7),
        permission: choice('internal', 'publish', 'send', 'spend'),
        scope: string
      }),
      6
    )
  }),
  produce: object({ items: list(object({ title: string, body: string }), 7) }),
  qa: object({ verdict: choice('PASS', 'REVISE'), reason: string })
}
const rules =
  'You work in Projento, a UK early-stage construction feasibility business. The owner and all identifying details must stay private in material for external use. Use the company voice. Only owner approval authorises a specific publication, send or spend. Phase 1 prepares internal material only. All numerical project calculations come from controlled workbooks through code. Write prose only, never calculate, invent measurements or claim a target is achieved. Use supplied recorded facts, distinguish proposals and unknowns. The other agents are colleagues under Omar. Emma is independent.'
const instructions = {
  intake:
    'You are the GM, responsible for ALL objectives. Handle this message in light of the current portfolio, recent conversation, team skills and workload. For a question answer briefly from saved evidence, with no tasks. For a new objective give it a short projectName and restate the outcome in one line; keep unrelated work active. For a clear replacement of the scope select amend and target its exact existing ID. Resolve conflicting targets using the latest owner instruction and mention the choice. Only clarify if absolutely essential, with one question. Use answersQuestion only for a reply to a matching pending question, otherwise an empty string. Resolve that request with the best available assumptions; never ask twice for the same objective. Assign task groups to available agent IDs, each with a deadline, verifiable done definition and exact output titles. Pick priorities across the whole portfolio; reserve urgent for real trade-offs. Do not assign quality or the final GM summary; the system handles these. Always produce finished materials within this session. For a combined LinkedIn audience and website visit growth objective, the standard package is five distinct ready-to-use LinkedIn posts in a single marketing task and a four-week growth plan in a separate task. Adapt when the owner explicitly requests another package. Mark public material publish, with the exact destination and limits in scope. For sending or spending require explicit recipient or amount and purpose, otherwise propose an internal draft. External actions are never executed here. Respond in British English.',
  produce:
    'Deliver each requested output in order. Return one usable finished item per exact title. A post is publishable copy, a report contains the report itself. A four-week plan gives concrete actions, owner, timing and measurement for each week. Use actual relevant source records where available. Do not ask the owner to do routine coordination. Avoid boilerplate and promises. Use fewer than 100 words per social post, fewer than 500 for a plan. For a GM summary use two sentences reporting actual reviewed results and any decision. Address Emma’s correction when supplied.',
  qa: 'Independently inspect every exact output and its title against the task, objective, company privacy rule and sources. For posts require usable company copy; for plans require actionable deliverables. For a GM summary require explicit distinction between delivered work and business results. Reject personal names identifying the owner, fabricated metrics, unsupported attribution, imaginary external actions, or missing requested content. Return PASS or REVISE and a concise reason.'
}
function compactPortfolio(c) {
  return c.objectives
    .filter((o) => o.status !== 'superseded')
    .slice(-45)
    .map((o) => ({
      id: o.id,
      objective: o.title.slice(0, 300),
      priority: o.priority,
      status: o.status,
      outputs: c.outputs
        .filter((x) => x.objective === o.id)
        .slice(-8)
        .map((x) => ({ title: x.title, status: x.status }))
    }))
}
export async function agentStep(c, j, reply, sources) {
  const role = j.stage === 'qa' ? 'emma' : j.agent
  const agent = c.agents[role]
  const goal = c.objectives.find((o) => o.id === j.objective)
  let input
  if (j.stage === 'intake') {
    input = {
      message: j.text,
      portfolio: compactPortfolio(c),
      context: c.context,
      team: Object.entries(c.agents).map(([id, a]) => ({
        id,
        role: a.role,
        instructions: a.instructions.slice(0, 500),
        work: c.jobs
          .filter((t) => t.agent === id && !['done', 'cancelled'].includes(t.stage))
          .map((t) => t.title)
          .slice(0, 4)
      })),
      conversation: c.messages
        .slice(0, c.messages.findIndex((m) => m.id === j.conversationEnd) + 1)
        .filter((m) => m.type !== 'daily')
        .slice(-5)
        .map((m) => ({ from: m.from, text: m.text.slice(0, 1200) })),
      reviewedWork: c.outputs
        .slice(-10)
        .map((o) => ({ title: o.title, objective: o.objective, status: o.status, body: o.body.slice(0, 650) })),
      pendingQuestions: c.questions || []
    }
  } else {
    input = {
      objective: goal?.brief || goal?.title || j.title,
      brief: j.title,
      deadline: j.deadline,
      criteria: j.criteria,
      titles: j.titles,
      reviewedResults: j.summary
        ? c.outputs
            .filter((o) => o.objective === j.objective)
            .slice(-24)
            .map((o) => ({ title: o.title, excerpt: o.body.slice(0, 320) }))
        : undefined,
      drafts: j.stage === 'qa' ? j.drafts : undefined,
      feedback: j.feedback,
      context: c.context,
      sources: j.stage === 'qa' ? j.sources : sources
    }
  }
  const output = await reply(role, {
    job: { name: agent.name, role: agent.role, instructions: agent.instructions },
    companyContext: rules,
    instruction: instructions[j.stage],
    input: { ...input, retryGuidance: j.retryFeedback },
    responseSchema: schema[j.stage]
  })
  if (j.stage === 'qa' && j.drafts.some((d) => hasIdentity(d.title + ' ' + d.body)))
    return { verdict: 'REVISE', reason: 'Remove identifying details from the material.' }
  return output
}
