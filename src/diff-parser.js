/**
 * Parse unified diff format and extract changed chunks per file
 */
export function parseDiff(diffString) {
  const fileDiffs = {};
  const lines = diffString.split('\n');
  let currentFile = null;
  let currentHunk = null;
  let currentHunkLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // File header: diff --git a/path b/path
    if (line.startsWith('diff --git')) {
      // Save previous hunk if exists
      if (currentFile && currentHunk) {
        if (!fileDiffs[currentFile]) {
          fileDiffs[currentFile] = { hunks: [] };
        }
        fileDiffs[currentFile].hunks.push({
          ...currentHunk,
          lines: currentHunkLines,
        });
        currentHunk = null;
        currentHunkLines = [];
      }
      
      // Extract filename from: diff --git a/path b/path
      const match = line.match(/diff --git a\/(.+?) b\/(.+?)$/);
      if (match) {
        currentFile = match[2]; // Use new filename (b/)
        if (!fileDiffs[currentFile]) {
          fileDiffs[currentFile] = { hunks: [] };
        }
      }
    }
    // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    else if (line.startsWith('@@')) {
      // Save previous hunk if exists
      if (currentFile && currentHunk) {
        if (!fileDiffs[currentFile]) {
          fileDiffs[currentFile] = { hunks: [] };
        }
        fileDiffs[currentFile].hunks.push({
          ...currentHunk,
          lines: currentHunkLines,
        });
        currentHunkLines = [];
      }
      
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match && currentFile) {
        currentHunk = {
          oldStart: parseInt(match[1]),
          oldLines: parseInt(match[2] || '1'),
          newStart: parseInt(match[3]),
          newLines: parseInt(match[4] || '1'),
        };
      }
    }
    // Content lines (only if we have a current hunk)
    else if (currentHunk && currentFile) {
      // Store all lines including context
      currentHunkLines.push(line);
    }
  }

  // Save last hunk
  if (currentFile && currentHunk) {
    if (!fileDiffs[currentFile]) {
      fileDiffs[currentFile] = { hunks: [] };
    }
    fileDiffs[currentFile].hunks.push({
      ...currentHunk,
      lines: currentHunkLines,
    });
  }

  return fileDiffs;
}

/**
 * Extract changed code chunks from diff hunk lines
 * Returns only the added/modified lines (not deletions or context)
 */
export function extractChangedCode(hunkLines) {
  const changedLines = [];
  
  for (const line of hunkLines) {
    // Lines starting with + are additions (skip the + prefix)
    if (line.startsWith('+') && !line.startsWith('+++')) {
      changedLines.push(line.substring(1));
    }
  }
  
  return changedLines.join('\n');
}

