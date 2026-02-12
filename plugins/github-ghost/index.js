const { Octokit } = require("octokit");

// In-memory cache for token optimization
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

class GitHubGhost {
  constructor(config) {
    if (!config.token) {
      throw new Error("GitHubGhost: config.token is required");
    }
    this.octokit = new Octokit({ auth: config.token });
    this.maxOutputChars = config.maxOutputChars || 3000;
  }

  /**
   * Helper: Check cache before making API calls
   */
  _getCached(key) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      return entry.data;
    }
    cache.delete(key);
    return null;
  }

  _setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Helper: Truncate output to stay within token budget
   */
  _truncate(str, maxLen = this.maxOutputChars) {
    if (typeof str !== 'string') str = JSON.stringify(str, null, 2);
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + "\n... [truncated]";
  }

  /**
   * Summarize repository status efficiently (OPTIMIZED for tokens).
   * - Uses cache to avoid repeated API calls
   * - Returns minimal data structure
   * - Limits to essential fields only
   */
  async getSummary({ owner, repo }) {
    const cacheKey = `summary:${owner}/${repo}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      // Fetch only what we need with minimal fields
      const [repoInfo, commits] = await Promise.all([
        this.octokit.request("GET /repos/{owner}/{repo}", { owner, repo }),
        this.octokit.request("GET /repos/{owner}/{repo}/commits", { 
          owner, repo, 
          per_page: 1 // Only need latest commit
        })
      ]);

      const latestCommit = commits.data[0];

      // Ultra-compact summary format
      const summary = {
        repo: repoInfo.data.full_name,
        stars: repoInfo.data.stargazers_count,
        issues: repoInfo.data.open_issues_count,
        commit: latestCommit ? {
          sha: latestCommit.sha.substring(0, 7),
          msg: latestCommit.commit.message.split('\n')[0].substring(0, 50),
          by: latestCommit.commit.author.name,
          at: new Date(latestCommit.commit.author.date).toLocaleDateString()
        } : null
      };

      this._setCache(cacheKey, summary);
      return summary;
    } catch (error) {
      return { error: error.message.substring(0, 100) };
    }
  }

  /**
   * Get open PRs summary (token-optimized)
   */
  async getPRs({ owner, repo, limit = 3 }) {
    const cacheKey = `prs:${owner}/${repo}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data: prs } = await this.octokit.request("GET /repos/{owner}/{repo}/pulls", {
        owner, repo,
        state: "open",
        per_page: limit
      });

      if (prs.length === 0) {
        const result = { count: 0, prs: [] };
        this._setCache(cacheKey, result);
        return result;
      }

      // Compact PR list
      const result = {
        count: prs.length,
        prs: prs.map(pr => ({
          n: pr.number,
          t: pr.title.substring(0, 40),
          by: pr.user.login
        }))
      };

      this._setCache(cacheKey, result);
      return result;
    } catch (error) {
      return { error: error.message.substring(0, 100) };
    }
  }

  /**
   * Quick security audit - checks for sensitive files (OPTIMIZED)
   * - Limits PR count
   * - Limits files per PR
   * - Caches results
   */
  async auditPRs({ owner, repo }) {
    const cacheKey = `audit:${owner}/${repo}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data: prs } = await this.octokit.request("GET /repos/{owner}/{repo}/pulls", {
        owner, repo,
        state: "open",
        per_page: 2 // Reduced from 3 to 2 for token savings
      });

      if (prs.length === 0) {
        const result = "No open PRs";
        this._setCache(cacheKey, result);
        return result;
      }

      const sensitivePattern = /(key|secret|token|password|\.env|credentials|private)/i;
      
      const audits = await Promise.all(prs.map(async (pr) => {
        const { data: files } = await this.octokit.request(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
          { owner, repo, pull_number: pr.number, per_page: 5 } // Reduced from 10
        );

        const riskyFiles = files
          .filter(f => sensitivePattern.test(f.filename))
          .map(f => f.filename.split('/').pop()); // Only filename, not full path

        return riskyFiles.length > 0 
          ? `PR#${pr.number}: ${riskyFiles.join(', ')}`
          : null;
      }));

      const result = audits.filter(Boolean).join('\n') || "Clean";
      this._setCache(cacheKey, result);
      return result;
    } catch (error) {
      return `Err: ${error.message.substring(0, 50)}`;
    }
  }

  /**
   * Get recent commits (token-optimized)
   */
  async getRecentCommits({ owner, repo, limit = 3 }) {
    const cacheKey = `commits:${owner}/${repo}`;
    const cached = this._getCached(cacheKey);
    if (cached) return cached;

    try {
      const { data: commits } = await this.octokit.request("GET /repos/{owner}/{repo}/commits", {
        owner, repo,
        per_page: limit
      });

      const result = commits.map(c => ({
        sha: c.sha.substring(0, 7),
        msg: c.commit.message.split('\n')[0].substring(0, 40),
        by: c.commit.author.name.split(' ')[0], // First name only
        at: new Date(c.commit.author.date).toLocaleDateString()
      }));

      this._setCache(cacheKey, result);
      return result;
    } catch (error) {
      return { error: error.message.substring(0, 100) };
    }
  }

  /**
   * Clear cache (for manual refresh)
   */
  clearCache() {
    cache.clear();
    return "Cache cleared";
  }
}

module.exports = GitHubGhost;
