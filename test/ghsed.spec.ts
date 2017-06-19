/**
 * @file
 * Main test suite for ghsed
 */

import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';

import * as ghsed from '../lib/ghsed';

chai.use(sinonChai);
const should = chai.should();

xdescribe('default', () => {
  describe('auth via $HOME/.githubtoken', () => {
    describe('ghsed "s/herpa/derpa/" "aendrew/*"', () => {
      xit('parses the sed commands', () => {});
      xit('parses the GitHub path', () => {});
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
      let parseSedInstructionsStub: sinon.SinonStub;

      beforeEach(() => {
        parseSedInstructionsStub = sinon.stub(ghsed, 'parseSedInstructions');
      });

      afterEach(() => {
        parseSedInstructionsStub.restore();
      });
      it('allows multiple -e flags', () => {
        const flags = {
          expr: [
            's/llama/duck/',
            's/whee/woo/'
          ],
        };
        ghsed.default(flags, ['aendrew/*']);

        parseSedInstructionsStub.should.have.been.calledTwice;
        parseSedInstructionsStub.firstCall.should.have.been.calledWith('s/llama/duck/');
        parseSedInstructionsStub.secondCall.should.have.been.calledWith('s/whee/woo/');
      });

      it('allows semi-colon separated instructions', () => {
        ghsed.default({}, ['s/llama/duck/;s/whee/woo/', 'aendrew/*']);

        parseSedInstructionsStub.should.have.been.calledTwice;
        parseSedInstructionsStub.firstCall.should.have.been.calledWith('s/llama/duck/');
        parseSedInstructionsStub.secondCall.should.have.been.calledWith('s/whee/woo/');
      });
    });
  });
});
