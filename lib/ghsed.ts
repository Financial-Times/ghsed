/**
 * ghsed
 * Replace strings across GitHub
 *
 * 2017 Ændrew Rininsland
 */

import GitHub = require('github-api');
import sed = require('parse-sed');
import axios from 'axios';
import {prompt} from 'inquirer';
import * as chalk from 'chalk';
import * as diff from 'diff';
import * as _ from 'lodash';

import {authGitHub, readToken, ConfigObject} from './auth';

/**
 * Main function call
 * @param  {array}       input    Values from CLI
 * @property  {string}    find     Value to search for
 * @property  {string}    replace  Value to replace `search` with
 * @param  {ConfigObject} config  Configuration object via CLI flags
 * @return {Promise<PRResults>}   Results of workflow
 */
export default async (input: string[], config: ConfigObject) => {
  const target = input.length === 2 ? input[1] : input[0];
  const instructions = input.length === 2 ? input[0] : input[1];

  const githubTokenFile = readToken(); // Get token if possible
  const gh = authGitHub(config, githubTokenFile); // Auth with either config or token

  // Throw if unable to authenticate
  if (!config.org && !config.repos) throw new Error('You need to specify either a list of repos or an org to modify.');

  // Create search query from CLI args
  let query = buildQuery(config, find);

  try { // @TODO make this try block less disgustingly huge
    // Create search for code, returning text-match results
    // @TODO Don't do this! Apparently only ~two fragments per file are returned!
    const results = await gh.search({AcceptHeader: 'v3.text-match+json'})
      .forCode({
        q: query
      });

    // Query user about whether to find/replace and PR file
    const outcomes = await processResults(results.data.items, find, replace);

    // Create a hash of file matches keyed by repo long name
    const groupedByRepo: RepoGroup = outcomes.reduce((collection: RepoGroup, item: GitHubSearchItem) => {
      if (!collection.hasOwnProperty(item.repository.full_name)) {
        collection[item.repository.full_name] = [];
      }
      collection[item.repository.full_name].push(item);
      return collection;
    }, {});

    // Get user's login name to verify he/she is a contributor later on
    const username = (await gh.getUser()).login;

    // For each repo, make replacements and PR
    Object.entries(groupedByRepo).reduce(async (queue, [repoName, replacements]) => {
      const [repoShortName, repoOwner] = repoName.split('/', 2);
      const repo = gh.getRepo(repoOwner, repoShortName);

      try {
        const collection = await queue;
        const details = await repo.getDetails();

        // Ensure user has write access
        // @TODO verify isCollaborator only is true if user has write access
        if (await repo.isCollaborator(username)) {
          // Create new branch on current repo from the default branch
          // N.b., GitHub code search only works on the default branch
          const newBranch = `ghsed-${Date.now()}`;
          repo.createBranch(details.data.default_branch, newBranch);

          // Replace all the blobs!
          const replacedBlobs = await replaceBlobs(repo, replacements, find, replace);

          // Create a new commit for each file update
          await replacedBlobs.reduce(async (queue, blobItem) => {
            try {
              const collection = await queue;
              await updateBranch(blobItem, newBranch, repo);
              return collection;
            } catch (e) {
              console.error(e);
              return queue;
            }
          }, Promise.resolve([]));

          // Once all the changes are committed, PR the default branch.
          // @TODO Make title and body templatable
          await repo.createPullRequest({
            title: `Mass find and replace via ghsed`,
            body: `Replaces all instances of \`${find}\` with \`${replace}\``,
            head: newBranch,
            base: details.data.default_branch,
          });
        } else {
          // @TODO Ask user if he/she wants to fork repo; use that repo instead
        }

        // Finally, return the collection regardless of outcome to continue queue.
        return collection;
      } catch (e) {
        console.error(e);
        return queue;
      }
    }, Promise.resolve([]));
  } catch (e) {
    console.error(e);
  }
  // const repo = gh.getRepo(repoUser, repoName);
  // const blob: string = (await repo.getBlob(item.sha)).data;
  // const matches = blob.match(new RegExp(`^.*(${find}).*$`, 'gmi'));
};

/**
 * Ask user if he/she wants to PR replacement on a particular file
 * @param  {Array<GitHubSearchItem>}   results Results array from gh.search
 * @param  {string} find    Find string
 * @param  {string} replace Replace string
 * @return {Array<GitHubSearchItem>}         Updated GitHub search items
 */
async function processResults(results: Array<GitHubSearchItem>, find: string, replace: string) {
  return results.reduce(async (queue: any, item) => {
    try {
      const collection = await queue;
      const {full_name} = item.repository;
      const {path} = item;
      const [repoUser, repoName] = full_name.split('/');

      console.log(chalk.bold(`Modifying ${full_name} ${path}`));

      // @TODO make this idempotent by filtering out rejected entries
      // @TODO also create own matches array via RegExp
      item.text_replaces = await item.text_matches.reduce(async (queue, matches) => {
        try {
          const collection = await queue;
          return collection.concat(await queryMatches(matches, find, replace));
        } catch (e) {
          console.error(e);
          return queue;
        }
      }, Promise.resolve([]));

      return collection.concat(item);
    } catch (e) {
      console.error(e);
      return queue;
    }
  }, Promise.resolve([]));
}

/**
 * Display changed lines to user and ask for confirmation of changed
 * @param  {GithubTextMatches} match   Array of matches to consider
 * @param  {string}            find    Find string
 * @param  {string}            replace Replacement string
 * @return {GithubTextMatches}         Match object with new `replace` property
 */
async function queryMatches(match: GithubTextMatches, find: string, replace: string) {
  // @TODO display more than first 2 fragments!
  const theirs = match.fragment;
  const theirsHighlighted = match.fragment.replace(new RegExp(`(${find})`, 'ig'), chalk.red('$1'));
  const ours = match.fragment.replace(new RegExp(`(${find})`, 'ig'), replace);
  const oursHighlighted = match.fragment.replace(new RegExp(`(${find})`, 'ig'), chalk.green(replace));

  // Confirm action
  const response = await prompt({
    type: 'confirm',
    default: false,
    name: 'replace',
    message: `${theirsHighlighted}\n${oursHighlighted}\nReplace strings and open PR?`,
  });

  // @TODO ughh this is so not idempotent.
  match.replace = response.replace;

  return match;
}

/**
 * Replace all relevant strings in each repo
 * @param  {GitHub.Repository}       repo         github-api repo
 * @param  {Array<GitHubSearchItem>} replacements Array of replacement items
 * @param  {string}                  find         Find string
 * @param  {string}                  replace      Replacement string
 * @return {Array}                                Array of updated file blobs
 */
async function replaceBlobs(repo: GitHub.Repository, replacements: Array<GitHubSearchItem>, find: string, replace: string) {
  const filenames = _.uniqBy(replacements, d => d.repository.path).map(d => d.repository.path);
  const blobs = await Promise.all(filenames.map(filename => repo.getSha(undefined, filename)));
  return blobs.map((file: any) => {
    file.replaced = file.content.replace(new RegExp(find, 'ig'), replace);
    return file;
  });
}

/**
 * Commit blob to branch
 * @param  {object}               blobItem   Updated file
 * @param  {string}               branchName New branch to commit to
 * @param  {GitHub.Repository}    repo       github-api repo class
 * @return {object}                          API responses
 */
async function updateBranch(blobItem: any, branchName: string, repo: GitHub.Repository) {
  const {path, replaced} = blobItem;
  const message = `ghsed find/replace`; // TODO make commit message less dumb.
  return await repo.writeFile(branchName, path, replaced, message);
}

/**
 * Build a query from CLI arguments
 * @param  {ConfigObject} config Config object from CLI flags
 * @param  {string}       find   Search query string
 * @return {string}              Complete search query
 */
function buildQuery(config: ConfigObject, find: string) {
  return [
    ...(config.repos ? config.repos.split(/,\s?/).map(d => `repo:${d}`) : []),
    (config.org ? `org:${config.org}` : undefined),
    find,
  ].filter(i => i).join(' ');
}

export function splitMultipleSedInstructions(instructionSet: string) {
  return instructionSet; // TODO write way to split instructions
}

/**
 * Parse sed language instructions into component parts
 * The regex used only suffices for single-instruction sed commands!
 * @TODO Port sed.js so it can be used to parse the sed instruction set.
 *
 * @param  {string} instruction Sed instruction
 * @return {SedInstruction}     Parsed sed instruction object
 */
export function parseSedInstructions(instructions: string[]) {
  return instructions.map(instruction => {
    const [op, find, replace] = instruction.split(/^([^\/]+)\/(.*)\/(.*)\/\w*$/).slice(1, -1);
    return {
      op,
      find,
      replace,
    };
  });
}

/**
 * Parse GitHub username/org, repo and filename into object
 * @param  {string} targetString A GitHub fileglob in format "owner/repo/file"
 * @return {TargetObject}        A parsed target object
 */
export function parseTargets(targetString: string) {
  const [owner, repo, file = '*'] = targetString.split('/');

  if ((!owner && repo) || owner === '*') {
    throw new TypeError('An organization or GitHub username must be specified!');
  }

  return {
    owner,
    repo,
    file
  };
}

interface GitHubSearchItem {
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

interface GithubTextMatches {
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

interface RepoGroup {
  [key: string]: Array<GitHubSearchItem>;
}
