// src/app/api/downloads/resolve/route.ts
import { NextResponse } from "next/server";
import { Pool } from "pg";

// الاتصال المباشر بقاعدة بيانات PostgreSQL المشتركة عبر متغير البيئة
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export async function POST(request: Request) {
    try {
        const { token, download_url } = await request.json();

        if (!token || !download_url) {
            return NextResponse.json(
                { error: "البيانات المطلوبة غير مكتملة" },
                { status: 400 }
            );
        }

        // تحديث حالة الطلب في جدول pending_downloads المشترك مع البوت
        const query = `
      UPDATE pending_downloads 
      SET status = 'resolved', download_url = $1, resolved_at = NOW()
      WHERE token = $2 AND status = 'pending'
      RETURNING id, app_id;
    `;

        const client = await pool.connect();
        try {
            const result = await client.query(query, [download_url, token]);

            if (result.rowCount === 0) {
                return NextResponse.json(
                    { error: "الطلب غير موجود أو تمت معالجته سابقاً" },
                    { status: 404 }
                );
            }

            return NextResponse.json({
                success: true,
                app_id: result.rows[0].app_id,
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Failed to resolve pending download:", error);
        return NextResponse.json(
            { error: "حدث خطأ أثناء معالجة الطلب" },
            { status: 500 }
        );
    }
}