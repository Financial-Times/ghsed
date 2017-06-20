/**
 * @file
 * Test suite for ghsed searching functions
 */

import * as chai from 'chai';
import * as sinon from 'sinon';
import * as sinonChai from 'sinon-chai';

import {
  parseSedInstructions,
  parseTargets,
} from '../lib/search';

chai.use(sinonChai);
const should = chai.should();

describe('lib/search.ts', () => {
  describe('ghsed.parseSedInstructions', () => {
    it('parses one instruction', () => {
      const instructions = ['s/llama/duck/'];
      const [result] = parseSedInstructions(instructions);
      const [command] = result.commands;
      command.should.have.property('string1', 'llama');
      command.should.have.property('replacement', 'duck');
    });

    it('parses multiple instructions', () => {
      const instructions = [
        's/llama/duck/',
        's/cow/chicken/'
      ];
      const [result1, result2] = parseSedInstructions(instructions);
      const [commands1] = result1.commands;
      const [commands2] = result2.commands;
      commands1.should.have.property('string1', 'llama');
      commands1.should.have.property('replacement', 'duck');

      commands2.should.have.property('string1', 'cow');
      commands2.should.have.property('replacement', 'chicken');
    });
  });

  describe('ghsed.parseTargets', () => {
    it('parses wildcard repo without file', () => {
      const targets = 'aendrew/*';
      const result = parseTargets(targets);
      result.should.eql({
        owner: 'aendrew',
        repo: '*',
        file: '*',
      });
    });

    it('parses specified repo without file', () => {
      const targets = 'aendrew/ghsed';
      const result = parseTargets(targets);
      result.should.eql({
        owner: 'aendrew',
        repo: 'ghsed',
        file: '*',
      });
    });

    it('parses wildcard repo with specified file', () => {
      const targets = 'aendrew/*/README.md';
      const result = parseTargets(targets);
      result.should.eql({
        owner: 'aendrew',
        repo: '*',
        file: 'README.md',
      });
    });

    it('parses specified repo with specified file', () => {
      const targets = 'aendrew/ghsed/README.md';
      const result = parseTargets(targets);
      result.should.eql({
        owner: 'aendrew',
        repo: 'ghsed',
        file: 'README.md',
      });
    });

    it('throws TypeError if no slashes in string', () => {
      const brokenTarget = 'herpa-dee-derpa';
      should.Throw(() => parseTargets(brokenTarget), TypeError);
    });

    it('throws TypeError if first argument is "*"', () => {
      const brokenTarget = '*/llama/duck.md';
      should.Throw(() => parseTargets(brokenTarget), TypeError);
    });
  });
});
