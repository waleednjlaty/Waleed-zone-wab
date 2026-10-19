"use client";

import React, { useEffect, useState } from "react";

interface Props {
    token: string;
    appId: number;
}

export default function TelegramBridgeBanner({ token, appId }: Props) {
    const [synced, setSynced] = useState(false);

    useEffect(() => {
        async function syncWithTelegram() {
            try {
                const sessionRes = await fetch(`/api/downloads/session?app_id=${appId}`);
                const sessionData = await sessionRes.json();
                const directUrl = sessionData.url || sessionData.direct_url;

                if (directUrl) {
                    await fetch("/api/downloads/resolve", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token, download_url: directUrl }),
                    });
                    setSynced(true);
                }
            } catch (err) {
                console.error("Telegram bridge sync failed:", err);
            }
        }

        syncWithTelegram();
    }, [token, appId]);

    const telegramBotLink = `https://t.me/WaleedZoneBot?start=dl_${token}`;

    return (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-lg bg-blue-900/90 backdrop-blur-md border border-blue-500 text-white p-4 rounded-xl shadow-2xl text-center dir-rtl">
            <p className="text-sm font-semibold mb-2">
                {synced
                    ? "✅ تم تأكيد اجتياز التحقق وتحديث الرابط في تلغرام!"
                    : "⏳ جاري إعداد الرابط المباشر للبوت..."}
            </p>
            <a
                href={telegramBotLink}
                className="inline-block w-full py-2 px-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow transition text-sm font-bold"
            >
                🚀 العودة للتطبيق في تلغرام واستلام اللعبة
            </a>
        </div>
    );
}