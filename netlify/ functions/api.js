// netlify/functions/api.js
// Satu endpoint untuk semua aksi aplikasi chat "PKS Bandung Kulon"
// Data disimpan di Supabase (Postgres)

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "gantipassword";

function pad(n, len = 4) {
  return String(n).padStart(len, "0");
}

function privateConvoId(idA, idB) {
  const sorted = [idA, idB].sort();
  return `p_${sorted[0]}_${sorted[1]}`;
}

function reply(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  };
}

async function nextSeq(seqName) {
  const { data, error } = await supabase.rpc("nextval_public", { seq_name: seqName });
  if (error) throw error;
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return reply(405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "Body tidak valid" });
  }

  const { action } = body;

  try {
    switch (action) {
      case "register": {
        const { name, password, phone } = body;
        if (!name || !password || !phone) {
          return reply(400, { error: "Nama, nomor HP, dan kata sandi wajib diisi" });
        }

        // Bersihkan nomor: hilangkan spasi/strip/tanda kurung, hanya sisakan angka dan "+"
        let id = phone.replace(/[^0-9+]/g, "");
        if (!/^(\+?62|0)8[0-9]{7,12}$/.test(id)) {
          return reply(400, { error: "Format nomor HP tidak valid. Contoh: 08123456789" });
        }
        // Samakan format ke 62xxxx (tanpa +, tanpa 0 di depan)
        if (id.startsWith("0")) id = "62" + id.slice(1);
        if (id.startsWith("+")) id = id.slice(1);

        const { data: existing } = await supabase.from("users").select("id").eq("id", id).single();
        if (existing) return reply(409, { error: "Nomor HP ini sudah terdaftar. Silakan masuk (login)." });

        const { error } = await supabase.from("users").insert({ id, name: name.trim(), password });
        if (error) throw error;

        return reply(200, { id, name: name.trim() });
      }

      case "login": {
        const { id, password } = body;
        const { data: user, error } = await supabase.from("users").select("*").eq("id", id).single();
        if (error || !user || user.password !== password) {
          return reply(401, { error: "Nomor HP atau kata sandi salah" });
        }
        return reply(200, { id: user.id, name: user.name });
      }

      case "findUser": {
        const { id } = body;
        const { data: user } = await supabase.from("users").select("id,name").eq("id", id).single();
        if (!user) return reply(404, { error: "Nomor HP tidak ditemukan" });
        return reply(200, user);
      }

      case "startPrivateChat": {
        const { id, targetId } = body;
        if (id === targetId) return reply(400, { error: "Tidak bisa chat dengan diri sendiri" });

        const { data: targetUser } = await supabase.from("users").select("id,name").eq("id", targetId).single();
        if (!targetUser) return reply(404, { error: "Nomor HP tidak ditemukan" });

        const convoId = privateConvoId(id, targetId);
        const { data: existing } = await supabase.from("conversations").select("id").eq("id", convoId).single();

        if (!existing) {
          const { error: convoErr } = await supabase.from("conversations").insert({ id: convoId, type: "private" });
          if (convoErr) throw convoErr;
          const { error: memErr } = await supabase.from("conversation_members").insert([
            { conversation_id: convoId, user_id: id },
            { conversation_id: convoId, user_id: targetId },
          ]);
          if (memErr) throw memErr;
        }

        return reply(200, { convoId, otherName: targetUser.name, otherId: targetId });
      }

      case "createGroup": {
        const { id, groupName } = body;
        if (!groupName) return reply(400, { error: "Nama grup wajib diisi" });

        const seqVal = await nextSeq("group_id_seq");
        const groupId = `g_${pad(seqVal)}`;

        const { error: convoErr } = await supabase.from("conversations").insert({
          id: groupId, type: "group", name: groupName.trim(), admin_id: id,
        });
        if (convoErr) throw convoErr;

        const { error: memErr } = await supabase.from("conversation_members").insert({
          conversation_id: groupId, user_id: id,
        });
        if (memErr) throw memErr;

        return reply(200, { groupId, name: groupName.trim() });
      }

      case "joinGroup": {
        const { id, groupId } = body;
        const { data: group } = await supabase.from("conversations").select("*").eq("id", groupId).eq("type", "group").single();
        if (!group) return reply(404, { error: "Kode grup tidak ditemukan" });

        const { error } = await supabase.from("conversation_members")
          .upsert({ conversation_id: groupId, user_id: id }, { onConflict: "conversation_id,user_id" });
        if (error) throw error;

        return reply(200, { groupId, name: group.name });
      }

      case "getConversations": {
        const { id } = body;

        const { data: memberships, error: memErr } = await supabase
          .from("conversation_members").select("conversation_id").eq("user_id", id);
        if (memErr) throw memErr;

        const convoIds = memberships.map((m) => m.conversation_id);
        let list = [];

        if (convoIds.length > 0) {
          const { data: convos } = await supabase.from("conversations").select("*").in("id", convoIds);

          for (const convo of convos) {
            const { data: lastMsgArr } = await supabase
              .from("messages").select("text,media_type,created_at")
              .eq("conversation_id", convo.id)
              .order("created_at", { ascending: false }).limit(1);
            const lastMsg = lastMsgArr && lastMsgArr[0];
            let previewText = "";
            if (lastMsg) {
              if (lastMsg.text) previewText = lastMsg.text;
              else if (lastMsg.media_type && lastMsg.media_type.startsWith("image/")) previewText = "📷 Gambar";
              else if (lastMsg.media_type && lastMsg.media_type.startsWith("video/")) previewText = "🎬 Video";
              else if (lastMsg.media_type) previewText = "📄 Dokumen";
            }

            let title = convo.name;
            if (convo.type === "private") {
              const { data: members } = await supabase
                .from("conversation_members").select("user_id").eq("conversation_id", convo.id);
              const otherId = members.map((m) => m.user_id).find((uid) => uid !== id);
              const { data: otherUser } = await supabase.from("users").select("name").eq("id", otherId).single();
              title = otherUser ? otherUser.name : otherId;
            }

            list.push({
              convoId: convo.id,
              type: convo.type,
              title,
              lastMessage: previewText,
              lastTimestamp: lastMsg ? new Date(lastMsg.created_at).getTime() : 0,
            });
          }
          list.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
        }

        const { data: announcements } = await supabase
          .from("announcements").select("text,created_at")
          .order("created_at", { ascending: false }).limit(20);

        return reply(200, {
          conversations: list,
          announcements: (announcements || []).reverse().map((a) => ({ text: a.text, timestamp: new Date(a.created_at).getTime() })),
        });
      }

      case "getMessages": {
        const { id, convoId } = body;
        const { data: membership } = await supabase
          .from("conversation_members").select("*").eq("conversation_id", convoId).eq("user_id", id).single();
        if (!membership) return reply(404, { error: "Percakapan tidak ditemukan" });

        const { data: messages, error } = await supabase
          .from("messages").select("from_id,from_name,text,media_url,media_type,file_name,created_at")
          .eq("conversation_id", convoId).order("created_at", { ascending: true }).limit(300);
        if (error) throw error;

        return reply(200, {
          messages: messages.map((m) => ({
            from: m.from_id, fromName: m.from_name, text: m.text,
            mediaUrl: m.media_url, mediaType: m.media_type, fileName: m.file_name,
            timestamp: new Date(m.created_at).getTime(),
          })),
        });
      }

      case "sendMessage": {
        const { id, convoId, text, mediaUrl, mediaType, fileName } = body;
        const hasText = text && text.trim();
        if (!hasText && !mediaUrl) return reply(400, { error: "Pesan kosong" });

        const { data: membership } = await supabase
          .from("conversation_members").select("*").eq("conversation_id", convoId).eq("user_id", id).single();
        if (!membership) return reply(404, { error: "Percakapan tidak ditemukan" });

        const { data: user } = await supabase.from("users").select("name").eq("id", id).single();

        const { error } = await supabase.from("messages").insert({
          conversation_id: convoId,
          from_id: id,
          from_name: user ? user.name : id,
          text: hasText ? text.trim() : "",
          media_url: mediaUrl || null,
          media_type: mediaType || null,
          file_name: fileName || null,
        });
        if (error) throw error;

        return reply(200, { ok: true });
      }

      case "broadcast": {
        const { adminPassword, text } = body;
        if (adminPassword !== ADMIN_PASSWORD) return reply(401, { error: "Kata sandi admin salah" });
        if (!text || !text.trim()) return reply(400, { error: "Pengumuman kosong" });

        const { error } = await supabase.from("announcements").insert({ text: text.trim() });
        if (error) throw error;

        return reply(200, { ok: true });
      }

      default:
        return reply(400, { error: "Aksi tidak dikenal" });
    }
  } catch (err) {
    console.error(err);
    return reply(500, { error: "Terjadi kesalahan server: " + (err.message || err) });
  }
};
