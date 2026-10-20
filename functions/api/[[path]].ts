const API_ORIGIN = "https://dtr-api.sanigkram24.workers.dev"

type PagesContext = {
  request: Request
}

export async function onRequest({ request }: PagesContext): Promise<Response> {
  const incoming = new URL(request.url)
  const target = new URL(incoming.pathname + incoming.search, API_ORIGIN)

  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
    redirect: "manual",
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body
  }

  return fetch(new Request(target, init))
}
