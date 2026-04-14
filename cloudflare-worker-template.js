/**
 * L'Oréal Routine Builder - Cloudflare Worker
 *
 * This Worker handles API requests from the frontend and securely proxies them to OpenAI
 *
 * HOW TO SET UP:
 * 1. Go to https://workers.cloudflare.com
 * 2. Create a new Worker
 * 3. Copy ALL code from this file into the Worker editor
 * 4. Add environment variables in the Worker settings:
 *    - Name: OPENAI_API_KEY
 *    - Value: your actual OpenAI API key (https://platform.openai.com/api-keys)
 * 5. Deploy the Worker
 * 6. Copy your Worker URL (e.g., https://your-worker-name.your-account.workers.dev)
 * 7. Paste it into secrets.js as CLOUDFLARE_WORKER_URL
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return handleCors();
    }

    // Only allow POST requests
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...getCorsHeaders() },
      });
    }

    try {
      // Parse request body
      const body = await request.json();
      const { messages, context, useWebSearch } = body;

      // Validate input
      if (!messages || !Array.isArray(messages)) {
        return new Response(
          JSON.stringify({ error: "Invalid request: messages array required" }),
          {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...getCorsHeaders(),
            },
          },
        );
      }

      // Get API key from environment
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        console.error("OPENAI_API_KEY not found in environment");
        return new Response(
          JSON.stringify({ error: "Server configuration error" }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              ...getCorsHeaders(),
            },
          },
        );
      }

      // Build request payload
      // Add context system message if provided
      let requestMessages = messages;
      if (context) {
        requestMessages = [{ role: "system", content: context }, ...messages];
      }

      const responsePayload = {
        model: useWebSearch ? "gpt-4.1" : "gpt-4o",
        input: requestMessages,
        temperature: 0.7,
        max_output_tokens: 1000,
      };

      // Enable live web search when requested by the frontend.
      if (useWebSearch) {
        responsePayload.tools = [{ type: "web_search_preview" }];
      }

      // Call OpenAI Responses API
      const openaiResponse = await fetch(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(responsePayload),
        },
      );

      // Check for API errors
      if (!openaiResponse.ok) {
        const errorData = await openaiResponse.json();
        console.error("OpenAI API error:", errorData);
        return new Response(
          JSON.stringify({
            error: "OpenAI API error",
            details: errorData.error?.message || "Unknown error",
          }),
          {
            status: openaiResponse.status,
            headers: {
              "Content-Type": "application/json",
              ...getCorsHeaders(),
            },
          },
        );
      }

      // Parse OpenAI response
      const data = await openaiResponse.json();

      // Extract plain output text first
      let message = data.output_text;

      // Collect source links if web search annotations are present
      const sources = [];
      const outputItems = Array.isArray(data.output) ? data.output : [];
      outputItems.forEach((item) => {
        const contentItems = Array.isArray(item.content) ? item.content : [];
        contentItems.forEach((contentItem) => {
          const annotations = Array.isArray(contentItem.annotations)
            ? contentItem.annotations
            : [];
          annotations.forEach((annotation) => {
            const url =
              annotation.url || annotation.source?.url || annotation.web_url;
            const title =
              annotation.title ||
              annotation.source?.title ||
              annotation.display_text ||
              "Source";
            if (url) {
              sources.push({ title, url });
            }
          });
        });
      });

      // Fallback text extraction for edge cases
      if (!message && outputItems.length > 0) {
        const textParts = [];
        outputItems.forEach((item) => {
          const contentItems = Array.isArray(item.content) ? item.content : [];
          contentItems.forEach((contentItem) => {
            const textValue =
              contentItem.text ||
              contentItem.output_text ||
              contentItem.content ||
              null;
            if (typeof textValue === "string") {
              textParts.push(textValue);
            }
          });
        });
        message = textParts.join("\n").trim();
      }

      if (!message) {
        throw new Error("No message content in OpenAI response");
      }

      // Append unique sources as links for user visibility.
      const uniqueSources = [];
      const seen = new Set();
      sources.forEach((source) => {
        const key = `${source.title}::${source.url}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueSources.push(source);
        }
      });

      if (uniqueSources.length > 0) {
        const sourceLines = uniqueSources
          .slice(0, 6)
          .map((source) => `- ${source.title}: ${source.url}`)
          .join("\n");
        message = `${message}\n\nSources:\n${sourceLines}`;
      }

      // Return success response
      return new Response(
        JSON.stringify({
          success: true,
          message: message,
          citations: uniqueSources,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...getCorsHeaders() },
        },
      );
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          details: error.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...getCorsHeaders() },
        },
      );
    }
  },
};

// CORS headers to allow requests from your frontend
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// Handle CORS preflight
function handleCors() {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
}
