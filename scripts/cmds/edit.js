const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = {
  config: {
    name: "edit",
    version: "1.0",
    author: "Mueid Mursalin Rifat",
    countDown: 15,
    role: 0,
    shortDescription: "🎨 Edit images with Shadowx-AI",
    longDescription: "Apply various edits and styles to images using AI",
    category: "media",
    guide: "{pn} [prompt] (reply to image or provide URL)\nExample: {pn} Make anime style",
    aliases: ["imageedit", "editimage"]
  },

  onStart: async function({ api, event, args, message }) {
    let processingMsg = null;
    
    try {
      // Get prompt (what edit to apply)
      const prompt = args.join(" ");
      if (!prompt) {
        return message.reply(
          `🎨 Image Editor\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📌 How to use:\n` +
          `• Reply to an image: ${this.config.name} [prompt]\n` +
          `• Provide image URL: ${this.config.name} [prompt] [url]\n` +
          `• Attach image: ${this.config.name} [prompt]\n\n` +
          `✨ Example prompts:\n` +
          `• Make anime style\n` +
          `• Enhance quality\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👨‍💻 Author: Mueid Mursalin Rifat`
        );
      }

      // Get image source
      let imageUrl;
      
      // Check for URL in arguments (after prompt)
      const urlMatch = args.find(arg => arg.match(/^https?:\/\//));
      if (urlMatch) {
        imageUrl = urlMatch;
      }
      // Check for reply
      else if (event.type === "message_reply" && event.messageReply.attachments?.[0]) {
        imageUrl = event.messageReply.attachments[0].url;
      }
      // Check for attachment
      else if (event.attachments?.[0]) {
        imageUrl = event.attachments[0].url;
      }
      
      if (!imageUrl) {
        return message.reply("❌ Please provide an image (reply, URL, or attach)");
      }

      // Send processing message
      processingMsg = await message.reply(`🎨 Editing image with AI...\n🪄 Prompt: "${prompt}"\n⏳ This may take 10-30 seconds`);

      // Call ShadowX API
      const apiUrl = `https://shadowx-api.onrender.com/api/edit?url=${encodeURIComponent(imageUrl)}&p=${encodeURIComponent(prompt)}`;
      const response = await axios.get(apiUrl, { timeout: 60000 });
      const data = response.data;

      if (!data.success) {
        throw new Error(data.message || "Edit failed");
      }

      // Get edited image URL
      const editedUrl = data.catbox_url;
      
      if (!editedUrl) {
        throw new Error("No edited image URL received");
      }

      // Download edited image
      const imgRes = await axios.get(editedUrl, { 
        responseType: 'arraybuffer',
        timeout: 30000 
      });
      
      const tempPath = path.join(__dirname, `edited_${Date.now()}.png`);
      fs.writeFileSync(tempPath, imgRes.data);

      // Delete processing message
      await api.unsendMessage(processingMsg.messageID);

      // Send result
      await message.reply({
        body: `✅ Image Edited!\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `🖼️ Prompt: ${prompt}\n` +
              `⏰ Time: ${data.job?.processing_time || "N/A"}\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `✨ Enjoy your edited image!`,
        attachment: fs.createReadStream(tempPath)
      });

      // Cleanup
      fs.unlinkSync(tempPath);

    } catch (error) {
      console.error("Edit Error:", error);
      
      if (processingMsg) {
        await api.unsendMessage(processingMsg.messageID);
      }
      
      let errorMsg = "❌ Edit failed.\n";
      if (error.code === 'ECONNABORTED') {
        errorMsg += "• Request timeout\n";
      } else if (error.response?.status === 413) {
        errorMsg += "• Image too large\n";
      } else {
        errorMsg += `• ${error.message}\n`;
      }
      errorMsg += "\nTry again with a different prompt or image.";
      
      message.reply(errorMsg);
    }
  }
};
