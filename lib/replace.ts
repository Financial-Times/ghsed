/**
 * @file
 * Replacement functions
 */

import * as _ from 'lodash';
import * as chalk from 'chalk'; // @TODO remove from here
import {prompt} from 'inquirer';
import GitHub = require('github-api');
import {
  GitHubSearchItem,
  GHTarget,
  GithubTextMatches,
} from './search';

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
 * Ask user if he/she wants to PR replacement on a particular file
 * @param  {Array<GitHubSearchItem>}   results Results array from gh.search
 * @param  {string} find    Find string
 * @param  {string} replace Replace string
 * @return {Array<GitHubSearchItem>}         Updated GitHub search items
 */
export async function processResults(results: Array<GitHubSearchItem>, targets: GHTarget, instrutions: string) {
  return results.reduce(async (queue: any, item) => {
    const find = '', replace = ''; // @TODO FIX
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



async function makeReplacements(groupedByRepo: RepoGroup) {
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
}

// /**
//  * Display changed lines to user and ask for confirmation of changed
//  * @param  {GithubTextMatches} match   Array of matches to consider
//  * @param  {string}            find    Find string
//  * @param  {string}            replace Replacement string
//  * @return {GithubTextMatches}         Match object with new `replace` property
//  */
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
