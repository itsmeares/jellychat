import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReleaseNotes } from "./release-notes.mjs";

const pull = (number, title, author = "itsmeares", labels = []) => ({ number, title, author, labels });

test("groups pull requests by title prefix", () => {
  const fixes = Array.from({ length: 16 }, (_, index) => pull(100 + index, `fix: bug ${index}`));
  const notes = buildReleaseNotes({
    summary: "JellyChat 3.0 is a rewrite.",
    compareUrl: "https://github.com/itsmeares/jellychat/compare/v2.1.4...v3.0.0",
    pulls: [
      pull(45, "feat(ui): themes and layouts"),
      pull(44, "release: update manifest and version to 2.1.4.0", "github-actions[bot]"),
      pull(46, "fix: keep header button in line", "friend", ["security"]),
      pull(47, "docs: refresh README"),
      pull(48, "chore(deps): bump vite", "renovate[bot]"),
      pull(49, "fix(ci): use Node 24 actions"),
      pull(50, "Simplify release publishing"),
      ...fixes
    ]
  });

  assert.match(notes, /^JellyChat 3\.0 is a rewrite\.\n\n## ✨ New features\n\n- \*\*ui:\*\* Themes and layouts \(#45, @itsmeares\)\n/);
  assert.doesNotMatch(notes, /#44/);
  assert.match(notes, /## 🔒 Security\n\n- Keep header button in line \(#46, @friend\)/);
  assert.match(notes, /<summary>🐛 Bug fixes \(16\)<\/summary>/);
  assert.match(notes, /<summary>📖 Documentation \(1\)<\/summary>/);
  assert.match(notes, /<summary>📦 Dependencies \(1\)<\/summary>\n\n- \*\*deps:\*\* Bump vite \(#48, @renovate\[bot\]\)/);
  assert.match(notes, /<summary>🧹 Maintenance \(2\)<\/summary>\n\n- Simplify release publishing \(#50, @itsmeares\)\n- \*\*ci:\*\* Use Node 24 actions \(#49, @itsmeares\)/);
  assert.match(notes, /## ❤️ Contributors\n\n@itsmeares @friend\n\n\[Full changelog\]\(https:\/\/github\.com\/itsmeares\/jellychat\/compare\/v2\.1\.4\.\.\.v3\.0\.0\)\n$/);
});

test("keeps short bug fix lists open", () => {
  const notes = buildReleaseNotes({ summary: "Fixes.", compareUrl: "", pulls: [pull(1, "fix: one")] });
  assert.equal(notes, "Fixes.\n\n## 🐛 Bug fixes\n\n- One (#1, @itsmeares)\n\n## ❤️ Contributors\n\n@itsmeares\n");
});
