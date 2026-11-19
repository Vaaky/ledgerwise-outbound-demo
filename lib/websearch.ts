export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  provider: "tavily" | "duckduckgo" | "bing";
}

export interface SearchResponse {
  hits: SearchHit[];
  provider: string;
  error?: string;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const SEARCH_HOSTS =
  /(^|\.)(duckduckgo|bing|google|youtube|facebook|instagram|linkedin|x|twitter|tiktok|pinterest|reddit)\./i;

const SKIP_BRAND_HOSTS =
  /(^|\.)(duckduckgo|bing|google|youtube|facebook|instagram|linkedin|x|twitter|tiktok|pinterest|reddit|shopify|amazon|ebay|etsy|walmart|indeed|glassdoor|ziprecruiter|simplyhired|wikipedia|crunchbase|techcrunch|forbes|bloomberg|businessinsider|clutch|wa\.me|medium|substack|wordpress|blogspot|wixsite|squarespace|openai|perplexity|anthropic|claude|patreon|calendly|hubspot|klaviyo|gorgias|recharge|yotpo|trustpilot|entrepreneur|retail-week|marknology|ecomcatalyst|identixweb|bebolddigital|maggrowth|byteout|shaazford|admetrics|jarvio|thegenielab|sellercenter|trendtrack|fastbundle|synarionit|the4|founderjar|brandsearch|solomediagroup|wisepops|ecommerceparadise|findniche|sitebuilderreport|geekwire|cnbc|discord|thedigipalms|support|help|docs|status|chat|admin|central|blog|careers|jobs)\./i;

export function isBrandHost(host: string): boolean {
  return !SKIP_BRAND_HOSTS.test(host);
}

export function htmlToText(value: string): string {
  return strip(value);
}

/** Pull brand domains out of a listicle or directory page. */
export function extractBrandHosts(html: string, baseUrl: string, limit = 25): string[] {
  const baseHost = domainOf(baseUrl);
  const hosts: string[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && hosts.length < limit) {
    let href = match[1].replace(/&amp;/g, "&").trim();
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    try {
      const absolute = new URL(href, baseUrl);
      if (!/^https?:$/.test(absolute.protocol)) continue;
      const host = absolute.hostname.replace(/^www\./i, "").toLowerCase();
      if (host === baseHost) continue;
      if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(host)) continue;
      if (!isBrandHost(host)) continue;
      if (seen.has(host)) continue;
      seen.add(host);
      hosts.push(host);
    } catch {
      // ignore malformed links
    }
  }
  return hosts;
}

async function fetchHtml(url: string, timeoutMs = 9000): Promise<{ html: string; status: number } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
      redirect: "follow",
    });
    return { html: (await res.text()).slice(0, 400_000), status: res.status };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function strip(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function domainOf(url: string): string | null {
  try {
    const absolute = url.startsWith("//") ? `https:${url}` : url;
    const host = new URL(absolute).hostname.replace(/^www\./i, "").toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

function decodeDuckDuckGo(href: string): string {
  try {
    const absolute = href.startsWith("//") ? `https:${href}` : href;
    const url = new URL(absolute, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : absolute;
  } catch {
    return href;
  }
}

function decodeBing(href: string): string {
  const clean = href.replace(/&amp;/g, "&");
  const match = clean.match(/[?&]u=a1([^&]+)/);
  if (match) {
    let b64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    try {
      return Buffer.from(b64, "base64").toString("utf8");
    } catch {
      return clean;
    }
  }
  return clean.startsWith("//") ? `https:${clean}` : clean;
}

function toHit(
  href: string,
  title: string,
  snippet: string,
  provider: SearchHit["provider"],
): SearchHit | null {
  const url = provider === "duckduckgo" ? decodeDuckDuckGo(href) : provider === "bing" ? decodeBing(href) : href;
  const domain = domainOf(url);
  if (!domain || SEARCH_HOSTS.test(domain)) return null;
  return { title: strip(title), snippet: strip(snippet).slice(0, 320), url, domain, provider };
}

async function tavilySearch(query: string, limit: number): Promise<SearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ query, max_results: limit, search_depth: "basic" }),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    return (json.results ?? [])
      .map((r: any) => toHit(String(r.url ?? ""), String(r.title ?? ""), String(r.content ?? ""), "tavily"))
      .filter((h: SearchHit | null): h is SearchHit => Boolean(h));
  } catch {
    return [];
  }
}

async function duckDuckGo(query: string, limit: number): Promise<SearchHit[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const page = await fetchHtml(url);
  if (!page || page.status === 202) return [];
  const hits: SearchHit[] = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(page.html)) && hits.length < limit) {
    const block = page.html.slice(match.index, match.index + 1800);
    const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "";
    const hit = toHit(match[1], match[2], snippet, "duckduckgo");
    if (hit) hits.push(hit);
  }
  return hits;
}

async function bing(query: string, limit: number): Promise<SearchHit[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const page = await fetchHtml(url);
  if (!page) return [];
  const hits: SearchHit[] = [];
  const blocks = page.html.split('<li class="b_algo"').slice(1);
  for (const block of blocks) {
    if (hits.length >= limit) break;
    const anchor = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const snippet = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
    const hit = toHit(anchor[1], anchor[2], snippet, "bing");
    if (hit) hits.push(hit);
  }
  return hits;
}

function dedupe(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.domain)) return false;
    seen.add(hit.domain);
    return true;
  });
}

/**
 * Real web search with a free provider chain:
 * Tavily when a key exists, then DuckDuckGo HTML, then Bing HTML.
 */
export async function searchWeb(query: string, limit = 8): Promise<SearchResponse> {
  const q = query.trim();
  if (!q) return { hits: [], provider: "none", error: "Empty search" };

  const providers: string[] = [];
  if (process.env.TAVILY_API_KEY) {
    providers.push("tavily");
    const hits = await tavilySearch(q, limit);
    if (hits.length) return { hits: dedupe(hits), provider: "tavily" };
  }

  providers.push("duckduckgo");
  const ddg = await duckDuckGo(q, limit);
  if (ddg.length) return { hits: dedupe(ddg), provider: "duckduckgo" };

  providers.push("bing");
  const bingHits = await bing(q, limit);
  if (bingHits.length) return { hits: dedupe(bingHits), provider: "bing" };

  return {
    hits: [],
    provider: providers.join(" → "),
    error: "No web results. Add a free TAVILY_API_KEY for reliable search, or paste a domain.",
  };
}
