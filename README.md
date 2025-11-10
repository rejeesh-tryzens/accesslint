# AccessLint PR Bot 🤖

An AI-powered accessibility (a11y) PR reviewer bot that automatically reviews pull requests for accessibility issues and creates fix PRs with suggested corrections.

## 🎯 Features

- **Automated Accessibility Reviews**: Uses AI (Anthropic Claude) to analyze code changes for accessibility issues
- **Smart Issue Detection**: Identifies problems with ARIA attributes, semantic HTML, keyboard navigation, color contrast, alt text, form labels, and more
- **Automatic Fix Generation**: Creates new PRs with AI-generated fixes for accessibility issues
- **GitHub Integration**: Works via webhooks or manual API calls
- **Detailed Reviews**: Provides severity-based issue categorization and code suggestions

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- GitHub Personal Access Token with repo permissions
- Anthropic API Key

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd AccessLint
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
GITHUB_TOKEN=ghp_your_token_here
ANTHROPIC_API_KEY=your_anthropic_key_here
GITHUB_WEBHOOK_SECRET=your_optional_secret
PORT=3000
```

### Running the Bot

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

## 🔧 Setup

### GitHub Webhook Configuration

1. Go to your repository Settings → Webhooks
2. Click "Add webhook"
3. Set the Payload URL to: `https://your-domain.com/webhook`
4. Set Content type to: `application/json`
5. Select events: `Pull requests`
6. (Optional) Add a secret and update `GITHUB_WEBHOOK_SECRET` in `.env`

### GitHub Token Permissions

Your GitHub token needs these permissions:
- `repo` (full control of private repositories)
  - `public_repo` (if working with public repos)
- `pull_requests` (read and write)
- `contents` (read and write)

## 📖 Usage

### Automatic Reviews (via Webhook)

Once the webhook is configured, the bot will automatically:
1. Review PRs when they are opened, updated, or reopened
2. Post a review comment with all findings
3. Create a fix PR if issues are found

### Manual Reviews

You can trigger a review manually via API:

```bash
curl -X POST http://localhost:3000/review/owner/repo/123
```

Or use the endpoint in your code:
```
POST /review/:owner/:repo/:prNumber
```

## 🎨 How It Works

1. **PR Detection**: Bot receives webhook when PR is created/updated
2. **File Analysis**: Analyzes changed files (HTML, JS, JSX, TS, TSX, Vue, Svelte)
3. **AI Review**: Sends code to Anthropic Claude for accessibility analysis
4. **Issue Reporting**: Posts comprehensive review comment on PR
5. **Fix Generation**: If issues found, generates fixes using AI
6. **Fix PR Creation**: Creates a new branch and PR with suggested fixes

## 📋 Review Focus Areas

The bot checks for:
- ✅ ARIA attributes and roles
- ✅ Semantic HTML elements
- ✅ Keyboard navigation support
- ✅ Color contrast compliance
- ✅ Alt text for images
- ✅ Form labels and accessibility
- ✅ Heading structure
- ✅ Focus management

## 🔍 Example Output

The bot provides:
- **Issue Summary**: Total count by severity
- **File-by-File Analysis**: Detailed issues per file
- **Severity Levels**: Critical, High, Medium, Low
- **Code Suggestions**: Specific fix recommendations with examples
- **Fix PR**: Automatic PR with corrected code

## 🛠️ Configuration

Edit `src/config.js` to customize:
- Focus areas for accessibility review
- AI model selection
- Bot name and email

## 📝 API Endpoints

- `GET /health` - Health check
- `POST /webhook` - GitHub webhook handler
- `POST /review/:owner/:repo/:prNumber` - Manual review trigger

## 🤝 Contributing

This project was created for Tryzens Hackathon 2025. Contributions are welcome!

## 📄 License

MIT

## 🙏 Acknowledgments

Built for Tryzens Hackathon 2025

---

**Note**: This bot requires OpenAI API credits. Monitor your usage to avoid unexpected costs.

