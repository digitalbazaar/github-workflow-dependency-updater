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
 *   node index.js
 *
 * Note: This script assumes that the `uses` field in the workflow files follows
 * the format `owner/repo@version` and that the version can be replaced with a
 * SHA value.
 */

import fs from 'node:fs';
import path from 'node:path';

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows');

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
  const usesRegex = /uses:\s*['"]?([^'"\s]+)['"]?(?:\s*#.*)?/g;
  let match;
  let updatedContent = content;

  while ((match = usesRegex.exec(content)) !== null) {
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
  const workflowFiles = fs.readdirSync(WORKFLOWS_DIR).filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));

  // Collect all unique actions
  const actionsSet = new Set();
  for (const file of workflowFiles) {
    const filePath = path.join(WORKFLOWS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const usesRegex = /uses:\s*['"]?([^'"\s]+)['"]?(?:\s*#.*)?/g;
    let match;
    while ((match = usesRegex.exec(content)) !== null) {
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
  for (const file of workflowFiles) {
    const filePath = path.join(WORKFLOWS_DIR, file);
    console.log(`Processing workflow file: ${filePath}`);
    await updateWorkflowFile(filePath, actionToLatest);
  }
}

main().catch(error => {
  console.error('Error updating workflow files:', error);
});
