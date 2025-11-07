import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

/**
 * Analyze code changes for accessibility issues using AI
 */
export async function analyzeAccessibility(filePath, oldContent, newContent, language) {
  const focusAreas = config.accessibility.focusAreas.join(', ');
  
  const prompt = `You are an expert accessibility (a11y) reviewer. Analyze the following code changes for accessibility issues.

Focus areas: ${focusAreas}

File: ${filePath}
Language: ${language}

${oldContent ? `Old content:\n\`\`\`${language}\n${oldContent}\n\`\`\`\n\n` : ''}New content:
\`\`\`${language}
${newContent}
\`\`\`

Please provide:
1. A list of accessibility issues found (if any)
2. Specific suggestions for fixes
3. Prioritize issues by severity (critical, high, medium, low)
4. Provide code examples for fixes

Format your response as JSON:
{
  "hasIssues": boolean,
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "type": "string",
      "description": "string",
      "line": number (if applicable),
      "suggestion": "string",
      "fixedCode": "string" (optional code example)
    }
  ],
  "summary": "string"
}`;

  try {
    const response = await anthropic.messages.create({
      model: config.anthropic.model,
      system: 'You are an expert web accessibility consultant. You review code changes and identify accessibility issues, providing actionable fixes with code examples. Always respond with valid JSON.',
      messages: [
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.content?.[0]?.type === 'text' ? response.content[0].text : '';
    return JSON.parse(content);
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw new Error(`AI analysis failed: ${error.message}`);
  }
}

/**
 * Generate fix suggestions for a file
 */
export async function generateFixes(filePath, content, issues, language) {
  if (!issues || issues.length === 0) {
    return content; // No fixes needed
  }

  const issuesText = issues.map((issue, idx) => 
    `${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}\n   Fix: ${issue.suggestion}${issue.fixedCode ? `\n   Example:\n\`\`\`${language}\n${issue.fixedCode}\n\`\`\`` : ''}`
  ).join('\n\n');

  const prompt = `You are an expert accessibility developer. Fix the following code based on the accessibility issues identified.

File: ${filePath}
Language: ${language}

Current code:
\`\`\`${language}
${content}
\`\`\`

Issues to fix:
${issuesText}

Please provide the COMPLETE fixed code file. Only output the fixed code, wrapped in a code block. Do not add explanations outside the code block.`;

  try {
    const response = await anthropic.messages.create({
      model: config.anthropic.model,
      system: 'You are an expert accessibility developer. You fix code to meet WCAG 2.1 AA standards. Always provide complete, working code.',
      messages: [
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    });

    const text = response.content?.[0]?.type === 'text' ? response.content[0].text : '';
    const codeMatch = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
    return codeMatch ? codeMatch[1].trim() : text.trim();
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw new Error(`Fix generation failed: ${error.message}`);
  }
}

