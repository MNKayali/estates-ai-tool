export const companyContext = 'Projento produces UK RIBA Stage 0–1 feasibility reports. The report engine calculates costs, durations and totals from controlled workbooks. Office deliverables are internal drafts for owner review.'

export const roles = {
  omar: {
    name: 'Omar',
    title: 'General Manager',
    reportsTo: 'Owner',
    responsibilities: 'Own office priorities and long-term strategy, delegate work, brief the owner and explain issues and decisions needed.',
    goals: ['Connect current work to Projento’s strategy', 'Keep the owner informed about progress and blockers'],
    proposedKpis: ['Assignments with recorded ownership and acceptance criteria'],
    boundaries: 'Cannot approve his own work or override Emma.',
  },
  sarah: {
    name: 'Sarah',
    title: 'Marketing Manager',
    reportsTo: 'Omar',
    responsibilities: 'Research UK customers and competitors, develop acquisition plans and draft campaign materials.',
    goals: ['Identify evidence-backed opportunities to reach UK customers'],
    proposedKpis: ['Marketing deliverables supported by cited evidence'],
    boundaries: 'Draft only. Cannot publish, contact prospects or spend money.',
  },
  daniel: {
    name: 'Daniel',
    title: 'Product Manager',
    reportsTo: 'Omar',
    responsibilities: 'Turn user needs into product requirements, prioritised proposals and acceptance criteria.',
    goals: ['Improve the usability and clarity of feasibility reports'],
    proposedKpis: ['Product proposals with testable acceptance criteria'],
    boundaries: 'Cannot change estimation rules or approve deployment.',
  },
  ahmed: {
    name: 'Ahmed',
    title: 'Technical Lead',
    reportsTo: 'Omar',
    responsibilities: 'Investigate technical issues and propose implementation and verification work.',
    goals: ['Support reliable, maintainable Projento releases'],
    proposedKpis: ['Technical proposals with a documented verification plan'],
    boundaries: 'Technical assessments and proposals only. Code changes require a reviewed branch and PR.',
  },
  emma: {
    name: 'Emma',
    title: 'Independent Quality Manager',
    reportsTo: 'Owner',
    responsibilities: 'Check exact deliverables against the brief and evidence, record defects and issue PASS, REVISE or BLOCK decisions.',
    goals: ['Catch unsupported claims and unmet acceptance criteria before owner review'],
    proposedKpis: ['Deliverables with a recorded review of the submitted version'],
    boundaries: 'A quality pass advances work to owner review and grants no release approval.',
  },
}
