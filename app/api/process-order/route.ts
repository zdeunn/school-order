import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Receiver } from "@upstash/qstash";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// يتحقق من أن الطلب الوارد موقّع فعلاً من طرف QStash (وليس من أي مصدر خارجي)
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

// تحييد رموز Markdown الخاصة داخل النصوص القادمة من المستخدم حتى لا تكسر تنسيق رسالة Telegram
function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[])/g, "\\$1");
}

export async function POST(request: Request) {
  try {
    // 0. التحقق من توقيع QStash قبل أي معالجة — يمنع أي جهة خارجية من استدعاء هذا المسار مباشرة
    const signature = request.headers.get("upstash-signature");
    const rawBody = await request.text();

    if (!signature) {
      return NextResponse.json({ error: "توقيع الطلب مفقود" }, { status: 401 });
    }

    const isValidSignature = await receiver
      .verify({ signature, body: rawBody })
      .catch((err) => {
        console.error("QStash Signature Verification Error:", err);
        return false;
      });

    if (!isValidSignature) {
      return NextResponse.json({ error: "توقيع الطلب غير صالح" }, { status: 401 });
    }

    const data = JSON.parse(rawBody);
    const { fullName, phone, location, items, notes } = data;

    // تحقق من شكل items قبل استخدامها لمنع تعطل الطلب بخطأ 500 عند وصول بيانات غير متوقعة
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "قائمة العناصر غير صالحة" }, { status: 400 });
    }

    // 1. التخزين الاحتياطي والدائم في Supabase
    const { error: dbError } = await supabase.from("orders").insert([
      {
        full_name: fullName,
        phone: phone,
        location: location,
        items: items,
        notes: notes || null,
      },
    ]);

    if (dbError) {
      console.error("Supabase Storage Error:", dbError);
    }

    // 2. تنسيق عناصر القائمة المخصصة (مع حماية من رموز Markdown الخاصة في الأسماء)
    const formattedItems = items
      .map(
        (item: { name: string; quantity: number }, index: number) =>
          `  ${index + 1}. *${escapeMarkdown(String(item.name ?? ""))}* — (الكمية: ${item.quantity})`
      )
      .join("\n");

    // 3. صياغة نص الرسالة لـ Telegram (مع حماية جميع الحقول القادمة من المستخدم)
    const message = `
📦 *طلب قائمة مخصصة جديد!*

👤 *الاسم واللقب:* ${escapeMarkdown(String(fullName ?? ""))}
📞 *رقم الهاتف:* ${escapeMarkdown(String(phone ?? ""))}
📍 *مكان التوصيل:* ${escapeMarkdown(String(location ?? ""))}
📝 *ملاحظات إضافية:* ${notes ? escapeMarkdown(String(notes)) : "لا يوجد"}

📋 *عناصر القائمة:*
${formattedItems}
    `;

    // 4. إرسال الإشعار عبر Telegram Bot API، مع التحقق الفعلي من نجاح الإرسال
    const telegramRes = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: "Markdown",
        }),
      }
    );

    if (!telegramRes.ok) {
      const telegramErrorText = await telegramRes.text();
      console.error("Telegram Notification Error:", telegramErrorText);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Processing Execution Error:", error);
    return NextResponse.json(
      { error: "فشلت عملية معالجة الطلب في الخلفية" },
      { status: 500 }
    );
  }
}