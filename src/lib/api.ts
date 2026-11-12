
import { supabase } from './supabase';

// Railway backend URL
const API_BASE_URL = (
  import.meta.env.VITE_API_URL ||
  'https://nile-digtal-menu-production.up.railway.app'
).replace(/\/+$/, '');

export const TOKEN_KEY = 'nile.token';

// Build backend API URLs
function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/api/')
    ? path
    : `/api${path.startsWith('/') ? path : `/${path}`}`;

  return `${API_BASE_URL}${normalizedPath}`;
}

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    payload: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function token(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();

  if (error) throw error;

  const accessToken = data.session?.access_token ?? null;

  if (accessToken) {
    localStorage.setItem(TOKEN_KEY, accessToken);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }

  return accessToken;
}

async function authenticatedFetch(
  path: string,
  init: RequestInit,
  initialToken: string | null,
): Promise<Response> {
  const send = async (accessToken: string | null) => {
    const headers = new Headers(init.headers);

    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    } else {
      headers.delete('Authorization');
    }

    return fetch(apiUrl(path), {
      ...init,
      headers,
    });
  };

  let response = await send(initialToken);

  if (response.status !== 401) {
    return response;
  }

  const { data, error } = await supabase.auth.refreshSession();

  if (error) {
    console.error(
      '[nile] could not refresh Supabase Auth session:',
      error,
    );
  } else if (data.session) {
    localStorage.setItem(
      TOKEN_KEY,
      data.session.access_token,
    );

    response = await send(data.session.access_token);
  }

  return response;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let payload: Record<string, unknown> = {};

    try {
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        payload = await response.json();
      } else {
        const text = await response.text();
        console.error('[nile] Non-JSON API response:', text.slice(0, 300));
      }
    } catch {
      payload = {};
    }

    const message =
      typeof payload.error === 'string'
        ? payload.error
        : `Request failed (${response.status})`;

    throw new ApiError(message, response.status, payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await response.text();

    console.error(
      '[nile] Expected JSON but received:',
      text.slice(0, 300),
    );

    throw new ApiError(
      'Backend returned HTML or an unexpected response. Check the API URL and backend route.',
      response.status,
    );
  }

  return (await response.json()) as T;
}

export async function api<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  headers.set('x-app-origin', window.location.origin);

  if (
    options.body !== undefined &&
    !(options.body instanceof FormData) &&
    !(options.body instanceof Blob)
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const auth = await token();

  if (auth) {
    headers.set('Authorization', `Bearer ${auth}`);
  }

  const response = await authenticatedFetch(
    path,
    {
      ...options,
      headers,
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData ||
              options.body instanceof Blob ||
              typeof options.body === 'string'
            ? (options.body as BodyInit)
            : JSON.stringify(options.body),
    },
    auth,
  );

  if (response.status === 401 && !path.startsWith('/public')) {
    window.dispatchEvent(new Event('nile:unauthorized'));
  }

  return parseResponse<T>(response);
}

export async function apiPublic<T>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: unknown } = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  headers.set('x-app-origin', window.location.origin);

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(apiUrl(`/api${path}`), {
    ...options,
    headers,
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === 'string'
          ? (options.body as BodyInit)
          : JSON.stringify(options.body),
  });

  return parseResponse<T>(response);
}

export async function downloadFile(
  path: string,
  fallbackName: string,
): Promise<void> {
  const headers = new Headers();

  headers.set('x-app-origin', window.location.origin);

  const auth = await token();

  if (auth) {
    headers.set('Authorization', `Bearer ${auth}`);
  }

  const response = await authenticatedFetch(
    path,
    { headers },
    auth,
  );

  if (!response.ok) {
    let message = `Download failed (${response.status})`;

    try {
      const payload = await response.json();

      if (typeof payload.error === 'string') {
        message = payload.error;
      }
    } catch {
      // Binary error response
    }

    throw new ApiError(message, response.status);
  }

  const disposition =
    response.headers.get('content-disposition') ?? '';

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
