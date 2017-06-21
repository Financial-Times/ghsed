/**
 * ghsed
 * Replace strings across GitHub
 *
 * 2017 Ændrew Rininsland
 */

import GitHub = require('github-api');
import {
  authGitHub,
  readToken,
  ConfigObject
} from './auth';
import {
  parseSedInstructions,
  buildQueries,
  parseTargets,
} from './search';

import {
  processResults,
  queryMatches,
  RepoGroup,
  GitHubSearchItem,
  ReplaceAnswers,
} from './replace';

export default async function ghSed(config: ConfigObject, input?: string[]) {
  // Parse instructions and targets
  const targetInput = input.length === 2 ? input[1] : input[0]; // If two input values, assume expr + target
  const instructionsInput = input.length === 2 ? input[0] : undefined; // If one input value, assume just target
  const configExpr = Array.isArray(config.expr) ? config.expr : Array.from(config.expr || []); // Ensure -e is an array

  if (!targetInput || (!instructionsInput && !configExpr)) {
    throw new Error('You need to include both instructions and targets');
  }

  const targets = parseTargets(targetInput);
  const instructions = parseSedInstructions([instructionsInput, ...(config.expr || [])].filter(i => i));

  // Authenticate with GitHub
  const githubTokenFile = readToken(); // Get token if possible
  const gh = authGitHub(config, githubTokenFile); // Auth with either config or token

  // Create search query from instructions
  const queries = buildQueries(targets, instructions);

  try {
    const results = await Promise.all(
      queries.map(async query => (await gh.search({})
        .forCode({
          q: query
        })
      ).data));


    // Create a hash of file matches keyed by repo long name
    const groupedByRepo: RepoGroup = Array.prototype.concat(...results)
      .reduce((collection: RepoGroup, item: GitHubSearchItem) => {
        if (!collection.hasOwnProperty(item.repository.full_name)) {
          collection[item.repository.full_name] = [];
        }
        collection[item.repository.full_name].push(item);
      return collection;
    }, {});

    // Do get blobs and replace relevant strings
    const processed = await processResults(groupedByRepo, targets, instructions, gh);
    const answers = await queryMatches(processed);
    if (config.inplace) {
      return commitToBranch(answers, gh);
    } else {
      const branchesAndShas = await commitToBranch(answers, gh);
      return await makePullRequests(branchesAndShas, gh);
    }
  } catch (e) {
    console.error(e);
  }
}

// @TODO this should probably be broken into a few functions
async function commitToBranch(answers: ReplaceAnswers[], gh: GitHub, inPlace: boolean = false) {
  return answers.reduce(async (queue, current) => {
    const collection = await queue;

    // Bail if trying to commit directly to master branch and not using "in-place" mode
    if (current.branch === 'master' && !inPlace) return collection;

    const [repoOwner, repoName] = current.repo.split('/');
    const repo = gh.getRepo(repoOwner, repoName);
    const head = (await createOrGetBranch(current.branch, repo)).commit.head;
    const tree = (await repo.getTree(head)).data;
    const blobs = (await Promise.all(current.replacements.map(async file => {
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
    const commit = (await repo.commit(head.sha, updatedTree.sha, `ghsed changes\n${process.argv.join(' ')}`)).data;

    return collection.concat({
      repo,
      branch: current.branch,
      sha: commit.sha,
    });
  }, Promise.resolve<Array<UpdatedBranch>>([]));
}

async function createOrGetBranch(branchName: string, repo: GitHub.Repository) {
  const branch = (await repo.getBranch(branchName)).data;
  if (!branch.name) {
    return (await repo.createBranch(branchName)).data;
  } else {
    return branch;
  }
}

async function makePullRequests(prs: UpdatedBranch[], gh: GitHub) {
  return await prs.reduce(async (q, c) => {
    const collection = await q;
    const defaultBranch = (await c.repo.getDetails()).data.default_branch || 'master';
    const PRData = await c.repo.createPullRequest({
      title: `Replacements via ghsed`,
      body: `Command invoked ${new Date().toISOString()} with the following arguments:\n${process.argv.join(' ')}`,
      head: c.branch,
      base: defaultBranch,
    });
    return collection.concat(PRData.data);
  }, Promise.resolve([]));
}

interface UpdatedBranch {
  repo: GitHub.Repository;
  branch: string;
  sha: string;
}
