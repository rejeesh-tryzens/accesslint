import { getPullRequest, getPullRequestDiff, getFileContentWithSha, createBranch, createOrUpdateFile, createPullRequest, createPRComment, listPullRequests } from './github-client.js';
import { analyzeAccessibility, generateFixes } from './ai-analyzer.js';
import { parseDiff, extractChangedCode } from './diff-parser.js';

/**
 * Main function to review a pull request for accessibility issues
 * Only analyzes code changes from git diff
 */
export async function reviewPullRequest(owner, repo, prNumber) {
  console.log(`🔍 Reviewing PR #${prNumber} in ${owner}/${repo}`);

  // Get PR details and diff
  const [pr, diff] = await Promise.all([
    getPullRequest(owner, repo, prNumber),
    getPullRequestDiff(owner, repo, prNumber),
  ]);
  
  if (!pr) {
    throw new Error(`PR #${prNumber} not found`);
  }

  // Parse diff to extract changed sections per file
  const fileDiffs = parseDiff(diff);
  const reviewableFiles = pr.files.filter(file => 
    file.status !== 'removed' && isReviewableFile(file.filename)
  );

  console.log(`📝 Analyzing ${reviewableFiles.length} file(s) from diff`);

  const reviewResults = [];
  const allIssues = [];
  const filesToFix = [];

  // Analyze each changed file using only diff data
  for (const file of reviewableFiles) {
    const fileDiff = fileDiffs[file.filename];
    
    if (!fileDiff || !fileDiff.hunks || fileDiff.hunks.length === 0) {
      console.log(`⚠️  No diff found for ${file.filename}, skipping`);
      continue;
    }

    try {
      const language = getLanguage(file.filename);
      
      // Extract all changed code chunks from diff
      const changedChunks = [];
      for (const hunk of fileDiff.hunks) {
        const changedCode = extractChangedCode(hunk.lines);
        if (changedCode.trim()) {
          changedChunks.push({
            code: changedCode,
            hunk: hunk,
          });
        }
      }

      if (changedChunks.length === 0) {
        console.log(`ℹ️  No code additions found in ${file.filename}`);
        continue;
      }

      // Combine all changed chunks for analysis
      const changedContent = changedChunks.map(c => c.code).join('\n\n// --- Next changed section ---\n\n');
      
      console.log(`🤖 AI analyzing ${changedChunks.length} changed section(s) in ${file.filename}...`);
      
      // Analyze only changed sections from diff
      const analysis = await analyzeAccessibility(
        file.filename,
        null, // No old content needed - we work with diff only
        changedContent,
        language
      );

      if (analysis.hasIssues && analysis.issues.length > 0) {
        console.log(`⚠️  Found ${analysis.issues.length} issue(s) in ${file.filename}`);
        
        allIssues.push(...analysis.issues.map(issue => ({
          ...issue,
          file: file.filename,
        })));

        filesToFix.push({
          path: file.filename,
          changedChunks: changedChunks,
          issues: analysis.issues,
          language,
          sha: file.sha,
          hunks: fileDiff.hunks,
        });

        reviewResults.push({
          file: file.filename,
          hasIssues: true,
          issues: analysis.issues,
          summary: analysis.summary,
        });
      } else {
        console.log(`✅ No issues found in ${file.filename}`);
        reviewResults.push({
          file: file.filename,
          hasIssues: false,
        });
      }
    } catch (error) {
      console.error(`❌ Error analyzing ${file.filename}:`, error.message);
      reviewResults.push({
        file: file.filename,
        error: error.message,
      });
    }
  }

  // Create summary comment
  const commentBody = generateReviewComment(reviewResults, allIssues);
  await createPRComment(owner, repo, prNumber, commentBody);

  // If there are issues, create a fix PR
  if (filesToFix.length > 0) {
    console.log(`🔧 Creating fix PR for ${filesToFix.length} file(s)...`);
    await createFixPullRequest(owner, repo, prNumber, pr, filesToFix);
  }

  return {
    prNumber,
    filesAnalyzed: reviewResults.length,
    issuesFound: allIssues.length,
    hasFixes: filesToFix.length > 0,
    results: reviewResults,
  };
}

/**
 * Generate review comment for PR
 */
function generateReviewComment(results, allIssues) {
  const criticalIssues = allIssues.filter(i => i.severity === 'critical');
  const highIssues = allIssues.filter(i => i.severity === 'high');
  const mediumIssues = allIssues.filter(i => i.severity === 'medium');
  const lowIssues = allIssues.filter(i => i.severity === 'low');

  let comment = `## 🔍 Accessibility Review Summary\n\n`;
  
  if (allIssues.length === 0) {
    comment += `✅ **No accessibility issues found!** Great work on making your code accessible.\n`;
    return comment;
  }

  comment += `Found **${allIssues.length}** accessibility issue(s) across **${results.length}** file(s):\n\n`;
  comment += `- 🔴 Critical: ${criticalIssues.length}\n`;
  comment += `- 🟠 High: ${highIssues.length}\n`;
  comment += `- 🟡 Medium: ${mediumIssues.length}\n`;
  comment += `- 🔵 Low: ${lowIssues.length}\n\n`;

  comment += `### Issues by File\n\n`;

  for (const result of results) {
    if (!result.hasIssues) continue;

    comment += `#### \`${result.file}\`\n\n`;
    
    for (const issue of result.issues) {
      const emoji = {
        critical: '🔴',
        high: '🟠',
        medium: '🟡',
        low: '🔵',
      }[issue.severity] || '⚪';

      comment += `${emoji} **${issue.type}** (${issue.severity})\n`;
      comment += `${issue.description}\n`;
      comment += `\n💡 **Suggestion:** ${issue.suggestion}\n`;
      
      if (issue.fixedCode) {
        comment += `\n\`\`\`${result.language || 'html'}\n${issue.fixedCode}\n\`\`\`\n`;
      }
      
      comment += `\n---\n\n`;
    }
  }

  comment += `\n> 🤖 This review was automatically generated by AccessLint PR Bot. `;
  comment += `A fix PR will be created shortly with suggested corrections.`;

  return comment;
}

/**
 * Create a pull request with accessibility fixes
 */
async function createFixPullRequest(owner, repo, originalPRNumber, originalPR, filesToFix) {
  const sourceBranch = originalPR.head.ref;
  const targetBranch = originalPR.head.ref;
  
  // Check if a fix PR already exists
  const existingPRs = await listPullRequests(owner, repo, {
    state: 'open',
    base: targetBranch,
  });
  
  const fixPRTitlePattern = new RegExp(`🔧 Fix accessibility issues from PR #${originalPRNumber}`);
  const existingFixPR = existingPRs.find(pr => 
    pr.head.ref.startsWith('accesslint/fix-pr-') &&
    pr.head.ref.includes(`-${originalPRNumber}-`) &&
    fixPRTitlePattern.test(pr.title)
  );
  
  if (existingFixPR) {
    console.log(`ℹ️  Fix PR already exists: #${existingFixPR.number}`);
    return existingFixPR;
  }
  
  const branchName = `accesslint/fix-pr-${originalPRNumber}-${Date.now()}`;
  
  try {
    // Create new branch from the PR's head branch
    await createBranch(owner, repo, branchName, sourceBranch);

    // Apply fixes to each file
    for (const file of filesToFix) {
      console.log(`🔧 Generating fixes for ${file.path}...`);
      
      // Get current file content to apply fixes
      const fileInfo = await getFileContentWithSha(owner, repo, file.path, branchName);
      if (!fileInfo) {
        console.warn(`⚠️  Could not get file content for ${file.path}, skipping`);
        continue;
      }

      // Generate fixes for changed chunks
      const changedContent = file.changedChunks.map(c => c.code).join('\n\n// --- Next changed section ---\n\n');
      
      const fixedChangedContent = await generateFixes(
        file.path,
        changedContent,
        file.issues,
        file.language
      );

      // Apply fixes to the full file
      const fixedContent = applyFixesToFile(
        fileInfo.content,
        file.changedChunks,
        fixedChangedContent
      );

      await createOrUpdateFile(
        owner,
        repo,
        file.path,
        fixedContent,
        branchName,
        `fix(a11y): Fix accessibility issues in ${file.path}`,
        fileInfo.sha
      );
    }

    // Create the fix PR
    const fixPR = await createPullRequest(
      owner,
      repo,
      `🔧 Fix accessibility issues from PR #${originalPRNumber}`,
      `This PR automatically fixes accessibility issues found in PR #${originalPRNumber}.\n\n` +
      `**Issues fixed:**\n` +
      filesToFix.map(f => `- ${f.path} (${f.issues.length} issue(s))`).join('\n') +
      `\n\n---\n` +
      `🤖 Auto-generated by AccessLint PR Bot\n\n` +
      `> 💡 **Note:** This PR can be merged independently or the fixes can be cherry-picked into PR #${originalPRNumber}`,
      branchName,
      targetBranch
    );

    console.log(`✅ Created fix PR #${fixPR.number}: ${fixPR.html_url}`);
    
    return fixPR;
  } catch (error) {
    console.error('Error creating fix PR:', error);
    throw error;
  }
}

/**
 * Apply fixes from changed sections back to the full file
 */
function applyFixesToFile(fullContent, changedChunks, fixedChangedContent) {
  if (!fullContent) {
    return fixedChangedContent;
  }

  // Split the fixed content back into sections
  const fixedSections = fixedChangedContent.split(/\n\n\/\/ --- Next changed section ---\n\n/);
  
  if (fixedSections.length !== changedChunks.length) {
    console.warn(`⚠️  Could not match fixed sections (${fixedSections.length} vs ${changedChunks.length}), using original content`);
    return fullContent;
  }

  let result = fullContent;
  
  // Apply fixes by replacing changed chunks in the full file
  // This is a simplified approach - in production you might want more sophisticated diff application
  for (let i = 0; i < changedChunks.length; i++) {
    const originalChunk = changedChunks[i].code;
    const fixedChunk = fixedSections[i];
    
    if (originalChunk !== fixedChunk && result.includes(originalChunk)) {
      result = result.replace(originalChunk, fixedChunk);
    }
  }

  return result;
}

/**
 * Check if file should be reviewed
 */
function isReviewableFile(filename) {
  const reviewableExtensions = ['.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'];
  return reviewableExtensions.some(ext => filename.endsWith(ext));
}

/**
 * Get programming language from filename
 */
function getLanguage(filename) {
  const extension = filename.split('.').pop()?.toLowerCase();
  const langMap = {
    'html': 'html',
    'htm': 'html',
    'js': 'javascript',
    'jsx': 'jsx',
    'ts': 'typescript',
    'tsx': 'tsx',
    'vue': 'vue',
    'svelte': 'svelte',
  };
  return langMap[extension] || 'html';
}
