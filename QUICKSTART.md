# Quick Start Guide 🚀

Get your AccessLint PR Bot up and running in 5 minutes!

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Get Your API Keys

### GitHub Token
1. Go to https://github.com/settings/tokens
2. Click "Generate new token" → "Generate new token (classic)"
3. Select permissions:
   - `repo` (full control)
   - Or `public_repo` (if only using public repos)
4. Copy the token

### Anthropic API Key
1. Go to `https://console.anthropic.com/`
2. Create an API key
3. Copy the key

## Step 3: Configure Environment

Copy the example file:
```bash
cp env.example .env
```

Edit `.env` and add your keys:
```env
GITHUB_TOKEN=ghp_your_github_token_here
ANTHROPIC_API_KEY=your_anthropic_key_here
PORT=3000
```

## Step 4: Start the Bot

```bash
npm start
```

You should see:
```
🚀 AccessLint PR Bot running on port 3000
📡 Webhook endpoint: http://localhost:3000/webhook
```

## Step 5: Test It!

### Option A: Manual Review (Testing)
```bash
curl -X POST http://localhost:3000/review/owner/repo/123
```

Replace:
- `owner` - GitHub username/org
- `repo` - Repository name  
- `123` - PR number

### Option B: Setup Webhook (Production)

1. In your GitHub repo, go to **Settings → Webhooks**
2. Click **Add webhook**
3. Set:
   - **Payload URL**: `https://your-domain.com/webhook` (or use ngrok for local testing)
   - **Content type**: `application/json`
   - **Events**: Select `Pull requests`
   - **Secret**: (optional) Add a secret and update `.env`
4. Click **Add webhook**

## Local Testing with ngrok

If testing locally, use ngrok to expose your localhost:

```bash
# Install ngrok
npm install -g ngrok

# Expose local port
ngrok http 3000

# Use the ngrok URL in GitHub webhook settings
```

## What Happens Next?

1. ✨ When a PR is opened/updated, the bot analyzes it
2. 📝 Posts a detailed review comment with accessibility issues
3. 🔧 If issues found, creates a new PR with AI-generated fixes
4. ✅ You review and merge the fix PR!

## Troubleshooting

**"Missing required environment variables"**
- Make sure `.env` file exists and has all required keys

**"GITHUB_TOKEN is not configured"**
- Check your `.env` file has the correct token

**Webhook not working**
- Verify the webhook URL is accessible
- Check webhook secret matches (if configured)
- Look at bot logs for errors

**AI analysis failing**
- Verify Anthropic API key is correct
- Check you have credits in your Anthropic account
- Ensure model is set correctly in `.env` (e.g., `ANTHROPIC_MODEL=claude-sonnet-4-5-20250929`)

## Next Steps

- Read the full [README.md](README.md) for advanced configuration
- Customize focus areas in `src/config.js`
- Set up monitoring and error handling for production

Happy hacking! 🎉

