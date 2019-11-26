import * as toml from 'toml';
import * as fs from 'fs';
var concat = require('concat-stream');

import * as core from '@actions/core';
import * as github from '@actions/github';
import * as yaml from 'js-yaml';

async function run() {
  try {
    const token = core.getInput('repo-token', {required: true});

    const pr = getPr();
    if (!pr) {
      core.setFailed('Could not get pull request from context, exiting');
      return;
    }

    const prNumber = pr.number;
    if (!prNumber) {
      core.setFailed('Could not get pull request number from context, exiting');
      return;
    }

    const prBaseRef = pr.base.ref;
    if (!prBaseRef) {
      core.setFailed('Could not get pull request base ref from context, exiting');
      return;
    }

    const prLogin = pr.user.login;
    if (!prLogin) {
      core.setFailed('Could not get pull request author from context, exiting');
      return;
    }

    const client = new github.GitHub(token);

    core.debug(`fetching changed files for pr #${prNumber}`);
    const changedFiles = await getChangedFiles(client, prNumber);

    if (changedFiles.length <= 0) {
      core.setFailed('No file changed in this pull request, exiting');
      return;
    }

    for (const f of changedFiles){
      await checkFile(client, prLogin, prBaseRef, f.filename, f.status);
    }
    
  } catch (error) {
    core.error(error);
    core.setFailed(error.message);
  }
}

function getPr() {

  switch(github.context.payload.action){
    case "opened":
      return github.context.payload.pull_request;
      break;

    case "rerequested":
      const pullRequests = github.context.payload.check_suite.pull_requests;
     
      if (pullRequests.length > 1) {
        core.setFailed('More than one pull request, exiting');
        return undefined;
      }

      return pullRequests[0];
      break;

    default:
      core.setFailed("Unknown payload action: '" + github.context.payload.action + "'");
  }


}

async function checkFile(
  client: github.GitHub,
  actor : string,
  ref   : string,
  fileName : string,
  status : string)
{
  console.log("Checking file: '" + fileName + "' (" + status + ")");

  try {
    var parsed = toml.parse(await getContent(client, ref, fileName, status));
  } catch (e) {
    core.setFailed("Parsing error on line " + e.line + ", column " + e.column + ": " + e.message);
  }

  if (!parsed.general) {
    core.setFailed("Missing 'general' in '" + fileName + "'" );
    return;
  }

  if (!parsed.general["maintainers-logins"]) {
    core.setFailed("Missing 'general.maintainers-logins' in '" + fileName + "'" );
    return;
  }

  if (parsed.general["maintainers-logins"].indexOf(actor) <= -1) {
    core.setFailed("'" + actor + "' not in maintainers-logins for '" + fileName + "'" );
    return;
  } else {
    console.log ("'" + actor + "' found in maintainers-logins for '" + fileName + "'" );
  }
}

async function getContent(
  client: github.GitHub,
  ref   : string,
  fileName : string,
  status : string)
: Promise<string> 
{
  switch(status) {
    case "added":
      try {
          return fs.readFileSync(fileName, 'utf8').toString();
      } catch(e) {
          console.log('Error:', e.stack);
      }
      break;
    case "modified":
      console.log("Getting original version of file: '" + fileName + "' ref: '" + ref + "'");
      return await fetchOriginal(client, fileName, ref);
      break;
    default:
      core.setFailed("Unsupported file status : '" + status + "'");
  }
  return "";
}

async function getChangedFiles(
  client: github.GitHub,
  prNumber: number
) {
  const listFilesResponse = await client.pulls.listFiles({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    pull_number: prNumber
  });

  const changedFiles = listFilesResponse.data.map(f => f);

  core.debug('found changed files:');
  for (const file of changedFiles) {
    core.debug('  ' + file.filename + ' (' + file.status + ')');
  }

  return changedFiles;
}

async function fetchOriginal(
  client: github.GitHub,
  repoPath: string,
  ref: string
): Promise<string> {
  const response = await client.repos.getContents({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    path: repoPath,
    ref: ref
  });

  return Buffer.from(response.data.content, 'base64').toString();
}
run();

