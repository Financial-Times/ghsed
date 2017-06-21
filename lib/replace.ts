/**
 * @file
 * Replacement functions
 */

import * as _ from 'lodash';
import * as chalk from 'chalk';
import {prompt} from 'inquirer';
import * as diff from 'diff';
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

  return Object.entries(results).reduce(async (queue, [repoFullName, files]) => {
    try {
      const collection = await queue; // Process one repo at a time
      const fileObjects = await Promise.all(files.map(async file => {
        const [repoUser, repoName] = repoFullName.split('/');
        const repo = gh.getRepo(repoUser, repoName);
        const blob = (await repo.getBlob(file.sha)).data;
        const original = typeof blob !== 'string' ? JSON.stringify(blob) : blob;
        const replaced: string = flattenedInstructions.reduce((last, instruction) => {
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
  }, Promise.resolve<Array<ProcessedResult>>([]));
}

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
      const diffedLines = diff.diffLines(file.original, file.replaced)
        .map((line, i, a) => { // I'm not 100% sure about all this logic
          if (line.removed && a[i + 1].added) {
            const bolded = diff.diffChars(line.value, a[i + 1].value)
              .map(char => char.removed ?
                chalk.bold(char.value) :
                char.added ? undefined : char.value)
              .filter(i => i)
              .join('');
            return chalk.red(bolded);
          } else if (line.added && a[i - 1].removed) {
            const bolded = diff.diffChars(a[i - 1].value, line.value)
              .map(char => char.added ?
                chalk.bold(char.value) :
                char.removed ? undefined : char.value)
              .filter(i => i)
              .join('');
            return chalk.green(bolded);
          } else {
            if (line.added) return chalk.green(line.value);
            else if (line.removed) return chalk.red(line.value);
            else return chalk.grey(line.value);
          }
        });

      console.log(chalk.bold(`${file.path}`));
      console.log(diffedLines.join(''));

      // Confirm action
      const response = await prompt({
        type: 'confirm',
        default: false,
        name: 'replace',
        message: `Confirm replacements?`,
      });

      return collection.concat({
        confirmed: response.replace,
        ...file,
      });
    }, Promise.resolve<Array<ConfirmedProcessedResultItem>>([]));

    return collection.concat({
      repo: item.repo,
      branch,
      replacements,
    });
  }, Promise.resolve<Array<ReplaceAnswers>>([]));
}

export interface ReplaceAnswers {
  repo: string;
  branch: string;
  replacements: ConfirmedProcessedResultItem[];
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
  files: Array<ProcessedResultItem>;
}

export interface ConfirmedProcessedResultItem extends ProcessedResultItem {
  confirmed: boolean;
}

export interface ProcessedResultItem {
  path: string;
  original: string;
  replaced: string;
}
