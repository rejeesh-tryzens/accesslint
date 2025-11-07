import dotenv from 'dotenv';

dotenv.config();

export const config = {
  github: {
    token: process.env.GITHUB_TOKEN,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
  },
  bot: {
    name: process.env.BOT_NAME || 'accesslint-bot',
    email: process.env.BOT_EMAIL || 'accesslint-bot@tryzens.com',
  },
  accessibility: {
    // Focus on these accessibility areas
    focusAreas: [
      'ARIA attributes',
      'semantic HTML',
      'keyboard navigation',
      'color contrast',
      'alt text for images',
      'form labels',
      'heading structure',
      'focus management',
    ],
  },
};

// Validate required environment variables
export function validateConfig() {
  const required = ['GITHUB_TOKEN', 'ANTHROPIC_API_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

