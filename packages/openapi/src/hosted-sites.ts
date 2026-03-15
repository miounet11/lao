const DEFAULT_HEADERS = {
  "user-agent": "iatlas-browser-hosted-sites/0.5.0",
  "accept-language": "en-US,en;q=0.9",
};

export interface HostedSiteInfo {
  name: string;
  notes: string;
}

type HostedSiteHandler = (args: Record<string, string>) => Promise<unknown>;

function requireArg(args: Record<string, string>, name: string): string {
  const value = args[name]?.trim();
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function parseCount(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new Error(`Upstream HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    throw new Error(`Upstream HTTP ${response.status}`);
  }
  return response.text();
}

function decodeHtml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripHtml(text: string): string {
  return decodeHtml(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseXmlTag(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return stripHtml(match?.[1] ?? "");
}

function parseXmlTags(text: string, tag: string): string[] {
  return Array.from(text.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))).map((match) => stripHtml(match[1]));
}

function extractArxivId(url: string): string {
  return url.replace("http://arxiv.org/abs/", "").replace("https://arxiv.org/abs/", "").trim();
}

async function githubRepo(args: Record<string, string>) {
  const repo = requireArg(args, "repo");
  const data = await fetchJson(`https://api.github.com/repos/${encodeURIComponent(repo).replace(/%2F/g, "/")}`) as Record<string, any>;
  return {
    full_name: data.full_name,
    description: data.description,
    language: data.language,
    url: data.html_url,
    stars: data.stargazers_count,
    forks: data.forks_count,
    open_issues: data.open_issues_count,
    created_at: data.created_at,
    updated_at: data.updated_at,
    default_branch: data.default_branch,
    topics: data.topics,
    license: data.license?.spdx_id ?? null,
  };
}

async function githubIssues(args: Record<string, string>) {
  const repo = requireArg(args, "repo");
  const state = args.state?.trim() || "open";
  const data = await fetchJson(
    `https://api.github.com/repos/${encodeURIComponent(repo).replace(/%2F/g, "/")}/issues?state=${encodeURIComponent(state)}&per_page=20`,
  ) as Record<string, any>[];
  return {
    repo,
    state,
    count: data.length,
    issues: data
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user?.login ?? null,
        comments: issue.comments,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        url: issue.html_url,
      })),
  };
}

async function hackernewsTop(args: Record<string, string>) {
  const count = parseCount(args.count, 20, 50);
  const ids = await fetchJson("https://hacker-news.firebaseio.com/v0/topstories.json") as number[];
  const topIds = ids.slice(0, count);
  const items = await Promise.all(topIds.map(async (id) => fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`) as Promise<Record<string, any>>));
  return {
    count: items.length,
    posts: items.map((item, index) => ({
      rank: index + 1,
      id: item.id,
      title: item.title,
      url: item.url ?? null,
      hn_url: `https://news.ycombinator.com/item?id=${item.id}`,
      author: item.by,
      score: item.score,
      comments: item.descendants ?? 0,
      time: item.time,
    })),
  };
}

async function hackernewsThread(args: Record<string, string>) {
  const rawId = requireArg(args, "id");
  const itemId = rawId.match(/id=(\d+)/)?.[1] ?? rawId;
  const item = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${encodeURIComponent(itemId)}.json`) as Record<string, any> | null;
  if (!item) {
    throw new Error(`Hacker News item not found: ${itemId}`);
  }

  async function fetchComments(ids: number[] | undefined, depth: number): Promise<unknown[]> {
    if (!ids?.length || depth > 2) {
      return [];
    }

    const comments = await Promise.all(ids.slice(0, 30).map(async (id) => {
      const comment = await fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`) as Record<string, any> | null;
      if (!comment || comment.deleted || comment.dead) {
        return null;
      }
      return {
        id: comment.id,
        author: comment.by ?? null,
        text: stripHtml(comment.text ?? ""),
        time: comment.time,
        depth,
        replies: await fetchComments(comment.kids, depth + 1),
      };
    }));

    return comments.filter(Boolean);
  }

  return {
    post: {
      id: item.id,
      title: item.title,
      url: item.url ?? null,
      hn_url: `https://news.ycombinator.com/item?id=${item.id}`,
      author: item.by,
      score: item.score,
      comments_count: item.descendants ?? 0,
      time: item.time,
      text: stripHtml(item.text ?? ""),
    },
    comments: await fetchComments(item.kids, 0),
  };
}

async function wikipediaSearch(args: Record<string, string>) {
  const query = requireArg(args, "query");
  const count = parseCount(args.count, 10, 50);
  const data = await fetchJson(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&srlimit=${count}`) as Record<string, any>;
  const results = data.query?.search ?? [];
  return {
    query,
    count: results.length,
    results: results.map((result: Record<string, any>) => ({
      pageid: result.pageid,
      title: result.title,
      snippet: stripHtml(result.snippet ?? ""),
      wordcount: result.wordcount,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(result.title).replace(/ /g, "_"))}`,
    })),
  };
}

async function wikipediaSummary(args: Record<string, string>) {
  const title = requireArg(args, "title");
  const data = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`) as Record<string, any>;
  return {
    title: data.title,
    description: data.description,
    extract: data.extract,
    thumbnail: data.thumbnail?.source ?? null,
    url: data.content_urls?.desktop?.page ?? null,
    timestamp: data.timestamp ?? null,
  };
}

async function arxivSearch(args: Record<string, string>) {
  const query = requireArg(args, "query");
  const count = parseCount(args.count, 10, 50);
  const xml = await fetchText(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${count}`);
  const totalResults = Number.parseInt(parseXmlTag(xml, "totalResults") || "0", 10);
  const entries = Array.from(xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)).map((match) => match[1]);

  const papers = entries.map((entry) => {
    const idUrl = parseXmlTag(entry, "id");
    const pdfUrl = (entry.match(/<link[^>]+title="pdf"[^>]+href="([^"]+)"/i)?.[1] ?? "").trim();
    return {
      id: extractArxivId(idUrl),
      title: parseXmlTag(entry, "title").replace(/\s+/g, " "),
      abstract: parseXmlTag(entry, "summary").replace(/\s+/g, " ").slice(0, 500),
      authors: parseXmlTags(entry, "name"),
      published: parseXmlTag(entry, "published").slice(0, 10),
      categories: Array.from(entry.matchAll(/<category[^>]+term="([^"]+)"/g)).map((match) => match[1]),
      url: idUrl,
      pdf: pdfUrl,
    };
  });

  return {
    query,
    totalResults: Number.isNaN(totalResults) ? papers.length : totalResults,
    count: papers.length,
    papers,
  };
}

async function npmSearch(args: Record<string, string>) {
  const query = requireArg(args, "query");
  const count = parseCount(args.count, 20, 250);
  const data = await fetchJson(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${count}`) as Record<string, any>;
  const packages = (data.objects ?? []).map((obj: Record<string, any>) => {
    const pkg = obj.package ?? {};
    const score = obj.score ?? {};
    return {
      name: pkg.name,
      version: pkg.version,
      description: String(pkg.description ?? "").slice(0, 300),
      author: pkg.publisher?.username ?? pkg.author?.name ?? null,
      date: pkg.date,
      url: pkg.links?.npm ?? `https://www.npmjs.com/package/${pkg.name}`,
      homepage: pkg.links?.homepage ?? null,
      repository: pkg.links?.repository ?? null,
      score: Math.round((score.final ?? 0) * 100) / 100,
      searchScore: Math.round((obj.searchScore ?? 0) * 100) / 100,
      keywords: (pkg.keywords ?? []).slice(0, 8),
    };
  });

  return {
    total: data.total ?? packages.length,
    count: packages.length,
    packages,
  };
}

async function openLibrarySearch(args: Record<string, string>) {
  const query = requireArg(args, "query");
  const count = parseCount(args.count, 10, 50);
  const data = await fetchJson(`https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=${count}`) as Record<string, any>;
  return {
    total: data.numFound,
    count: (data.docs ?? []).length,
    books: (data.docs ?? []).map((doc: Record<string, any>) => ({
      title: doc.title,
      authors: doc.author_name ?? [],
      firstPublishYear: doc.first_publish_year,
      isbn: (doc.isbn ?? []).slice(0, 3),
      subjects: (doc.subject ?? []).slice(0, 5),
      pages: doc.number_of_pages_median,
      cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
      url: doc.key ? `https://openlibrary.org${doc.key}` : null,
    })),
  };
}

async function pypiPackage(args: Record<string, string>) {
  const name = requireArg(args, "name");
  const data = await fetchJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`) as Record<string, any>;
  const info = data.info ?? {};
  return {
    name: info.name,
    version: info.version,
    summary: info.summary,
    author: info.author,
    author_email: info.author_email,
    license: info.license,
    home_page: info.home_page,
    project_url: info.project_url,
    package_url: info.package_url,
    requires_python: info.requires_python,
    keywords: info.keywords,
    classifiers: info.classifiers,
    project_urls: info.project_urls,
    requires_dist: info.requires_dist,
  };
}

async function bbcNews(args: Record<string, string>) {
  const query = args.query?.trim().toLowerCase() ?? "";
  const count = parseCount(args.count, 20, 50);
  const xml = await fetchText("https://feeds.bbci.co.uk/news/rss.xml");
  const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))
    .map((match) => {
      const item = match[1];
      return {
        title: parseXmlTag(item, "title"),
        description: parseXmlTag(item, "description"),
        url: parseXmlTag(item, "link"),
        pubDate: parseXmlTag(item, "pubDate"),
      };
    })
    .filter((item) => !query || `${item.title} ${item.description}`.toLowerCase().includes(query))
    .slice(0, count);

  return {
    source: "BBC News RSS",
    query: query || null,
    count: items.length,
    headlines: items,
  };
}

async function yahooFinanceQuote(args: Record<string, string>) {
  const symbol = requireArg(args, "symbol").toUpperCase();
  const data = await fetchJson(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`) as Record<string, any>;
  const quote = data.quoteResponse?.result?.[0];
  if (!quote) {
    throw new Error(`Quote not found for ${symbol}`);
  }

  return {
    symbol: quote.symbol,
    name: quote.shortName ?? quote.longName ?? quote.symbol,
    price: quote.regularMarketPrice ?? null,
    change: quote.regularMarketChange != null ? Number(quote.regularMarketChange.toFixed(2)) : null,
    changePercent: quote.regularMarketChangePercent != null ? `${quote.regularMarketChangePercent.toFixed(2)}%` : null,
    open: quote.regularMarketOpen ?? null,
    high: quote.regularMarketDayHigh ?? null,
    low: quote.regularMarketDayLow ?? null,
    prevClose: quote.regularMarketPreviousClose ?? null,
    volume: quote.regularMarketVolume ?? null,
    marketCap: quote.marketCap ?? null,
    currency: quote.currency ?? null,
    exchange: quote.fullExchangeName ?? quote.exchange ?? null,
    marketState: quote.marketState ?? null,
    url: `https://finance.yahoo.com/quote/${quote.symbol}/`,
  };
}

const handlers: Record<string, HostedSiteHandler> = {
  "github/repo": githubRepo,
  "github/issues": githubIssues,
  "hackernews/top": hackernewsTop,
  "hackernews/thread": hackernewsThread,
  "wikipedia/search": wikipediaSearch,
  "wikipedia/summary": wikipediaSummary,
  "arxiv/search": arxivSearch,
  "npm/search": npmSearch,
  "openlibrary/search": openLibrarySearch,
  "pypi/package": pypiPackage,
  "bbc/news": bbcNews,
  "yahoo-finance/quote": yahooFinanceQuote,
};

const hostedSiteInfo: HostedSiteInfo[] = [
  { name: "github/repo", notes: "Public GitHub repository metadata via GitHub API" },
  { name: "github/issues", notes: "Public GitHub issue listing via GitHub API" },
  { name: "hackernews/top", notes: "Hacker News top stories via official Firebase API" },
  { name: "hackernews/thread", notes: "Hacker News threads via official Firebase API" },
  { name: "wikipedia/search", notes: "Wikipedia search via MediaWiki API" },
  { name: "wikipedia/summary", notes: "Wikipedia summary via REST API" },
  { name: "arxiv/search", notes: "arXiv query via Atom API" },
  { name: "npm/search", notes: "npm search via registry API" },
  { name: "openlibrary/search", notes: "Open Library search via public JSON API" },
  { name: "pypi/package", notes: "PyPI package metadata via public JSON API" },
  { name: "bbc/news", notes: "BBC News RSS with optional server-side query filtering" },
  { name: "yahoo-finance/quote", notes: "Yahoo Finance quote lookup" },
];

export function listHostedSiteRunners(): HostedSiteInfo[] {
  return hostedSiteInfo.slice();
}

export function isHostedSiteRunner(name: string): boolean {
  return name in handlers;
}

export async function runHostedSite(name: string, args: Record<string, string>): Promise<unknown> {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Hosted execution is not available for ${name}`);
  }
  return handler(args);
}
