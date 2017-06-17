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

describe('default', () => {
  describe('auth via $HOME/.githubtoken', () => {
    describe('ghsed "s/herpa/derpa/" "aendrew/*"', () => {
      xit('parses the sed commands', () => {});
      xit('parses the GitHub path', () => {});
      xit('searches for all repos for user aendrew', () => {});
      xit('queries user on changes', () => {});
      xit('makes PRs to specified repos', () => {});
    });

    describe('ghsed -i "s/herpa/derpa/" "aendrew/*"', () => {
      xit('parses the sed commands', () => {});
      xit('parses the GitHub path', () => {});
      xit('searches for all repos for user aendrew', () => {});
      xit('queries user on changes', () => {});
      xit('commits directly to main branch on specified repos', () => {});
    });

    describe('ghsed -i backup "s/herpa/derpa/" "aendrew/*"', () => {
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

describe('ghsed.splitMultipleSedInstructions', () => {
  it('splits by semi-colon', () => {
    const instructions = 's/llama/duck/;s/wee/woo/';
    const result = ghsed.splitMultipleSedInstructions(instructions);
    result.should.eql([
      's/llama/duck/',
      's/wee/woo/'
    ]);
  });

  it('respects escaped semi-colons', () => {
    const instructions = 's/;/y/;s/e/z/;5!s/foo/bar/g';
    const result = ghsed.splitMultipleSedInstructions(instructions);
    result.should.eql([
      's/;/y/',
      's/e/z/',
      '5!s/foo/bar/g',
    ]);
  })
});

describe('ghsed.parseSedInstructions', () => {
  it('parses one instruction', () => {
    const instructions = ['s/llama/duck/'];
    const result = ghsed.parseSedInstructions(instructions);
    result.should.eql([
      {
        search: 'llama',
        replace: 'duck',
      },
    ]);
  });

  it('parses multiple instructions', () => {
    const instructions = [
      's/llama/duck',
      's/cow/chicken'
    ];
    const result = ghsed.parseSedInstructions(instructions);
    result.should.eql([
      {
        search: 'llama',
        replace: 'duck',
      },
      {
        search: 'cow',
        replace: 'chicken',
      }
    ]);
  });
});

describe('ghsed.parseTargets', () => {
  it('parses wildcard repo without file', () => {
    const targets = 'aendrew/*';
    const result = ghsed.parseTargets(targets);
    result.should.eql({
      owner: 'aendrew',
      repo: '*',
      file: '*',
    });
  });

  it('parses specified repo without file', () => {
    const targets = 'aendrew/ghsed';
    const result = ghsed.parseTargets(targets);
    result.should.eql({
      owner: 'aendrew',
      repo: 'ghsed',
      file: '*',
    });
  });

  it('parses wildcard repo with specified file', () => {
    const targets = 'aendrew/*/README.md';
    const result = ghsed.parseTargets(targets);
    result.should.eql({
      owner: 'aendrew',
      repo: '*',
      file: 'README.md',
    });
  });

  it('parses specified repo with specified file', () => {
    const targets = 'aendrew/ghsed/README.md';
    const result = ghsed.parseTargets(targets);
    result.should.eql({
      owner: 'aendrew',
      repo: 'ghsed',
      file: 'README.md',
    });
  });

  it('throws TypeError if no slashes in string', () => {
    const brokenTarget = 'herpa-dee-derpa';
    ghsed.parseTargets(brokenTarget).should.throw(TypeError);
  });

  it('throws TypeError if first argument is "*"', () => {
    const brokenTarget = '*/llama/duck.md';
    ghsed.parseTargets(brokenTarget).should.throw(TypeError);
  });
});
