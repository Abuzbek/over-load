/**
 * An exercise how-to, as the catalogue's markdown writes it: `##` sections,
 * `###` subheadings, numbered steps nested by four spaces, and paragraphs.
 * Nothing else occurs in the 1,090 files, so this is the whole grammar.
 */
export type InstructionBlock =
  | { kind: 'step'; depth: number; number: string; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'paragraph'; text: string };

export type InstructionSection = { title: string; blocks: InstructionBlock[] };

/** Inline markup reduced to plain text: **bold** and [label](url). */
function inline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim();
}

export function parseInstructions(markdown: string): InstructionSection[] {
  const sections: InstructionSection[] = [];
  let current: InstructionSection | null = null;
  const section = () => {
    if (!current) sections.push((current = { title: '', blocks: [] }));
    return current;
  };

  for (const line of markdown.split('\n')) {
    if (!line.trim()) continue;
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      sections.push((current = { title: inline(heading[1]!), blocks: [] }));
      continue;
    }
    const sub = /^###\s+(.*)$/.exec(line);
    const step = /^( *)(\d+)\.\s+(.*)$/.exec(line);
    if (sub) section().blocks.push({ kind: 'subheading', text: inline(sub[1]!) });
    else if (step) section().blocks.push({ kind: 'step', depth: Math.floor(step[1]!.length / 4), number: step[2]!, text: inline(step[3]!) });
    else section().blocks.push({ kind: 'paragraph', text: inline(line) });
  }
  return sections;
}
