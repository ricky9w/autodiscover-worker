interface Env {
	UPSTREAM: string;
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		url.hostname = env.UPSTREAM;
		url.protocol = "https:";

		const headers = new Headers(request.headers);
		headers.set("Host", env.UPSTREAM);

		const response = await fetch(url.toString(), {
			method: request.method,
			headers,
			body: request.body,
			redirect: "follow",
		});

		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	},
} satisfies ExportedHandler<Env>;
