// Deletes generated projects and tasks only. Seeded users are kept.
const db = require('../src/db');
const tasks = db.prepare('DELETE FROM tasks').run().changes;
const projects = db.prepare('DELETE FROM projects').run().changes;
console.log(`Reset complete: removed ${projects} project(s) and ${tasks} task(s). Users were not touched.`);
