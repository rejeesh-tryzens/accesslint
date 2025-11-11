import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
  timeout: 120000,
  maxRetries: 2,
});

/**
 * Analyze code changes for accessibility issues using AI
 * Only analyzes the changed code from git diff
 */
export async function analyzeAccessibility(filePath, oldContent, newContent, language) {
  const focusAreas = config.accessibility.focusAreas.join(', ');
  
  const prompt = `You are an expert accessibility (a11y) reviewer. Analyze the following code changes from a git diff for accessibility issues.

Focus areas: ${focusAreas}

File: ${filePath}
Language: ${language}

Changed code:
\`\`\`${language}
${newContent}
\`\`\`

Please provide:
1. A list of accessibility issues found (if any)
2. Specific suggestions for fixes
3. Prioritize issues by severity (critical, high, medium, low)
4. Provide code examples for fixes

Format your response as valid JSON:
{
  "hasIssues": boolean,
  "issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "type": "string",
      "description": "string",
      "suggestion": "string",
      "fixedCode": "string" (optional code example)
    }
  ],
  "summary": "string"
}

IMPORTANT: Return ONLY valid JSON. All quotes inside string values must be escaped with \\". No trailing commas.`;

  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: config.anthropic.model,
        system: 'You are an expert web accessibility consultant. You review code changes from git diff and identify accessibility issues. You MUST respond with valid, complete JSON only. All strings must have properly escaped quotes (use \\" for quotes inside strings). No trailing commas.',
        messages: [
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const content = response.content?.[0]?.type === 'text' ? response.content[0].text : '';
      const jsonContent = extractJSON(content);
      
      try {
        return JSON.parse(jsonContent);
      } catch (parseError) {
        // Try to fix common JSON issues
        const fixedJson = fixJSON(jsonContent);
        try {
          return JSON.parse(fixedJson);
        } catch (secondError) {
          console.error('Failed to parse JSON:', parseError.message);
          console.error('JSON content (first 500 chars):', jsonContent.substring(0, 500));
          throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
        }
      }
      
    } catch (apiError) {
      lastError = apiError;
      
      // Don't retry on auth errors
      if (apiError.status === 401 || apiError.status === 403 || apiError.status === 400) {
        throw apiError;
      }
      
      // Retry on network errors, timeouts, and server errors
      if (attempt < maxRetries && (
        apiError.code === 'ECONNABORTED' || 
        apiError.message?.includes('timeout') || 
        apiError.message?.includes('aborted') ||
        apiError.status >= 500 ||
        apiError.status === 429
      )) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.warn(`⚠️  API request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw apiError;
    }
  }
  
  // Handle specific error types
  if (lastError?.code === 'ECONNABORTED' || lastError?.message?.includes('timeout')) {
    throw new Error(`AI analysis failed: Request timed out after ${maxRetries} attempts.`);
  }
  
  if (lastError?.status === 429) {
    throw new Error(`AI analysis failed: Rate limit exceeded.`);
  }
  
  if (lastError?.status === 401 || lastError?.status === 403) {
    throw new Error(`AI analysis failed: Authentication error. Please check your ANTHROPIC_API_KEY.`);
  }
  
  throw new Error(`AI analysis failed: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Extract JSON from response (handles markdown code blocks)
 */
function extractJSON(content) {
  let jsonContent = content.trim();
  
  // Remove markdown code blocks
  if (jsonContent.includes('```')) {
    const firstBacktick = jsonContent.indexOf('```');
    const lastBacktick = jsonContent.lastIndexOf('```');
    
    if (firstBacktick !== -1 && lastBacktick !== -1 && lastBacktick > firstBacktick) {
      let afterFirst = jsonContent.substring(firstBacktick + 3);
      // Skip language identifier
      const braceIndex = afterFirst.indexOf('{');
      if (braceIndex !== -1) {
        afterFirst = afterFirst.substring(braceIndex);
      }
      // Remove trailing ```
      jsonContent = afterFirst.replace(/```\s*$/, '').trim();
    }
  }
  
  // Find JSON object boundaries if needed
  if (!jsonContent.startsWith('{')) {
    const jsonStart = jsonContent.indexOf('{');
    const jsonEnd = jsonContent.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
    }
  }
  
  return jsonContent.trim();
}

/**
 * Fix common JSON issues
 */
function fixJSON(jsonContent) {
  // Remove trailing commas
  let fixed = jsonContent.replace(/,(\s*[}\]])/g, '$1');
  
  // Fix missing commas between objects/arrays
  fixed = fixed.replace(/}\s*{/g, '},{');
  fixed = fixed.replace(/\]\s*\[/g, '],[');
  
  return fixed;
}

/**
 * Generate fix suggestions for changed code
 */
export async function generateFixes(filePath, content, issues, language) {
  if (!issues || issues.length === 0) {
    return content;
  }

  const issuesText = issues.map((issue, idx) => 
    `${idx + 1}. [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}\n   Fix: ${issue.suggestion}${issue.fixedCode ? `\n   Example:\n\`\`\`${language}\n${issue.fixedCode}\n\`\`\`` : ''}`
  ).join('\n\n');

  const prompt = `You are an expert accessibility developer. Fix the following code based on the accessibility issues identified.

File: ${filePath}
Language: ${language}

Changed code from git diff:
\`\`\`${language}
${content}
\`\`\`

Issues to fix:
${issuesText}

Please provide the COMPLETE fixed code. Only output the fixed code, wrapped in a code block. Do not add explanations outside the code block.`;

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
