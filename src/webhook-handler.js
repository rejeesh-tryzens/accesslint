import crypto from 'crypto';
import { config } from './config.js';
import { reviewPullRequest } from './pr-reviewer.js';

/**
 * Handle GitHub webhook events
 */
export async function handleWebhook(req, res) {
  // Verify webhook signature if secret is configured
  if (config.github.webhookSecret) {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature || !verifySignature(req.body, signature)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
  }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  console.log(`📥 Received ${event} event`);

  // Handle different event types
  switch (event) {
    case 'pull_request':
      await handlePullRequestEvent(payload);
      break;
    
    case 'ping':
      console.log('✅ Webhook configured correctly');
      res.json({ message: 'pong' });
      return;
    
    default:
      console.log(`ℹ️  Ignoring ${event} event`);
      res.json({ message: 'Event ignored' });
      return;
  }

  res.json({ message: 'Webhook processed' });
}

/**
 * Handle pull request events
 */
async function handlePullRequestEvent(payload) {
  const action = payload.action;
  const pr = payload.pull_request;

  // Only review when PR is opened, synchronize (new commits), or reopened
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    console.log(`ℹ️  Ignoring PR ${action} action`);
    return;
  }

  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const prNumber = pr.number;

  console.log(`🔍 Processing PR #${prNumber} (${action})`);

  try {
    await reviewPullRequest(owner, repo, prNumber);
  } catch (error) {
    console.error(`❌ Error processing PR #${prNumber}:`, error);
    // In production, you might want to post an error comment to the PR
  }
}

/**
 * Verify GitHub webhook signature
 */
function verifySignature(body, signature) {
  const hmac = crypto.createHmac('sha256', config.github.webhookSecret);
  const digest = 'sha256=' + hmac.update(JSON.stringify(body)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

