const axios = require("axios");
const yts = require("yt-search");
const fs = require("fs-extra");
const path = require("path");

module.exports = {
  config: {
    name: "yt",
    aliases: ["youtube", "ytb"],
    version: "4.1",
    author: "Mueid Mursalin Rifat 😺",
    countDown: 5,
    role: 0,
    shortDescription: "🎵 YouTube downloader",
    longDescription: "Search and download YouTube audio (-a) or video (-v) with quality selection.",
    category: "media",
    guide: {
      en: "{pn} <query/link> -a (audio)\n{pn} <query/link> -v (video) [quality]\n\nQuality options: 144, 360, 480, 720, 1080 (default: 480p)\n\nReply with 1-5 to download.\n\nExamples:\n{prefix}yt song name -a\n{prefix}yt https://youtube.com/watch?v=... -v 720\n{prefix}yt song name -v 1080"
    }
  },

  onStart: async function ({ message, event, args, api }) {
    const raw = args.join(" ");
    if (!raw) return message.reply("❗ Use: yt <query/link> -a or -v [quality]");

    const isAudio = raw.includes("-a");
    const isVideo = raw.includes("-v");

    if (!isAudio && !isVideo)
      return message.reply("❗ Please use `-a` for audio or `-v` for video.");

    // Extract quality from command
    let quality = "360"; // Default quality
    if (isVideo) {
      const qualityMatch = raw.match(/\b(144|360|480|720|1080)\b/);
      if (qualityMatch) {
        quality = qualityMatch[1];
      }
    }

    // Remove all flags and quality numbers
    const query = raw.replace(/-a|-v|\b(144|360|480|720|1080)\b/g, "").trim();

    if (!query) return message.reply("❗ Please provide a search query or YouTube URL.");

    // Handle direct URL download
    if (/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(query)) {
      const wait = await message.reply(`⏳ Downloading ${isAudio ? "audio" : `video (${quality}p)`}, please wait...`);
      await handleDownload(query, isAudio ? "audio" : "video", message, wait.messageID, quality);
      return;
    }

    try {
      const res = await yts(query);
      const videos = res.videos.slice(0, 5);
      if (videos.length === 0) return message.reply("❌ No results found.");

      let body = `🎬 Results for: "${query}"\nReply with 1-5 to download ${isAudio ? "audio" : `video (${quality}p)`}\n\n`;
      for (let i = 0; i < videos.length; i++) {
        body += `${i + 1}. ${videos[i].title} (${videos[i].timestamp})\nBy: ${videos[i].author.name}\n\n`;
      }

      const attachments = [];
      for (let i = 0; i < videos.length; i++) {
        try {
          const img = await axios.get(videos[i].thumbnail, { responseType: "stream" });
          const tempPath = path.join(__dirname, "cache", `yt-thumb-${i}-${Date.now()}.jpg`);
          const writer = fs.createWriteStream(tempPath);
          img.data.pipe(writer);
          await new Promise(resolve => writer.on("finish", resolve));
          attachments.push(fs.createReadStream(tempPath));
        } catch (e) {
          console.error("Error downloading thumbnail:", e);
        }
      }

      api.sendMessage({
        body: body + `🔰 Dev: Mueid Mursalin Rifat 😺`,
        attachment: attachments
      }, event.threadID, (err, info) => {
        // Clean up temp files
        attachments.forEach(file => {
          try { 
            fs.unlinkSync(file.path); 
          } catch (e) {}
        });

        if (err) {
          console.error("Send message error:", err);
          return;
        }

        const sentMsgID = info.messageID;
        
        // Auto delete after 30 seconds
        setTimeout(() => {
          try {
            api.unsendMessage(sentMsgID);
          } catch (e) {}
        }, 30000);

        global.GoatBot.onReply.set(sentMsgID, {
          commandName: "yt",
          messageID: sentMsgID,
          author: event.senderID,
          type: "yt-reply",
          data: videos,
          isAudio: isAudio,
          quality: quality
        });
      });

    } catch (e) {
      console.error("Search error:", e);
      message.reply("⚠️ Failed to search YouTube.");
    }
  },

  onReply: async function ({ event, message, Reply, api }) {
    const { author, data, isAudio, quality, messageID } = Reply;
    if (event.senderID !== author) return;

    const index = parseInt(event.body);
    if (isNaN(index) || index < 1 || index > data.length)
      return message.reply("❗ Reply with a number from 1–5.");

    const selected = data[index - 1];

    try {
      api.unsendMessage(messageID);
    } catch (e) {}

    const wait = await message.reply(`⏳ Downloading ${isAudio ? "audio" : `video (${quality}p)`}, please wait...`);
    await handleDownload(selected.url, isAudio ? "audio" : "video", message, wait.messageID, quality);
  }
};

// Simple Download Handler
async function handleDownload(url, type, message, waitMsgID, quality = null) {
  try {
    let downloadUrl;
    let metadata;
    let apiSource;
    let fileExtension = type === "audio" ? "mp3" : "mp4";

    // Try ShadowX API first
    try {
      console.log("Trying ShadowX API...");
      let shadowxApiURL;
      
      if (type === "video") {
        shadowxApiURL = `https://shadowx-api.onrender.com/api/yt?url=${encodeURIComponent(url)}&quality=${quality}&format=mp4`;
      } else {
        shadowxApiURL = `https://shadowx-api.onrender.com/api/yt?url=${encodeURIComponent(url)}&format=mp3`;
      }
      
      const { data: shadowxData } = await axios.get(shadowxApiURL, { timeout: 15000 });
      
      if (shadowxData.success && shadowxData.download_info && shadowxData.download_info.fileUrl) {
        downloadUrl = shadowxData.download_info.fileUrl;
        metadata = shadowxData.video_info;
        apiSource = "ShadowX";
        console.log("ShadowX API success, fileUrl:", downloadUrl);
      }
    } catch (shadowxError) {
      console.log("ShadowX API failed:", shadowxError.message);
    }

    // If ShadowX failed, try ShadowX Downloader API as fallback
    if (!downloadUrl) {
      try {
        console.log("Trying ShadowX Downloader API...");
        
        // Extract video ID from URL
        let videoId = url;
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
          const urlObj = new URL(url);
          if (url.includes('youtube.com/shorts/')) {
            videoId = url.split('shorts/')[1].split('?')[0];
          } else if (url.includes('youtube.com/watch')) {
            videoId = urlObj.searchParams.get('v');
          } else if (url.includes('youtu.be/')) {
            videoId = url.split('youtu.be/')[1].split('?')[0];
          }
        }
        
        if (!videoId) {
          throw new Error("Could not extract video ID");
        }
        
        // For video downloads
        if (type === "video") {
          const qualityOption = quality ? quality : "best";
          const downloaderApiURL = `https://shadowx-downloader.vercel.app/dl?url=${encodeURIComponent(url)}&quality=${qualityOption}&key=shadowx`;
          
          const { data: downloaderData } = await axios.get(downloaderApiURL, { timeout: 15000 });
          
          if (downloaderData.success && downloaderData.download && downloaderData.download.url) {
            // Construct full download URL
            const baseUrl = "https://shadowx-downloader.vercel.app";
            downloadUrl = baseUrl + downloaderData.download.url;
            metadata = {
              title: downloaderData.title,
              duration: downloaderData.duration,
              thumbnail: downloaderData.thumbnail,
              channel: "YouTube"
            };
            apiSource = "ShadowX-Downloader";
            console.log("ShadowX Downloader API success");
          }
        } 
        // For audio downloads
        else {
          // ShadowX Downloader might not support audio directly, so use best quality video
          const downloaderApiURL = `https://shadowx-downloader.vercel.app/dl?url=${encodeURIComponent(url)}&quality=best&key=shadowx`;
          
          const { data: downloaderData } = await axios.get(downloaderApiURL, { timeout: 15000 });
          
          if (downloaderData.success && downloaderData.download && downloaderData.download.url) {
            const baseUrl = "https://shadowx-downloader.vercel.app";
            downloadUrl = baseUrl + downloaderData.download.url;
            metadata = {
              title: downloaderData.title,
              duration: downloaderData.duration,
              thumbnail: downloaderData.thumbnail,
              channel: "YouTube"
            };
            apiSource = "ShadowX-Downloader (Video converted)";
            console.log("ShadowX Downloader API success for audio (using video)");
          }
        }
      } catch (downloaderError) {
        console.log("ShadowX Downloader API failed:", downloaderError.message);
      }
    }

    // If both APIs failed
    if (!downloadUrl) {
      throw new Error("All APIs failed");
    }

    // Download and send the file
    await downloadAndSendFile(downloadUrl, metadata, type, message, waitMsgID, quality, apiSource);

  } catch (err) {
    console.error("Download failed:", err.message || err);
    try {
      await message.unsend(waitMsgID);
    } catch (e) {}
    message.reply("❌ Error downloading file. Please try again later.");
  }
}

// Download and Send File
async function downloadAndSendFile(downloadUrl, metadata, type, message, waitMsgID, quality, apiSource) {
  try {
    const fileExtension = type === "audio" ? "mp3" : "mp4";
    const fileName = `${Date.now()}.${fileExtension}`;
    const filePath = path.join(__dirname, "cache", fileName);

    console.log("Downloading from:", downloadUrl);
    
    const res = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      }
    });

    const writer = fs.createWriteStream(filePath);
    res.data.pipe(writer);
    
    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    // Remove wait message
    try {
      await message.unsend(waitMsgID);
    } catch (e) {
      console.error("Failed to unsend wait message:", e);
    }

    const fileSize = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);
    
    // Build message body
    let body = `🎵 ${metadata?.title || "YouTube Media"}\n`;
    
    if (metadata?.channel || metadata?.author?.name) {
      body += `📺 Channel: ${metadata.channel || metadata.author?.name}\n`;
    }
    
    if (metadata?.duration) {
      body += `⏱ Duration: ${metadata.duration}\n`;
    }
    
    if (type === "video") {
      body += `📥 Quality: ${quality}p\n`;
    } else {
      body += `🎧 Audio Quality: 128K\n`;
    }
    
    body += `📦 Size: ${fileSize}MB\n`;
    body += `🔧 API: ${apiSource}\n\n`;
    body += `🔰 Made by Anik Islam Sadik 😺`;

    await message.reply({
      body: body,
      attachment: fs.createReadStream(filePath)
    });

    // Clean up
    fs.unlinkSync(filePath);

  } catch (err) {
    console.error("Download and send error:", err.message);
    
    // Try to clean up if file exists
    try {
      const filePath = path.join(__dirname, "cache", `${Date.now()}.${type === "audio" ? "mp3" : "mp4"}`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }
    
    throw err;
  }
}
