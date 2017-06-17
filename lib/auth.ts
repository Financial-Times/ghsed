/**
 * @file
 * Handle authentication of clients
 */

import GitHub = require('github-api');
import {readFileSync} from 'fs';

/**
 * Read GitHub token from file or return false
 * @return {string|false} Token string or false
 */
export function readToken() {
  try {
    return readFileSync(`${process.env.HOME}/.githubtoken`, {encoding: 'utf-8'});
  } catch (e) {
    return false;
  }
}

/**
 * Instantiate github-api parent class and set authentication
 * @param  {ConfigObject}   config          Config object from CLI flags
 * @param  {string|boolean} githubTokenFile Token from file (or false)
 * @throws {Error}                          ...When no authentication method available
 * @return {GitHub}                         github-api GitHub class
 */
export function authGitHub(config: ConfigObject, githubTokenFile: string|boolean) {
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

export interface ConfigObject extends ConfigObjectBase {
  username: string;
  password: string;
}

export interface ConfigObject extends ConfigObjectBase {
  token: string;
}

interface ConfigObjectBase {
  org?: string;
  repos?: string;
  expr?: string|string[];
  inplace?: string;
}
