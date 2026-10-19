# @zof-ai/code-risk-score

A transparent local heuristic that highlights changes that may deserve more review. Every contribution is shown, all weights are configurable, and missing inputs stay explicitly unknown. It never executes source or tests, uploads data, or contacts a hosted service.

This independently authored public heuristic is advisory. It does not use proprietary Zof weights, training data, private telemetry or a commercial risk model. A low score does not establish safety or passing verification.



<!-- ZOF_NPM_INSTALL_START -->
## Install from npm

Use Node.js 22 or 24 and npm. File-based operations require Linux or macOS with Python 3.10 or newer; Windows file operations fail closed. In a new project directory, install the version used by this guide:

```sh
npm install --ignore-scripts --save-exact @zof-ai/code-risk-score@0.1.2
npx --no-install zof-code-risk-score --help
```

The package includes compiled JavaScript, TypeScript declarations and its runtime dependencies. No source build, Zof account or repository upload is required. `--ignore-scripts` disables installation lifecycle scripts; `--no-install` keeps the example commands from downloading another package.

Confirm the public ESM entry point; this prints `function`:

```sh
node --input-type=module -e "import('@zof-ai/code-risk-score').then(api => console.log(typeof api.scoreRisk))"
```

Run a packaged example from the same directory:

```sh
npx --no-install zof-code-risk-score --root node_modules/@zof-ai/code-risk-score/examples --input small-change.json --json
```

The supplied example reports score `3.8`, no missing inputs and `verificationResult: "not-run"`. The score is advisory; it does not verify the change.

Package: [@zof-ai/code-risk-score](https://www.npmjs.com/package/@zof-ai/code-risk-score). The source-checkout instructions and three additional workflows follow.
<!-- ZOF_NPM_INSTALL_END -->

<!-- ZOF_RELEASE_INSTALL_START -->
## Install from GitHub source

Requires Node.js 22 or 24, npm, and Git. Filesystem operations require Linux or macOS with Python 3.10 or newer; Windows file operations fail closed. Clone this repository and explicitly prepare its reviewed release dependencies:

```sh
git clone --branch v0.1.2 --depth 1 https://github.com/Zof-AI/zof-code-risk-score.git
cd zof-code-risk-score
node scripts/bootstrap.mjs --allow-network
npm ci --ignore-scripts --prefer-offline
npm run build
npm test
```

The bootstrap downloads only the exact versioned dependency assets from [GitHub Releases](https://github.com/Zof-AI/zof-code-risk-score/releases), as listed in `scripts/release-dependencies.json`, verifies SHA256 and byte size, and adds them to the npm cache. It does not extract archives, run package scripts, collect application data, or send credentials. Downloads require the explicit flag and follow only HTTPS GitHub asset redirects. Installation then fetches ordinary third-party dependencies from npm. Use a writable npm cache; set `npm_config_cache` consistently for both commands if needed. An unavailable asset, changed hash, or oversized response stops installation.

<!-- ZOF_RELEASE_INSTALL_END -->

## Local quick start

Requires Node.js 22 or 24. Git is needed only for Git change analysis. After the source installation above:

```sh
npm ci --ignore-scripts
npm run build
node dist/cli.js --root examples --input small-change.json --json
```

The example score is **3.8**: one file (2), six changed lines (0.3), and 10% uncovered lines (1.5). The package identifier is `@zof-ai/code-risk-score`; executable name is `zof-code-risk-score`.

## Three controlled examples

```sh
# Ordinary source path: 3.8.
node dist/cli.js --root examples --input small-change.json --json
# Identical changes in an authentication path: 18.8, a +15 contribution.
node dist/cli.js --root examples --input auth-change.json --json
# Reviewed custom weights: 29.1, classified medium under custom bands.
node dist/cli.js --root examples --input auth-change.json --config custom-weights.json --json
```

`--root . --base HEAD~1 --head HEAD` analyzes a clean Git revision comparison. Omitting revisions compares `HEAD` to the working tree. Repeat `--changed FILE` to score an explicit file list; its changed-line count is unknown. `--input`, `--config` and `--coverage` read only bounded, repository-relative JSON files. Direct inputs cannot be combined with Git revision or external coverage options. Exit `0` means an advisory report was generated; `2` means input/operational failure. There is no passing-verification exit status.

## Documented calculation

For every signal, `contribution = round2(input × weight)`. `rawScore` is the rounded sum of contributions; `score = min(100, rawScore)`. Default advisory bands are low below 30, medium from 30 to below 60, and high from 60. Bands describe this heuristic only. No changes means score zero.

| Signal | Public input | Default weight |
| --- | --- | ---: |
| changedFiles | Number of distinct changed paths | 2 |
| changedLines | Added plus deleted lines | 0.05 |
| authentication | Paths with auth, authentication, authorization, login, oauth, session or credential segments | 15 |
| payments | Payment, payments, billing, checkout, invoice or stripe segments | 15 |
| migrations | Migration, migrations or db-migrate segments | 12 |
| publicApi | API, openapi, swagger, graphql, proto or protobuf segments; `.proto` files | 10 |
| concurrency | Concurrency, thread, worker, mutex, semaphore, async, queue or lock segments | 10 |
| coverageGap | `1 - coveredLines / totalLines`, when changes exist | 15 |
| dependencies | Named npm, Python, Rust or Go dependency manifests and locks | 12 |
| configuration | Config/settings segments, Dockerfile, docker-compose, tsconfig or `.github/` paths | 5 |

Path rules count matching files. Segments are separated by slash, underscore, dot or hyphen; matches are case-insensitive. A file may contribute to several categories. See `src/index.ts` for the exact public expressions, and [sample configuration](examples/custom-weights.json) for weights and bands. Finite weights from 0 through 1,000 are allowed; bands must be ordered within 0–100. Unknown configuration keys fail rather than silently taking effect.

## API

```js
import { scoreRisk, analyzeRisk, DEFAULT_WEIGHTS, formatReport } from '@zof-ai/code-risk-score';
const report = scoreRisk({
  changes: [{ path: 'src/auth/login.ts', addedLines: 4, deletedLines: 2 }],
  coverage: { coveredLines: 90, totalLines: 100 }
}, { weights: { authentication: 25 } });
console.log(formatReport(report));
```

`scoreRisk(input, config?)` validates an explicit input. `analyzeRisk({root, base?, head?, changedFiles?, config?, configFile?, coverage?, coverageFile?, inputFile?})` adds bounded local/Git input collection using `@zof-ai/change-impact`. All reports use `risk/v1` and contain the score, raw score, advisory band, signals with exact input/weight/contribution/path explanations, missing inputs, limitations, `advisory: true`, and `verificationResult: "not-run"`.

Missing changed-line or coverage observations produce null signal inputs and zero observed contribution, with `scoreMeaning: "partial-inputs"`. This is an incomplete score, not evidence of low risk. [Missing-data example](examples/missing-coverage.json) demonstrates that distinction. Unknown Git/static analysis conditions also mark input completeness partial.

## Limitations and safety

Path classification can miss authentication, payments or concurrency logic in generic filenames and can flag unrelated files. Caller-supplied coverage may be stale or irrelevant and does not establish behavioral coverage. Scores are explainable prioritization aids; do not use them as proof that a change is safe to merge.

Inputs are limited to 10,000 changed paths, 10 million lines per field, 1 MiB explicit input files and 256 KiB configuration/coverage files. Duplicate paths, unsafe paths, invalid JSON, nonfinite values, unknown keys and inconsistent coverage fail explicitly. Symlinks and traversal are rejected. XML, archives, external URLs and raw application logs are not processed. Reports omit arbitrary environment variables and source snippets; shared evidence redaction removes recognizable credentials and sensitive URLs. A redactor cannot recognize every arbitrary secret, so keep secrets out of file names and metadata. Git diff disables external helpers and does not use a shell. Git operates on a bounded private snapshot of the selected repository; external metadata, linked worktrees and submodules are unsupported.

## Validation and release

```sh
npm test
npm pack --ignore-scripts
```

Tests independently calculate each signal delta, exact contribution sums, custom weights, caps, missing data and error cases. They also exercise real Git changes, safe file reads, symlinks, malformed/oversized inputs, redaction, documentation commands and a clean tarball installation with explicit candidate dependencies. CI targets Linux/macOS on Node 22/24; only completed jobs establish platform verification. See [security policy](SECURITY.md) and [release procedure](docs/RELEASE.md). Versioned GitHub releases record installation and validation details.

## Filesystem and Git boundaries

Filesystem operations use bounded, directory-relative descriptors on Linux/macOS with Python 3.10 or newer. Symlinks, hard-linked inputs, special files and traversal are rejected. Open descriptors remain attached to the original directory when names change. File contents can still change during a read or snapshot; this is not an atomic filesystem snapshot. Windows filesystem operations fail closed; in-memory JSON validation and analysis do not require the file helper. Git reads use a private bounded snapshot: 256 MiB total, 32 MiB per source/object file, 50,000 entries and 64 directory levels. Repository hooks/configuration are not used; local `.git/info/exclude` and `.git/info/attributes` are preserved. External Git metadata, object alternates, grafts, sparse-checkout metadata, linked worktrees and submodules are unsupported. Limits and unsupported metadata cause an explicit error or incomplete result.
