#!/usr/bin/env node

const fs = require('fs');

// Read and parse verbs.yml
const content = fs.readFileSync('verbs.yml', 'utf8');
const lines = content.split('\n');

const verbs = [];
let currentVerb = null;

for (const line of lines) {
  const verbMatch = line.match(/^- verb:\s*"([^"]+)"/);
  if (verbMatch) {
    if (currentVerb) verbs.push(currentVerb);
    currentVerb = { verb: verbMatch[1], forms: {} };
    continue;
  }

  const formMatch = line.match(/^\s{4}([^:]+):/);
  if (formMatch && currentVerb) {
    currentVerb.forms[formMatch[1].trim()] = true;
  }
}
if (currentVerb) verbs.push(currentVerb);

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

// Print verbs with notation
const maxLen = Math.max(...verbs.map(v => v.verb.length));

for (const v of verbs) {
  const notation = generateNotation(v.forms);
  const padding = ' '.repeat(maxLen - v.verb.length);
  console.log(`${v.verb}${padding}  ${notation}`);
}

console.log(`\nLegend:`);
console.log(`  First group:  [i]ntransitive [o]bject [v]erb`);
console.log(`  Second group: à + [p]erson [o]bject [v]erb`);
console.log(`  Third group:  de + [p]erson [o]bject [v]erb`);
console.log(`  Then: other prepositions (par, avec, qn+v=perception verb, à+de=complex form)`);
