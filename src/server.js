require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('./db');
const { seedDemoUsers } = require('./seed');
const { extractDraft, AiError } = require('./ai');
const { validateDraft } = require('./validate');

const SECRET = process.env.SESSION_SECRET || 'dev-only-secret-change-me';
if (!process.env.SESSION_SECRET) console.warn('WARNING: SESSION_SECRET is not set. Using an insecure development default.');

seedDemoUsers(); // idempotent: guarantees the ten demo users exist

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---------- auth ----------
function auth(req, res, next) {
  const token = req.cookies.session;
  if (!token) return res.status(401).json({ error: 'Please log in.' });
  try {
    const payload = jwt.verify(token, SECRET);
    // The role always comes from the database, never from the request.
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    if (!user) throw new Error('no user');
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}
const requireRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: 'You do not have permission to do this.' });

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, specialization: u.specialization, skills: JSON.parse(u.skills) });

app.post('/api/login', (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Invalid email or password.' });
  const token = jwt.sign({ uid: user.id }, SECRET, { expiresIn: '8h' });
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: 8 * 60 * 60 * 1000,
  });
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

// ---------- data access (role rules enforced here, not only in the UI) ----------
const PROJECT_COLS = `p.id, p.name, p.client_name AS clientName, p.description, p.manager_id AS managerId,
  m.name AS managerName, p.deadline`;

function listTasks(user, projectId) {
  let sql = `SELECT t.id, t.project_id AS projectId, t.title, t.description, t.assignee_id AS assigneeId,
      a.name AS assigneeName, t.deadline, t.estimated_hours AS estimatedHours
    FROM tasks t JOIN users a ON a.id = t.assignee_id WHERE t.project_id = ?`;
  const args = [projectId];
  if (user.role === 'AGENT') { sql += ' AND t.assignee_id = ?'; args.push(user.id); }
  sql += ' ORDER BY t.deadline, t.title';
  return db.prepare(sql).all(...args);
}

function listProjects(user) {
  let sql = `SELECT ${PROJECT_COLS} FROM projects p JOIN users m ON m.id = p.manager_id`;
  const args = [];
  if (user.role === 'MANAGER') { sql += ' WHERE p.manager_id = ?'; args.push(user.id); }
  else if (user.role === 'AGENT') { sql += ' WHERE p.id IN (SELECT project_id FROM tasks WHERE assignee_id = ?)'; args.push(user.id); }
  sql += ' ORDER BY p.deadline, p.name';
  return db.prepare(sql).all(...args);
}

function getProjectById(user, id) {
  const project = listProjects(user).find((p) => p.id === id);
  if (!project) return null;
  return { ...project, tasks: listTasks(user, id) };
}

app.get('/api/projects', auth, (req, res) => {
  const projects = listProjects(req.user).map((p) => {
    const tasks = listTasks(req.user, p.id);
    return { ...p, taskCount: tasks.length, totalHours: tasks.reduce((s, t) => s + t.estimatedHours, 0) };
  });
  res.json({ projects });
});

app.get('/api/projects/:id', auth, (req, res) => {
  const project = getProjectById(req.user, req.params.id);
  // 404 (not 403) so other people's project ids are not even confirmed to exist.
  if (!project) return res.status(404).json({ error: 'Project not found.' });
  res.json({ project });
});

app.get('/api/my-tasks', auth, requireRole('AGENT'), (req, res) => {
  const tasks = db.prepare(`SELECT t.id, t.project_id AS projectId, p.name AS projectName, p.client_name AS clientName,
      m.name AS managerName, t.title, t.description, t.deadline, t.estimated_hours AS estimatedHours
    FROM tasks t JOIN projects p ON p.id = t.project_id JOIN users m ON m.id = p.manager_id
    WHERE t.assignee_id = ? ORDER BY t.deadline, t.title`).all(req.user.id);
  res.json({ tasks });
});

app.get('/api/team', auth, (req, res) => {
  const team = db.prepare('SELECT id, name, role, specialization, skills FROM users ORDER BY CASE role WHEN \'ADMIN\' THEN 0 WHEN \'MANAGER\' THEN 1 ELSE 2 END, name').all()
    .map((u) => ({ ...u, skills: JSON.parse(u.skills) }));
  res.json({ team });
});

// ---------- transcript automation (admin only) ----------
const inFlight = new Set();

const saveProjects = db.transaction((clean) => {
  const insP = db.prepare('INSERT INTO projects (id, name, client_name, description, manager_id, deadline) VALUES (?,?,?,?,?,?)');
  const insT = db.prepare('INSERT INTO tasks (id, project_id, title, description, assignee_id, deadline, estimated_hours) VALUES (?,?,?,?,?,?,?)');
  return clean.projects.map((p) => {
    const pid = crypto.randomUUID();
    insP.run(pid, p.name, p.clientName, p.description, p.managerId, p.deadline);
    p.tasks.forEach((t) => insT.run(crypto.randomUUID(), pid, t.title, t.description, t.assigneeId, t.deadline, t.estimatedHours));
    return { id: pid, name: p.name, clientName: p.clientName, managerId: p.managerId, deadline: p.deadline, taskCount: p.tasks.length };
  });
});

function allUsers() {
  return db.prepare('SELECT id, name, role, specialization, skills FROM users').all()
    .map((u) => ({ ...u, skills: JSON.parse(u.skills) }));
}

function validateAndSave(draft, res) {
  const { issues, clean } = validateDraft(draft, allUsers());
  if (issues.length)
    return res.status(422).json({ error: 'Some required details are missing or invalid. Nothing was saved. Fix them below and try again.', issues, draft });
  try {
    const created = saveProjects(clean); // all-or-nothing transaction
    return res.status(201).json({ created, totalTasks: created.reduce((s, p) => s + p.taskCount, 0) });
  } catch (e) {
    return res.status(500).json({ error: 'Saving failed and nothing was saved. Please try again.' });
  }
}

app.post('/api/transcripts/create', auth, requireRole('ADMIN'), async (req, res) => {
  const transcript = String((req.body && req.body.transcript) || '').trim();
  if (!transcript) return res.status(400).json({ error: 'The transcript is empty. Paste the meeting text first.' });
  if (inFlight.has(req.user.id)) return res.status(409).json({ error: 'A transcript is already being processed. Please wait.' });
  inFlight.add(req.user.id);
  try {
    let draft;
    try {
      draft = await extractDraft(transcript, allUsers()); // no emails or passwords are sent
    } catch (e) {
      const msg = e instanceof AiError ? e.message : 'The AI step failed unexpectedly.';
      return res.status(502).json({ error: `${msg} Nothing was saved.` });
    }
    return validateAndSave(draft, res);
  } finally {
    inFlight.delete(req.user.id);
  }
});

// Used after the admin corrects an invalid draft: re-validates, then saves everything or nothing.
app.post('/api/transcripts/commit', auth, requireRole('ADMIN'), (req, res) => {
  validateAndSave(req.body && req.body.draft, res);
});

app.get('/api/sample-transcript', auth, requireRole('ADMIN'), (req, res) => {
  const file = path.join(__dirname, '..', 'transcripts', 'meeting_transcript.txt');
  res.type('text/plain').send(fs.readFileSync(file, 'utf8'));
});

// Deletes generated projects and tasks only. Seeded users stay.
app.post('/api/admin/reset', auth, requireRole('ADMIN'), (req, res) => {
  const run = db.transaction(() => ({ tasks: db.prepare('DELETE FROM tasks').run().changes, projects: db.prepare('DELETE FROM projects').run().changes }));
  res.json(run());
});

// ---------- frontend ----------
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`NovaWorks CRM running at http://localhost:${port}`));
}

module.exports = app;
