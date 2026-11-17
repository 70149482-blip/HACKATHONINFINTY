const bcrypt = require('bcryptjs');
const db = require('./db');

const DEMO_PASSWORD = 'Demo123!';

const ACCOUNTS = [
  { id: 'ADMIN', name: 'Admin', email: 'admin@novaworks.example', role: 'ADMIN', specialization: 'Administrator', skills: ['Company overview', 'Transcript creation'] },
  { id: 'PM01', name: 'Ayesha Khan', email: 'ayesha@novaworks.example', role: 'MANAGER', specialization: 'Web PM', skills: ['Web projects', 'Client coordination'] },
  { id: 'PM02', name: 'Bilal Ahmed', email: 'bilal@novaworks.example', role: 'MANAGER', specialization: 'Mobile PM', skills: ['Mobile projects', 'Delivery planning'] },
  { id: 'PM03', name: 'Hina Malik', email: 'hina@novaworks.example', role: 'MANAGER', specialization: 'AI PM', skills: ['AI projects', 'Requirement review'] },
  { id: 'DEV01', name: 'Ali Raza', email: 'ali@novaworks.example', role: 'AGENT', specialization: 'Full-Stack', skills: ['React', 'Frontend integration'] },
  { id: 'DEV02', name: 'Hamza Shah', email: 'hamza@novaworks.example', role: 'AGENT', specialization: 'Full-Stack', skills: ['Node.js', 'Databases', 'APIs'] },
  { id: 'DEV03', name: 'Sara Noor', email: 'sara@novaworks.example', role: 'AGENT', specialization: 'App Developer', skills: ['Flutter', 'Mobile UI'] },
  { id: 'DEV04', name: 'Usman Tariq', email: 'usman@novaworks.example', role: 'AGENT', specialization: 'App Developer', skills: ['Flutter', 'Integration', 'Testing'] },
  { id: 'DEV05', name: 'Zain Abbas', email: 'zain@novaworks.example', role: 'AGENT', specialization: 'AI Developer', skills: ['LLMs', 'Extraction', 'Prompts'] },
  { id: 'DEV06', name: 'Maryam Asif', email: 'maryam@novaworks.example', role: 'AGENT', specialization: 'AI Developer', skills: ['Retrieval', 'Document processing'] },
];

// Upserts by unique email: re-running never duplicates users.
function seedDemoUsers() {
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const findByEmail = db.prepare('SELECT id FROM users WHERE email = ?');
  const insert = db.prepare(
    `INSERT INTO users (id, name, email, password_hash, role, specialization, skills)
     VALUES (@id, @name, @email, @hash, @role, @specialization, @skills)`
  );
  const update = db.prepare(
    `UPDATE users SET name=@name, password_hash=@hash, role=@role,
       specialization=@specialization, skills=@skills WHERE email=@email`
  );
  const run = db.transaction(() => {
    let created = 0;
    for (const a of ACCOUNTS) {
      const row = { ...a, hash, skills: JSON.stringify(a.skills) };
      if (findByEmail.get(a.email)) update.run(row);
      else { insert.run(row); created++; }
    }
    return created;
  });
  return run();
}

module.exports = { seedDemoUsers, ACCOUNTS, DEMO_PASSWORD };
