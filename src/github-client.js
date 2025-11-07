import { Octokit } from '@octokit/rest';
import { config } from './config.js';

let octokit = null;

export function getOctokit() {
  if (!octokit) {
    if (!config.github.token) {
      throw new Error('GITHUB_TOKEN is not configured');
    }
    octokit = new Octokit({
      auth: config.github.token,
    });
  }
  return octokit;
}

/**
 * Get PR details including files changed
 */
export async function getPullRequest(owner, repo, prNumber) {
  const octokit = getOctokit();
  
  const [pr, files] = await Promise.all([
    octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    }),
    octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    }),
  ]);

  return {
    ...pr.data,
    files: files.data,
  };
}

/**
 * Get file content from repository
 */
export async function getFileContent(owner, repo, path, ref = 'main') {
  const octokit = getOctokit();
  
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    
    if (Array.isArray(response.data)) {
      return null; // Directory, not a file
    }
    
    return Buffer.from(response.data.content, 'base64').toString('utf-8');
  } catch (error) {
    if (error.status === 404) {
      return null; // File doesn't exist
    }
    throw error;
  }
}

/**
 * Get file content and SHA from repository
 */
export async function getFileContentWithSha(owner, repo, path, ref = 'main') {
  const octokit = getOctokit();
  
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });
    
    if (Array.isArray(response.data)) {
      return null; // Directory, not a file
    }
    
    return {
      content: Buffer.from(response.data.content, 'base64').toString('utf-8'),
      sha: response.data.sha,
    };
  } catch (error) {
    if (error.status === 404) {
      return null; // File doesn't exist
    }
    throw error;
  }
}

/**
 * Create a new branch
 */
export async function createBranch(owner, repo, branchName, fromRef = 'main') {
  const octokit = getOctokit();
  
  // Get the SHA of the base branch
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${fromRef}`,
  });

  // Create new branch
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: refData.object.sha,
  });

  return branchName;
}

/**
 * Create or update a file in the repository
 */
export async function createOrUpdateFile(owner, repo, path, content, branch, message, sha = null) {
  const octokit = getOctokit();
  
  const fileContent = Buffer.from(content).toString('base64');
  
  const params = {
    owner,
    repo,
    path,
    message,
    content: fileContent,
    branch,
  };

  if (sha) {
    params.sha = sha;
  }

  await octokit.repos.createOrUpdateFileContents(params);
}

/**
 * Create a pull request
 */
export async function createPullRequest(owner, repo, title, body, head, base = 'main') {
  const octokit = getOctokit();
  
  const { data } = await octokit.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
  });

  return data;
}

/**
 * Create a comment on a PR
 */
export async function createPRComment(owner, repo, prNumber, body) {
  const octokit = getOctokit();
  
  const { data } = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  });

  return data;
}

