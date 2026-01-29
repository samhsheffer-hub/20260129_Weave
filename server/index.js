import "dotenv/config";
import express from "express";
import OpenAI from "openai";

const app = express();
app.use(express.json({ limit: "2mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildPrompt(body) {
  const shape = body.shape ?? "stacked rounded hedge pads";
  const trim = body.trim ?? "cleanly clipped edges with soft transitions";
  const layout = body.layout ?? "street-corner topiary";
  const lighting = body.lighting ?? "late afternoon sunlight, soft shadows";
  const camera = body.camera ?? "35mm lens, eye-level";
  const details = body.details ?? "dense leaf texture, subtle color variation, natural occlusion";

  return [
    "Hyper-realistic photograph of a sculpted topiary bush.",
    `Shape: ${shape}.`,
    `Trim: ${trim}.`,
    `Scene: ${layout}.`,
    `Lighting: ${lighting}.`,
    `Camera: ${camera}.`,
    details,
    "Ultra-detailed, natural shadows, believable materials.",
  ].join(" ");
}

app.post("/api/generate-bush", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY" });
      return;
    }

    const prompt = buildPrompt(req.body ?? {});
    const size = req.body?.size ?? "1024x1024";
    const quality = req.body?.quality ?? "high";
    const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1.5";

    const result = await openai.images.generate({
      model,
      prompt,
      size,
      quality,
      output_format: "png",
    });

    const image = result.data?.[0]?.b64_json;
    if (!image) {
      res.status(500).json({ error: "No image data returned" });
      return;
    }

    res.json({ image, prompt });
  } catch (error) {
    console.error(error);
    const message = error?.response?.data?.error?.message || error?.message || "Image generation failed";
    res.status(500).json({ error: message });
  }
});

const port = clamp(Number(process.env.PORT) || 3001, 1024, 65535);
app.listen(port, () => {
  console.log(`AI image server running on http://localhost:${port}`);
});
