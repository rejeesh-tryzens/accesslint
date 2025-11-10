import express from 'express';
import { handleWebhook } from './webhook-handler.js';
import { reviewPullRequest } from './pr-reviewer.js';
import { validateConfig } from './config.js';

// Validate configuration at startup
try {
  validateConfig();
  console.log('✅ Configuration validated successfully');
} catch (error) {
  console.error('❌ Configuration error:', error.message);
  console.error('   Please check your .env file and ensure all required variables are set');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'AccessLint PR Bot' });
});

// Webhook endpoint for GitHub
app.post('/webhook', async (req, res) => {
  try {
    await handleWebhook(req, res);
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manual review endpoint (for testing)
app.post('/review/:owner/:repo/:prNumber', async (req, res) => {
  try {
    const { owner, repo, prNumber } = req.params;
    const result = await reviewPullRequest(owner, repo, parseInt(prNumber));
    res.json(result);
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 AccessLint PR Bot running on port ${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
});

