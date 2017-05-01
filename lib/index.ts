/**
 * ghsed
 * Replace strings across GitHub
 *
 * 2017 Ændrew Rininsland
 */

import * as GitHub from 'github-api';
import axios from 'axios';
import {prompt} from 'inquirer';
import * as chalk from 'chalk';
import * as diff from 'diff';
import {
  readFileSync
} from 'fs';

// Main function call for CLI
export default async ([find, replace, glob]: string[], config: ConfigObject) => {
  const githubTokenFile = readToken();
  const gh = authGitHub(config, githubTokenFile);

  if (!config.org && !config.repos) throw new Error('You need to specify either a list of repos or an org to modify.');

  let query = buildQuery(config, find);

  const results = await gh.search().forCode({
    q: query
  });

  const outcomes = await processResults(gh, results, find, replace);
};

async function processResults(gh: GitHub, results: any, find: string, replace: string) {
  return results.data.reduce(async (queue: any, item: GitHubSearchItem) => {
    try {
      const collection = await queue;
      const {full_name} = item.repository;
      const {path} = item;
      const [repoUser, repoName] = full_name.split('/');
      const repo = gh.getRepo(repoUser, repoName);

      const blob: string = (await repo.getBlob(item.sha)).data;

      console.log(chalk.bold(`Modifying ${full_name} ${path}`));
      const matches = blob.match(new RegExp(`^.*(${find}).*$`, 'gmi'));

      const actions = await queryMatches(matches, find, replace);

      // TO PR:
      // get diff of blob
      // gh.createBranch(oldBranchFromItem, newBranchFromStrat);
      // writeFile()
      // create

      const updated = replaceItems(matches, actions, blob);

      return collection.concat({
        repo: item.repository.full_name,
        path: item.repository.path,
        changes: Object.values(actions).filter(i => i),
      });
    } catch (e) {
      console.error(e);
      return queue;
    }
  }, Promise.resolve([]));
}

function replaceItems(matches: RegExpMatchArray, actions: PRActions, blob: string) {

}

function buildQuery(config: ConfigObject, find: string) {
  return `${[
    ...(config.repos ? config.repos.split(/,\s?/).map(d => `repo:${d}`) : []),
    ...(config.org ? `org:${config.org}` : '')
  ].join(' ')} ${find}`;
}

function readToken() {
  try {
    return readFileSync(`${process.env.HOME}/.githubtoken`, {encoding: 'utf-8'});
  } catch (e) {
    return false;
  }
}

function authGitHub(config: ConfigObject, githubTokenFile: string|boolean) {
  if (process.env.GITHUB_TOKEN || githubTokenFile) {
    return new GitHub({
      token: githubTokenFile,
    });
  } else if (config.token) {
    return new GitHub({
      token: config.token,
    });
  } else if (config.username && config.password) {
    return new GitHub({
      username: config.username,
      password: config.password,
    });
  } else {
    throw new Error('You need to either specify username/password or provide an API token.');
  }
}

async function makePullRequests(gh: GitHub, {repo, item, actions, blob, matches: RegExpMatchArray}: PullRequestSetting) {

  return;
}

async function queryMatches(matches: RegExpMatchArray, find: string, replace: string) {
  return matches.reduce(async (queue, match, idx) => {
    const collection = await queue;
    const matchIdx = match.indexOf(find);
    const theirs = match.slice(0, matchIdx) + chalk.red(find) + match.slice(matchIdx + find.length);
    const ours = match.slice(0, matchIdx) + chalk.green(replace) + match.slice(matchIdx + find.length);

    // Confirm action
    const answer = await prompt({
      type: 'confirm',
      default: false,
      name: String(idx),
      message: `${theirs}\n${ours}\nOpen PR?`,
    });

    return {...collection, ...answer};
  }, Promise.resolve({}));
}

interface ConfigObject extends ConfigObjectBase {
  username: string;
  password: string;
}

interface ConfigObject extends ConfigObjectBase {
  token: string;
}

interface ConfigObjectBase {
  org?: string;
  repos?: string;
}

interface GitHubSearchItem {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: any;
}

interface PRActions {
  [key: string]: boolean;
}

interface PullRequestSetting {
  repo: any;
  blob: string;
  actions: PRActions;
  item: GitHubSearchItem;
  matches: RegExpMatchArray;
}
