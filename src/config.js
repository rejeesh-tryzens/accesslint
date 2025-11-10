import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try multiple paths to find .env file
const possiblePaths = [
  join(__dirname, '..', '.env'),  // From src/config.js -> project root
  resolve(process.cwd(), '.env'),  // From current working directory
  '.env',                          // Relative to cwd
];

let envPath = null;
for (const path of possiblePaths) {
  if (existsSync(path)) {
    envPath = path;
    break;
  }
}

if (!envPath) {
  console.error('❌ .env file not found in any of these locations:');
  possiblePaths.forEach(p => console.error(`   - ${p}`));
} else {
  console.log(`✅ Found .env file at: ${envPath}`);
  // Try to read first few lines to verify file is readable
  try {
    const fileContent = readFileSync(envPath, 'utf8');
    const lines = fileContent.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    console.log(`   File is readable, found ${lines.length} non-comment lines`);
    if (lines.length > 0) {
      console.log(`   First line: ${lines[0].substring(0, 50)}...`);
    }
  } catch (err) {
    console.error(`   Error reading file: ${err.message}`);
  }
}

// Load environment variables
// First, try to read and clean the file if it has BOM
let cleanedEnvPath = envPath || possiblePaths[0];
try {
  // Read file as buffer first to detect encoding
  const fileBuffer = readFileSync(cleanedEnvPath);
  let fileContent;
  let needsRewrite = false;
  
  // Check for BOM and handle encoding
  if (fileBuffer[0] === 0xFF && fileBuffer[1] === 0xFE) {
    // UTF-16 LE BOM
    console.log('   Detected UTF-16 LE BOM, converting to UTF-8...');
    fileContent = fileBuffer.slice(2).toString('utf16le');
    needsRewrite = true;
  } else if (fileBuffer[0] === 0xFE && fileBuffer[1] === 0xFF) {
    // UTF-16 BE BOM
    console.log('   Detected UTF-16 BE BOM, converting to UTF-8...');
    // Convert BE to LE first, then decode
    const leBuffer = Buffer.alloc(fileBuffer.length - 2);
    for (let i = 2; i < fileBuffer.length; i += 2) {
      leBuffer[i - 2] = fileBuffer[i + 1];
      leBuffer[i - 1] = fileBuffer[i];
    }
    fileContent = leBuffer.toString('utf16le');
    needsRewrite = true;
  } else if (fileBuffer[0] === 0xEF && fileBuffer[1] === 0xBB && fileBuffer[2] === 0xBF) {
    // UTF-8 BOM
    console.log('   Detected UTF-8 BOM, removing...');
    fileContent = fileBuffer.slice(3).toString('utf8');
    needsRewrite = true;
  } else {
    // No BOM, read as UTF-8
    fileContent = fileBuffer.toString('utf8');
    // Still check for \uFEFF character (just in case)
    const cleanedContent = fileContent.replace(/^\uFEFF/, '');
    if (fileContent !== cleanedContent) {
      fileContent = cleanedContent;
      needsRewrite = true;
      console.log('   Removed Unicode BOM character');
    }
  }
  
  if (needsRewrite) {
    console.log('   Rewriting .env file in UTF-8 without BOM...');
    writeFileSync(cleanedEnvPath, fileContent, 'utf8');
  }
} catch (err) {
  // If we can't read it, dotenv will handle the error
  console.warn(`   Could not pre-process .env file: ${err.message}`);
}

// Load environment variables using dotenv
if (envPath) {
  const result = dotenv.config({ 
    path: envPath,
    override: false, // Don't override existing env vars
  });

  if (result.error) {
    console.error('❌ Error loading .env file:', result.error.message);
  } else if (result.parsed) {
    console.log(`✅ .env file loaded successfully (${Object.keys(result.parsed).length} variables)`);
  } else {
    console.warn('⚠️  dotenv.config() returned no parsed variables');
    console.warn('   This might indicate the file is empty or has parsing issues');
  }
} else {
  // Try loading from default location if no .env found
  const result = dotenv.config({ 
    override: false,
  });
  if (result.parsed && Object.keys(result.parsed).length > 0) {
    console.log(`✅ Loaded ${Object.keys(result.parsed).length} environment variables from default .env location`);
  }
}

// Debug: Check if token is loaded (without exposing the actual token)
if (!process.env.GITHUB_TOKEN) {
  console.warn('⚠️  WARNING: GITHUB_TOKEN not found in environment variables');
  console.warn('   Make sure .env file exists and contains: GITHUB_TOKEN=your_token_here');
  console.warn(`   Current working directory: ${process.cwd()}`);
  console.warn(`   Environment keys found: ${Object.keys(process.env).filter(k => k.includes('GITHUB') || k.includes('ANTHROPIC')).join(', ') || 'none'}`);
} else {
  console.log('✅ GITHUB_TOKEN loaded successfully');
}

export const config = {
  github: {
    token: process.env.GITHUB_TOKEN,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
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

