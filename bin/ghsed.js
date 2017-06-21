#!/usr/bin/env node
'use strict';

require('ts-node/register');

const chalk = require('chalk');
const meow = require('meow');
const ghsed = require('../lib/ghsed');

const cli = meow(`
  ${chalk.bold('ghsed makes it easy to change strings across multiple repos')}
  - Supply a sed-style substitution and it will open pull requests replacing the relevant strings
  - You must supply username and password, or an appropriate access token; see ${chalk.underline.bold('Credentials')}.

  Usage
    $ ghsed <credentials> <instructions> <target(s)>

  Options
    ${chalk.underline.bold('Credentials')}
    --username, -u           GitHub username
    --password, -p           GitHub password
    --token,    -t           GitHub token
    ${chalk.bold('Note:')} You can also create a file at $HOME/.githubtoken containing a token to use.

    ${chalk.underline.bold('Instructions')}
    --expr,     -e           Sed instruction. Can supply multiple -e flags
    --inplace,  -i [branch]  Edit "in-place": commit directly to branch.
                             Supply [branch] to push to a new branch instead of repo default

    ${chalk.underline.bold('Targets')}
    <user-or-org>/*          Apply changes to all repos for a given user or organisation
    <user-or-org>/<repo>     Apply changes to only <repo>
    <user-or-org>/*/<file>   Apply changes to <file> on all repos for supplied user/org
`, {
  alias: {
    u: 'username',
    p: 'password',
    t: 'token',
    e: 'expr',
    i: 'inplace'
  }
});

ghsed.default(cli.flags, cli.input)
.then(results => {
  process.exit(0);
})
.catch(e => {
  console.error(e);
  process.exit(1);
});
