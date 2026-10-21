import { Figtree, Noto_Kufi_Arabic, Schibsted_Grotesk } from "next/font/google";

export const display = Schibsted_Grotesk({ subsets: ["latin"], weight: ["500", "700", "800"], variable: "--font-display", display: "swap" });
export const body = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-body", display: "swap" });
export const arabic = Noto_Kufi_Arabic({ subsets: ["arabic"], weight: ["400", "500", "700", "800"], variable: "--font-ar", display: "swap" });
