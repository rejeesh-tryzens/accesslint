import { getPullRequest, getFileContent, createBranch, createOrUpdateFile, createPullRequest, createPRComment } from './github-client.js';
import { analyzeAccessibility, generateFixes } from './ai-analyzer.js';
import { config } from './config.js';
import { parseDiff } from './diff-parser.js';

/**
 * Main function to review a pull request for accessibility issues
 */
export async function reviewPullRequest(owner, repo, prNumber) {
  console.log(`[REVIEW] Reviewing PR #${prNumber} in ${owner}/${repo}`);

  // Get PR details
  const pr = await getPullRequest(owner, repo, prNumber);
  
  if (!pr) {
    throw new Error(`PR #${prNumber} not found`);
  }

  console.log(`[INFO] Analyzing ${pr.files.length} file(s)`);

  const reviewResults = [];
  const allIssues = [];
  const filesToFix = [];

  // Analyze each changed file
  for (const file of pr.files) {
    if (file.status === 'removed' || !isReviewableFile(file.filename)) {
      continue;
    }

    try {
      const language = getLanguage(file.filename);
      
      // Get old and new content
      const oldContent = file.status !== 'added' 
        ? await getFileContent(owner, repo, file.filename, pr.base.ref)
        : null;
      
      const newContent = file.status !== 'removed'
        ? await getFileContent(owner, repo, file.filename, pr.head.ref)
        : null;

      if (!newContent) {
        continue;
      }

      console.log(`[AI] Analyzing ${file.filename}...`);
      
      // Analyze with AI
      const analysis = await analyzeAccessibility(
        file.filename,
        oldContent,
        newContent,
        language
      );

      if (analysis.hasIssues && analysis.issues.length > 0) {
        console.log(`[WARNING] Found ${analysis.issues.length} issue(s) in ${file.filename}`);
        
        allIssues.push(...analysis.issues.map(issue => ({
          ...issue,
          file: file.filename,
        })));

        filesToFix.push({
          path: file.filename,
          content: newContent,
          issues: analysis.issues,
          language,
          sha: file.sha,
        });

        reviewResults.push({
          file: file.filename,
          ...analysis,
        });
      } else {
        console.log(`[SUCCESS] No issues found in ${file.filename}`);
      }
    } catch (error) {
      console.error(`[ERROR:ANALYSIS] Failed to analyze ${file.filename}:`, error.message);
      reviewResults.push({
        file: file.filename,
        error: error.message,
        errorType: 'analysis_failed',
      });
    }
  }

  // Create summary comment
  const commentBody = generateReviewComment(reviewResults, allIssues);
  await createPRComment(owner, repo, prNumber, commentBody);

  // If there are issues, create a fix PR
  if (filesToFix.length > 0) {
    console.log(`[FIX] Creating fix PR for ${filesToFix.length} file(s)...`);
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
 * 
 * Heading structure for accessibility:
 * - h2: Main "Accessibility Review Summary" title
 * - h3: Section titles like "Issues by File"
 * - h4: Individual file names
 * 
 * This hierarchy ensures proper document outline for screen readers.
 * Text labels always precede emoji to ensure screen reader accessibility.
 */
function generateReviewComment(results, allIssues) {
  const criticalIssues = allIssues.filter(i => i.severity === 'critical');
  const highIssues = allIssues.filter(i => i.severity === 'high');
  const mediumIssues = allIssues.filter(i => i.severity === 'medium');
  const lowIssues = allIssues.filter(i => i.severity === 'low');

  let comment = `## Accessibility Review Summary\n\n`;
  
  if (allIssues.length === 0) {
    comment += `✅ **No accessibility issues found!** Great work on making your code accessible.\n`;
    return comment;
  }

  comment += `Found **${allIssues.length}** accessibility issue(s) across **${results.length}** file(s):\n\n`;
  comment += `- **CRITICAL:** ${criticalIssues.length} 🔴\n`;
  comment += `- **HIGH:** ${highIssues.length} 🟠\n`;
  comment += `- **MEDIUM:** ${mediumIssues.length} 🟡\n`;
  comment += `- **LOW:** ${lowIssues.length} 🔵\n\n`;

  comment += `### Issues by File\n\n`;

  for (const result of results) {
    if (!result.hasIssues) continue;

    comment += `#### \`${result.file}\`\n\n`;
    
    for (const issue of result.issues) {
      const severityLabel = {
        critical: '**[CRITICAL]** 🔴',
        high: '**[HIGH]** 🟠',
        medium: '**[MEDIUM]** 🟡',
        low: '**[LOW]** 🔵',
      }[issue.severity] || '**[INFO]** ⚪';

      comment += `${severityLabel} **${issue.type}**\n`;
      comment += `${issue.description}\n`;
      comment += `\n💡 **Suggestion:** ${issue.suggestion}\n`;
      
      if (issue.fixedCode) {
        // Ensure valid language for code block
        const validLanguages = ['html', 'javascript', 'jsx', 'typescript', 'tsx', 'vue', 'svelte'];
        const lang = validLanguages.includes(result.language) ? result.language : 'text';
        comment += `\n\`\`\`${lang}\n${issue.fixedCode}\n\`\`\`\n`;
      }
      
      comment += `\n---\n\n`;
    }
  }

  comment += `\n> 🤖 This review was automatically generated by [AccessLint PR Bot](https://github.com/tryzens/accesslint-pr-bot). `;
  comment += `A fix PR will be created shortly with suggested corrections.`;

  return comment;
}

/**
 * Create a pull request with accessibility fixes
 */
async function createFixPullRequest(owner, repo, originalPRNumber, originalPR, filesToFix) {
  const branchName = `accesslint/fix-pr-${originalPRNumber}-${Date.now()}`;
  const sourceBranch = originalPR.head.ref; // Branch to create fixes on top of
  const targetBranch = originalPR.head.ref; // Target the same branch as the source branch
  //const targetBranch = originalPR.base.ref; // Branch the original PR targets (usually main)
  
  try {
    // Create new branch from the PR's head branch (where changes are)
    await createBranch(owner, repo, branchName, sourceBranch);

    // Apply fixes to each file
    for (const file of filesToFix) {
      console.log(`[FIX] Generating fixes for ${file.path}...`);
      
      const fixedContent = await generateFixes(
        file.path,
        file.content,
        file.issues,
        file.language
      );

      // Get current SHA for the file in the new branch
      let currentSha = file.sha; // Use original SHA as fallback
      try {
        const { getFileContentWithSha } = await import('./github-client.js');
        const fileInfo = await getFileContentWithSha(owner, repo, file.path, branchName);
        if (fileInfo) {
          currentSha = fileInfo.sha;
        }
      } catch (e) {
        // File might not exist, that's okay - will create new file
        console.log(`[INFO] Could not get SHA for ${file.path}, will create/update without SHA`);
      }

      await createOrUpdateFile(
        owner,
        repo,
        file.path,
        fixedContent,
        branchName,
        `fix(a11y): Fix accessibility issues in ${file.path}`,
        currentSha
      );
    }

    // Create the fix PR targeting the same base as the original PR
    const fixPR = await createPullRequest(
      owner,
      repo,
      `Fix accessibility issues from PR #${originalPRNumber}`,
      `This PR automatically fixes accessibility issues found in PR #${originalPRNumber}.\n\n` +
      `**Issues fixed:**\n` +
      filesToFix.map(f => `- ${f.path} (${f.issues.length} issue(s))`).join('\n') +
      `\n\n---\n` +
      `🤖 Auto-generated by [AccessLint PR Bot](https://github.com/tryzens/accesslint-pr-bot)\n\n` +
      `> 💡 **Note:** This PR can be merged independently or the fixes can be cherry-picked into PR #${originalPRNumber}`,
      branchName,
      targetBranch
    );

    console.log(`[SUCCESS] Created fix PR #${fixPR.number}: ${fixPR.html_url}`);
    
    return fixPR;
  } catch (error) {
    console.error('[ERROR:PR_CREATION] Failed to create fix PR:', error.message);
    throw error;
  }
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