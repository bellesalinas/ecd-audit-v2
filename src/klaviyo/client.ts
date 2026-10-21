// Thin Klaviyo REST client: auth, revision header, retries on 429/5xx and
// cursor pagination. Uses the global fetch (Node 20+).

export const KLAVIYO_REVISION = "2026-10-15";
const BASE_URL = "https://a.klaviyo.com/api";
const MAX_ATTEMPTS = 6;

export type FetchFn = typeof fetch;

export class KlaviyoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

interface JsonApiResource {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
}

interface JsonApiPage {
  data: JsonApiResource[];
  links?: { next?: string | null };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class KlaviyoClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = fetch,
    private readonly log: (line: string) => void = () => {},
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {
    if (!apiKey) throw new Error("A Klaviyo private API key is required");
  }

  async request<T>(method: "GET" | "POST", pathOrUrl: string, body?: unknown): Promise<T> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
    for (let attempt = 1; ; attempt++) {
      const res = await this.fetchFn(url, {
        method,
        headers: {
          Authorization: `Klaviyo-API-Key ${this.apiKey}`,
          revision: KLAVIYO_REVISION,
          accept: "application/vnd.api+json",
          ...(body ? { "content-type": "application/vnd.api+json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.ok) return (await res.json()) as T;

      const text = await res.text();
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        throw new KlaviyoError(`Klaviyo ${method} ${url} failed with ${res.status}: ${text.slice(0, 500)}`, res.status, text);
      }
      // Report endpoints allow 2 calls a minute, so Retry-After can be long.
      const retryAfter = Number(res.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
      this.log(`Klaviyo returned ${res.status}; retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
      await this.wait(delayMs);
    }
  }

  /** Follows links.next until the collection is exhausted. */
  async getAll(path: string): Promise<JsonApiResource[]> {
    const items: JsonApiResource[] = [];
    let next: string | null | undefined = path;
    while (next) {
      const page: JsonApiPage = await this.request<JsonApiPage>("GET", next);
      items.push(...page.data);
      next = page.links?.next;
    }
    return items;
  }
}
