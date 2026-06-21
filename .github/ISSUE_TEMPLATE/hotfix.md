---
name: Hotfix Checklist
about: Checklist for creating a hotfix release
title: "Hotfix v[VERSION] - [BUG_DESCRIPTION]"
labels: hotfix, bug
assignees: ""
---

## Hotfix Information

**Version**: [e.g., v1.2.4] (patch version increment)
**Base Tag**: [e.g., v1.2.3] (tag that needs fixing)
**Bug Description**: [Brief description of the bug being fixed]
**Hotfix Manager**: @[username]
**Review Required**: @[reviewer-username]

## Pre-Hotfix Checklist

### Branch Setup

- [ ] Check out the specific tag that needs fixing: `git checkout [BASE_TAG]`
- [ ] Create new hotfix branch from the tag: `hotfix/[VERSION]`
- [ ] Switch to the new hotfix branch

### Bug Fix

- [ ] Apply minimal invasive fix for the bug
- [ ] Update version in `package.json` to new patch version
- [ ] Commit the fix with clear commit message
- [ ] Push the hotfix branch

### Testing
- Please follow the test plan [here](.TEAM/Release_Test_Plan.md) and if successful move to the next steps

### Review & Release

- [ ] Create merge request from hotfix branch
- [ ] Request review from designated reviewer
- [ ] **WAIT**: Review approved by reviewer
- [ ] Tag the new release with patch version number
- [ ] Verify GitHub Actions pipeline ran successfully
- [ ] Merge hotfix branch to main
- [ ] Create GitHub release from the tag

## Post-Hotfix Tasks

- [ ] Monitor for any immediate issues
- [ ] Notify stakeholders of the hotfix
- [ ] Close this issue

---

**Critical**: This hotfix process requires reviewer approval before tagging the release.
