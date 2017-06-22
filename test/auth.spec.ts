/**
 * @file
 * Main test suite for ghsed authentication
 *
 * @TODO Fix tests -- currently failing because of stub logic
 */

import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import * as fs from 'fs';
import GitHub = require('github-api');

import {
  readToken,
  authGitHub,
} from '../lib/auth';

chai.use(sinonChai);
const should = chai.should();


describe('lib/auth.ts', () => {
  describe('readToken()', () => {
    let readFileSyncStub: sinon.SinonStub;
    const currentProcessEnvHome = process.env.HOME;

    beforeEach(() => {
      readFileSyncStub = sinon.stub(fs, 'readFileSync');
      process.env.HOME = '/tmp';
    });

    afterEach(() => {
      readFileSyncStub.restore();
      process.env.HOME = currentProcessEnvHome;
    });

    it('attempts to read ${process.env.HOME}/.githubtoken', () => {
      readFileSyncStub.returns('<TOKEN>');

      const result = readToken();

      result.should.equal('<TOKEN>');
      readFileSyncStub.should.have.been.calledOnce;
      readFileSyncStub.should.have.been.calledWith('/tmp/.githubtoken');
    });

    it('returns false if file does not exist', () => {
      readFileSyncStub.throws(new TypeError('File not found'));

      const result = readToken();

      result.should.be.false;
    });
  });

  // @TODO figure out how to properly stub a new'd GitHub instance
  xdescribe('authGitHub()', () => {
    let GitHubStub: any;
    const GitHubTokenEnvVar = process.env.GITHUB_TOKEN;

    beforeEach(() => {
      process.env.GITHUB_TOKEN = '<TOKEN>';
      GitHubStub = sinon.stub(GitHub.prototype);
    });

    afterEach(() => {
      process.env.GITHUB_TOKEN = GitHubTokenEnvVar;
      GitHubStub.restore();
    });

    it('auths using $GITHUB_TOKEN env var', () => {
      const result = authGitHub();
      GitHubStub.should.have.been.calledOnce;
      GitHubStub.should.have.been.calledWith({token: '<TOKEN>'});
      result.should.be.a('Github');
    });

    it('auths using GitHub token arg', () => {
      const result = authGitHub({}, '<TOKEN>');
      GitHubStub.should.have.been.calledOnce;
      GitHubStub.should.have.been.calledWith({token: '<TOKEN>'});
      result.should.be.a('Github');
    });

    it('auths using GitHub token config value', () => {
      const result = authGitHub({token: '<TOKEN>'});
      GitHubStub.should.have.been.calledOnce;
      GitHubStub.should.have.been.calledWith({token: '<TOKEN>'});
      result.should.be.a('Github');
    });

    it('auths using username/pass config values', () => {
      const result = authGitHub({username: '<USERNAME>', password: '<PASSWORD>'});
      GitHubStub.should.have.been.calledOnce;
      GitHubStub.should.have.been.calledWith({
        username: '<USERNAME>',
        password: '<PASSWORD>',
      });
      result.should.be.a('Github');
    });

    it('throws if no authentication mechanism supplied', () => {
      process.env.GITHUB_TOKEN = undefined;
      should.Throw(() => authGitHub(), TypeError);
    });
  });
});
