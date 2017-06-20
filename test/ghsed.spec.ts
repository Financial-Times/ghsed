/**
 * @file
 * Main test suite for ghsed
 */

import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';

import {default as ghsed} from '../lib/ghsed';
import * as auth from '../lib/auth';
import * as search from '../lib/search';
import * as replace from '../lib/replace';

chai.use(sinonChai);
const should = chai.should();

xdescribe('default', () => {
  let parseSedInstructionsSpy: sinon.SinonSpy;
  let parseTargetsSpy: sinon.SinonSpy;

  beforeEach(() => {
    parseSedInstructionsSpy = sinon.spy(search, 'parseSedInstructions');
    parseTargetsSpy = sinon.spy(search, 'parseTargets');
  });

  afterEach(() => {
    parseSedInstructionsSpy.restore();
    parseTargetsSpy.restore();
  });

  describe('auth via $HOME/.githubtoken', () => {
    describe('ghsed "s/herpa/derpa/" "aendrew/*"', () => {
      beforeEach(() => {
        ghsed({}, ['s/herpa/derpa/', 'aendrew/*']);
      });
      it('parses the sed commands', () => {
        parseSedInstructionsSpy.should.have.been.calledOnce;
        parseSedInstructionsSpy.should.have.been.calledWith(['s/herpa/derpa/']);
      });
      it('parses the targets', () => {
        parseTargetsSpy.should.have.been.calledOnce;
        parseTargetsSpy.should.have.been.calledWith('aendrew/*');
      });
      xit('authenticates via token', () => {});
      xit('searches for all repos for user aendrew', () => {});
      xit('queries user on changes', () => {});
      xit('makes PRs to specified repos', () => {});
    });

    xdescribe('ghsed -i "s/herpa/derpa/" "aendrew/*"', () => {
      xit('parses the sed commands', () => {});
      xit('parses the GitHub path', () => {});
      xit('searches for all repos for user aendrew', () => {});
      xit('queries user on changes', () => {});
      xit('commits directly to main branch on specified repos', () => {});
    });

    xdescribe('ghsed -i backup "s/herpa/derpa/" "aendrew/*"', () => {
      xit('parses the sed commands', () => {});
      xit('parses the GitHub path', () => {});
      xit('searches for all repos for user aendrew', () => {});
      xit('queries user on changes', () => {});
      xit('commits directly to new branch "backup" on specified repos', () => {});
      xit('commits to new branch "backup-1" if repo already contains "backup" branch', () => {});
    });

    describe('multiple instructions', () => {
      it('allows multiple -e flags', () => {
        const flags = {
          expr: [
            's/llama/duck/',
            's/whee/woo/'
          ],
        };
        ghsed(flags, ['aendrew/*']);

        parseSedInstructionsSpy.should.have.been.calledOnce;
        parseSedInstructionsSpy.firstCall.should.have.been.calledWith([
          's/llama/duck/',
          's/whee/woo/',
        ]);
      });

      it('allows semi-colon separated instructions', () => {
        ghsed({}, ['s/llama/duck/;s/whee/woo/', 'aendrew/*']);

        parseSedInstructionsSpy.should.have.been.calledOnce;
        parseSedInstructionsSpy.firstCall.should.have.been.calledWith([
          's/llama/duck/;s/whee/woo/',
        ]);
      });
    });
  });
});
