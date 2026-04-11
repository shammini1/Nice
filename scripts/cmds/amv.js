const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const AMV_API_URL = "https://toshiro-editz-api.vercel.app/search/amv";

async function getStreamFromURL(url) {
  const response = await axios.get(url, {
    responseType: "stream",
    timeout: 120000,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    },
  });
  return response.data;
}

module.exports = {
  config: {
    name: "amv",
    aliases: ["anieditz", "animeedit"],
    author: "Toshiro Editz",
    version: "5.2",
    shortDescription: { en: "get anime edit" },
    longDescription: { en: "search for anime edits" },
    category: "anime",
    guide: { en: "{p}{n} [query]" },
  },

  onStart: async function ({ api, event, args }) {
    api.setMessageReaction("✨", event.messageID, event.threadID, () => {}, true);

    let query = args.join(" ").toLowerCase().trim() || "random";

    try {
      const res = await axios.get(
        `${AMV_API_URL}?keyword=${encodeURIComponent(query)}`,
        { timeout: 60000 }
      );

      const data = res.data;

      if (!data?.success || !data?.downloadUrl) {
        api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
        return api.sendMessage(
          "❌ No AMV found for: " + query,
          event.threadID,
          event.messageID
        );
      }

      const cacheDir = path.join(__dirname, "cache");
      await fs.ensureDir(cacheDir);
      const filePath = path.join(cacheDir, `amv_${Date.now()}.mp4`);

      const videoUrl = data.downloadUrl.replace("http://", "https://");
      const responseStream = await getStreamFromURL(videoUrl);

      const writer = fs.createWriteStream(filePath);
      responseStream.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });

      const stats = fs.statSync(filePath);
      if (stats.size === 0) throw new Error("File is empty");

      const msg = {
        body: `╔═『 𝙔𝙊𝙐𝙍 𝘼𝙈𝙑 𝙇𝙊𝘼𝘿𝙀𝘿 』═╗
║
║ 🔍 Query      ➤ ${query}
║ 🎬 Title      ➤ ${data.title || "Unknown Title"}
║ 📦 Size       ➤ ${data.size || "Unknown"}
║ ⏳ Duration   ➤ ${data.duration || "Unknown"}
║
║ 🖼️ Thumbnail  ➤ ${data.thumbnail || "Not Available"}
║
╚═══════════════╝

✨ Powered by —͟͞͞SA 𓆩D𓆪 IK 모`,
        attachment: fs.createReadStream(filePath),
      };

      await api.sendMessage(
        msg,
        event.threadID,
        (err) => {
          if (err) {
            console.error("Send Error:", err);
            api.sendMessage(
              "❌ Error sending video attachment.",
              event.threadID
            );
          }
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        },
        event.messageID
      );

      api.setMessageReaction("✅", event.messageID, event.threadID, () => {}, true);

    } catch (err) {
      console.error("[AMV CMD] Error:", err.message);
      api.setMessageReaction("❌", event.messageID, event.threadID, () => {}, true);
      const errorMsg =
        err.code === "ECONNABORTED"
          ? "⏱️ Timeout! Try again"
          : "❌ Failed to fetch AMV";
      api.sendMessage(errorMsg, event.threadID, event.messageID);
    }
  },
};
