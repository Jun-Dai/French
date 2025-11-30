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

  return idioms.filter(idiom => {
    for (const filter of filters) {
      // Parse filter: property:value or property:min-max or property:<value or property:>value
      const match = filter.match(/^(\w+):(.+)$/);
      if (!match) {
        console.error(`Invalid filter format: ${filter}`);
        continue;
      }

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
      else {
        console.error(`Unknown filter property: ${property}`);
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

// Main function
function main() {
  const args = process.argv.slice(2);

  let filters = [];
  let sortBy = null;
  let template = null;
  let showCount = false;
  let jsonOutput = false;
  let ankiOutput = false;

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

  // Determine if we should print idioms or just count
  const shouldPrintIdioms = template !== null || jsonOutput || ankiOutput;

  // Show count
  if (showCount) {
    console.log(`Count: ${idioms.length}`);
    if (!shouldPrintIdioms || idioms.length === 0) return;
    console.log('');
  }

  // Output idioms if requested
  if (jsonOutput) {
    console.log(JSON.stringify(idioms, null, 2));
  } else if (ankiOutput) {
    // Anki format: front;back
    for (const idiom of idioms) {
      const front = `${idiom.idiom} (${idiom.literal})`;
      const back = `${idiom.meaning}\n\nExample: ${idiom.examples.b?.french || idiom.examples.a?.french || ''}\nTranslation: ${idiom.examples.b?.english || idiom.examples.a?.english || ''}`;
      console.log(`${front};${back.replace(/\n/g, '<br>')}`);
    }
  } else if (shouldPrintIdioms) {
    console.log(formatOutput(idioms, template));
  }
}

main();
