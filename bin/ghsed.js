#!/usr/bin/env node
'use strict';

require('ts-node/register');

const chalk = require('chalk');
const meow = require('meow');
const ghsed = require('../lib/index').default;

const cli = meow(`
  ${chalk.bold('ghsed makes it easy to change strings across multiple repos')}
  - Supply a sed-style substitution and it will open pull requests replacing the relevant strings
  - You need to either include username and password, or an appropriate access token
  - If you specify the --org flag but not --repos, it will search *every repo in the org*

  Usage
    $ ghsed <credentials> <flags> <search> <replace> <glob>

  Options
    ${chalk.underline.bold('Credentials')}
    --username, -u  GitHub username
    --password, -p  GitHub password
    --token,    -t  GitHub token

    ${chalk.underline.bold('Flags')}
    --org,      -o  GitHub org
    --repos     -r  GitHub repos (comma-separated)

`, {
  alias: {
    u: 'username',
    p: 'password',
    t: 'token',
    o: 'org',
    r: 'repos'
  }
});

ghsed(cli.input, cli.flags);
