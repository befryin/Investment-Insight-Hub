import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/proxy-file", async (req, res) => {
  const target = req.query["url"] as string | undefined;
  if (!target) {
    res.status(400).json({ error: "url parameter required" });
    return;
  }
  try {
    const r = await fetch(target, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; FolioBot/1.0)" },
    });
    if (!r.ok) {
      res.status(502).json({ error: `Upstream ${r.status}` });
      return;
    }
    
    // Copy content-type header
    const contentType = r.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    
    const arrayBuffer = await r.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;