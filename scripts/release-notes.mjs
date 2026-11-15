// Builds GitHub release notes from the pull requests merged since the previous release.

const sections = [
  { key: "feat", title: "✨ New features" },
  { key: "perf", title: "🏎️ Performance", foldOver: 15 },
  { key: "fix", title: "🐛 Bug fixes", foldOver: 15 },
  { key: "security", title: "🔒 Security" },
  { key: "docs", title: "📖 Documentation", folded: true },
  { key: "deps", title: "📦 Dependencies", folded: true },
  { key: "chore", title: "🧹 Maintenance", folded: true }
];

const dependencyBots = new Set(["renovate[bot]", "dependabot[bot]"]);
const maintenanceAreas = new Set(["ci", "deps", "release", "tooling"]);

export function parseTitle(title) {
  const match = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/.exec(title.trim());
  if (!match) return { type: "", area: "", text: title.trim() };
  return { type: match[1].toLowerCase(), area: match[2]?.toLowerCase() || "", text: match[3] };
}

export function sectionOf(pull) {
  const { type, area } = parseTitle(pull.title);
  if (pull.labels.includes("security")) return "security";
  if (dependencyBots.has(pull.author)) return "deps";
  if (maintenanceAreas.has(area)) return "chore";
  if (type === "feat" || type === "perf" || type === "fix" || type === "docs") return type;
  return "chore";
}

function line(pull) {
  const { area, text } = parseTitle(pull.title);
  return `- ${area ? `**${area}:** ` : ""}${text[0].toUpperCase()}${text.slice(1)} (#${pull.number}, @${pull.author})`;
}

// Release metadata pull requests opened by the release workflow are not changes.
export function isReleasePull(pull) {
  return parseTitle(pull.title).type === "release";
}

export function buildReleaseNotes({ summary, pulls, compareUrl }) {
  const kept = pulls.filter((pull) => !isReleasePull(pull));
  const parts = [summary.trim()];
  for (const section of sections) {
    const items = kept
      .filter((pull) => sectionOf(pull) === section.key)
      .sort((a, b) => parseTitle(a.title).area.localeCompare(parseTitle(b.title).area) || a.number - b.number)
      .map(line);
    if (!items.length) continue;
    const fold = section.folded || (section.foldOver !== undefined && items.length > section.foldOver);
    parts.push(fold
      ? `<details>\n<summary>${section.title} (${items.length})</summary>\n\n${items.join("\n")}\n\n</details>`
      : `## ${section.title}\n\n${items.join("\n")}`);
  }
  const people = [...new Set(kept.map((pull) => pull.author).filter((author) => !author.endsWith("[bot]")))];
  if (people.length) parts.push(`## ❤️ Contributors\n\n${people.map((author) => `@${author}`).join(" ")}`);
  if (compareUrl) parts.push(`[Full changelog](${compareUrl})`);
  return parts.join("\n\n") + "\n";
}

// Collects merged pull requests between the previous release and the release commit, through the github-script client.
export async function collectPulls({ github, owner, repo, base, head }) {
  const comparison = await github.paginate(github.rest.repos.compareCommitsWithBasehead, { owner, repo, basehead: `${base}...${head}`, per_page: 100 }, (response) => response.data.commits);
  const pulls = new Map();
  for (const commit of comparison) {
    const { data } = await github.rest.repos.listPullRequestsAssociatedWithCommit({ owner, repo, commit_sha: commit.sha });
    for (const pull of data) {
      if (!pull.merged_at || pull.base.ref !== "main" || pulls.has(pull.number)) continue;
      pulls.set(pull.number, { number: pull.number, title: pull.title, author: pull.user?.login ?? "ghost", labels: pull.labels.map((label) => label.name) });
    }
  }
  return [...pulls.values()].sort((a, b) => a.number - b.number);
}
