/**
 * Parse unified diff format
 * This is a utility for future enhancements
 */
export function parseDiff(diffString) {
  const lines = diffString.split('\n');
  const hunks = [];
  let currentHunk = null;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Hunk header
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        currentHunk = {
          oldStart: parseInt(match[1]),
          oldLines: parseInt(match[2] || '1'),
          newStart: parseInt(match[3]),
          newLines: parseInt(match[4] || '1'),
          lines: [],
        };
      }
    } else if (currentHunk) {
      currentHunk.lines.push(line);
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

