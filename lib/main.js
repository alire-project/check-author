"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const toml = __importStar(require("toml"));
const fs = __importStar(require("fs"));
var concat = require('concat-stream');
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const token = core.getInput('repo-token', { required: true });
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
            const changedFiles = yield getChangedFiles(client, prNumber);
            if (changedFiles.length <= 0) {
                core.setFailed('No file changed in this pull request, exiting');
                return;
            }
            for (const f of changedFiles) {
                yield checkFile(client, prLogin, prBaseRef, f.filename, f.status);
            }
        }
        catch (error) {
            core.error(error);
            core.setFailed(error.message);
        }
    });
}
function getPr() {
    switch (github.context.payload.action) {
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
function checkFile(client, actor, ref, fileName, status) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("Checking file: '" + fileName + "' (" + status + ")");
        try {
            var parsed = toml.parse(yield getContent(client, ref, fileName, status));
        }
        catch (e) {
            core.setFailed("Parsing error on line " + e.line + ", column " + e.column + ": " + e.message);
        }
        if (!parsed.general) {
            core.setFailed("Missing 'general' in '" + fileName + "'");
            return;
        }
        if (!parsed.general["maintainers-logins"]) {
            core.setFailed("Missing 'general.maintainers-logins' in '" + fileName + "'");
            return;
        }
        if (parsed.general["maintainers-logins"].indexOf(actor) <= -1) {
            core.setFailed("'" + actor + "' not in maintainers-logins for '" + fileName + "'");
            return;
        }
        else {
            console.log("'" + actor + "' found in maintainers-logins for '" + fileName + "'");
        }
    });
}
function getContent(client, ref, fileName, status) {
    return __awaiter(this, void 0, void 0, function* () {
        switch (status) {
            case "added":
                try {
                    return fs.readFileSync(fileName, 'utf8').toString();
                }
                catch (e) {
                    console.log('Error:', e.stack);
                }
                break;
            case "modified":
                console.log("Getting original version of file: '" + fileName + "' ref: '" + ref + "'");
                return yield fetchOriginal(client, fileName, ref);
                break;
            default:
                core.setFailed("Unsupported file status : '" + status + "'");
        }
        return "";
    });
}
function getChangedFiles(client, prNumber) {
    return __awaiter(this, void 0, void 0, function* () {
        const listFilesResponse = yield client.pulls.listFiles({
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
    });
}
function fetchOriginal(client, repoPath, ref) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield client.repos.getContents({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            path: repoPath,
            ref: ref
        });
        return Buffer.from(response.data.content, 'base64').toString();
    });
}
run();
