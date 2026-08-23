import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "헤르메스-IX: 제로 아워";
const description = "4인용 비밀 추리 보드게임 — 다섯 번째 파괴 공작 전에 스파이와 타깃 구역을 찾아내십시오.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title,
    description,
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1664, height: 936, alt: "헤르메스-IX 우주선과 제로 아워 타이틀" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
