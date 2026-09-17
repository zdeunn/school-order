import { Client } from "@upstash/qstash";
import { NextResponse } from "next/server";

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export async function POST(request: Request) {
    try {
        const body = await request.json();

        if (!body.fullName || !body.phone || !body.location || !body.items || body.items.length === 0){
            return NextResponse.json(
                { message: "يرجى ملء جميع الحقول المطلوبة" },
                { status: 400 }
            ); 
        }

        // تحقق إضافي: التأكد أن items مصفوفة فعلية وأن كل عنصر يحمل اسماً وكمية صحيحة
        if (!Array.isArray(body.items) || body.items.some(
            (item: any) => typeof item?.name !== "string" || !item.name.trim() || !(Number(item.quantity) > 0)
        )) {
            return NextResponse.json(
                { message: "بيانات عناصر القائمة غير صالحة" },
                { status: 400 }
            );
        }
        
        await qstash.publishJSON({
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/process-order`,
            body: body,
        });

        return NextResponse.json(
            { success: true, message: "تم إرسال الطلب بنجاح" },
            { status: 200 }
        );
    } catch (error) {
        console.error("Order Queue Error:", error);
        return NextResponse.json(
            { message: "حدث خطأ أثناء معالجة الطلب" },
            { status: 500 }
        );
    }
    
        
}