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

async function cratesSearch(args: Record<string, string>) {
  const query = requireArg(args, "query");
  const count = parseCount(args.count, 10, 50);
  const data = await fetchJson(`https://crates.io/api/v1/crates?page=1&per_page=${count}&q=${encodeURIComponent(query)}`) as Record<string, any>;
  const crates = (data.crates ?? []).map((item: Record<string, any>) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    max_version: item.max_version,
    downloads: item.downloads,
    recent_downloads: item.recent_downloads ?? null,
    updated_at: item.updated_at,
    repository: item.repository ?? null,
    homepage: item.homepage ?? null,
    documentation: item.documentation ?? null,
    keywords: item.keywords ?? [],
    url: `https://crates.io/crates/${item.id}`,
  }));

  return {
    query,
    total: data.meta?.total ?? crates.length,
    count: crates.length,
    crates,
  };
}

async function dockerHubSearch(args: Record<string, string>) {
  const query = requireArg(args, "query");
  const count = parseCount(args.count, 10, 50);
  const data = await fetchJson(`https://hub.docker.com/v2/search/repositories/?page_size=${count}&query=${encodeURIComponent(query)}`) as Record<string, any>;
  const repositories = (data.results ?? []).map((item: Record<string, any>) => ({
    name: item.repo_name ?? item.name,
    namespace: item.repo_namespace ?? null,
    description: item.short_description ?? item.description ?? "",
    stars: item.star_count ?? 0,
    pulls: item.pull_count ?? 0,
    isOfficial: Boolean(item.is_official),
    isAutomated: Boolean(item.is_automated),
    lastUpdated: item.last_updated ?? null,
    url: item.repo_name ? `https://hub.docker.com/r/${item.repo_name}` : null,
  }));

  return {
    query,
    total: data.count ?? repositories.length,
    count: repositories.length,
    repositories,
  };
}

async function huggingFaceModels(args: Record<string, string>) {
  const query = requireArg(args, "query");
  const count = parseCount(args.count, 10, 50);
  const models = await fetchJson(
    `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=${count}&sort=downloads&direction=-1`,
  ) as Record<string, any>[];

  return {
    query,
    count: models.length,
    models: models.map((item) => ({
      id: item.id,
      author: item.author ?? null,
      pipeline_tag: item.pipeline_tag ?? null,
      downloads: item.downloads ?? null,
      likes: item.likes ?? null,
      private: Boolean(item.private),
      gated: item.gated ?? false,
      updated_at: item.lastModified ?? null,
      tags: (item.tags ?? []).slice(0, 10),
      url: item.id ? `https://huggingface.co/${item.id}` : null,
    })),
  };
}

async function mavenSearch(args: Record<string, string>) {
  const query = requireArg(args, "query");
  const count = parseCount(args.count, 10, 50);
  const data = await fetchJson(
    `https://search.maven.org/solrsearch/select?q=${encodeURIComponent(query)}&rows=${count}&wt=json`,
  ) as Record<string, any>;
  const docs = data.response?.docs ?? [];

  return {
    query,
    total: data.response?.numFound ?? docs.length,
    count: docs.length,
    artifacts: docs.map((doc: Record<string, any>) => ({
      group: doc.g,
      artifact: doc.a,
      latestVersion: doc.latestVersion ?? null,
      packaging: doc.p ?? null,
      timestamp: doc.timestamp ?? null,
      versionCount: doc.versionCount ?? null,
      repositoryId: doc.repositoryId ?? null,
      url: doc.g && doc.a ? `https://search.maven.org/artifact/${doc.g}/${doc.a}` : null,
    })),
  };
}

async function pubmedSearch(args: Record<string, string>) {
  const query = requireArg(args, "query");
  const count = parseCount(args.count, 10, 20);
  const searchData = await fetchJson(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${count}&term=${encodeURIComponent(query)}`,
  ) as Record<string, any>;
  const ids = searchData.esearchresult?.idlist ?? [];
  if (!ids.length) {
    return {
      query,
      total: Number.parseInt(searchData.esearchresult?.count ?? "0", 10) || 0,
      count: 0,
      articles: [],
    };
  }

  const summaryData = await fetchJson(
    `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(ids.join(","))}`,
  ) as Record<string, any>;

  return {
    query,
    total: Number.parseInt(searchData.esearchresult?.count ?? "0", 10) || ids.length,
    count: ids.length,
    articles: ids.map((id: string) => {
      const item = summaryData.result?.[id] ?? {};
      return {
        uid: id,
        title: item.title ?? null,
        fullJournalName: item.fulljournalname ?? null,
        pubdate: item.pubdate ?? null,
        authors: (item.authors ?? []).map((author: Record<string, any>) => author.name).filter(Boolean),
        doi: item.elocationid ?? null,
        articleIds: item.articleids ?? [],
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      };
    }),
  };
}

async function stackExchangeSearch(args: Record<string, string>) {
  const query = requireArg(args, "query");
  const site = args.site?.trim() || "stackoverflow";
  const count = parseCount(args.count, 10, 50);
  const data = await fetchJson(
    `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&site=${encodeURIComponent(site)}&pagesize=${count}&q=${encodeURIComponent(query)}`,
  ) as Record<string, any>;
  const items = data.items ?? [];

  return {
    query,
    site,
    count: items.length,
    hasMore: Boolean(data.has_more),
    questions: items.map((item: Record<string, any>) => ({
      question_id: item.question_id,
      title: stripHtml(item.title ?? ""),
      score: item.score ?? 0,
      answer_count: item.answer_count ?? 0,
      view_count: item.view_count ?? 0,
      is_answered: Boolean(item.is_answered),
      tags: item.tags ?? [],
      owner: item.owner?.display_name ?? null,
      creation_date: item.creation_date ?? null,
      last_activity_date: item.last_activity_date ?? null,
      url: item.link ?? null,
    })),
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
  "crates/search": cratesSearch,
  "dockerhub/search": dockerHubSearch,
  "huggingface/models": huggingFaceModels,
  "maven/search": mavenSearch,
  "pubmed/search": pubmedSearch,
  "stackexchange/search": stackExchangeSearch,
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
  { name: "crates/search", notes: "Rust crate search via crates.io API" },
  { name: "dockerhub/search", notes: "Docker Hub repository search via public API" },
  { name: "huggingface/models", notes: "Hugging Face model search via public API" },
  { name: "maven/search", notes: "Maven Central artifact search via Solr API" },
  { name: "pubmed/search", notes: "PubMed search via NCBI E-utilities" },
  { name: "stackexchange/search", notes: "Stack Exchange question search via public API" },
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
