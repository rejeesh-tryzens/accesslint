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
    });

    const content = response.content?.[0]?.type === 'text' ? response.content[0].text : '';
    
    // Extract JSON from markdown code blocks if present
    let jsonContent = content.trim();
    
    // Simple and reliable extraction: find content between first and last ```
    if (jsonContent.includes('```')) {
      const firstBacktick = jsonContent.indexOf('```');
      const lastBacktick = jsonContent.lastIndexOf('```');
      
      if (firstBacktick !== -1 && lastBacktick !== -1 && lastBacktick > firstBacktick) {
        // Get everything after the first ```
        let afterFirst = jsonContent.substring(firstBacktick + 3);
        
        // Skip language identifier (like "json") - find first newline or first {
        const newlineAfterLang = afterFirst.indexOf('\n');
        const braceAfterLang = afterFirst.indexOf('{');
        
        let contentStart = 0;
        if (newlineAfterLang !== -1) {
          contentStart = newlineAfterLang + 1;
        } else if (braceAfterLang !== -1) {
          contentStart = braceAfterLang;
        } else {
          // No newline or brace, skip any whitespace
          const match = afterFirst.match(/\S/);
          if (match && match.index !== undefined) {
            contentStart = match.index;
          }
        }
        
        // Get content from start position to before the last ```
        // The last ``` is at position (lastBacktick - firstBacktick - 3) in afterFirst
        const endPosInAfterFirst = lastBacktick - firstBacktick - 3;
        
        if (endPosInAfterFirst > contentStart) {
          jsonContent = afterFirst.substring(contentStart, endPosInAfterFirst).trim();
        } else {
          // Fallback: use simpler calculation - just remove trailing ```
          jsonContent = afterFirst.substring(contentStart).replace(/```\s*$/, '').trim();
        }
      }
    }
    
    // If still no valid JSON, try to find JSON object boundaries
    if (!jsonContent.startsWith('{') && !jsonContent.startsWith('[')) {
      const jsonStart = jsonContent.indexOf('{');
      const jsonEnd = jsonContent.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonContent = jsonContent.substring(jsonStart, jsonEnd + 1);
      }
    }
    
    // Final aggressive cleanup: remove any remaining markdown artifacts
    jsonContent = jsonContent.trim();
    // Remove any leading ```json or ```
    jsonContent = jsonContent.replace(/^```[a-z]*\s*\n?/i, '');
    jsonContent = jsonContent.replace(/^```\s*\n?/i, '');
    // Remove any trailing ```
    jsonContent = jsonContent.replace(/\n?\s*```$/i, '');
    jsonContent = jsonContent.replace(/\n?```$/i, '');
    jsonContent = jsonContent.trim();
    
    // Try to parse the JSON
    try {
      return JSON.parse(jsonContent);
    } catch (parseError) {
      // Log the content we tried to parse for debugging
      console.error('Failed to parse JSON. Original content length:', content.length);
      console.error('Extracted JSON content (first 300 chars):', jsonContent.substring(0, 300));
      console.error('Extracted JSON content (last 100 chars):', jsonContent.substring(Math.max(0, jsonContent.length - 100)));
      throw new Error(`Failed to parse JSON response: ${parseError.message}`);
    }
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

