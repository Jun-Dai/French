#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Simple YAML parser for our specific format
function parseYAML(yamlContent) {
  const idioms = [];
  const lines = yamlContent.split('\n');
  let currentIdiom = null;
  let currentExample = null;
  let indent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Detect new idiom entry
    if (trimmed.startsWith('- idiom:')) {
      if (currentIdiom) {
        idioms.push(currentIdiom);
      }
      currentIdiom = {
        idiom: trimmed.replace('- idiom:', '').trim().replace(/^["']|["']$/g, ''),
        examples: {}
      };
      currentExample = null;
      continue;
    }

    if (!currentIdiom) continue;

    // Parse other fields
    if (trimmed.startsWith('literal:')) {
      currentIdiom.literal = trimmed.replace('literal:', '').trim().replace(/^["']|["']$/g, '');
    } else if (trimmed.startsWith('meaning:')) {
      currentIdiom.meaning = trimmed.replace('meaning:', '').trim().replace(/^["']|["']$/g, '');
    } else if (trimmed.startsWith('difficulty:')) {
      currentIdiom.difficulty = parseInt(trimmed.replace('difficulty:', '').trim());
    } else if (trimmed.startsWith('frequency:')) {
      currentIdiom.frequency = parseInt(trimmed.replace('frequency:', '').trim());
    } else if (trimmed.startsWith('context:')) {
      currentIdiom.context = trimmed.replace('context:', '').trim().replace(/^["']|["']$/g, '');
    } else if (trimmed.startsWith('register:')) {
      currentIdiom.register = trimmed.replace('register:', '').trim().replace(/^["']|["']$/g, '');
    } else if (trimmed.startsWith('category:')) {
      currentIdiom.category = trimmed.replace('category:', '').trim().replace(/^["']|["']$/g, '');
    } else if (trimmed === 'examples:') {
      // Starting examples section
      continue;
    } else if (trimmed.match(/^[abc]:$/)) {
      // Example level (a:, b:, c:)
      currentExample = trimmed.replace(':', '');
      currentIdiom.examples[currentExample] = {};
    } else if (currentExample && trimmed.startsWith('french:')) {
      currentIdiom.examples[currentExample].french = trimmed.replace('french:', '').trim().replace(/^["']|["']$/g, '');
    } else if (currentExample && trimmed.startsWith('english:')) {
      currentIdiom.examples[currentExample].english = trimmed.replace('english:', '').trim().replace(/^["']|["']$/g, '');
    }
  }

  // Add last idiom
  if (currentIdiom) {
    idioms.push(currentIdiom);
  }

  return idioms;
}

// Filter idioms based on criteria
function filterIdioms(idioms, filters) {
  if (!filters || filters.length === 0) return idioms;

  // Validate filter properties first
  const validProperties = ['freq', 'diff', 'context', 'register', 'category'];
  for (const filter of filters) {
    const match = filter.match(/^(\w+):(.+)$/);
    if (!match) {
      console.error(`Error: Invalid filter format: ${filter}`);
      console.error(`Expected format: property:value (e.g., freq:<20, category:emotions)`);
      process.exit(1);
    }
    const [, property] = match;
    if (!validProperties.includes(property)) {
      console.error(`Error: Unknown filter property: ${property}`);
      console.error(`Valid properties: ${validProperties.join(', ')}`);
      process.exit(1);
    }
  }

  return idioms.filter(idiom => {
    for (const filter of filters) {
      const match = filter.match(/^(\w+):(.+)$/);
      const [, property, value] = match;

      // Handle numeric ranges and comparisons
      if (property === 'freq' || property === 'diff') {
        const prop = property === 'freq' ? 'frequency' : 'difficulty';
        const idiomValue = idiom[prop];

        // Range: 20-40
        if (value.includes('-')) {
          const [min, max] = value.split('-').map(Number);
          if (idiomValue < min || idiomValue > max) return false;
        }
        // Less than: <20
        else if (value.startsWith('<')) {
          const threshold = Number(value.substring(1));
          if (idiomValue >= threshold) return false;
        }
        // Greater than: >20
        else if (value.startsWith('>')) {
          const threshold = Number(value.substring(1));
          if (idiomValue <= threshold) return false;
        }
        // Exact match
        else {
          const target = Number(value);
          if (idiomValue !== target) return false;
        }
      }
      // Handle string matches
      else if (property === 'context' || property === 'register' || property === 'category') {
        const idiomValue = idiom[property] || '';
        // Case-insensitive partial match
        if (!idiomValue.toLowerCase().includes(value.toLowerCase())) return false;
      }
    }

    return true;
  });
}

// Sort idioms
function sortIdioms(idioms, sortBy) {
  if (!sortBy) return idioms;

  const sorted = [...idioms];

  switch (sortBy) {
    case 'alpha':
      sorted.sort((a, b) => a.idiom.localeCompare(b.idiom, 'fr'));
      break;
    case 'freq':
      sorted.sort((a, b) => a.frequency - b.frequency);
      break;
    case 'diff':
      sorted.sort((a, b) => a.difficulty - b.difficulty);
      break;
    case 'category':
      sorted.sort((a, b) => {
        const catCompare = (a.category || '').localeCompare(b.category || '');
        if (catCompare !== 0) return catCompare;
        return a.idiom.localeCompare(b.idiom, 'fr');
      });
      break;
    case 'random':
      for (let i = sorted.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      }
      break;
    default:
      console.error(`Unknown sort option: ${sortBy}`);
  }

  return sorted;
}

// Format output based on template
function formatOutput(idioms, template) {
  if (!template) {
    // Default format: just the idiom
    template = '{i}';
  }

  const output = [];

  for (const idiom of idioms) {
    // Handle escape sequences first
    let formatted = template.replace(/\\n/g, '\n').replace(/\\t/g, '\t');

    // Create a mapping of placeholders to values
    const values = {
      'i': idiom.idiom || '',
      'l': idiom.literal || '',
      'm': idiom.meaning || '',
      'd': String(idiom.difficulty || ''),
      'f': String(idiom.frequency || ''),
      'r': idiom.register || '',
      'ctx': idiom.context || '',
      'cat': idiom.category || '',
      'a': idiom.examples.a?.french || '',
      'b': idiom.examples.b?.french || '',
      'c': idiom.examples.c?.french || '',
      'A': idiom.examples.a?.english || '',
      'B': idiom.examples.b?.english || '',
      'C': idiom.examples.c?.english || ''
    };

    // Replace placeholders in {placeholder} format
    formatted = formatted.replace(/\{([^}]+)\}/g, (match, key) => {
      return values[key] !== undefined ? values[key] : match;
    });

    output.push(formatted);
  }

  return output.join('\n');
}

// Escape special LaTeX characters
function escapeLatex(text) {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/[&%$#_{}]/g, '\\$&')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/\n/g, '\n\n'); // Double newline for paragraph breaks
}

// Generate LaTeX document from idioms
function generateLatex(idioms) {
  const latex = `\\documentclass[11pt,a4paper]{article}
\\usepackage{fontspec}
\\usepackage[french]{babel}
\\usepackage[margin=1in]{geometry}
\\usepackage{fancyhdr}
\\usepackage{xcolor}
\\usepackage{enumitem}
\\usepackage{titlesec}

% Set main font (using default if specific font not available)
\\setmainfont{Latin Modern Roman}

% Page setup
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\textit{Expressions Françaises}}
\\fancyhead[R]{\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}

% Colors
\\definecolor{idiomcolor}{RGB}{44, 62, 80}
\\definecolor{literalcolor}{RGB}{127, 140, 141}
\\definecolor{metacolor}{RGB}{52, 73, 94}

% Custom section formatting
\\titleformat{\\section}
  {\\Large\\bfseries\\color{idiomcolor}}
  {}{0em}{}[\\vspace{-0.5em}\\rule{\\textwidth}{0.4pt}]
\\titlespacing*{\\section}{0pt}{1.5em}{0.5em}

% Document
\\begin{document}

% Title page
\\begin{titlepage}
  \\centering
  \\vspace*{2cm}
  {\\Huge\\bfseries Expressions Françaises\\par}
  \\vspace{1cm}
  {\\Large Une collection de ${idioms.length} expressions idiomatiques\\par}
  \\vspace{2cm}
  {\\large Niveau: B2--C2+\\par}
  \\vfill
  {\\large \\today\\par}
\\end{titlepage}

\\tableofcontents
\\newpage

${idioms.map((idiom, idx) => `
\\section{${escapeLatex(idiom.idiom)}}

{\\color{literalcolor}\\textit{${escapeLatex(idiom.literal)}}}

\\vspace{0.5em}

\\textbf{Signification:} ${escapeLatex(idiom.meaning)}

\\vspace{0.5em}

{\\small\\color{metacolor}
\\textbf{Difficulté:} ${idiom.difficulty}/100 \\quad
\\textbf{Fréquence:} ${idiom.frequency}/100 \\quad
\\textbf{Registre:} ${escapeLatex(idiom.register)} \\quad
\\textbf{Contexte:} ${escapeLatex(idiom.context)}
${idiom.category ? `\\quad \\textbf{Catégorie:} ${escapeLatex(idiom.category)}` : ''}
}

\\vspace{0.5em}

\\textbf{Exemples:}

\\begin{enumerate}[leftmargin=*, label=\\textbf{\\alph*.}, itemsep=0.3em]
${idiom.examples.a ? `
  \\item \\textit{${escapeLatex(idiom.examples.a.french)}}

  ${escapeLatex(idiom.examples.a.english)}
` : ''}
${idiom.examples.b ? `
  \\item \\textit{${escapeLatex(idiom.examples.b.french)}}

  ${escapeLatex(idiom.examples.b.english)}
` : ''}
${idiom.examples.c ? `
  \\item \\textit{${escapeLatex(idiom.examples.c.french)}}

  ${escapeLatex(idiom.examples.c.english)}
` : ''}
\\end{enumerate}

${idx < idioms.length - 1 ? '\\vspace{1em}\n' : ''}
`).join('\n')}

\\end{document}`;

  return latex;
}

// Generate PDF using XeLaTeX
function generatePDF(idioms, outputPath) {
  const fs = require('fs');
  const { execSync } = require('child_process');
  const path = require('path');

  // Check if xelatex is available
  try {
    execSync('which xelatex', { stdio: 'ignore' });
  } catch (error) {
    console.error('Error: XeLaTeX is not installed.');
    console.error('');
    console.error('To install on Ubuntu/Debian:');
    console.error('  sudo apt-get install texlive-xetex texlive-lang-french texlive-fonts-recommended');
    console.error('');
    console.error('To install on macOS:');
    console.error('  brew install --cask mactex-no-gui');
    process.exit(1);
  }

  // Generate LaTeX source
  const latex = generateLatex(idioms);
  const tempDir = fs.mkdtempSync('/tmp/idioms-');
  const texPath = path.join(tempDir, 'idioms.tex');
  const pdfPath = path.join(tempDir, 'idioms.pdf');

  try {
    // Write LaTeX file
    fs.writeFileSync(texPath, latex, 'utf8');

    console.log('Generating PDF...');
    console.log(`Processing ${idioms.length} idioms...`);

    // Compile LaTeX (run twice for TOC)
    console.log('Running XeLaTeX (first pass)...');
    try {
      execSync(`xelatex -interaction=nonstopmode -output-directory=${tempDir} ${texPath}`, {
        stdio: 'pipe'
      });
    } catch (compileError) {
      // Save .tex file for debugging
      const debugTexPath = outputPath.replace(/\.pdf$/, '.tex');
      fs.copyFileSync(texPath, debugTexPath);

      console.error('\nXeLaTeX compilation failed!');
      console.error(`LaTeX source saved to: ${debugTexPath}`);
      console.error('\nTo see detailed errors, run:');
      console.error(`  xelatex ${debugTexPath}`);

      // Try to extract useful error from log
      const logPath = path.join(tempDir, 'idioms.log');
      if (fs.existsSync(logPath)) {
        const log = fs.readFileSync(logPath, 'utf8');
        const errorMatch = log.match(/! (.+?)[\r\n]/);
        if (errorMatch) {
          console.error(`\nLaTeX Error: ${errorMatch[1]}`);
        }
      }
      throw compileError;
    }

    console.log('Running XeLaTeX (second pass for table of contents)...');
    execSync(`xelatex -interaction=nonstopmode -output-directory=${tempDir} ${texPath}`, {
      stdio: 'ignore'
    });

    // Move PDF to output location
    fs.copyFileSync(pdfPath, outputPath);

    console.log(`✓ PDF generated successfully: ${outputPath}`);
    console.log(`  Total pages: ~${Math.ceil(idioms.length / 2)}`);

  } catch (error) {
    console.error('\nFailed to generate PDF.');
    process.exit(1);
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Main function
function main() {
  const args = process.argv.slice(2);

  let filters = [];
  let sortBy = null;
  let template = null;
  let showCount = false;
  let jsonOutput = false;
  let ankiOutput = false;
  let pdfOutput = null;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-f' || arg === '--filter') {
      filters.push(args[++i]);
    } else if (arg === '-s' || arg === '--sort') {
      sortBy = args[++i];
    } else if (arg === '-p' || arg === '--print') {
      template = args[++i];
    } else if (arg === '--count') {
      showCount = true;
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--anki') {
      ankiOutput = true;
    } else if (arg === '--pdf') {
      pdfOutput = args[++i];
    } else if (arg === '--full') {
      template = '**{i}**\n{l}\n{m}\n\nDifficulty: {d}/100 | Frequency: {f}/100\nRegister: {r} | Context: {ctx} | Category: {cat}\n\nExamples:\nA: {a}\n   {A}\n\nB: {b}\n   {B}\n\nC: {c}\n   {C}\n\n---\n';
    } else if (arg === '--def' || arg === '--with-def') {
      template = '{i} — {m} ({l})';
    } else if (arg === '-h' || arg === '--help') {
      console.log(`
Usage: npm run idioms [options]

Options:
  -f, --filter <filter>    Filter idioms (can be used multiple times)
                           Examples:
                             freq:<20          Frequency less than 20
                             freq:20-40        Frequency between 20 and 40
                             diff:50-70        Difficulty between 50 and 70
                             context:Quebec    Context contains "Quebec"
                             register:informal Register is informal
                             category:emotions Category contains "emotions"

  -s, --sort <type>        Sort idioms
                           Options: alpha, freq, diff, category, random

  -p, --print <template>   Custom print format using {placeholder} syntax
                           Placeholders:
                             {i}    - idiom
                             {l}    - literal translation
                             {m}    - meaning
                             {d}    - difficulty level
                             {f}    - frequency level
                             {r}    - register
                             {ctx}  - context
                             {cat}  - category
                             {a}, {b}, {c} - example sentences (A, B, C levels)
                             {A}, {B}, {C} - English translations of examples
                           Special chars: \\n (newline), \\t (tab)
                           Examples:
                             '{i} ({a}) ({b}) ({c})'
                             '{i} - {a} ({A})'
                             '**{i}**\\n\\t- {a}\\n\\t- *{A}*\\n'

  --count                  Show count of matching idioms
  --json                   Output as JSON
  --anki                   Output in Anki flashcard format
  --pdf <filename>         Generate a beautifully formatted PDF document
                           Requires: XeLaTeX (texlive-xetex)
  --full                   Print full details for each idiom
  --def, --with-def        Print idiom with definition and literal translation
  -h, --help               Show this help message

Examples:
  npm run idioms -f freq:<20
  npm run idioms -s alpha
  npm run idioms -f diff:40-60 -s freq
  npm run idioms -p '{i} - {a} ({A})'
  npm run idioms -f category:emotions -s diff -p '{i} (diff: {d})'
  npm run idioms --def
  npm run idioms -f diff:70-100 --full
  npm run idioms --pdf idioms.pdf
  npm run idioms -f freq:<30 -s alpha --pdf common-idioms.pdf
      `);
      process.exit(0);
    }
  }

  // Read and parse YAML file
  const yamlPath = path.join(__dirname, 'idioms.yml');

  if (!fs.existsSync(yamlPath)) {
    console.error('Error: idioms.yml not found');
    process.exit(1);
  }

  const yamlContent = fs.readFileSync(yamlPath, 'utf8');
  let idioms = parseYAML(yamlContent);

  // Apply filters
  idioms = filterIdioms(idioms, filters);

  // Apply sorting
  idioms = sortIdioms(idioms, sortBy);

  // Generate PDF if requested
  if (pdfOutput) {
    generatePDF(idioms, pdfOutput);
    return;
  }

  // Determine if we have no arguments at all
  const hasNoArgs = args.length === 0;

  // Determine if we should print idioms (default is yes, unless ONLY --count is specified)
  const onlyCount = showCount && !jsonOutput && !ankiOutput && !pdfOutput && template === null && filters.length === 0 && sortBy === null;

  // Show count
  if (showCount) {
    console.log(`Count: ${idioms.length}`);
    if (onlyCount || idioms.length === 0) return;
    console.log('');
  }

  // Output idioms (default behavior unless only --count was specified)
  if (jsonOutput) {
    console.log(JSON.stringify(idioms, null, 2));
  } else if (ankiOutput) {
    // Anki format: front;back
    for (const idiom of idioms) {
      const front = `${idiom.idiom} (${idiom.literal})`;
      const back = `${idiom.meaning}\n\nExample: ${idiom.examples.b?.french || idiom.examples.a?.french || ''}\nTranslation: ${idiom.examples.b?.english || idiom.examples.a?.english || ''}`;
      console.log(`${front};${back.replace(/\n/g, '<br>')}`);
    }
  } else if (!onlyCount) {
    // Print idioms by default unless only --count was specified
    console.log(formatOutput(idioms, template));
  }
}

main();
