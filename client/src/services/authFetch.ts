export const AUTH_TOKEN_KEY = 'linggan_token';

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY);
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    window.dispatchEvent(new Event('linggan:auth-expired'));
  }

  return res;
}
