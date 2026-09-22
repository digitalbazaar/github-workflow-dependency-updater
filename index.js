#!/usr/bin/env node

/*
 * Copyright 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

/*
 * This script collects the actions used in the workflows (defined in `uses`)
 * and updates them to the latest version by collecting their SHA value from
 * the GitHub API and replacing the version in the workflow file with the SHA.
 *
 * Usage:
 *   node index.js [-n|--dry-run] [file|dir ...]
 *
 * Each argument may be a workflow file or a directory of workflow files. With
 * no arguments, `.github/workflows/` in the current working directory is used.
 * With `-n` or `--dry-run`, the changes that would be made are reported but no
 * files are written.
 *
 * Note: This script assumes that the `uses` field in the workflow files follows
 * the format `owner/repo@version` and that the version can be replaced with a
 * SHA value.
 */

import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';

const DEFAULT_WORKFLOWS_DIR = path.join('.github', 'workflows');
const WORKFLOW_EXTENSIONS = ['.yaml', '.yml'];
// Matches a `uses:` value, with optional quotes and an optional trailing
// comment. `[^\S\n]` is used instead of `\s` so a match can never span lines.
const usesRegex = () =>
  /(?<![\w-])(uses:[^\S\n]*)(['"]?)([^'"\s]+)\2([^\S\n]*#[^\n]*)?/g;

function usage() {
  console.log(`Usage: update-workflow-dependencies [options] [file|dir ...]

Update the \`uses\` values in GitHub workflow files to the latest tag SHAs.

Each argument may be a workflow file or a directory of workflow files. With no
arguments, ${DEFAULT_WORKFLOWS_DIR}/ in the current working directory is used.

Options:
  -n, --dry-run  Report what would be changed without writing any files.
  -h, --help     Show this help.`);
}

function collectWorkflowFiles(targets) {
  const workflowFiles = new Set();
  for (const target of targets) {
    let stats;
    try {
      stats = fs.statSync(target);
    } catch {
      throw new Error(`Workflow path not found: ${target}`);
    }
    if (stats.isDirectory()) {
      const files = fs.readdirSync(target)
        .filter(file => WORKFLOW_EXTENSIONS.includes(path.extname(file)))
        .sort();
      for (const file of files) {
        workflowFiles.add(path.join(target, file));
      }
    } else {
      workflowFiles.add(target);
    }
  }
  return [...workflowFiles];
}

// Local (`./path`) and container (`docker://...`) actions have no GitHub tags
// to look up.
function isRemoteAction(action) {
  const [owner, repo] = action.split('/');
  return Boolean(owner && repo) &&
    !action.startsWith('.') && !action.includes('://');
}

async function getLatestSHA(owner, repo) {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/tags?per_page=1`);
    const latestTag = (await response.json())[0];
    return latestTag ? { sha: latestTag.commit.sha, version: latestTag.name } : null;
  } catch (error) {
    console.error(`Error fetching latest SHA for ${owner}/${repo}:`, error);
    return null;
  }
}

function updateWorkflowFile(filePath, actionToLatest, {dryRun = false} = {}) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Matches arrive in order, so line numbers are found by counting newlines
  // incrementally from the previous match rather than from the file start.
  let line = 1;
  let scanned = 0;
  const lineAt = offset => {
    for (let i = scanned; i < offset; ++i) {
      if (content[i] === '\n') {
        ++line;
      }
    }
    scanned = offset;
    return line;
  };

  // Replace in a single pass so that only the matched text changes; the
  // surrounding indentation, quoting and following lines are left alone.
  const updatedContent = content.replace(
    usesRegex(), (fullMatch, prefix, quote, action, comment, offset) => {
      const [ownerRepo] = action.split('@');
      const latest = actionToLatest.get(ownerRepo);
      if (!latest) {
        return fullMatch;
      }
      const replacement =
        `${prefix}${quote}${ownerRepo}@${latest.sha}${quote} ` +
        `# ${latest.version}`;
      if (replacement === fullMatch) {
        return fullMatch;
      }
      const newAction = `${ownerRepo}@${latest.sha} # ${latest.version}`;
      console.log(
        `${filePath}:${lineAt(offset)}: ` +
        `${dryRun ? 'Would update' : 'Updated'} "${action}" to "${newAction}"`);
      return replacement;
    });

  if (updatedContent !== content && !dryRun) {
    fs.writeFileSync(filePath, updatedContent, 'utf-8');
  }
}

async function main() {
  let values;
  let positionals;
  try {
    ({values, positionals} = parseArgs({
      allowPositionals: true,
      options: {
        'dry-run': {type: 'boolean', short: 'n'},
        help: {type: 'boolean', short: 'h'}
      }
    }));
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 2;
    return;
  }
  if (values.help) {
    usage();
    return;
  }
  const dryRun = Boolean(values['dry-run']);

  const targets = positionals.length > 0 ?
    positionals : [DEFAULT_WORKFLOWS_DIR];
  const workflowFiles = collectWorkflowFiles(targets);

  // Collect all unique actions
  const actionsSet = new Set();
  for (const filePath of workflowFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    let match;
    const regex = usesRegex();
    while ((match = regex.exec(content)) !== null) {
      const action = match[3].split('@')[0];
      actionsSet.add(action);
    }
  }

  // Fetch latest for each unique action
  const actionToLatest = new Map();
  for (const action of actionsSet) {
    if (!isRemoteAction(action)) {
      continue;
    }
    const [owner, repo] = action.split('/');
    console.log(`Fetching latest for ${action}`);
    const latest = await getLatestSHA(owner, repo);
    if (latest) {
      actionToLatest.set(action, latest);
    }
  }

  // Update each file
  for (const filePath of workflowFiles) {
    console.log(`Processing workflow file: ${filePath}`);
    updateWorkflowFile(filePath, actionToLatest, {dryRun});
  }
}

main().catch(error => {
  console.error('Error updating workflow files:', error.message);
  process.exitCode = 1;
});
