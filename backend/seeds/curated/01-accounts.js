// Test teacher and student (seeds/local-test-accounts.json). Idempotent: existing users are left as they are
// (password included) unless --reset-passwords is passed. The password hash comes from the User model hook.
const { loadAccounts } = require('./lib/content');

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function resolvePassword({ host, filePassword }) {
  if (process.env.SEED_TEST_PASSWORD) return process.env.SEED_TEST_PASSWORD;
  if (LOCAL_HOSTS.has(String(host).toLowerCase()) && filePassword) return filePassword;
  throw new Error(`The database host is not local: set SEED_TEST_PASSWORD to choose the test accounts' password (the password in local-test-accounts.json is only used on localhost)`);
}

module.exports = {
  resolvePassword,
  name: 'accounts',
  async run({ models: { User }, sequelize, options, log, state }) {
    const { accounts, filePassword } = loadAccounts();
    let password;
    state.users = {};
    for (const account of accounts) {
      let user = await User.findOne({ where: { email: account.email } });
      if (!user) {
        password = password || resolvePassword({ host: sequelize.config.host, filePassword });
        user = await User.create({ name: account.name || account.email.split('@')[0], email: account.email, password, role: account.role });
        log(`created ${account.role} ${account.email}`);
      } else if (options.resetPasswords) {
        password = password || resolvePassword({ host: sequelize.config.host, filePassword });
        user.password = password;
        await user.save();
        log(`reset password of ${account.email}`);
      } else {
        if (user.role !== account.role) log(`warning: ${account.email} exists as ${user.role}, expected ${account.role}`);
        log(`kept ${account.email}`);
      }
      state.users[account.email] = user;
    }
  }
};
