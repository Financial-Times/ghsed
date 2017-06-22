/**
 * @file
 * Test suites for ghsed replacement mechanisms
 */
//
import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';
import GitHub = require('github-api');

import {
  processResults,
  queryMatches,
  createOrGetBranch,
  commitToBranch,
  getDefaultBranch,
  makePullRequest,
} from '../lib/replace';

chai.use(sinonChai);
const should = chai.should();

describe('lib/replace.ts', () => {
  describe('processResults()', () => {});
  describe('queryMatches()', () => {});
  describe('commitToBranch()', () => {});
  describe('createOrGetBranch()', () => {
    let repoStub: any;

    beforeEach(() => {
      repoStub = {
        getBranch: sinon.stub(),
        createBranch: sinon.stub(),
        getDetails: sinon.stub().returns(Promise.resolve({
          data: {
            default_branch: 'master',
          }
        }))
      };
    });

    it('should return branch object if exists', async () => {
      repoStub.getBranch.returns(Promise.resolve({
        data: '{FAKEBRANCHOBJECT}',
      }));

      const result = await createOrGetBranch('some-branch', repoStub);

      repoStub.getBranch.should.have.been.calledOnce;
      repoStub.getBranch.should.have.been.calledWith('some-branch');
      repoStub.createBranch.should.not.have.been.called;
      result.should.equal('{FAKEBRANCHOBJECT}');
    });

    it('should create and return a new branch is non-existent', async () => {
      repoStub.getBranch.throws({
        response: {
          status: 404
        }
      });

      repoStub.createBranch.returns(Promise.resolve({
        data: '{FAKEBRANCHOBJECT}',
      }));

      const result = await createOrGetBranch('new-branch', repoStub);

      repoStub.getBranch.should.have.been.calledOnce;
      repoStub.getBranch.should.have.been.calledWith('new-branch');
      repoStub.createBranch.should.have.been.calledOnce;
      repoStub.createBranch.should.have.been.calledWith('master', 'new-branch');
      result.should.equal('{FAKEBRANCHOBJECT}');
    });
  });

  describe('getDefaultBranch()', () => {
    let repoStub: any;

    beforeEach(() => {
      repoStub = {
        getDetails: sinon.stub(),
      };
    });

    it('returns default_branch', async () => {
      repoStub.getDetails.returns(Promise.resolve({
        data: {
          default_branch: 'testing'
        }
      }));

      const result = await getDefaultBranch(repoStub);

      repoStub.getDetails.should.have.been.calledOnce;
      result.should.equal('testing');
    });

    it('returns "master" by default', async () => {
      repoStub.getDetails.throws(new TypeError('WHUPS BAD REQUEST BRUH'));

      const result = await getDefaultBranch(repoStub);

      repoStub.getDetails.should.have.been.calledOnce;
      result.should.equal('master');
    });
  });
  describe('makePullRequest()', () => {});
});
