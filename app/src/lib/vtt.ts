/** One subtitle cue; times in seconds. */
export interface Cue {
  start: number;
  end: number;
  text: string;
}

// [hh:]mm:ss(.|,)fff — SRT uses a comma; some files drop the hours or use another fraction length.
const TIMESTAMP = /(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d+))?/;
const TIMING = new RegExp(`^\\s*${TIMESTAMP.source}\\s*-->\\s*${TIMESTAMP.source}`);

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  lrm: '',
  rlm: '',
};

function seconds(h: string | undefined, m: string, s: string, frac: string | undefined): number {
  return (h ? Number(h) * 3600 : 0) + Number(m) * 60 + Number(s) + (frac ? Number(`0.${frac}`) : 0);
}

function cleanLine(line: string): string {
  return line
    // Real tags only (<i>, </b>, <c.yellow>, <v Speaker>, <00:00:01.000>); a bare "<" as in "I <3 you" stays.
    .replace(/<\/?(?:[a-z][^<>]*|\d[\d:.]*)>/gi, '')
    .replace(/\{\\[^}]*\}/g, '') // SRT/ASS overrides like {\an8}
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (m, name: string) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[name.toLowerCase()] ?? m;
    })
    .trim();
}

/**
 * Parses WebVTT (and SRT-style input) into cues sorted by start time. Tolerates a BOM, CRLF,
 * comma decimals, cue settings, cue identifiers/SRT indices, multi-line cues and inline tags (stripped).
 * Header, NOTE, STYLE and REGION blocks are skipped. Never throws; unparsable blocks are dropped.
 */
export function parseVtt(input: string): Cue[] {
  const lines = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const cues: Cue[] = [];
  let i = 0;
  while (i < lines.length) {
    const m = TIMING.exec(lines[i]);
    if (!m) {
      i += 1;
      continue;
    }
    const start = seconds(m[1], m[2], m[3], m[4]);
    const end = seconds(m[5], m[6], m[7], m[8]);
    i += 1;
    const text: string[] = [];
    // Cue payload runs until a blank line (or the next timing line in files that omit the blank line).
    while (i < lines.length && lines[i].trim() !== '' && !TIMING.test(lines[i])) {
      const line = cleanLine(lines[i]);
      if (line) text.push(line);
      i += 1;
    }
    // A bare SRT index right before the next timing line belongs to that cue, not this one.
    if (i < lines.length && TIMING.test(lines[i]) && text.length > 1 && /^\d+$/.test(text[text.length - 1])) {
      text.pop();
    }
    if (text.length && end > start) cues.push({ start, end, text: text.join('\n') });
  }
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Text of every cue showing at `time` (overlapping cues stacked), or "" when none. */
export function cueTextAt(cues: readonly Cue[], time: number): string {
  const active: string[] = [];
  for (const c of cues) {
    if (c.start > time) break;
    if (time < c.end && !active.includes(c.text)) active.push(c.text);
  }
  return active.join('\n');
}
