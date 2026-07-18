/**
 * GitHub Models chat client (OpenAI-compatible). Free inside GitHub Actions via
 * the built-in GITHUB_TOKEN + `permissions: models: read` — no separate API key,
 * no cost. Used by generate.ts to turn collected market data + real news items
 * into a schema-valid report.json.
 */

export interface GhModelsConfig {
  token: string;
  endpoint?: string; // default https://models.github.ai/inference
  model?: string; // default openai/gpt-4o
}

export async function chatJson(
  cfg: GhModelsConfig,
  system: string,
  user: string,
  maxTokens = 8000,
): Promise<string> {
  const endpoint = (cfg.endpoint ?? "https://models.github.ai/inference").replace(/\/+$/, "");
  const model = cfg.model ?? "openai/gpt-4o";
  const url = `${endpoint}/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      top_p: 0.9,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub Models ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("GitHub Models returned no content");
  return content;
}
