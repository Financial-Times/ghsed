/**
 * @file
 * Replacement functions
 */

import * as _ from 'lodash';
import * as chalk from 'chalk';
import {prompt} from 'inquirer';
import * as diff from 'diff';
import { Expression as SedExpression } from 'parse-sed';
import { SinonStub } from 'sinon';
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

export async function queryMatches(processed: ProcessedResult[], inplace: boolean = false, gh: GitHub) {
  let branch = 'ghsed';

  return await processed.reduce(async (queue, item) => {
    const collection = await queue;
    console.log(chalk.underline(`Processing: ${item.repo}`));
    const answers = (await prompt([
      {
        type: 'confirm',
        default: true,
        name: 'confirmRepo',
        message: `Make changes to ${item.repo}?`
      },
      {
        type: 'input',
        default: branch,
        name: 'branch',
        message: 'What should the PR branch be called?',
        when: ({confirmRepo}) => confirmRepo === true,
      }]
    ));
    if (!answers.confirmRepo) return collection; // Bail early if told to skip repo.

    branch = answers.branch; // Store result so it's the default next repo

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

    const results = {
      repo: item.repo,
      branch,
      replacements,
    };

    if (inplace) {
      return collection.concat(await commitToBranch(results, gh));
    } else {
      const branchesAndShas = await commitToBranch(results, gh);
      return collection.concat(makePullRequest(branchesAndShas, gh));
    }
  }, Promise.resolve<Array<any>>([])); // TODO fix typedef
}

export async function createOrGetBranch(branchName: string, repo: GitHub.Repository) {
  try {
    const {data: branch} = await repo.getBranch(branchName);
    return branch;
  } catch (e) {
    if (e.response.status === 404) {
      try {
        const defaultBranch = await getDefaultBranch(repo);
        return (await repo.createBranch(defaultBranch, branchName)).data;
      } catch (e) {
        console.error(e);
      }
    }
  }
} // @TODO fix typedef for branch

// @TODO this should probably be broken into a few functions
export async function commitToBranch(item: ReplaceAnswers, gh: GitHub, inPlace: boolean = false) {
  try {
    // Bail if trying to commit directly to master branch and not using "in-place" mode
    if (item.branch === 'master' && !inPlace) return;

    const [repoOwner, repoName] = item.repo.split('/');
    const repo = gh.getRepo(repoOwner, repoName);
    const currentBranch = (await createOrGetBranch(item.branch, repo));
    const headRef = currentBranch.name ? `heads/${currentBranch.name}` : currentBranch.ref.split('/').slice(1).join('/');
    // currentBranch will have .commit if existent; .object if new
    const headSha = currentBranch.commit ? currentBranch.commit.sha : currentBranch.object.sha;
    const tree = (await repo.getTree(headSha)).data;
    const blobs = (await Promise.all(item.replacements.map(async file => {
      if (file.confirmed) {
        const blob = (await repo.createBlob(file.replaced)).data;
        return {
          path: file.path,
          mode: '100644', // @TODO Is this correct?!
          type: 'blob',
          sha: blob.sha,
        };
      } else {
        return undefined;
      }
    }))).filter(i => i);

    const updatedTree = (await repo.createTree(blobs, tree.sha)).data;
    const commit = (await repo.commit(headSha, updatedTree.sha, `ghsed changes:\n$ ghsed ${process.argv.slice(2).join(' ')}`)).data;
    const ref = (await repo.updateHead(headRef, commit.sha, false));

    return {
      repo,
      owner: repoOwner,
      branch: item.branch,
      sha: commit.sha,
    };
  } catch (e) {
    console.error(e); // Throw and quit. @TODO handle more gracefully.
    console.error(e.response.data.errors);
    process.exit(1);
  }
}

export async function getDefaultBranch(repo: GitHub.Repository) {
  try {
    const {data} = await repo.getDetails();
    return data.default_branch;
  } catch (e) {
    return 'master';
  }
}

export async function makePullRequest(pr: UpdatedBranch, gh: GitHub) {
  try {
    const {owner, branch} = pr;
    const defaultBranch = await getDefaultBranch(pr.repo);
    const PRData = await pr.repo.createPullRequest({
      title: `Replacements via ghsed`,
      body: `Command invoked ${new Date().toISOString()} with the following arguments:\n\`\`\`bash\n$ ghsed ${process.argv.slice(2).join(' ')}\n\`\`\``,
      head: `${owner}:${branch}`,
      base: defaultBranch,
    });
    return PRData.data;
  } catch (e) {
    console.error(e);
    console.error(e.response.data.errors);
    process.exit(1);
  }
}

export interface UpdatedBranch {
  repo: GitHub.Repository;
  owner: string;
  branch: string;
  sha: string;
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
