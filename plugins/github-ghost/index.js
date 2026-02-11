const { Octokit } = require("octokit");

class GitHubGhost {
  constructor(config) {
    if (!config.token) {
      throw new Error("GitHubGhost: config.token is required");
    }
    this.octokit = new Octokit({ auth: config.token });
  }

  /**
   * Summarize repository status efficiently (optimized for tokens).
   */
  async getSummary({ owner, repo }) {
    try {
      const [repoInfo, commits, prs] = await Promise.all([
        this.octokit.request("GET /repos/{owner}/{repo}", { owner, repo }),
        this.octokit.request("GET /repos/{owner}/{repo}/commits", { owner, repo, per_page: 5 }),
        this.octokit.request("GET /repos/{owner}/{repo}/pulls", { owner, repo, state: "open", per_page: 5 })
      ]);

      const latestCommit = commits.data[0];
      const prCount = prs.data.length;

      // Token-optimized summary
      return {
        name: repoInfo.data.full_name,
        stars: repoInfo.data.stargazers_count,
        open_issues: repoInfo.data.open_issues_count,
        last_commit: {
          sha: latestCommit.sha.substring(0, 7),
          message: latestCommit.commit.message.split('\n')[0], // First line only
          author: latestCommit.commit.author.name,
          date: latestCommit.commit.author.date
        },
        open_prs: prCount
      };
    } catch (error) {
      return `Error fetching summary: ${error.message}`;
    }
  }

  /**
   * Audit recent PRs for sensitive keys (simplified/optimized).
   */
  async auditPRs({ owner, repo }) {
    try {
      const { data: prs } = await this.octokit.request("GET /repos/{owner}/{repo}/pulls", {
        owner,
        repo,
        state: "open",
        per_page: 3 // Limit to 3 PRs to save tokens
      });

      if (prs.length === 0) return "No open PRs to audit.";

      const audits = await Promise.all(prs.map(async (pr) => {
        // Fetch PR files (simplified check)
        const { data: files } = await this.octokit.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
          owner,
          repo,
          pull_number: pr.number,
          per_page: 10
        });

        const riskyFiles = files
          .filter(f => f.filename.match(/(key|secret|token|password|\.env)/i))
          .map(f => f.filename);

        return {
          pr: pr.number,
          title: pr.title,
          risky_files: riskyFiles.length > 0 ? riskyFiles : "None detected"
        };
      }));

      return JSON.stringify(audits, null, 2);
    } catch (error) {
      return `Error auditing PRs: ${error.message}`;
    }
  }
}

module.exports = GitHubGhost;
