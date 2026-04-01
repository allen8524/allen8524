// scripts/generate-stats.js
// GitHub API + solved.ac API로 데이터 수집 후 SVG 파일 생성

import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const GH_USER = process.env.GITHUB_USERNAME || "allen8524";
const BOJ_USER = process.env.BOJ_USERNAME || "allen8524";
const GH_TOKEN = process.env.GITHUB_TOKEN;

const ASSETS_DIR = path.join(process.cwd(), "assets");
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR);

// ─── GitHub Stats ─────────────────────────────────────────────
async function fetchGitHubStats() {
  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    "Content-Type": "application/json",
  };

  // GraphQL로 커밋 수, 스타 수, PR, 이슈, 언어 한 번에 가져오기
  const query = `
    query($login: String!) {
      user(login: $login) {
        name
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
          nodes {
            stargazerCount
            languages(first: 5, orderBy: { field: SIZE, direction: DESC }) {
              edges { size node { name color } }
            }
          }
        }
        contributionsCollection {
          totalCommitContributions
          totalPullRequestContributions
          totalIssueContributions
        }
        followers { totalCount }
      }
    }
  `;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables: { login: GH_USER } }),
  });
  const json = await res.json();
  const user = json.data?.user;

  if (!user) throw new Error("GitHub API 응답 오류: " + JSON.stringify(json));

  const repos = user.repositories.nodes;
  const stars = repos.reduce((sum, r) => sum + r.stargazerCount, 0);
  const { totalCommitContributions: commits, totalPullRequestContributions: prs, totalIssueContributions: issues } =
    user.contributionsCollection;

  // 언어 통계 집계
  const langMap = {};
  for (const repo of repos) {
    for (const edge of repo.languages.edges) {
      const name = edge.node.name;
      const color = edge.node.color || "#8b949e";
      langMap[name] = langMap[name] || { size: 0, color };
      langMap[name].size += edge.size;
    }
  }
  const totalSize = Object.values(langMap).reduce((s, l) => s + l.size, 0);
  const langs = Object.entries(langMap)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 5)
    .map(([name, { size, color }]) => ({
      name,
      color,
      pct: Math.round((size / totalSize) * 100),
    }));

  return { commits, stars, prs, issues, langs, followers: user.followers.totalCount };
}

// ─── BOJ / solved.ac Stats ────────────────────────────────────
async function fetchBojStats() {
  const res = await fetch(`https://solved.ac/api/v3/user/show?handle=${BOJ_USER}`);
  if (!res.ok) throw new Error("solved.ac API 오류");
  const d = await res.json();

  const tierNames = [
    "Unrated","Bronze V","Bronze IV","Bronze III","Bronze II","Bronze I",
    "Silver V","Silver IV","Silver III","Silver II","Silver I",
    "Gold V","Gold IV","Gold III","Gold II","Gold I",
    "Platinum V","Platinum IV","Platinum III","Platinum II","Platinum I",
    "Diamond V","Diamond IV","Diamond III","Diamond II","Diamond I",
    "Ruby V","Ruby IV","Ruby III","Ruby II","Ruby I","Master",
  ];
  const tierColors = {
    Unrated:"#9e9e9e", Bronze:"#ad5600", Silver:"#435f7a", Gold:"#ec9a00",
    Platinum:"#27e2a4", Diamond:"#00b4fc", Ruby:"#ff0062", Master:"#b300e0",
  };
  const tierName = tierNames[d.tier] || "Unrated";
  const tierBase = tierName.split(" ")[0];
  const color = tierColors[tierBase] || "#9e9e9e";

  return {
    tier: tierName,
    color,
    solved: d.solvedCount,
    rating: d.rating,
    rank: d.rank,
    maxStreak: d.maxStreak,
    bio: d.bio || "",
  };
}

// ─── SVG 생성: GitHub Stats ───────────────────────────────────
function buildGithubSVG({ commits, stars, prs, issues, langs, followers }) {
  const W = 480, H = 200;
  const stats = [
    { label: "Total Commits", value: commits.toLocaleString(), icon: "●" },
    { label: "Total Stars",   value: stars.toLocaleString(),   icon: "★" },
    { label: "Pull Requests", value: prs.toLocaleString(),     icon: "↑" },
    { label: "Issues",        value: issues.toLocaleString(),  icon: "!" },
    { label: "Followers",     value: followers.toLocaleString(), icon: "♥" },
  ];

  // 언어 바 계산
  let barX = 0;
  const langBars = langs.map((l) => {
    const w = Math.round((l.pct / 100) * (W - 40));
    const bar = `<rect x="${20 + barX}" y="145" width="${w}" height="10" rx="5" fill="${l.color}" />`;
    barX += w;
    return bar;
  });

  const langLabels = langs
    .map(
      (l, i) =>
        `<circle cx="${20 + i * 88}" cy="174" r="5" fill="${l.color}"/>` +
        `<text x="${30 + i * 88}" y="178" font-size="11" fill="#8b949e">${l.name} ${l.pct}%</text>`
    )
    .join("");

  const statItems = stats
    .map(
      (s, i) =>
        `<text x="${i < 3 ? 20 + (i % 3) * 150 : 20 + ((i - 3) % 3) * 150}" ` +
        `y="${i < 3 ? 55 : 100}" font-size="11" fill="#8b949e">${s.icon} ${s.label}</text>` +
        `<text x="${i < 3 ? 20 + (i % 3) * 150 : 20 + ((i - 3) % 3) * 150}" ` +
        `y="${i < 3 ? 73 : 118}" font-size="18" font-weight="600" fill="#e6edf3">${s.value}</text>`
    )
    .join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" rx="12" fill="#0d1117" stroke="#30363d" stroke-width="1"/>
  <text x="20" y="30" font-size="14" font-weight="600" fill="#e6edf3" font-family="'Segoe UI',sans-serif">GitHub Stats — allen8524</text>
  <line x1="20" y1="36" x2="${W - 20}" y2="36" stroke="#30363d" stroke-width="0.5"/>
  <g font-family="'Segoe UI',sans-serif">${statItems}</g>
  <g>${langBars.join("")}</g>
  <g font-family="'Segoe UI',sans-serif">${langLabels}</g>
</svg>`;
}

// ─── SVG 생성: BOJ Stats ─────────────────────────────────────
function buildBojSVG({ tier, color, solved, rating, rank, maxStreak }) {
  const W = 480, H = 130;
  const items = [
    { label: "Tier",       value: tier },
    { label: "Solved",     value: solved.toLocaleString() },
    { label: "Rating",     value: rating.toLocaleString() },
    { label: "Rank",       value: "#" + rank.toLocaleString() },
    { label: "Max Streak", value: maxStreak + "d" },
  ];

  const cells = items
    .map(
      (it, i) =>
        `<rect x="${20 + i * 88}" y="55" width="80" height="55" rx="8" fill="#161b22" stroke="#30363d" stroke-width="0.5"/>` +
        `<text x="${60 + i * 88}" y="75" font-size="10" fill="#8b949e" text-anchor="middle" font-family="'Segoe UI',sans-serif">${it.label}</text>` +
        `<text x="${60 + i * 88}" y="97" font-size="${it.label === "Tier" ? 13 : 15}" font-weight="600" fill="${it.label === "Tier" ? color : "#e6edf3"}" text-anchor="middle" font-family="'Segoe UI',sans-serif">${it.value}</text>`
    )
    .join("");

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" rx="12" fill="#0d1117" stroke="#30363d" stroke-width="1"/>
  <text x="20" y="30" font-size="14" font-weight="600" fill="#e6edf3" font-family="'Segoe UI',sans-serif">Baekjoon / solved.ac — allen8524</text>
  <line x1="20" y1="36" x2="${W - 20}" y2="36" stroke="#30363d" stroke-width="0.5"/>
  <circle cx="${W - 36}" cy="22" r="10" fill="${color}" opacity="0.9"/>
  <g>${cells}</g>
</svg>`;
}

// ─── 메인 ─────────────────────────────────────────────────────
(async () => {
  console.log("📊 GitHub Stats 수집 중...");
  const ghStats = await fetchGitHubStats();
  const ghSVG = buildGithubSVG(ghStats);
  fs.writeFileSync(path.join(ASSETS_DIR, "github-stats.svg"), ghSVG, "utf8");
  console.log("✅ assets/github-stats.svg 생성 완료");

  console.log("🏅 BOJ Stats 수집 중...");
  const bojStats = await fetchBojStats();
  const bojSVG = buildBojSVG(bojStats);
  fs.writeFileSync(path.join(ASSETS_DIR, "boj-stats.svg"), bojSVG, "utf8");
  console.log("✅ assets/boj-stats.svg 생성 완료");
})();
