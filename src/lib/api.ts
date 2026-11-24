function getApiBase(): string {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (!configured) return '';

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('VITE_API_BASE_URL must be an absolute HTTPS backend URL.');
  }
  const isLocalDevelopment = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (
    (url.protocol !== 'https:' && !(isLocalDevelopment && url.protocol === 'http:')) ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('VITE_API_BASE_URL must be an HTTPS origin without a path, credentials, query parameters, or fragments.');
  }
  return url.origin;
}

export function apiUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('API request paths must be origin-relative paths.');
  }
  return `${getApiBase()}${path}`;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(apiUrl(path), {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${response.status})`);
  }
  return data as T;
}
