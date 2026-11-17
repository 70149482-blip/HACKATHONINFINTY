// Validates an AI draft against the real user directory.
// Returns { issues, clean }. If issues is non-empty, NOTHING may be saved.

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

function validateDraft(draft, users) {
  const issues = [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const add = (path, message) => issues.push({ path, message });

  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.projects)) {
    add('projects', 'The AI result has no "projects" list.');
    return { issues, clean: null };
  }
  if (draft.projects.length === 0) {
    add('projects', 'No projects were found in the transcript.');
    return { issues, clean: null };
  }

  const clean = { projects: [] };
  draft.projects.forEach((p, i) => {
    const pp = `projects[${i}]`;
    p = p && typeof p === 'object' ? p : {};
    const project = {
      name: str(p.name),
      clientName: str(p.clientName),
      description: str(p.description),
      managerId: str(p.managerId),
      deadline: str(p.deadline),
      tasks: [],
    };
    if (!project.name) add(`${pp}.name`, 'Project name is missing.');
    if (!project.clientName) add(`${pp}.clientName`, 'Client name is missing.');
    if (!project.managerId) add(`${pp}.managerId`, 'Project manager is missing.');
    else if (!byId.has(project.managerId) || byId.get(project.managerId).role !== 'MANAGER')
      add(`${pp}.managerId`, `"${project.managerId}" is not an existing manager.`);
    if (!project.deadline) add(`${pp}.deadline`, 'Project deadline is missing.');
    else if (!isValidDate(project.deadline)) add(`${pp}.deadline`, `"${project.deadline}" is not a valid date (use YYYY-MM-DD).`);

    if (!Array.isArray(p.tasks) || p.tasks.length === 0)
      add(`${pp}.tasks`, 'This project has no tasks.');
    (Array.isArray(p.tasks) ? p.tasks : []).forEach((t, j) => {
      const tp = `${pp}.tasks[${j}]`;
      t = t && typeof t === 'object' ? t : {};
      const hours = typeof t.estimatedHours === 'string' ? Number(t.estimatedHours) : t.estimatedHours;
      const task = {
        title: str(t.title),
        description: str(t.description),
        assigneeId: str(t.assigneeId),
        deadline: str(t.deadline),
        estimatedHours: hours,
      };
      if (!task.title) add(`${tp}.title`, 'Task title is missing.');
      if (!task.assigneeId) add(`${tp}.assigneeId`, 'Task owner is missing.');
      else if (!byId.has(task.assigneeId) || byId.get(task.assigneeId).role !== 'AGENT')
        add(`${tp}.assigneeId`, `"${task.assigneeId}" is not an existing agent.`);
      if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0)
        add(`${tp}.estimatedHours`, 'Estimated hours must be a positive number.');
      if (!task.deadline) add(`${tp}.deadline`, 'Task deadline is missing.');
      else if (!isValidDate(task.deadline)) add(`${tp}.deadline`, `"${task.deadline}" is not a valid date (use YYYY-MM-DD).`);
      else if (isValidDate(project.deadline) && task.deadline > project.deadline)
        add(`${tp}.deadline`, `Task deadline ${task.deadline} is after the project deadline ${project.deadline}.`);
      project.tasks.push(task);
    });
    clean.projects.push(project);
  });

  return { issues, clean: issues.length ? null : clean };
}

module.exports = { validateDraft, isValidDate };
