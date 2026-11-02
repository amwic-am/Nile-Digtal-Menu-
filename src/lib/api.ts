export const TOKEN_KEY = 'nile.token';

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;
  constructor(message: string, status: number, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function token() {
  return localStorage.getItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('x-app-origin', window.location.origin);
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const auth = token();
  if (auth) headers.set('Authorization', `Bearer ${auth}`);
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    body:
      options.body === undefined
        ? undefined
        : options.body instanceof FormData || typeof options.body === 'string'
          ? (options.body as BodyInit)
          : JSON.stringify(options.body),
  });
  if (!response.ok) {
    let payload: Record<string, unknown> = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    const message = typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`;
    if (response.status === 401 && !path.startsWith('/public')) {
      window.dispatchEvent(new Event('nile:unauthorized'));
    }
    throw new ApiError(message, response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiPublic<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('x-app-origin', window.location.origin);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === 'string'
          ? (options.body as BodyInit)
          : JSON.stringify(options.body),
  });
  if (!response.ok) {
    let payload: Record<string, unknown> = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    throw new ApiError(
      typeof payload.error === 'string' ? payload.error : `Request failed (${response.status})`,
      response.status,
      payload,
    );
  }
  return (await response.json()) as T;
}

export async function downloadFile(path: string, fallbackName: string) {
  const headers = new Headers();
  headers.set('x-app-origin', window.location.origin);
  const auth = token();
  if (auth) headers.set('Authorization', `Bearer ${auth}`);
  const response = await fetch(`/api${path}`, { headers });
  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    try {
      const payload = await response.json();
      if (typeof payload.error === 'string') message = payload.error;
    } catch {
      /* binary error */
    }
    throw new ApiError(message, response.status);
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match?.[1] ?? fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
