const root = `${import.meta.dir}/../dist`;

function contentType(pathname: string): string {
  if (pathname.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (pathname.endsWith(".map")) {
    return "application/json; charset=utf-8";
  }
  if (pathname.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  return "application/octet-stream";
}

Bun.serve({
  hostname: "127.0.0.1",
  port: 31333,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response("<!doctype html><title>@boltwall/l402 import</title>", {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }
    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    const pathname = url.pathname;
    const file = Bun.file(`${root}${pathname}`);

    if (!(await file.exists())) {
      return new Response("not found", { status: 404 });
    }

    return new Response(file, {
      headers: {
        "content-type": contentType(pathname),
        "cache-control": "no-store",
      },
    });
  },
});
