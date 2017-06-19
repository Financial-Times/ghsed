/**
 * @file
 * Functions for searching repos
 */

import sed = require('parse-sed');
import GitHub = require('github-api');
import {ConfigObject} from './auth';

/**
 * Get whether a user is a user or org
 * @param  {string} userString Name of the user or org
 * @param  {GitHub} gh         GitHub instance (to search private repos)
 * @return {string}            User type
 */
async function getUserType(userString: string, gh?: GitHub) {
  try {
    return (await gh.getUser(userString).getProfile()).data.type;
  } catch (e) {
    console.error(e);
  }
}

export function buildQueries(targets: GHTarget, sedExpressions: sed.Expression[]) {
  const {owner, repo, file} = targets;
  const commands = sedExpressions.map(expr => expr.commands);

  return commands.map(command => [
    ...(repo && repo !== '*' ? repo.split(/,\s?/).map(d => `repo:${d}`) : []),
    `user:${owner}`,
    ...command.map(c => c.string1),
  ].filter(i => i).join(' '));
}

/**
 * Parse sed language instructions into component parts
 * @param  {string} instruction Sed instruction
 * @return {SedInstruction}     Parsed sed instruction objects
 */
export function parseSedInstructions(instructions: string[]) {
  try {
    return instructions.map(sed);
  } catch (e) {
    if (e.message === 'Cannot read property \'slice\' of null') {
      throw new Error('One or more of your sed expressions are invalid. Did you forget a slash?');
    }
  }

}

/**
 * Parse GitHub username/org, repo and filename into object
 * @param  {string} targetString A GitHub fileglob in format "owner/repo/file"
 * @return {TargetObject}        A parsed target object
 */
export function parseTargets(targetString: string): GHTarget {
  const [owner, repo, file = '*'] = targetString.split('/');

  if ((owner && !repo) || owner === '*') {
    throw new TypeError('An organization or GitHub username must be specified!');
  }

  return {
    owner,
    repo,
    file
  };
}

// async function searchForRepos(owner: string, repoSearch: string, gh: GitHub) {
//   return (await gh.getUser(owner).listRepos()).data
//     .map((repo: any) => repo.name)
//     .filter((name: string) => );
// }

export interface GHTarget {
  owner: string;
  repo: string;
  file: string;
}

export interface GithubTextMatches {
  object_url: string;
  object_type: string;
  property: string;
  fragment: string;
  matches: Array<{
    text: string;
    indices: Array<number>;
  }>;
  replace?: boolean;
}

export interface GitHubSearchItem {
  name: string;
  path: string;
  sha: string;
  url: string;
  git_url: string;
  html_url: string;
  repository: any;
  text_matches: Array<GithubTextMatches>;
  text_replaces?: Array<GithubTextMatches>;
}

export interface RepoGroup {
  [key: string]: Array<GitHubSearchItem>;
}
