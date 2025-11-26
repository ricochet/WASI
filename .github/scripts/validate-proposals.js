#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');

const config = require('../proposals.json');

const witPath = (proposal, version) => {
  if (version === '0.2') return `proposals/${proposal}/wit`;
  if (version === '0.3') return `proposals/${proposal}/wit-0.3.0-draft`;
  throw new Error(`Unknown version: ${version}`);
};

const parseFiles = (filesJson) => {
  if (!filesJson || filesJson === 'null') return [];
  try {
    return JSON.parse(filesJson);
  } catch {
    return [];
  }
};

const extractProposals = (files) => {
  const proposals = new Set();
  for (const f of files) {
    const match = f.match(/^proposals\/([^/]+)\//);
    if (match) proposals.add(match[1]);
  }
  return [...proposals].sort();
};

const run = (cmd) => {
  console.log(`  $ ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
};

// Collect proposals to validate from changed files
const toValidate = [];
const filesByVersion = [
  [process.env.WIT_02_FILES, '0.2'],
  [process.env.WIT_03_FILES, '0.3'],
];

for (const [filesJson, version] of filesByVersion) {
  for (const proposal of extractProposals(parseFiles(filesJson))) {
    const entry = config[proposal]?.[version];
    if (entry) {
      toValidate.push({ proposal, version, worlds: entry.worlds });
    } else {
      console.log(`::warning::No config for ${proposal} v${version}, skipping`);
    }
  }
}

if (toValidate.length === 0) {
  console.log('No proposals to validate');
  process.exit(0);
}

let failed = false;

for (const { proposal, version, worlds } of toValidate) {
  const witDir = witPath(proposal, version);
  console.log(`::group::Validating ${proposal} v${version}`);
  console.log(`  Path: ${witDir}`);
  console.log(`  Worlds: ${worlds.join(' ')}`);

  // Check wit-deps lock if deps.toml exists
  if (fs.existsSync(`${witDir}/deps.toml`)) {
    console.log('  Checking dependencies...');
    if (!run(`wit-deps -m "${witDir}"/deps.toml -l "${witDir}"/deps.lock -d "${witDir}"/deps lock --check`)) {
      console.log(`::error::wit-deps lock check failed for ${proposal} v${version}`);
      failed = true;
    }
  }

  // Validate WIT syntax for each world
  for (const world of worlds) {
    console.log(`  Validating world: ${world}`);
    if (!run(`wasm-tools component wit "${witDir}" --world "${world}"`)) {
      console.log(`::error::WIT validation failed for ${proposal} v${version} world ${world}`);
      failed = true;
    }
  }

  console.log('::endgroup::');
}

process.exit(failed ? 1 : 0);
