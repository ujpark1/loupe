// Step 4: probe GitHub for a matching user. Public REST API; we don't ship a
// token. Rate-limit responses (403/429) return null silently.

export type GithubProbe = {
  login: string;
  url: string;
  followers: number;
  totalStars: number;
  topRepoLanguages: string[];
  topRepoUrls: string[];
};

const TIMEOUT_MS = 5_000;
const SEARCH_URL = "https://api.github.com/search/users";
const REPO_URL = (login: string) =>
  `https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=50&sort=updated`;

const HEADERS: HeadersInit = {
  Accept: "application/vnd.github+json",
  "User-Agent": "loupe-research-tool",
};

async function jget<T>(url: string): Promise<T | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ac.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type GithubUser = {
  login?: string;
  followers?: number;
  html_url?: string;
};

type GithubSearchResp = {
  items?: GithubUser[];
};

type GithubRepo = {
  name?: string;
  html_url?: string;
  stargazers_count?: number;
  language?: string | null;
  fork?: boolean;
};

export async function findGithubUser(
  handle: string,
  name?: string,
): Promise<GithubProbe | null> {
  // Try by handle first, then fall back to name. We require a non-empty
  // handle and at least 2 chars to avoid noisy matches.
  const tries: string[] = [];
  if (handle && handle.length >= 2) tries.push(handle);
  if (name && name.trim().length >= 2) tries.push(name.trim());
  if (tries.length === 0) return null;

  for (const q of tries) {
    const search = await jget<GithubSearchResp>(
      `${SEARCH_URL}?q=${encodeURIComponent(q)}+in:login&per_page=3`,
    );
    const item = search?.items?.[0];
    const login = item?.login;
    if (!login) continue;

    const followers = await jget<{ followers?: number; html_url?: string }>(
      `https://api.github.com/users/${encodeURIComponent(login)}`,
    );
    const repos = await jget<GithubRepo[]>(REPO_URL(login));
    if (!repos) {
      return {
        login,
        url: followers?.html_url ?? `https://github.com/${login}`,
        followers: followers?.followers ?? item?.followers ?? 0,
        totalStars: 0,
        topRepoLanguages: [],
        topRepoUrls: [],
      };
    }
    const ownRepos = repos.filter((r) => !r.fork);
    ownRepos.sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0));
    const top = ownRepos.slice(0, 5);
    const totalStars = ownRepos.reduce((s, r) => s + (r.stargazers_count ?? 0), 0);
    const langSet = new Set<string>();
    for (const r of top) if (typeof r.language === "string" && r.language) langSet.add(r.language);
    const topRepoUrls = top
      .map((r) => r.html_url)
      .filter((u): u is string => typeof u === "string");

    return {
      login,
      url: followers?.html_url ?? `https://github.com/${login}`,
      followers: followers?.followers ?? item?.followers ?? 0,
      totalStars,
      topRepoLanguages: Array.from(langSet),
      topRepoUrls,
    };
  }
  return null;
}
