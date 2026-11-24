// Comparisons of two texts, so the citizen sees exactly what an improved version changed before
// using it: longest common subsequence over words, or over lines. Drafts are a few hundred words,
// so the table stays small. The review shows lines: an application is one request per line, and
// a heavily reworded line reads better as old-then-new than as words interleaved.

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

function words(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token !== "");
}

export function diffWords(before: string, after: string): DiffPart[] {
  return diff(words(before), words(after), "");
}

// Each part is whole lines; blank lines and trailing spaces do not count as changes.
export function diffLines(before: string, after: string): DiffPart[] {
  const lines = (text: string) => text.split("\n").map((line) => line.trimEnd()).filter((line) => line !== "");
  return diff(lines(before), lines(after), "\n");
}

function diff(a: string[], b: string[], joiner: string): DiffPart[] {
  // lengths[i][j]: longest common subsequence of a[i..] and b[j..]
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const parts: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += joiner + text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      push("removed", a[i++]);
    } else {
      push("added", b[j++]);
    }
  }
  while (i < a.length) push("removed", a[i++]);
  while (j < b.length) push("added", b[j++]);
  return parts;
}
