/**
 * @file
 * Replacement functions
 */

import * as _ from 'lodash';
import * as chalk from 'chalk';
import {prompt} from 'inquirer';
import {diffLines as diff} from 'diff';
import { Expression as SedExpression } from 'parse-sed';
import GitHub = require('github-api');
import {
  GHTarget,
} from './search';

export async function processResults(
  results: RepoGroup,
  targets: GHTarget,
  instructions: SedExpression[],
  gh: GitHub,
) {
  const flattenedInstructions = instructions.reduce((col, cur): ProcessedResult[] => {
    return col.concat(cur.commands);
  }, []);

  return Object.entries(results).reduce(async (queue: Promise<any>, [repoFullName, files]) => {
    try {
      const collection = await queue; // Process one repo at a time
      const fileObjects = await Promise.all(files.map(async file => {
        const [repoUser, repoName] = repoFullName.split('/');
        const repo = gh.getRepo(repoUser, repoName);
        const blob = (await repo.getBlob(file.sha)).data;
        const original = typeof blob !== 'string' ? JSON.stringify(blob) : blob;
        const replaced = flattenedInstructions.reduce((last, instruction) => {
          if (instruction.verb === 's') {
            return last.replace(instruction.re, instruction.replacement);
          }

          return last;
        }, original);

        return {
          path: file.path,
          original,
          replaced,
        };
      }));

      return collection.concat({
        repo: repoFullName,
        files: fileObjects,
      });
    } catch (e) {
      console.error(e);
    }


    // try {
    //   const collection = await queue;
    //
    //
    //   console.log(chalk.bold(`Modifying ${full_name} ${path}`));
    //
    //   // @TODO make this idempotent by filtering out rejected entries
    //   // @TODO also create own matches array via RegExp
    //   item.text_replaces = await item.text_matches.reduce(async (queue, matches) => {
    //     try {
    //       const collection = await queue;
    //       return collection.concat(await queryMatches(matches, find, replace));
    //     } catch (e) {
    //       console.error(e);
    //       return queue;
    //     }
    //   }, Promise.resolve([]));
    //
    //   return collection.concat(item);
    // } catch (e) {
    //   console.error(e);
    //   return queue;
    // }
  }, Promise.resolve([]));
}

/**
 * Get user's login name to verify he/she is a contributor later on
 * @param  {GitHub} gh GitHub instance
 * @return {string}    GitHub username
 */
async function getUser(gh: GitHub) {
  return (await gh.getUser()).login;
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

// async function replaceBlobs(repo: GitHub.Repository, replacements: Array<GitHubSearchItem>, find: string, replace: string) {
//   const filenames = _.uniqBy(replacements, d => d.repository.path).map(d => d.repository.path);
//   const blobs = await Promise.all(filenames.map(filename => repo.getSha(undefined, filename)));
//   return blobs.map((file: any) => {
//     file.replaced = file.content.replace(new RegExp(find, 'ig'), replace);
//     return file;
//   });
// }

// async function makeReplacements(groupedByRepo: RepoGroup, gh: GitHub) {
//   // For each repo, make replacements and PR
//   Object.entries(groupedByRepo).reduce(async (queue, [repoName, replacements]) => {
//     const [repoShortName, repoOwner] = repoName.split('/', 2);
//     const repo = gh.getRepo(repoOwner, repoShortName);
//
//     try {
//       const collection = await queue;
//       const details = await repo.getDetails();
//
//       // Ensure user has write access
//       // @TODO verify isCollaborator only is true if user has write access
//       if (await repo.isCollaborator(username)) {
//         // Create new branch on current repo from the default branch
//         // N.b., GitHub code search only works on the default branch
//         const newBranch = `ghsed-${Date.now()}`;
//         repo.createBranch(details.data.default_branch, newBranch);
//
//         // Replace all the blobs!
//         const replacedBlobs = await replaceBlobs(repo, replacements, find, replace);
//
//         // Create a new commit for each file update
//         await replacedBlobs.reduce(async (queue, blobItem) => {
//           try {
//             const collection = await queue;
//             await updateBranch(blobItem, newBranch, repo);
//             return collection;
//           } catch (e) {
//             console.error(e);
//             return queue;
//           }
//         }, Promise.resolve([]));
//
//         // Once all the changes are committed, PR the default branch.
//         // @TODO Make title and body templatable
//         await repo.createPullRequest({
//           title: `Mass find and replace via ghsed`,
//           body: `Replaces all instances of \`${find}\` with \`${replace}\``,
//           head: newBranch,
//           base: details.data.default_branch,
//         });
//       } else {
//         // @TODO Ask user if he/she wants to fork repo; use that repo instead
//       }
//
//       // Finally, return the collection regardless of outcome to continue queue.
//       return collection;
//     } catch (e) {
//       console.error(e);
//       return queue;
//     }
//   }, Promise.resolve([]));
// }


export async function queryMatches(processed: ProcessedResult[]) {
  let branch = 'ghsed';

  return await processed.reduce(async (queue, item) => {
    const collection = await queue;
    console.log(chalk.underline(`Processing: ${item.repo}`));
    const answer = (await prompt({
      type: 'input',
      default: branch,
      name: 'branch',
      message: 'What should the PR branch be called?',
    }));
    branch = answer.branch; // Store result so it's the default next repo

    const replacements = await item.files.reduce(async (queue, file) => {
      const collection = await queue;
      const diffedLines = diff(file.original, file.replaced);
      console.log(chalk.bold(`${file.path}`));
      console.log(diffedLines.map(line => {
        if (line.added) {
          return chalk.green(line.value);
        } else if (line.removed) {
          return chalk.red(line.value);
        } else {
          return chalk.grey(line.value);
        }
      }).join('\n'));

      // Confirm action
      const response = await prompt({
        type: 'confirm',
        default: false,
        name: 'replace',
        message: `Confirm replacements?`,
      });

      return collection.concat(response);
    }, Promise.resolve([]));

    return collection.concat({
      repo: item.repo,
      branch,
      replacements,
    });
  }, Promise.resolve([]));
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

export interface ProcessedResult {
  repo: string;
  files: Array<{
    path: string;
    original: string;
    replaced: string;
  }>;
}
