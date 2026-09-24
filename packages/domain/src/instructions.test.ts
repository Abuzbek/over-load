import { describe, expect, it } from 'vitest';
import { parseInstructions } from './instructions';

describe('parseInstructions', () => {
  it('splits sections and nests steps by indent', () => {
    const md = [
      '## Setting up',
      '1. Adjust the **pad**.',
      '    1. See [the note](https://x.y/z).',
      '2. Grip the bar.',
      '',
      '## Description',
      '### **Straps**',
      'Plain paragraph.',
    ].join('\n');

    expect(parseInstructions(md)).toEqual([
      {
        title: 'Setting up',
        blocks: [
          { kind: 'step', depth: 0, number: '1', text: 'Adjust the pad.' },
          { kind: 'step', depth: 1, number: '1', text: 'See the note.' },
          { kind: 'step', depth: 0, number: '2', text: 'Grip the bar.' },
        ],
      },
      {
        title: 'Description',
        blocks: [
          { kind: 'subheading', text: 'Straps' },
          { kind: 'paragraph', text: 'Plain paragraph.' },
        ],
      },
    ]);
  });

  it('keeps text before the first heading in an untitled section', () => {
    expect(parseInstructions('Just a note.')).toEqual([{ title: '', blocks: [{ kind: 'paragraph', text: 'Just a note.' }] }]);
  });
});
