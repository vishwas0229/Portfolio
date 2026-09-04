const USERNAME = 'vishwas0229';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, max-age=0',
    'access-control-allow-origin': '*'
  },
  body: JSON.stringify(body)
});

async function fetchJson(url, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'Rahul-Portfolio/1.0',
        'x-github-api-version': '2022-11-28'
      }
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

exports.handler = async (event) => {
  const username = (event.queryStringParameters?.username || USERNAME).trim();
  if (!/^[A-Za-z0-9-]{1,39}$/.test(username)) return json(400, { ok: false, error: 'Invalid GitHub username' });

  try {
    const [profile, repos, contributions] = await Promise.all([
      fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}`),
      fetchJson(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`),
      fetchJson(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`)
    ]);

    const publicRepos = Array.isArray(repos) ? repos.filter(r => !r.fork && Number(r.id) !== 1146497917) : [];
    const languageTotals = {};
    let totalStars = 0;
    let totalForks = 0;
    let totalOpenIssues = 0;

    for (const repo of publicRepos) {
      totalStars += Number(repo.stargazers_count || 0);
      totalForks += Number(repo.forks_count || 0);
      totalOpenIssues += Number(repo.open_issues_count || 0);
      if (repo.language) languageTotals[repo.language] = (languageTotals[repo.language] || 0) + Math.max(Number(repo.size || 1), 1);
    }

    const languages = Object.entries(languageTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([name, size]) => ({ name, size }));

    const topRepos = publicRepos
      .slice()
      .sort((a, b) => (Number(b.stargazers_count || 0) - Number(a.stargazers_count || 0)) || (new Date(b.pushed_at || 0) - new Date(a.pushed_at || 0)))
      .slice(0, 6)
      .map(r => ({
        name: r.name,
        stars: Number(r.stargazers_count || 0),
        forks: Number(r.forks_count || 0),
        language: r.language || 'Other',
        url: r.html_url,
        updatedAt: r.pushed_at
      }));

    const contributionDays = Array.isArray(contributions?.contributions) ? contributions.contributions : [];
    const contributionTotal = contributionDays.reduce((sum, d) => sum + Number(d.count || 0), 0);
    const activeDays = contributionDays.filter(d => Number(d.count || 0) > 0).length;
    let currentStreak = 0;
    for (let i = contributionDays.length - 1; i >= 0; i--) {
      if (Number(contributionDays[i].count || 0) > 0) currentStreak++;
      else break;
    }

    const monthly = Array.from({ length: 12 }, () => 0);
    const year = new Date().getUTCFullYear();
    for (const d of contributionDays) {
      const date = new Date(`${d.date}T00:00:00Z`);
      if (date.getUTCFullYear() === year) monthly[date.getUTCMonth()] += Number(d.count || 0);
    }

    return json(200, {
      ok: true,
      source: 'github-api+contribution-calendar',
      data: {
        username: profile.login,
        name: profile.name || profile.login,
        avatar: profile.avatar_url,
        bio: profile.bio || '',
        followers: Number(profile.followers || 0),
        following: Number(profile.following || 0),
        publicRepos: Number(profile.public_repos || publicRepos.length),
        publicGists: Number(profile.public_gists || 0),
        totalStars,
        totalForks,
        totalOpenIssues,
        languages,
        topRepos,
        contributionTotal,
        activeDays,
        currentStreak,
        monthly,
        contributions: contributionDays,
        year,
        profileUrl: profile.html_url
      }
    });
  } catch (error) {
    return json(502, { ok: false, error: 'Live GitHub data could not be fetched right now.', detail: String(error?.message || error) });
  }
};
