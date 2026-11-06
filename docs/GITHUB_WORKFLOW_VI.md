# Git workflow: dev → main → automatic release

Repository: https://github.com/PhuNope/Cocos-Splines

**Important:** ChatGPT's regular GitHub plugin is read-only; granting it repository access doesn't enable write/commit. Use authenticated `git` on your machine or a Codex workflow with write access.

## Empty repository bootstrap (run ONCE)

As of 2026-11-06 the repository was empty with no commits/branches. To keep main empty of plugin code until approval, bootstrap main using a README only:

```bash
git clone https://github.com/PhuNope/Cocos-Splines.git
cd Cocos-Splines
git switch -c main
printf '# Cocos Splines\n\nDevelopment takes place on the dev branch.\n' > README.md
git add README.md
git commit -m 'chore: initialize main for approved releases'
git push -u origin main
git switch -c dev
```

Now **copy all contents** of the `cocos-splines/` directory from `cocos-splines-source-0.9.0.zip` into the cloned repository root, including hidden `.github/` (do not nest another `cocos-splines/` folder). Then:

```bash
git add -A
git commit -m 'feat: spline object controllers, modifiers, morph and road junction patch (v0.9.0)'
git push -u origin dev
```

> Windows PowerShell: create README with `Set-Content README.md '# Cocos Splines'`, instead of `printf`. If an authorized `main` commit already exists, skip the bootstrap and create/update dev from main as appropriate.

## Develop and release

- Regular work: commit and push **only to dev**. `.github/workflows/ci-release.yml` runs TypeScript, test suite, manifest verification on dev, but no release.
- When satisfied: create a PR `dev → main`, review and **merge manually**. The merge push to `main` triggers the release job. It builds the installer ZIP and creates `vX.Y.Z` GitHub release from `package.json`.
- Increase version in `package.json` **on dev** before each new main release. If the tag already exists, workflow deliberately fails rather than overwriting a past release.
- To prevent accidental commits into main, protect `main` with a GitHub branch ruleset requiring a pull request:
  https://github.com/PhuNope/Cocos-Splines/settings/rules

**No automated merge dev to main is configured.** CI uses Node.js 22 + TypeScript 5.9.3. GitHub Actions release job needs `contents: write` for the workflow's `GITHUB_TOKEN`, not for the ChatGPT connector.
