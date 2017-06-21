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

async function createOrGetBranch(branchName: string, repo: GitHub.Repository) {
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
}

// @TODO this should probably be broken into a few functions
async function commitToBranch(answers: ReplaceAnswers[], gh: GitHub, inPlace: boolean = false) {
  return answers.reduce(async (queue, current) => {
    try {
      const collection = await queue;

      // Bail if trying to commit directly to master branch and not using "in-place" mode
      if (current.branch === 'master' && !inPlace) return collection;

      const [repoOwner, repoName] = current.repo.split('/');
      const repo = gh.getRepo(repoOwner, repoName);
      const currentBranch = (await createOrGetBranch(current.branch, repo));

      // currentBranch will have .commit if existent; .object if new
      const head = currentBranch.commit ? currentBranch.commit.sha : currentBranch.object.sha;
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
      const commit = (await repo.commit(head, updatedTree.sha, `ghsed changes:\n$ ghsed ${process.argv.slice(2).join(' ')}`)).data;
      const ref = (await repo.updateHead(`heads/${currentBranch.name}`, commit.sha, false));

      return collection.concat({
        repo,
        owner: repoOwner,
        branch: current.branch,
        sha: commit.sha,
      });
    } catch (e) {
      console.error(e); // Throw and quit. @TODO handle more gracefully.
      console.error(e.response.data.errors);
      process.exit(1);
    }
  }, Promise.resolve<Array<UpdatedBranch>>([]));
}

async function getDefaultBranch(repo: GitHub.Repository) {
  try {
    const {data} = await repo.getDetails();
    return data.default_branch;
  } catch (e) {
    return 'master';
  }
}

async function makePullRequests(prs: UpdatedBranch[], gh: GitHub) {
  try {
    return await prs.reduce(async (q, c) => {
      const collection = await q;
      const {owner, branch} = c;
      const defaultBranch = await getDefaultBranch(c.repo);
      const PRData = await c.repo.createPullRequest({
        title: `Replacements via ghsed`,
        body: `Command invoked ${new Date().toISOString()} with the following arguments:\n\`\`\`bash\n$ ghsed ${process.argv.slice(2).join(' ')}\n\`\`\``,
        head: `${owner}:${branch}`,
        base: defaultBranch,
      });
      return collection.concat(PRData.data);
    }, Promise.resolve([]));
  } catch (e) {
    console.error(e);
    console.error(e.response.data.errors);
    process.exit(1);
  }
}

interface UpdatedBranch {
  repo: GitHub.Repository;
  owner: string;
  branch: string;
  sha: string;
}
