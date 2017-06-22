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
    return queryMatches(processed, config.inplace, gh);
  } catch (e) {
    console.error(e);
  }
}
