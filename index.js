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
 *   node index.js [file|dir ...]
 *
 * Each argument may be a workflow file or a directory of workflow files. With
 * no arguments, `.github/workflows/` in the current working directory is used.
 *
 * Note: This script assumes that the `uses` field in the workflow files follows
 * the format `owner/repo@version` and that the version can be replaced with a
 * SHA value.
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_WORKFLOWS_DIR = path.join('.github', 'workflows');
const WORKFLOW_EXTENSIONS = ['.yaml', '.yml'];
const usesRegex = () => /uses:\s*['"]?([^'"\s]+)['"]?(?:\s*#.*)?/g;

function usage() {
  console.log(`Usage: update-workflow-dependencies [file|dir ...]

Update the \`uses\` values in GitHub workflow files to the latest tag SHAs.

Each argument may be a workflow file or a directory of workflow files. With no
arguments, ${DEFAULT_WORKFLOWS_DIR}/ in the current working directory is used.`);
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

async function updateWorkflowFile(filePath, actionToLatest) {
  const content = fs.readFileSync(filePath, 'utf-8');
  let match;
  let updatedContent = content;

  const regex = usesRegex();
  while ((match = regex.exec(content)) !== null) {
    const [fullMatch, action] = match;
    const [ownerRepo, version] = action.split('@');
    const latest = actionToLatest.get(ownerRepo);
    if (latest) {
      const newAction = `${ownerRepo}@${latest.sha} # ${latest.version}`;
      updatedContent = updatedContent.replace(fullMatch, `uses: ${newAction}`);
      console.log(`Updated ${action} to ${newAction} in ${filePath}`);
    }
  }

  fs.writeFileSync(filePath, updatedContent, 'utf-8');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    usage();
    return;
  }

  const targets = args.length > 0 ? args : [DEFAULT_WORKFLOWS_DIR];
  const workflowFiles = collectWorkflowFiles(targets);

  // Collect all unique actions
  const actionsSet = new Set();
  for (const filePath of workflowFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    let match;
    const regex = usesRegex();
    while ((match = regex.exec(content)) !== null) {
      const action = match[1].split('@')[0];
      actionsSet.add(action);
    }
  }

  // Fetch latest for each unique action
  const actionToLatest = new Map();
  for (const action of actionsSet) {
    const [owner, repo] = action.split('/');
    if (owner && repo) {
      console.log(`Fetching latest for ${action}`);
      const latest = await getLatestSHA(owner, repo);
      if (latest) {
        actionToLatest.set(action, latest);
      }
    }
  }

  // Update each file
  for (const filePath of workflowFiles) {
    console.log(`Processing workflow file: ${filePath}`);
    await updateWorkflowFile(filePath, actionToLatest);
  }
}

main().catch(error => {
  console.error('Error updating workflow files:', error.message);
  process.exitCode = 1;
});
