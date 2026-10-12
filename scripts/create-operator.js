// Creates a Data Sentinels platform operator account.
//   npm run operator -- someone@data-sentinels.com
// The password is read from the terminal and never stored in shell history.

require('dotenv').config({ quiet: true });
const readline = require('readline');
const auth = require('../lib/auth');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (text) => {
    if (text.startsWith(question)) rl.output.write(text);
  };
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    process.stdout.write('\n');
    resolve(answer);
  }));
}

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Give the operator email: npm run operator -- name@example.com');
  if (await auth.findByEmail(email)) throw new Error(`${email} already has an account.`);
  const password = await ask('Password (12 characters or more): ');
  if (password.length < 12) throw new Error('Use a password of at least 12 characters.');
  if ((await ask('Repeat the password: ')) !== password) throw new Error('The two passwords do not match.');
  const secret = auth.hashPassword(password);
  await auth.addAccount({ email, operator: true, salt: secret.salt, hash: secret.hash });
  console.log(`${email} can sign in at /operator.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
