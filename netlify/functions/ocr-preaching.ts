import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";

const json = (status: number, body: unknown) => ({
    statusCode: status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
});

export const handler: Handler = async (event: HandlerEvent, _context: HandlerContext) => {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            body: "",
        };
    }

    if (event.httpMethod !== "POST") {
        return json(405, { error: "Method not allowed" });
    }

    try {
        // Decode body (Netlify may base64-encode large bodies)
        const rawBody = event.isBase64Encoded && event.body
            ? Buffer.from(event.body, "base64").toString("utf-8")
            : event.body;
        const body = rawBody ? JSON.parse(rawBody) : {};

        const { imageUrl } = body as { imageUrl?: string };
        if (!imageUrl) return json(400, { error: "imageUrl required" });

        if (!process.env.GEMINI_API_KEY) {
            console.error("[ocr-preaching] GEMINI_API_KEY not configured");
            return json(500, { error: "OCR not configured (missing API key)" });
        }

        // Fetch image server-side — bypasses client CORS on Firebase Storage URLs
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) {
            console.error("[ocr-preaching] Failed to fetch image:", imgRes.status, imageUrl);
            return json(502, { error: "Failed to fetch image from URL" });
        }

        const arrayBuf = await imgRes.arrayBuffer();
        const base64Data = Buffer.from(arrayBuf).toString("base64");

        // Detect MIME type from URL extension (before query params)
        const ext = imageUrl.split("?")[0].split(".").pop()?.toLowerCase() ?? "jpg";
        const mimeMap: Record<string, string> = {
            jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
            gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
        };
        const mimeType = mimeMap[ext] ?? "image/jpeg";

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{
                role: "user",
                parts: [
                    { inlineData: { data: base64Data, mimeType } },
                    {
                        text: `You are a precise sermon document transcriber. Extract ALL visible text from this image EXACTLY as it appears, preserving:\n- Every section heading (e.g. "Introduction:", "Key Points:", "Conclusion:")\n- Every scripture reference and Bible verse\n- Every bullet point, note, or outline item\n- Every annotation, emphasis, or formatting cue\n- Empty lines between sections for spacing\n\nRules:\n- Do NOT skip any visible text.\n- Do NOT add, invent, or summarize anything.\n- Do NOT use Markdown formatting (no **, no ##, no bullets unless they appear in the original).\n- Output ONLY the plain text transcription, nothing else.`,
                    },
                ],
            }],
        });

        let rawText = "";
        try {
            rawText = response.candidates?.[0]?.content?.parts
                ?.filter((p: any) => typeof p.text === "string")
                ?.map((p: any) => p.text as string)
                ?.join("") ?? "";
            if (!rawText) rawText = (response as any).text ?? "";
        } catch { /* no usable text */ }

        return json(200, { ok: true, text: rawText.replace(/\*\*/g, "").trim() });
    } catch (e: any) {
        console.error("[ocr-preaching]", e?.message ?? e);
        return json(500, { error: "OCR failed", detail: e?.message });
    }
};
