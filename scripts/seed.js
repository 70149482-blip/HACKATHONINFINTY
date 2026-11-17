const { seedDemoUsers, ACCOUNTS } = require('../src/seed');
const created = seedDemoUsers();
console.log(`Seed complete: ${created} new user(s) created, ${ACCOUNTS.length - created} already existed (updated). Total demo users: ${ACCOUNTS.length}.`);
