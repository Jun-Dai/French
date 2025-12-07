#!/usr/bin/env node

const fs = require('fs');

// Parse command line arguments
const args = process.argv.slice(2);
const showComplete = args.includes('--complet') || args.includes('-c');

// Extract verb filter (any arg that's not a flag)
const verbFilter = args.filter(arg => !arg.startsWith('-')).join(',');
const requestedVerbs = verbFilter ? verbFilter.split(',').map(v => v.trim().toLowerCase()) : [];

// Read and parse verbs.yml with full details
const content = fs.readFileSync('verbs.yml', 'utf8');
const lines = content.split('\n');

const verbs = [];
let currentVerb = null;
let currentForm = null;
let indentLevel = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  const verbMatch = line.match(/^- verb:\s*"([^"]+)"/);
  if (verbMatch) {
    if (currentVerb) verbs.push(currentVerb);
    currentVerb = { verb: verbMatch[1], forms: {} };
    currentForm = null;
    continue;
  }

  // Match form names (exactly 4 spaces, then non-whitespace)
  const formMatch = line.match(/^    ([a-zA-Z_àé']+):/);
  if (formMatch && currentVerb && !line.match(/^    (french|english):/)) {
    const formName = formMatch[1].trim();
    currentForm = formName;
    currentVerb.forms[formName] = {};
    continue;
  }

  const frenchMatch = line.match(/^      french:\s*"([^"]+)"/);
  if (frenchMatch && currentVerb && currentForm) {
    currentVerb.forms[currentForm].french = frenchMatch[1];
    continue;
  }

  const englishMatch = line.match(/^      english:\s*"([^"]+)"/);
  if (englishMatch && currentVerb && currentForm) {
    currentVerb.forms[currentForm].english = englishMatch[1];
    continue;
  }
}
if (currentVerb) verbs.push(currentVerb);

// Filter verbs if specific ones were requested
let filteredVerbs = verbs;
if (requestedVerbs.length > 0) {
  filteredVerbs = verbs.filter(v => requestedVerbs.includes(v.verb.toLowerCase()));
}

// Generate compact notation
function generateNotation(forms) {
  // First group: basic forms (intransitive, transitive, direct verb)
  const i = forms.intransitive ? 'i' : '-';
  const o = forms.transitive ? 'o' : '-';
  const v = forms.verb ? 'v' : '-';

  // Second group: à + ...
  const a_p = (forms['à_quelqu\'un'] || forms['quelqu\'un_à_verb']) ? 'p' : '-';
  const a_o = forms['à_quelque_chose'] ? 'o' : '-';
  const a_v = forms['à_verb'] ? 'v' : '-';

  // Third group: de + ...
  const de_p = forms['de_quelqu\'un'] ? 'p' : '-';
  const de_o = forms['de_quelque_chose'] ? 'o' : '-';
  const de_v = forms['de_verb'] ? 'v' : '-';

  // Other prepositions
  const others = [];
  if (forms['par_quelque_chose'] || forms['par_verb']) others.push('par');
  if (forms['avec_quelqu\'un'] || forms['avec_quelque_chose']) others.push('avec');
  if (forms['sur_quelque_chose'] || forms['sur_verb']) others.push('sur');
  if (forms['pour_quelque_chose'] || forms['pour_verb']) others.push('pour');
  if (forms['contre_quelque_chose'] || forms['contre_verb']) others.push('contre');

  // Special combined forms
  if (forms['à_quelqu\'un_de_verb']) others.push('à+de');
  if (forms['quelqu\'un_verb']) others.push('qn+v');
  if (forms['parler_de_quelque_chose']) others.push('parler_de');

  let notation = `${i}${o}${v} ${a_p}${a_o}${a_v} ${de_p}${de_o}${de_v}`;
  if (others.length > 0) {
    notation += ' ' + others.join(',');
  }

  return notation;
}

// Format form name for display
function formatFormName(formName) {
  return formName.replace(/_/g, ' ');
}

if (showComplete) {
  // Complete mode: show all examples
  for (const v of filteredVerbs) {
    console.log(`\n${v.verb.toUpperCase()}`);
    console.log('='.repeat(v.verb.length));

    for (const [formName, formData] of Object.entries(v.forms)) {
      if (formData.french) {
        console.log(`\n  ${formatFormName(formName)}:`);
        console.log(`    ${formData.french}`);
        console.log(`    ${formData.english}`);
      }
    }
  }
} else {
  // Compact mode: show notation table
  const maxLen = Math.max(...filteredVerbs.map(v => v.verb.length));

  // Print header
  const headerPadding = ' '.repeat(maxLen - 5); // 5 is length of "verbe"
  console.log(`verbe${headerPadding}  dir à   de  autres`);
  console.log('-'.repeat(maxLen + 2 + 20)); // separator line

  for (const v of filteredVerbs) {
    const notation = generateNotation(v.forms);
    const padding = ' '.repeat(maxLen - v.verb.length);
    console.log(`${v.verb}${padding}  ${notation}`);
  }

  console.log(`\nLegend:`);
  console.log(`  First group:  [i]ntransitive [o]bject [v]erb`);
  console.log(`  Second group: à + [p]erson [o]bject [v]erb`);
  console.log(`  Third group:  de + [p]erson [o]bject [v]erb`);
  console.log(`  Then: other prepositions (par, avec, qn+v=perception verb, à+de=complex form)`);
  console.log(`\nUse --complet or -c to see all example sentences`);
}
